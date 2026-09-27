import { query, pool } from '../../core/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    integrationService: row.integration_service,
    syncDirection: row.sync_direction,
    syncOperationType: row.sync_operation_type,
    status: row.status,
    failureCategory: row.failure_category,
    failureReason: row.failure_reason,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    recordsExamined: Number(row.records_examined || 0),
    recordsCreated: Number(row.records_created || 0),
    recordsUpdated: Number(row.records_updated || 0),
    recordsDeleted: Number(row.records_deleted || 0),
    recordsConflicted: Number(row.records_conflicted || 0),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: Number(row.duration_ms || 0),
    retryCount: Number(row.retry_count || 0),
    retryState: row.retry_state,
    correlationId: row.correlation_id,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

/**
 * Persists a synchronization diagnostic record.
 * Conforms to docs/21.COST-ARCHITECTURE.md Section 30 & 31.
 *
 * @param {Object} data
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function recordSyncDiagnostic(data, client = pool) {
  const {
    userId,
    workspaceId,
    provider = 'GOOGLE',
    integrationService,
    syncDirection = 'BIDIRECTIONAL',
    syncOperationType = 'INCREMENTAL',
    status,
    failureCategory = null,
    failureReason = null,
    errorCode = null,
    errorMessage = null,
    recordsExamined = 0,
    recordsCreated = 0,
    recordsUpdated = 0,
    recordsDeleted = 0,
    recordsConflicted = 0,
    startedAt,
    completedAt = new Date(),
    durationMs = 0,
    retryCount = 0,
    retryState = 'NONE',
    correlationId = null,
    metadata = {},
  } = data;

  const calculatedDuration =
    durationMs ||
    (startedAt && completedAt
      ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
      : 0);

  const sql = `
    INSERT INTO sync_diagnostics (
      user_id, workspace_id, provider, integration_service, sync_direction,
      sync_operation_type, status, failure_category, failure_reason,
      error_code, error_message, records_examined, records_created,
      records_updated, records_deleted, records_conflicted,
      started_at, completed_at, duration_ms, retry_count, retry_state,
      correlation_id, metadata, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13,
      $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22, $23, CURRENT_TIMESTAMP
    )
    RETURNING *;
  `;

  const params = [
    userId,
    workspaceId,
    provider,
    integrationService,
    syncDirection,
    syncOperationType,
    status,
    failureCategory,
    failureReason,
    errorCode,
    errorMessage,
    recordsExamined,
    recordsCreated,
    recordsUpdated,
    recordsDeleted,
    recordsConflicted,
    startedAt || new Date(),
    completedAt,
    calculatedDuration,
    retryCount,
    retryState,
    correlationId,
    JSON.stringify(metadata),
  ];

  const result = await query(sql, params, client);
  return mapRow(result.rows[0]);
}

/**
 * Retrieves diagnostics for a user with filtering and pagination.
 *
 * @param {string} userId
 * @param {Object} [options={}]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getDiagnosticsByUser(userId, options = {}, client = pool) {
  const { service, status, limit = 20, offset = 0 } = options;

  let sql = `
    SELECT * FROM sync_diagnostics
    WHERE user_id = $1
  `;
  const params = [userId];
  let paramIdx = 2;

  if (service) {
    sql += ` AND integration_service = $${paramIdx++}`;
    params.push(service);
  }

  if (status) {
    sql += ` AND status = $${paramIdx++}`;
    params.push(status);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++};`;
  params.push(limit, offset);

  const result = await query(sql, params, client);
  return result.rows.map(mapRow);
}

/**
 * Retrieves the latest diagnostic entry for a specific integration service.
 *
 * @param {string} userId
 * @param {string} service
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getLatestDiagnosticByService(userId, service, client = pool) {
  const sql = `
    SELECT * FROM sync_diagnostics
    WHERE user_id = $1 AND integration_service = $2
    ORDER BY created_at DESC
    LIMIT 1;
  `;
  const result = await query(sql, [userId, service], client);
  return mapRow(result.rows[0]);
}

/**
 * Returns diagnostic summary stats for an integration user.
 *
 * @param {string} userId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getDiagnosticStats(userId, client = pool) {
  const sql = `
    SELECT
      integration_service,
      COUNT(*)::int as total_runs,
      COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END)::int as success_runs,
      COUNT(CASE WHEN status = 'PARTIAL_SUCCESS' THEN 1 END)::int as partial_runs,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int as failed_runs,
      MAX(created_at) as last_synced_at
    FROM sync_diagnostics
    WHERE user_id = $1
    GROUP BY integration_service;
  `;
  const result = await query(sql, [userId], client);
  return result.rows.map(r => ({
    service: r.integration_service,
    totalRuns: Number(r.total_runs),
    successRuns: Number(r.success_runs),
    partialRuns: Number(r.partial_runs),
    failedRuns: Number(r.failed_runs),
    lastSyncedAt: r.last_synced_at,
  }));
}
