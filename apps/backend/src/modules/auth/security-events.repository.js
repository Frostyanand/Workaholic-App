import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to security event domain object
 */
export function mapSecurityEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceId: row.device_id,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

/**
 * Sanitizes metadata to strictly prevent leaking credentials, raw tokens, or secrets.
 */
function sanitizeEventMetadata(metadata = {}) {
  const sensitiveKeys = [
    'password',
    'token',
    'sessionToken',
    'rawToken',
    'idToken',
    'refreshToken',
    'secret',
    'clientSecret',
    'authorization',
  ];

  const clean = { ...metadata };
  for (const key of Object.keys(clean)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
      clean[key] = '[REDACTED]';
    }
  }
  return clean;
}

/**
 * Append-oriented security event recording conforming to docs/12.PRIVACY-SECURITY.md Section 48 & 49.
 *
 * @param {Object} eventData
 * @param {string|null} [eventData.userId]
 * @param {string} eventData.eventType - e.g. 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', etc.
 * @param {string} [eventData.ipAddress]
 * @param {string} [eventData.userAgent]
 * @param {string|null} [eventData.deviceId]
 * @param {Object} [eventData.metadata]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function recordSecurityEvent(eventData, client = pool) {
  if (!eventData || typeof eventData !== 'object') {
    throw new TypeError('eventData must be an object');
  }

  const {
    userId = null,
    eventType,
    ipAddress = null,
    userAgent = null,
    deviceId = null,
    metadata = {},
  } = eventData;

  if (!eventType) {
    throw new Error('eventType is required');
  }

  const safeMetadata = sanitizeEventMetadata(metadata);

  const sql = `
    INSERT INTO security_events (
      user_id,
      event_type,
      ip_address,
      user_agent,
      device_id,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, user_id, event_type, ip_address, user_agent, device_id, metadata, created_at
  `;

  const result = await query(
    sql,
    [userId, eventType, ipAddress, userAgent, deviceId, JSON.stringify(safeMetadata)],
    client,
  );

  return mapSecurityEventRow(result.rows[0]);
}

/**
 * Retrieve recent security events for an authenticated user with pagination.
 *
 * @param {string} userId
 * @param {Object} [options]
 * @param {number} [options.limit=20]
 * @param {number} [options.offset=0]
 * @param {string} [options.eventType]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findSecurityEventsForUser(userId, options = {}, client = pool) {
  if (!userId) throw new TypeError('userId is required');

  const { limit = 20, offset = 0, eventType } = options;

  let sql = `
    SELECT
      id,
      user_id,
      event_type,
      ip_address,
      user_agent,
      device_id,
      metadata,
      created_at
    FROM security_events
    WHERE user_id = $1
  `;
  const params = [userId];

  if (eventType) {
    params.push(eventType);
    sql += ` AND event_type = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(sql, params, client);
  return result.rows.map(mapSecurityEventRow);
}

/**
 * Count total security events for a user matching filters.
 *
 * @param {string} userId
 * @param {Object} [options]
 * @param {string} [options.eventType]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function countSecurityEventsForUser(userId, options = {}, client = pool) {
  if (!userId) throw new TypeError('userId is required');

  const { eventType } = options;
  let sql = `SELECT COUNT(*) AS total FROM security_events WHERE user_id = $1`;
  const params = [userId];

  if (eventType) {
    params.push(eventType);
    sql += ` AND event_type = $${params.length}`;
  }

  const result = await query(sql, params, client);
  return parseInt(result.rows[0].total, 10);
}
