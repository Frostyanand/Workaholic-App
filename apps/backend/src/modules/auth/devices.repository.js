import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean device domain object
 */
export function mapDeviceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    deviceName: row.device_name,
    applicationVersion: row.application_version,
    pushTokenReference: row.push_token_reference,
    trustState: row.trust_state,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Register or record a device for a user
 * @param {object} deviceData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function registerDevice(deviceData, client = pool) {
  if (!deviceData || typeof deviceData !== 'object') {
    throw new TypeError('deviceData must be an object');
  }
  const {
    userId,
    platform,
    deviceName,
    applicationVersion = null,
    pushTokenReference = null,
    trustState = 'UNTRUSTED',
  } = deviceData;

  if (!userId || !platform || !deviceName) {
    throw new Error('userId, platform, and deviceName are required');
  }

  const sql = `
    INSERT INTO devices (
      user_id,
      platform,
      device_name,
      application_version,
      push_token_reference,
      trust_state
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, user_id, platform, device_name, application_version, push_token_reference, trust_state, last_seen_at, created_at, updated_at
  `;

  const result = await query(
    sql,
    [userId, platform, deviceName, applicationVersion, pushTokenReference, trustState],
    client,
  );
  return mapDeviceRow(result.rows[0]);
}

/**
 * Find device by ID
 * @param {string} id - Device UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findDeviceById(id, client = pool) {
  if (!id) throw new TypeError('Device ID is required');

  const sql = `
    SELECT id, user_id, platform, device_name, application_version, push_token_reference, trust_state, last_seen_at, created_at, updated_at
    FROM devices
    WHERE id = $1
  `;
  const result = await query(sql, [id], client);
  return mapDeviceRow(result.rows[0]);
}

/**
 * Find all devices for a given user
 * @param {string} userId - User UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findDevicesForUser(userId, client = pool) {
  if (!userId) throw new TypeError('User ID is required');

  const sql = `
    SELECT id, user_id, platform, device_name, application_version, push_token_reference, trust_state, last_seen_at, created_at, updated_at
    FROM devices
    WHERE user_id = $1
    ORDER BY last_seen_at DESC
  `;
  const result = await query(sql, [userId], client);
  return result.rows.map(mapDeviceRow);
}

/**
 * Update trust state for a device
 * @param {string} id - Device UUID
 * @param {'TRUSTED' | 'UNTRUSTED' | 'REVOKED'} trustState
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateDeviceTrustState(id, trustState, client = pool) {
  if (!id || !trustState) throw new Error('Device ID and trustState are required');

  const sql = `
    UPDATE devices
    SET trust_state = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, user_id, platform, device_name, application_version, push_token_reference, trust_state, last_seen_at, created_at, updated_at
  `;
  const result = await query(sql, [id, trustState], client);
  return mapDeviceRow(result.rows[0]);
}

/**
 * Update device last seen timestamp
 * @param {string} id - Device UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function touchDevice(id, client = pool) {
  if (!id) throw new TypeError('Device ID is required');

  const sql = `
    UPDATE devices
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, last_seen_at
  `;
  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}

/**
 * Delete a device record
 * @param {string} id - Device UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function deleteDevice(id, client = pool) {
  if (!id) throw new TypeError('Device ID is required');

  const sql = `DELETE FROM devices WHERE id = $1 RETURNING id`;
  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}
