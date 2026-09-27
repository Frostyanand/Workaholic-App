import { query, pool } from '../../core/db.js';

export function mapNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    reminderRecipientId: row.reminder_recipient_id,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    targetReference: row.target_reference || {},
    createdAt: row.created_at,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
  };
}

export function mapDeliveryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    notificationId: row.notification_id,
    deviceId: row.device_id,
    channel: row.channel,
    status: row.status,
    attemptCount: row.attempt_count !== undefined ? Number(row.attempt_count) : 1,
    attemptedAt: row.attempted_at,
    deliveredAt: row.delivered_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

export async function createNotification(data, client = pool) {
  const {
    recipientUserId,
    reminderRecipientId = null,
    notificationType,
    title,
    body,
    targetReference = {},
  } = data;

  const sql = `
    INSERT INTO notifications (
      recipient_user_id, reminder_recipient_id, notification_type,
      title, body, target_reference
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  const params = [
    recipientUserId,
    reminderRecipientId,
    notificationType,
    title,
    body,
    JSON.stringify(targetReference),
  ];

  const res = await query(sql, params, client);
  return mapNotificationRow(res.rows[0]);
}

export async function findNotificationById(id, recipientUserId = null, client = pool) {
  let sql = `SELECT * FROM notifications WHERE id = $1`;
  const params = [id];

  if (recipientUserId) {
    sql += ` AND recipient_user_id = $2`;
    params.push(recipientUserId);
  }

  const res = await query(sql, params, client);
  if (res.rows.length === 0) return null;
  return mapNotificationRow(res.rows[0]);
}

export async function findNotificationByReminderRecipientId(reminderRecipientId, client = pool) {
  const sql = `
    SELECT * FROM notifications
    WHERE reminder_recipient_id = $1
    LIMIT 1;
  `;
  const res = await query(sql, [reminderRecipientId], client);
  if (res.rows.length === 0) return null;
  return mapNotificationRow(res.rows[0]);
}

export async function findNotifications(filter = {}, client = pool) {
  const { recipientUserId, type, unreadOnly, limit = 50, cursor } = filter;
  const conditions = [];
  const params = [];

  if (recipientUserId) {
    params.push(recipientUserId);
    conditions.push(`recipient_user_id = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`notification_type = $${params.length}`);
  }
  if (unreadOnly) {
    conditions.push(`read_at IS NULL AND dismissed_at IS NULL`);
  }
  if (cursor) {
    params.push(cursor);
    conditions.push(`created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const sql = `
    SELECT * FROM notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length};
  `;

  const res = await query(sql, params, client);
  return res.rows.map(mapNotificationRow);
}

export async function markNotificationRead(id, recipientUserId, client = pool) {
  const sql = `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND recipient_user_id = $2
    RETURNING *;
  `;
  const res = await query(sql, [id, recipientUserId], client);
  if (res.rows.length === 0) return null;
  return mapNotificationRow(res.rows[0]);
}

export async function markNotificationDismissed(id, recipientUserId, client = pool) {
  const sql = `
    UPDATE notifications
    SET dismissed_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND recipient_user_id = $2
    RETURNING *;
  `;
  const res = await query(sql, [id, recipientUserId], client);
  if (res.rows.length === 0) return null;
  return mapNotificationRow(res.rows[0]);
}

export async function markAllNotificationsRead(recipientUserId, client = pool) {
  const sql = `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE recipient_user_id = $1 AND read_at IS NULL
    RETURNING id;
  `;
  const res = await query(sql, [recipientUserId], client);
  return res.rows.length;
}

export async function getUnreadCount(recipientUserId, client = pool) {
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE recipient_user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL;
  `;
  const res = await query(sql, [recipientUserId], client);
  return res.rows[0]?.count || 0;
}

export async function createDelivery(data, client = pool) {
  const {
    notificationId,
    deviceId = null,
    channel,
    status = 'PENDING',
    attemptedAt = null,
    deliveredAt = null,
    failureReason = null,
  } = data;

  const sql = `
    INSERT INTO notification_deliveries (
      notification_id, device_id, channel, status, attempted_at, delivered_at, failure_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (notification_id, COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::uuid), channel)
    DO UPDATE SET
      status = EXCLUDED.status,
      attempted_at = EXCLUDED.attempted_at,
      delivered_at = EXCLUDED.delivered_at,
      failure_reason = EXCLUDED.failure_reason
    RETURNING *;
  `;

  const params = [
    notificationId,
    deviceId,
    channel,
    status,
    attemptedAt,
    deliveredAt,
    failureReason,
  ];

  const res = await query(sql, params, client);
  return mapDeliveryRow(res.rows[0]);
}

export async function updateDelivery(id, updates = {}, client = pool) {
  const allowed = ['status', 'attempt_count', 'attempted_at', 'delivered_at', 'failure_reason'];
  const setClauses = [];
  const params = [id];

  for (const [key, val] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    if (allowed.includes(snakeKey)) {
      params.push(val);
      setClauses.push(`${snakeKey} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  const sql = `
    UPDATE notification_deliveries
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;

  const res = await query(sql, params, client);
  if (res.rows.length === 0) return null;
  return mapDeliveryRow(res.rows[0]);
}

export async function findDeliveriesByNotificationId(notificationId, client = pool) {
  const sql = `
    SELECT * FROM notification_deliveries
    WHERE notification_id = $1
    ORDER BY created_at ASC;
  `;
  const res = await query(sql, [notificationId], client);
  return res.rows.map(mapDeliveryRow);
}
