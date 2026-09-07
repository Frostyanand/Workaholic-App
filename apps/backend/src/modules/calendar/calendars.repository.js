import { pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean calendar domain object
 */
export function mapCalendarRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    description: row.description,
    color: row.color,
    sourceType: row.source_type,
    externalAccountId: row.external_account_id,
    externalCalendarId: row.external_calendar_id,
    visibility: row.visibility,
    timezone: row.timezone,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...(row.event_count !== undefined ? { eventCount: parseInt(row.event_count, 10) } : {}),
  };
}

/**
 * Create a new calendar in a workspace
 * @param {object} calendarData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createCalendar(calendarData, client = pool) {
  if (!calendarData || typeof calendarData !== 'object') {
    throw new TypeError('calendarData must be an object');
  }

  const {
    workspaceId,
    ownerUserId = null,
    name,
    description = null,
    color = '#3B82F6',
    sourceType = 'WORKAHOLIC',
    externalAccountId = null,
    externalCalendarId = null,
    visibility = 'PRIVATE',
    timezone = 'UTC',
    isDefault = false,
  } = calendarData;

  const sql = `
    INSERT INTO calendars (
      workspace_id,
      owner_user_id,
      name,
      description,
      color,
      source_type,
      external_account_id,
      external_calendar_id,
      visibility,
      timezone,
      is_default
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;

  const values = [
    workspaceId,
    ownerUserId,
    name,
    description,
    color,
    sourceType,
    externalAccountId,
    externalCalendarId,
    visibility,
    timezone,
    isDefault,
  ];

  const result = await client.query(sql, values);
  return mapCalendarRow(result.rows[0]);
}

/**
 * Find calendar by ID scoped to workspace
 * @param {string} calendarId
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findCalendarById(calendarId, workspaceId, client = pool) {
  const sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM events e WHERE e.calendar_id = c.id AND e.deleted_at IS NULL) AS event_count
    FROM calendars c
    WHERE c.id = $1 AND c.workspace_id = $2 AND c.deleted_at IS NULL;
  `;
  const result = await client.query(sql, [calendarId, workspaceId]);
  return mapCalendarRow(result.rows[0]);
}

/**
 * Find all active calendars in a workspace
 * @param {string} workspaceId
 * @param {object} [options={}]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findCalendarsByWorkspace(workspaceId, options = {}, client = pool) {
  const { sourceType, visibility, search } = options;
  const conditions = ['c.workspace_id = $1', 'c.deleted_at IS NULL'];
  const values = [workspaceId];
  let paramIdx = 2;

  if (sourceType) {
    conditions.push(`c.source_type = $${paramIdx++}`);
    values.push(sourceType);
  }

  if (visibility) {
    conditions.push(`c.visibility = $${paramIdx++}`);
    values.push(visibility);
  }

  if (search) {
    conditions.push(`c.name ILIKE $${paramIdx++}`);
    values.push(`%${search}%`);
  }

  const sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM events e WHERE e.calendar_id = c.id AND e.deleted_at IS NULL) AS event_count
    FROM calendars c
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.is_default DESC, c.name ASC;
  `;

  const result = await client.query(sql, values);
  return result.rows.map(mapCalendarRow);
}

/**
 * Find the default calendar for a workspace
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findDefaultCalendar(workspaceId, client = pool) {
  const sql = `
    SELECT * FROM calendars
    WHERE workspace_id = $1 AND is_default = TRUE AND deleted_at IS NULL
    LIMIT 1;
  `;
  const result = await client.query(sql, [workspaceId]);
  return mapCalendarRow(result.rows[0]);
}

/**
 * Clear default flag for all calendars in a workspace
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function clearDefaultCalendar(workspaceId, client = pool) {
  const sql = `
    UPDATE calendars
    SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = $1 AND is_default = TRUE;
  `;
  await client.query(sql, [workspaceId]);
}

/**
 * Update an existing calendar
 * @param {string} calendarId
 * @param {string} workspaceId
 * @param {object} patchData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateCalendar(calendarId, workspaceId, patchData, client = pool) {
  const allowedKeys = [
    'name',
    'description',
    'color',
    'sourceType',
    'externalAccountId',
    'externalCalendarId',
    'visibility',
    'timezone',
    'isDefault',
  ];

  const columnMap = {
    name: 'name',
    description: 'description',
    color: 'color',
    sourceType: 'source_type',
    externalAccountId: 'external_account_id',
    externalCalendarId: 'external_calendar_id',
    visibility: 'visibility',
    timezone: 'timezone',
    isDefault: 'is_default',
  };

  const updates = [];
  const values = [calendarId, workspaceId];
  let paramIdx = 3;

  for (const key of allowedKeys) {
    if (patchData[key] !== undefined) {
      updates.push(`${columnMap[key]} = $${paramIdx++}`);
      values.push(patchData[key]);
    }
  }

  if (updates.length === 0) {
    return findCalendarById(calendarId, workspaceId, client);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE calendars
    SET ${updates.join(', ')}
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, values);
  return mapCalendarRow(result.rows[0]);
}

/**
 * Soft delete a calendar and its associated events
 * @param {string} calendarId
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function softDeleteCalendar(calendarId, workspaceId, client = pool) {
  const sql = `
    UPDATE calendars
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;
  const result = await client.query(sql, [calendarId, workspaceId]);
  if (!result.rows[0]) return null;

  // Soft-delete associated events
  await client.query(
    `UPDATE events SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE calendar_id = $1 AND deleted_at IS NULL`,
    [calendarId],
  );

  return mapCalendarRow(result.rows[0]);
}
