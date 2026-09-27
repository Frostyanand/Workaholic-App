import { query, pool } from '../../core/db.js';

export function mapDeviceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    deviceName: row.device_name,
    applicationVersion: row.application_version,
    pushToken: row.push_token_reference,
    trustState: row.trust_state,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findDevicesByUserId(userId, client = pool) {
  const sql = `
    SELECT * FROM devices
    WHERE user_id = $1
    ORDER BY last_seen_at DESC;
  `;
  const res = await query(sql, [userId], client);
  return res.rows.map(mapDeviceRow);
}

export async function findActivePushDevices(userId, client = pool) {
  const sql = `
    SELECT * FROM devices
    WHERE user_id = $1
      AND push_token_reference IS NOT NULL
      AND trust_state = 'TRUSTED'
    ORDER BY last_seen_at DESC;
  `;
  const res = await query(sql, [userId], client);
  return res.rows.map(mapDeviceRow);
}

export async function registerPushDevice(data, client = pool) {
  const { userId, platform, pushToken, deviceName = `${platform} Device`, deviceId = null } = data;

  if (deviceId) {
    const updateSql = `
      UPDATE devices
      SET push_token_reference = $1,
          platform = $2,
          device_name = COALESCE($3, device_name),
          trust_state = 'TRUSTED',
          last_seen_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND user_id = $5
      RETURNING *;
    `;
    const res = await query(updateSql, [pushToken, platform, deviceName, deviceId, userId], client);
    if (res.rows.length > 0) {
      return mapDeviceRow(res.rows[0]);
    }
  }

  // Insert or update device by user and device name
  const insertSql = `
    INSERT INTO devices (
      user_id, platform, device_name, push_token_reference, trust_state, last_seen_at
    ) VALUES ($1, $2, $3, $4, 'TRUSTED', CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const res = await query(insertSql, [userId, platform, deviceName, pushToken], client);
  return mapDeviceRow(res.rows[0]);
}

export async function invalidatePushToken(pushToken, client = pool) {
  const sql = `
    UPDATE devices
    SET push_token_reference = NULL,
        trust_state = 'UNTRUSTED',
        updated_at = CURRENT_TIMESTAMP
    WHERE push_token_reference = $1
    RETURNING id;
  `;
  const res = await query(sql, [pushToken], client);
  return res.rows.length;
}

export async function findDeviceById(id, client = pool) {
  const sql = `SELECT * FROM devices WHERE id = $1;`;
  const res = await query(sql, [id], client);
  if (res.rows.length === 0) return null;
  return mapDeviceRow(res.rows[0]);
}

export async function updateDevice(id, userId, fields = {}, client = pool) {
  const allowed = ['device_name', 'platform', 'trust_state'];
  const setClauses = [];
  const params = [id, userId];

  for (const [key, val] of Object.entries(fields)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    if (allowed.includes(snakeKey)) {
      params.push(val);
      setClauses.push(`${snakeKey} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    const sql = `SELECT * FROM devices WHERE id = $1 AND user_id = $2;`;
    const res = await query(sql, [id, userId], client);
    return res.rows[0] ? mapDeviceRow(res.rows[0]) : null;
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  const sql = `
    UPDATE devices
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await query(sql, params, client);
  return res.rows[0] ? mapDeviceRow(res.rows[0]) : null;
}

export async function deleteDevice(id, userId, client = pool) {
  const sql = `
    DELETE FROM devices
    WHERE id = $1 AND user_id = $2
    RETURNING id;
  `;
  const res = await query(sql, [id, userId], client);
  return res.rows.length > 0;
}
