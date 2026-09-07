import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean task work block domain object
 */
export function mapWorkBlockRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    calendarId: row.calendar_id,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a scheduled work block for a task
 * @param {object} blockData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createWorkBlock(blockData, client = pool) {
  if (!blockData || typeof blockData !== 'object') {
    throw new TypeError('blockData must be an object');
  }
  const {
    taskId,
    calendarId = null,
    startAt,
    endAt,
    timezone = 'UTC',
    status = 'SCHEDULED',
  } = blockData;

  if (!taskId || !startAt || !endAt) {
    throw new Error('taskId, startAt, and endAt are required');
  }

  const sql = `
    INSERT INTO task_work_blocks (task_id, calendar_id, start_at, end_at, timezone, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const result = await query(sql, [taskId, calendarId, startAt, endAt, timezone, status], client);
  return mapWorkBlockRow(result.rows[0]);
}

/**
 * Remove a work block by ID and task ID
 * @param {string} id
 * @param {string} taskId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function removeWorkBlock(id, taskId, client = pool) {
  if (!id || !taskId) {
    throw new TypeError('id and taskId are required');
  }

  const sql = `
    DELETE FROM task_work_blocks
    WHERE id = $1 AND task_id = $2
    RETURNING *
  `;
  const result = await query(sql, [id, taskId], client);
  return result.rows.length > 0;
}

/**
 * Get all work blocks for a task
 * @param {string} taskId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getWorkBlocksForTask(taskId, client = pool) {
  if (!taskId) {
    throw new TypeError('taskId is required');
  }

  const sql = `
    SELECT *
    FROM task_work_blocks
    WHERE task_id = $1
    ORDER BY start_at ASC
  `;
  const result = await query(sql, [taskId], client);
  return result.rows.map(mapWorkBlockRow);
}
