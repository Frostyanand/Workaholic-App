import { pool, query } from '../../core/db.js';

/**
 * Maps raw SQL row from task_occurrences to camelCase domain representation
 * @param {object} row
 * @returns {object}
 */
export function mapTaskOccurrenceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    occurrenceKey: row.occurrence_key,
    isAllDay: row.is_all_day,
    originalDueAt: row.original_due_at ? new Date(row.original_due_at).toISOString() : null,
    originalDueDate: row.original_due_date ? String(row.original_due_date).slice(0, 10) : null,
    overrideDueAt: row.override_due_at ? new Date(row.override_due_at).toISOString() : null,
    overrideDueDate: row.override_due_date ? String(row.override_due_date).slice(0, 10) : null,
    status: row.status,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/**
 * Upserts a task occurrence override (sparse persistence)
 * Idempotent: repeated calls with same status update timestamps without duplicating rows
 * @param {object} data
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function upsertTaskOccurrence(data, client = pool) {
  const {
    workspaceId,
    taskId,
    occurrenceKey,
    isAllDay = false,
    originalDueAt = null,
    originalDueDate = null,
    overrideDueAt = null,
    overrideDueDate = null,
    status = 'TODO',
    completedAt = null,
  } = data;

  const sql = `
    INSERT INTO task_occurrences (
      workspace_id, task_id, occurrence_key, is_all_day,
      original_due_at, original_due_date, override_due_at, override_due_date,
      status, completed_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
    ON CONFLICT (task_id, occurrence_key) DO UPDATE SET
      status = EXCLUDED.status,
      completed_at = EXCLUDED.completed_at,
      override_due_at = COALESCE(EXCLUDED.override_due_at, task_occurrences.override_due_at),
      override_due_date = COALESCE(EXCLUDED.override_due_date, task_occurrences.override_due_date),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const params = [
    workspaceId,
    taskId,
    occurrenceKey,
    Boolean(isAllDay),
    isAllDay ? null : originalDueAt,
    isAllDay ? originalDueDate : null,
    isAllDay ? null : overrideDueAt,
    isAllDay ? overrideDueDate : null,
    status,
    completedAt,
  ];

  const result = await query(sql, params, client);
  return mapTaskOccurrenceRow(result.rows[0]);
}

/**
 * Finds a specific task occurrence override by task ID and occurrence key
 * @param {string} taskId
 * @param {string} occurrenceKey
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findTaskOccurrence(taskId, occurrenceKey, workspaceId, client = pool) {
  const sql = `
    SELECT * FROM task_occurrences
    WHERE task_id = $1 AND occurrence_key = $2 AND workspace_id = $3;
  `;
  const result = await query(sql, [taskId, occurrenceKey, workspaceId], client);
  return mapTaskOccurrenceRow(result.rows[0]);
}

/**
 * Deletes a task occurrence override (reverts to implicit dynamic TODO)
 * @param {string} taskId
 * @param {string} occurrenceKey
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function deleteTaskOccurrence(taskId, occurrenceKey, workspaceId, client = pool) {
  const sql = `
    DELETE FROM task_occurrences
    WHERE task_id = $1 AND occurrence_key = $2 AND workspace_id = $3
    RETURNING *;
  `;
  const result = await query(sql, [taskId, occurrenceKey, workspaceId], client);
  return mapTaskOccurrenceRow(result.rows[0]);
}

/**
 * Finds all occurrence overrides for a specific task
 * @param {string} taskId
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findOccurrencesByTaskId(taskId, workspaceId, client = pool) {
  const sql = `
    SELECT * FROM task_occurrences
    WHERE task_id = $1 AND workspace_id = $2
    ORDER BY created_at ASC;
  `;
  const result = await query(sql, [taskId, workspaceId], client);
  return result.rows.map(mapTaskOccurrenceRow);
}

/**
 * Finds all occurrence overrides for a list of task IDs in a workspace
 * @param {string[]} taskIds
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findOccurrencesByTaskIds(taskIds, workspaceId, client = pool) {
  if (!taskIds || taskIds.length === 0) return [];
  const sql = `
    SELECT * FROM task_occurrences
    WHERE task_id = ANY($1::uuid[]) AND workspace_id = $2
    ORDER BY created_at ASC;
  `;
  const result = await query(sql, [taskIds, workspaceId], client);
  return result.rows.map(mapTaskOccurrenceRow);
}

/**
 * Queries completed task occurrences in a workspace within a date range (for Today cockpit)
 * @param {string} workspaceId
 * @param {string} startIso
 * @param {string} endIso
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findCompletedOccurrencesByRange(
  workspaceId,
  startIso,
  endIso,
  client = pool,
) {
  const sql = `
    SELECT
      o.*,
      t.title AS task_title,
      t.priority AS task_priority,
      t.description AS task_description,
      t.project_id AS task_project_id,
      t.board_id AS task_board_id,
      t.board_column_id AS task_board_column_id,
      u_assignee.display_name AS assignee_display_name,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
    FROM task_occurrences o
    JOIN tasks t ON o.task_id = t.id
    LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
    WHERE o.workspace_id = $1
      AND t.deleted_at IS NULL
      AND o.status = 'COMPLETED'
      AND o.completed_at >= $2 AND o.completed_at <= $3
    ORDER BY o.completed_at DESC;
  `;
  const result = await query(sql, [workspaceId, startIso, endIso], client);
  return result.rows.map(r => ({
    ...mapTaskOccurrenceRow(r),
    taskTitle: r.task_title,
    taskPriority: r.task_priority,
    taskDescription: r.task_description,
    taskProjectId: r.task_project_id,
    taskBoardId: r.task_board_id,
    taskBoardColumnId: r.task_board_column_id,
    assigneeDisplayName: r.assignee_display_name,
    subtaskCount: parseInt(r.subtask_count, 10) || 0,
  }));
}

/**
 * Counts completed and accounted-for occurrences for a task series
 * @param {string} taskId
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function countAccountedOccurrencesForTask(taskId, workspaceId, client = pool) {
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
      COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_count,
      COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'CANCELLED')) AS accounted_count
    FROM task_occurrences
    WHERE task_id = $1 AND workspace_id = $2;
  `;
  const result = await query(sql, [taskId, workspaceId], client);
  const row = result.rows[0];
  return {
    completedCount: parseInt(row.completed_count, 10) || 0,
    cancelledCount: parseInt(row.cancelled_count, 10) || 0,
    accountedCount: parseInt(row.accounted_count, 10) || 0,
  };
}
