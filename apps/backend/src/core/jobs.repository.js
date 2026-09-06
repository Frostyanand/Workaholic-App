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
  } = jobData;

  if (!jobType) throw new TypeError('jobType is required');

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
 * Fail a job and either schedule for retry with backoff or mark as FAILED
 * @param {string} jobId
 * @param {string} errorMessage
 * @param {number} [retryDelaySeconds=60]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function failJob(jobId, errorMessage, retryDelaySeconds = 60, client = pool) {
  if (!jobId) throw new TypeError('jobId is required');

  const currentJob = await findJobById(jobId, client);
  if (!currentJob) return null;

  const shouldRetry = currentJob.attempts < currentJob.maxAttempts;
  const newStatus = shouldRetry ? JOB_STATUS.PENDING : JOB_STATUS.FAILED;

  let runAt = currentJob.runAt;
  if (shouldRetry) {
    runAt = new Date(Date.now() + retryDelaySeconds * 1000);
  }

  const sql = `
    UPDATE background_jobs
    SET status = $2,
        last_error = $3,
        run_at = $4,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;

  const result = await query(sql, [jobId, newStatus, errorMessage, runAt], client);
  return mapJobRow(result.rows[0]);
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
    total: 0,
  };

  for (const row of result.rows) {
    metrics[row.status] = row.count;
    metrics.total += row.count;
  }

  return metrics;
}
