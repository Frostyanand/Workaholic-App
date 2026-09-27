import { query, pool } from './db.js';
import { JOB_STATUS } from '@workaholic/shared';

function mapJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    queue: row.queue,
    jobType: row.job_type,
    payload: row.payload,
    status: row.status,
    priority: row.priority,
    runAt: row.run_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    lastError: row.last_error,
    deadLetterReason: row.dead_letter_reason || null,
    jobKey: row.job_key || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/**
 * Enqueue a new background job into PostgreSQL queue
 * @param {Object} jobData
 * @param {string} jobData.jobType
 * @param {Object} [jobData.payload={}]
 * @param {string} [jobData.queue='default']
 * @param {number} [jobData.priority=0]
 * @param {Date|string} [jobData.runAt]
 * @param {number} [jobData.maxAttempts=3]
 * @param {string} [jobData.jobKey=null] Optional idempotency deduplication key
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function enqueueJob(jobData, client = pool) {
  const {
    jobType,
    payload = {},
    queue: queueName = 'default',
    priority = 0,
    runAt = null,
    maxAttempts = 3,
    jobKey = null,
  } = jobData;

  if (!jobType) throw new TypeError('jobType is required');

  if (jobKey) {
    const insertSql = `
      INSERT INTO background_jobs (
        queue, job_type, payload, priority, run_at, max_attempts, job_key
      ) VALUES (
        $1, $2, $3, $4, COALESCE($5, CURRENT_TIMESTAMP), $6, $7
      )
      ON CONFLICT (queue, job_key) WHERE status IN ('PENDING', 'PROCESSING')
      DO NOTHING
      RETURNING *;
    `;
    const params = [
      queueName,
      jobType,
      JSON.stringify(payload),
      priority,
      runAt,
      maxAttempts,
      jobKey,
    ];
    const result = await query(insertSql, params, client);

    if (result.rows.length > 0) {
      return mapJobRow(result.rows[0]);
    }

    // Row was deduplicated due to active job with identical key
    const existing = await query(
      `SELECT * FROM background_jobs
       WHERE queue = $1 AND job_key = $2 AND status IN ('PENDING', 'PROCESSING')
       LIMIT 1;`,
      [queueName, jobKey],
      client,
    );
    return mapJobRow(existing.rows[0]);
  }

  const sql = `
    INSERT INTO background_jobs (
      queue, job_type, payload, priority, run_at, max_attempts
    ) VALUES (
      $1, $2, $3, $4, COALESCE($5, CURRENT_TIMESTAMP), $6
    )
    RETURNING *;
  `;

  const params = [queueName, jobType, JSON.stringify(payload), priority, runAt, maxAttempts];
  const result = await query(sql, params, client);
  return mapJobRow(result.rows[0]);
}

/**
 * Atomically fetch and lock the next pending job using FOR UPDATE SKIP LOCKED
 * Must be called within an active transaction client
 *
 * @param {string} queueName
 * @param {string} workerId
 * @param {import('pg').PoolClient} client - Active transaction client
 */
export async function fetchNextPendingJob(
  queueName = 'default',
  workerId = 'worker-default',
  client,
) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('fetchNextPendingJob requires an active transaction client');
  }

  // 1. Lock next pending row skipping any concurrently locked rows
  const selectSql = `
    SELECT id, queue, job_type, payload, priority, run_at, attempts, max_attempts
    FROM background_jobs
    WHERE queue = $1
      AND status = 'PENDING'
      AND run_at <= CURRENT_TIMESTAMP
    ORDER BY priority DESC, run_at ASC, id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  `;

  const selectRes = await client.query(selectSql, [queueName]);
  if (selectRes.rows.length === 0) {
    return null;
  }

  const selectedJob = selectRes.rows[0];

  // 2. Mark row as PROCESSING
  const updateSql = `
    UPDATE background_jobs
    SET status = 'PROCESSING',
        locked_at = CURRENT_TIMESTAMP,
        locked_by = $2,
        attempts = attempts + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;

  const updateRes = await client.query(updateSql, [selectedJob.id, workerId]);
  return mapJobRow(updateRes.rows[0]);
}

/**
 * Mark job as successfully completed
 * @param {string} jobId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function completeJob(jobId, client = pool) {
  if (!jobId) throw new TypeError('jobId is required');

  const sql = `
    UPDATE background_jobs
    SET status = $2,
        completed_at = CURRENT_TIMESTAMP,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;

  const result = await query(sql, [jobId, JOB_STATUS.COMPLETED], client);
  return mapJobRow(result.rows[0]);
}

