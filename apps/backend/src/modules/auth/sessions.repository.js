import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean session domain object
 */
export function mapSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    sessionTokenHash: row.session_token_hash,
    sessionType: row.session_type,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    ...(row.display_name ? { userDisplayName: row.display_name } : {}),
    ...(row.email ? { userEmail: row.email } : {}),
  };
}

/**
 * Create a new session record
 * @param {object} sessionData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createSession(sessionData, client = pool) {
  if (!sessionData || typeof sessionData !== 'object') {
    throw new TypeError('sessionData must be an object');
  }
  const { userId, deviceId = null, sessionTokenHash, sessionType = 'WEB', expiresAt } = sessionData;

  if (!userId || !sessionTokenHash || !expiresAt) {
    throw new Error('userId, sessionTokenHash, and expiresAt are required');
  }

  const sql = `
    INSERT INTO sessions (
      user_id,
      device_id,
      session_token_hash,
      session_type,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, user_id, device_id, session_token_hash, session_type, expires_at, revoked_at, created_at, last_seen_at
  `;

  const result = await query(
    sql,
    [userId, deviceId, sessionTokenHash, sessionType, expiresAt],
    client,
  );
  return mapSessionRow(result.rows[0]);
}

/**
 * Find active unrevoked session by token hash
 * @param {string} tokenHash
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findActiveSessionByTokenHash(tokenHash, client = pool) {
  if (!tokenHash) throw new TypeError('Token hash is required');

  const sql = `
    SELECT
      s.id,
      s.user_id,
      s.device_id,
      s.session_token_hash,
      s.session_type,
      s.expires_at,
      s.revoked_at,
      s.created_at,
      s.last_seen_at,
      u.display_name,
      u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > CURRENT_TIMESTAMP
      AND u.deleted_at IS NULL
  `;
  const result = await query(sql, [tokenHash], client);
  return mapSessionRow(result.rows[0]);
}

/**
 * Update session last seen timestamp
 * @param {string} id - Session UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function touchSession(id, client = pool) {
  if (!id) throw new TypeError('Session ID is required');

  const sql = `
    UPDATE sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND revoked_at IS NULL
    RETURNING id, last_seen_at
  `;
  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}

/**
 * Revoke a single session
 * @param {string} id - Session UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function revokeSession(id, client = pool) {
  if (!id) throw new TypeError('Session ID is required');

  const sql = `
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND revoked_at IS NULL
    RETURNING id, revoked_at
  `;
  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}

/**
 * Revoke all active sessions for a user
 * @param {string} userId - User UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function revokeAllUserSessions(userId, client = pool) {
  if (!userId) throw new TypeError('User ID is required');

  const sql = `
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND revoked_at IS NULL
    RETURNING id
  `;
  const result = await query(sql, [userId], client);
  return result.rowCount || result.rows.length;
}

/**
 * Find a session by ID (including revoked or expired for audit/ownership checks)
 * @param {string} id - Session UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findSessionById(id, client = pool) {
  if (!id) throw new TypeError('Session ID is required');

  const sql = `
    SELECT
      id,
      user_id,
      device_id,
      session_token_hash,
      session_type,
      expires_at,
      revoked_at,
      created_at,
      last_seen_at
    FROM sessions
    WHERE id = $1
  `;
  const result = await query(sql, [id], client);
  return mapSessionRow(result.rows[0]);
}

/**
 * List active sessions for a user
 * @param {string} userId - User UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findActiveSessionsForUser(userId, client = pool) {
  if (!userId) throw new TypeError('User ID is required');

  const sql = `
    SELECT
      id,
      user_id,
      device_id,
      session_token_hash,
      session_type,
      expires_at,
      revoked_at,
      created_at,
      last_seen_at
    FROM sessions
    WHERE user_id = $1
      AND revoked_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    ORDER BY created_at DESC
  `;
  const result = await query(sql, [userId], client);
  return result.rows.map(mapSessionRow);
}

/**
 * Revoke all active sessions linked to a device
 * @param {string} deviceId - Device UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function revokeSessionsByDeviceId(deviceId, client = pool) {
  if (!deviceId) throw new TypeError('Device ID is required');

  const sql = `
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE device_id = $1 AND revoked_at IS NULL
    RETURNING id
  `;
  const result = await query(sql, [deviceId], client);
  return result.rowCount || result.rows.length;
}
