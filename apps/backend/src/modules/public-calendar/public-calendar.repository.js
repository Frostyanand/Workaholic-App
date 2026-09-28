import { pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean public calendar link domain object.
 */
export function mapPublicCalendarLinkRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    calendarId: row.calendar_id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    tokenEncrypted: row.token_encrypted,
    tokenPrefix: row.token_prefix,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at).toISOString() : null,
    ...(row.calendar_name ? { calendarName: row.calendar_name } : {}),
    ...(row.calendar_color ? { calendarColor: row.calendar_color } : {}),
    ...(row.calendar_timezone ? { calendarTimezone: row.calendar_timezone } : {}),
    ...(row.calendar_visibility ? { calendarVisibility: row.calendar_visibility } : {}),
  };
}

/**
 * Creates a new public calendar link record.
 * @param {object} linkData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createLink(linkData, client = pool) {
  const {
    workspaceId,
    calendarId,
    userId,
    tokenHash,
    tokenEncrypted,
    tokenPrefix,
    status = 'ACTIVE',
    expiresAt = null,
  } = linkData;

  const sql = `
    INSERT INTO public_calendar_links (
      workspace_id,
      calendar_id,
      user_id,
      token_hash,
      token_encrypted,
      token_prefix,
      status,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;

  const result = await client.query(sql, [
    workspaceId,
    calendarId,
    userId,
    tokenHash,
    tokenEncrypted,
    tokenPrefix,
    status,
    expiresAt,
  ]);

  return mapPublicCalendarLinkRow(result.rows[0]);
}

/**
 * Retrieves the single active public link for a calendar, if one exists.
 * @param {string} calendarId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getActiveLinkByCalendarId(calendarId, client = pool) {
  const sql = `
    SELECT pcl.*,
           c.name AS calendar_name,
           c.color AS calendar_color,
           c.timezone AS calendar_timezone,
           c.visibility AS calendar_visibility
    FROM public_calendar_links pcl
    JOIN calendars c ON pcl.calendar_id = c.id
    WHERE pcl.calendar_id = $1
      AND pcl.status = 'ACTIVE'
      AND pcl.deleted_at IS NULL
      AND c.deleted_at IS NULL
    ORDER BY pcl.created_at DESC
    LIMIT 1;
  `;

  const result = await client.query(sql, [calendarId]);
  return mapPublicCalendarLinkRow(result.rows[0]);
}

/**
 * Retrieves a public calendar link by its primary key ID.
 * @param {string} id
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getLinkById(id, client = pool) {
  const sql = `
    SELECT pcl.*,
           c.name AS calendar_name,
           c.color AS calendar_color,
           c.timezone AS calendar_timezone,
           c.visibility AS calendar_visibility
    FROM public_calendar_links pcl
    JOIN calendars c ON pcl.calendar_id = c.id
    WHERE pcl.id = $1
      AND pcl.deleted_at IS NULL
      AND c.deleted_at IS NULL;
  `;

  const result = await client.query(sql, [id]);
  return mapPublicCalendarLinkRow(result.rows[0]);
}

/**
 * Retrieves a public calendar link and associated calendar metadata by token SHA-256 hash.
 * @param {string} tokenHash
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getLinkByTokenHash(tokenHash, client = pool) {
  const sql = `
    SELECT pcl.*,
           c.name AS calendar_name,
           c.color AS calendar_color,
           c.timezone AS calendar_timezone,
           c.visibility AS calendar_visibility
    FROM public_calendar_links pcl
    JOIN calendars c ON pcl.calendar_id = c.id
    WHERE pcl.token_hash = $1
      AND pcl.deleted_at IS NULL
      AND c.deleted_at IS NULL;
  `;

  const result = await client.query(sql, [tokenHash]);
  return mapPublicCalendarLinkRow(result.rows[0]);
}

/**
 * Revokes an existing public calendar link by its ID.
 * @param {string} id
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function revokeLink(id, client = pool) {
  const sql = `
    UPDATE public_calendar_links
    SET status = 'REVOKED',
        revoked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, [id]);
  return mapPublicCalendarLinkRow(result.rows[0]);
}

/**
 * Revokes all active links for a given calendar ID.
 * Used during link regeneration to guarantee atomic single-active invariant.
 * @param {string} calendarId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function revokeActiveLinksByCalendarId(calendarId, client = pool) {
  const sql = `
    UPDATE public_calendar_links
    SET status = 'REVOKED',
        revoked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE calendar_id = $1
      AND status = 'ACTIVE'
      AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, [calendarId]);
  return result.rows.map(mapPublicCalendarLinkRow);
}

/**
 * Updates last_accessed_at timestamp when a public link is visited.
 * @param {string} id
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function touchLastAccessed(id, client = pool) {
  const sql = `
    UPDATE public_calendar_links
    SET last_accessed_at = CURRENT_TIMESTAMP
    WHERE id = $1;
  `;

  await client.query(sql, [id]);
}