/**
 * Fail a job and either schedule for retry with backoff or mark as DEAD_LETTER / FAILED
 * @param {string} jobId
 * @param {string} errorMessage
 * @param {number} [retryDelaySeconds=60]
 * @param {boolean} [isNonRetryable=false]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function failJob(
  jobId,
  errorMessage,
  retryDelaySeconds = 60,
  isDeadLetter = false,
  client = pool,
) {
  if (!jobId) throw new TypeError('jobId is required');

  const currentJob = await findJobById(jobId, client);
  if (!currentJob) return null;

  const exhausted = currentJob.attempts >= currentJob.maxAttempts;
  const shouldRetry = !isDeadLetter && !exhausted;

  let newStatus;
  let deadLetterReason = null;

  if (isDeadLetter) {
    newStatus = JOB_STATUS.DEAD_LETTER;
    deadLetterReason = `Non-retryable failure: ${errorMessage}`;
  } else if (exhausted) {
    newStatus = JOB_STATUS.FAILED;
    deadLetterReason = `Max attempts (${currentJob.maxAttempts}) reached. Last error: ${errorMessage}`;
  } else {
    newStatus = JOB_STATUS.PENDING;
  }

  let runAt = currentJob.runAt;
  if (shouldRetry) {
    runAt = new Date(Date.now() + retryDelaySeconds * 1000);
  }

  const sql = `
    UPDATE background_jobs
    SET status = $2,
        last_error = $3,
        dead_letter_reason = COALESCE($4, dead_letter_reason),
        run_at = $5,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;

  const result = await query(
    sql,
    [jobId, newStatus, errorMessage, deadLetterReason, runAt],
    client,
  );
  return mapJobRow(result.rows[0]);
}

/**
 * Explicitly transition a job to DEAD_LETTER
 * @param {string} jobId
 * @param {string} reason
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function deadLetterJob(jobId, reason, client = pool) {
  if (!jobId) throw new TypeError('jobId is required');

  const sql = `
    UPDATE background_jobs
    SET status = $2,
        dead_letter_reason = $3,
        last_error = $3,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;

  const result = await query(sql, [jobId, JOB_STATUS.DEAD_LETTER, reason], client);
  return mapJobRow(result.rows[0]);
}

/**
 * Cancel a pending or processing job
 * @param {string} jobId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function cancelJob(jobId, client = pool) {
  if (!jobId) throw new TypeError('jobId is required');

  const sql = `
    UPDATE background_jobs
    SET status = $2,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')
    RETURNING *;
  `;

  const result = await query(sql, [jobId, JOB_STATUS.CANCELLED], client);
  return mapJobRow(result.rows[0]);
}

/**
 * Recovers jobs stuck in PROCESSING where worker crashed or disconnected
 * @param {number} [staleTimeoutSeconds=300] Time after which locked_at is considered stale
 * @param {number} [retryDelaySeconds=30] Delay before re-queueing stale jobs
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 * @returns {Promise<Array<{ id: string, recoveredStatus: string }>>}
 */
export async function recoverStaleJobs(
  staleTimeoutSeconds = 300,
  retryDelaySeconds = 30,
  client = pool,
) {
  const sql = `
    WITH stale_candidates AS (
      SELECT id, attempts, max_attempts
      FROM background_jobs
      WHERE status = 'PROCESSING'
        AND locked_at < CURRENT_TIMESTAMP - ($1 || ' seconds')::interval
      FOR UPDATE SKIP LOCKED
    ),
    updated_dead_letter AS (
      UPDATE background_jobs b
      SET status = 'DEAD_LETTER',
          dead_letter_reason = 'Stale lock timed out with max attempts exhausted',
          last_error = 'Stale lock timed out with max attempts exhausted',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = CURRENT_TIMESTAMP
      FROM stale_candidates c
      WHERE b.id = c.id AND c.attempts >= c.max_attempts
      RETURNING b.id, 'DEAD_LETTER' AS recovered_status
    ),
    updated_pending AS (
      UPDATE background_jobs b
      SET status = 'PENDING',
          run_at = CURRENT_TIMESTAMP + ($2 || ' seconds')::interval,
          last_error = 'Recovered from stale PROCESSING lock',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = CURRENT_TIMESTAMP
      FROM stale_candidates c
      WHERE b.id = c.id AND c.attempts < c.max_attempts
      RETURNING b.id, 'PENDING' AS recovered_status
    )
    SELECT id, recovered_status AS "recoveredStatus" FROM updated_dead_letter
    UNION ALL
    SELECT id, recovered_status AS "recoveredStatus" FROM updated_pending;
  `;

  const result = await query(sql, [staleTimeoutSeconds, retryDelaySeconds], client);
  return result.rows;
}

/**
 * Find a job by ID
 * @param {string} jobId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findJobById(jobId, client = pool) {
  if (!jobId) throw new TypeError('jobId is required');

  const sql = `SELECT * FROM background_jobs WHERE id = $1;`;
  const result = await query(sql, [jobId], client);
  return mapJobRow(result.rows[0]);
}

/**
 * Query jobs for internal diagnostics and observability
 * @param {Object} [filter={}]
 * @param {string} [filter.queue]
 * @param {string} [filter.status]
 * @param {string} [filter.jobType]
 * @param {number} [filter.limit=50]
 * @param {number} [filter.offset=0]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findJobs(filter = {}, client = pool) {
  const { queue: queueName, status, jobType, limit = 50, offset = 0 } = filter;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (queueName) {
    conditions.push(`queue = $${paramIdx++}`);
    params.push(queueName);
  }
  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (jobType) {
    conditions.push(`job_type = $${paramIdx++}`);
    params.push(jobType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT * FROM background_jobs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;
  params.push(limit, offset);

  const result = await query(sql, params, client);
  return result.rows.map(mapJobRow);
}

/**
 * Get queue metrics (counts by status)
 * @param {string} [queueName='default']
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getQueueMetrics(queueName = 'default', client = pool) {
  const sql = `
    SELECT status, COUNT(*)::int AS count
    FROM background_jobs
    WHERE queue = $1
    GROUP BY status;
  `;

  const result = await query(sql, [queueName], client);
  const metrics = {
    queue: queueName,
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
    DEAD_LETTER: 0,
    total: 0,
  };

  for (const row of result.rows) {
    if (metrics[row.status] !== undefined) {
      metrics[row.status] = row.count;
    }
    metrics.total += row.count;
  }

  return metrics;
}
