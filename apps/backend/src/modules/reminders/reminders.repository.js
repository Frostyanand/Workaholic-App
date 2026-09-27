import { query, pool } from '../../core/db.js';

export function mapRecipientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    reminderId: row.reminder_id,
    userId: row.user_id,
    recipientStatus: row.recipient_status,
    nextTriggerAt: row.next_trigger_at,
    dismissedAt: row.dismissed_at,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapReminderRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    eventId: row.event_id,
    bookingId: row.booking_id,
    triggerType: row.trigger_type,
    triggerAt: row.trigger_at,
    relativeOffset: row.relative_offset,
    priority: row.priority,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.recipients ? { recipients: row.recipients.map(mapRecipientRow) } : {}),
  };
}

export async function createReminder(data, client = pool) {
  const {
    workspaceId,
    taskId = null,
    eventId = null,
    bookingId = null,
    triggerType,
    triggerAt = null,
    relativeOffset = null,
    priority = 'NORMAL',
    status = 'PENDING',
    createdBy,
  } = data;

  const sql = `
    INSERT INTO reminders (
      workspace_id, task_id, event_id, booking_id, trigger_type,
      trigger_at, relative_offset, priority, status, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;

  const params = [
    workspaceId,
    taskId,
    eventId,
    bookingId,
    triggerType,
    triggerAt,
    relativeOffset,
    priority,
    status,
    createdBy,
  ];

  const res = await query(sql, params, client);
  return mapReminderRow(res.rows[0]);
}

export async function findReminderById(id, workspaceId = null, client = pool) {
  let sql = `
    SELECT r.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', rr.id,
            'reminder_id', rr.reminder_id,
            'user_id', rr.user_id,
            'recipient_status', rr.recipient_status,
            'next_trigger_at', rr.next_trigger_at,
            'dismissed_at', rr.dismissed_at,
            'snoozed_until', rr.snoozed_until,
            'created_at', rr.created_at,
            'updated_at', rr.updated_at
          )
        ) FILTER (WHERE rr.id IS NOT NULL),
        '[]'
      ) AS recipients
    FROM reminders r
    LEFT JOIN reminder_recipients rr ON r.id = rr.reminder_id
    WHERE r.id = $1
  `;
  const params = [id];

  if (workspaceId) {
    sql += ` AND r.workspace_id = $2`;
    params.push(workspaceId);
  }

  sql += ` GROUP BY r.id;`;

  const res = await query(sql, params, client);
  if (res.rows.length === 0) return null;
  return mapReminderRow(res.rows[0]);
}

export async function findReminders(filter = {}, client = pool) {
  const { workspaceId, taskId, eventId, status, limit = 50, cursor } = filter;
  const conditions = [];
  const params = [];

  if (workspaceId) {
    params.push(workspaceId);
    conditions.push(`r.workspace_id = $${params.length}`);
  }
  if (taskId) {
    params.push(taskId);
    conditions.push(`r.task_id = $${params.length}`);
  }
  if (eventId) {
    params.push(eventId);
    conditions.push(`r.event_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (cursor) {
    params.push(cursor);
    conditions.push(`r.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const sql = `
    SELECT r.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', rr.id,
            'reminder_id', rr.reminder_id,
            'user_id', rr.user_id,
            'recipient_status', rr.recipient_status,
            'next_trigger_at', rr.next_trigger_at,
            'dismissed_at', rr.dismissed_at,
            'snoozed_until', rr.snoozed_until,
            'created_at', rr.created_at,
            'updated_at', rr.updated_at
          )
        ) FILTER (WHERE rr.id IS NOT NULL),
        '[]'
      ) AS recipients
    FROM reminders r
    LEFT JOIN reminder_recipients rr ON r.id = rr.reminder_id
    ${whereClause}
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT $${params.length};
  `;

  const res = await query(sql, params, client);
  return res.rows.map(mapReminderRow);
}

export async function updateReminder(id, updates = {}, client = pool) {
  const allowed = ['trigger_type', 'trigger_at', 'relative_offset', 'priority', 'status'];
  const setClauses = [];
  const params = [id];

  for (const [key, val] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    if (allowed.includes(snakeKey)) {
      params.push(val);
      setClauses.push(`${snakeKey} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findReminderById(id, null, client);
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  const sql = `
    UPDATE reminders
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;

  const res = await query(sql, params, client);
  if (res.rows.length === 0) return null;
  return mapReminderRow(res.rows[0]);
}

export async function deleteReminder(id, workspaceId = null, client = pool) {
  let sql = `DELETE FROM reminders WHERE id = $1`;
  const params = [id];
  if (workspaceId) {
    sql += ` AND workspace_id = $2`;
    params.push(workspaceId);
  }
  sql += ` RETURNING id;`;
  const res = await query(sql, params, client);
  return res.rows.length > 0;
}

export async function createReminderRecipient(reminderId, userId, triggerAt, client = pool) {
  const sql = `
    INSERT INTO reminder_recipients (
      reminder_id, user_id, recipient_status, next_trigger_at
    ) VALUES ($1, $2, 'PENDING', $3)
    ON CONFLICT (reminder_id, user_id) DO UPDATE
      SET next_trigger_at = EXCLUDED.next_trigger_at,
          recipient_status = 'PENDING',
          dismissed_at = NULL,
          snoozed_until = NULL,
          updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;
  const res = await query(sql, [reminderId, userId, triggerAt], client);
  return mapRecipientRow(res.rows[0]);
}

export async function findRecipient(reminderId, userId, client = pool) {
  const sql = `
    SELECT * FROM reminder_recipients
    WHERE reminder_id = $1 AND user_id = $2;
  `;
  const res = await query(sql, [reminderId, userId], client);
  if (res.rows.length === 0) return null;
  return mapRecipientRow(res.rows[0]);
}

export async function findRecipientsByReminderId(reminderId, client = pool) {
  const sql = `
    SELECT * FROM reminder_recipients
    WHERE reminder_id = $1
    ORDER BY created_at ASC;
  `;
  const res = await query(sql, [reminderId], client);
  return res.rows.map(mapRecipientRow);
}

export async function snoozeRecipient(reminderId, userId, snoozeUntil, client = pool) {
  const sql = `
    UPDATE reminder_recipients
    SET recipient_status = 'SNOOZED',
        snoozed_until = $3,
        next_trigger_at = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE reminder_id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await query(sql, [reminderId, userId, snoozeUntil], client);
  if (res.rows.length === 0) return null;
  return mapRecipientRow(res.rows[0]);
}

export async function dismissRecipient(reminderId, userId, client = pool) {
  const sql = `
    UPDATE reminder_recipients
    SET recipient_status = 'DISMISSED',
        dismissed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE reminder_id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await query(sql, [reminderId, userId], client);
  if (res.rows.length === 0) return null;
  return mapRecipientRow(res.rows[0]);
}

export async function removeRecipient(reminderId, userId, client = pool) {
  const sql = `
    DELETE FROM reminder_recipients
    WHERE reminder_id = $1 AND user_id = $2
    RETURNING id;
  `;
  const res = await query(sql, [reminderId, userId], client);
  return res.rows.length > 0;
}

export async function suppressRemindersForTask(taskId, client = pool) {
  // When task is completed, suppress pending reminders for that task
  const sqlReminders = `
    UPDATE reminders
    SET status = 'CANCELLED',
        updated_at = CURRENT_TIMESTAMP
    WHERE task_id = $1 AND status IN ('PENDING', 'ACTIVE')
    RETURNING id;
  `;
  const resReminders = await query(sqlReminders, [taskId], client);
  if (resReminders.rows.length > 0) {
    const reminderIds = resReminders.rows.map(r => r.id);
    const sqlRecipients = `
      UPDATE reminder_recipients
      SET recipient_status = 'CANCELLED',
          updated_at = CURRENT_TIMESTAMP
      WHERE reminder_id = ANY($1::uuid[]) AND recipient_status = 'PENDING';
    `;
    await query(sqlRecipients, [reminderIds], client);
  }
  return resReminders.rows.length;
}

export async function suppressRemindersForEvent(eventId, client = pool) {
  const sqlReminders = `
    UPDATE reminders
    SET status = 'CANCELLED',
        updated_at = CURRENT_TIMESTAMP
    WHERE event_id = $1 AND status IN ('PENDING', 'ACTIVE')
    RETURNING id;
  `;
  const resReminders = await query(sqlReminders, [eventId], client);
  if (resReminders.rows.length > 0) {
    const reminderIds = resReminders.rows.map(r => r.id);
    const sqlRecipients = `
      UPDATE reminder_recipients
      SET recipient_status = 'CANCELLED',
          updated_at = CURRENT_TIMESTAMP
      WHERE reminder_id = ANY($1::uuid[]) AND recipient_status = 'PENDING';
    `;
    await query(sqlRecipients, [reminderIds], client);
  }
  return resReminders.rows.length;
}

export async function findDueReminderRecipients(
  currentTime = new Date(),
  limit = 50,
  client = pool,
) {
  const isTransaction = client !== pool;
  const lockClause = isTransaction ? ' FOR UPDATE OF rr SKIP LOCKED' : '';
  const sql = `
    SELECT
      rr.id,
      rr.reminder_id,
      rr.user_id,
      rr.recipient_status,
      rr.next_trigger_at,
      rr.dismissed_at,
      rr.snoozed_until,
      r.workspace_id,
      r.task_id,
      r.event_id,
      r.booking_id,
      r.trigger_type,
      r.priority,
      r.created_by,
      t.title AS task_title,
      e.title AS event_title
    FROM reminder_recipients rr
    JOIN reminders r ON rr.reminder_id = r.id
    LEFT JOIN tasks t ON r.task_id = t.id
    LEFT JOIN events e ON r.event_id = e.id
    WHERE rr.recipient_status IN ('PENDING', 'SNOOZED')
      AND rr.next_trigger_at <= $1
      AND rr.dismissed_at IS NULL
      AND (rr.snoozed_until IS NULL OR rr.snoozed_until <= $1)
      AND r.status IN ('PENDING', 'ACTIVE')
    ORDER BY rr.next_trigger_at ASC
    LIMIT $2${lockClause};
  `;
  const res = await query(sql, [currentTime, limit], client);
  return res.rows;
}

export async function markRecipientDelivered(recipientId, client = pool) {
  const sql = `
    UPDATE reminder_recipients
    SET recipient_status = 'SENT',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [recipientId], client);
  return res.rows[0] ? mapRecipientRow(res.rows[0]) : null;
}

export async function advanceRecipientRecurrence(recipientId, nextTriggerAt, client = pool) {
  const sql = `
    UPDATE reminder_recipients
    SET next_trigger_at = $2,
        recipient_status = 'PENDING',
        dismissed_at = NULL,
        snoozed_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [recipientId, nextTriggerAt], client);
  return res.rows[0] ? mapRecipientRow(res.rows[0]) : null;
}

export async function cancelRecipient(recipientId, client = pool) {
  const sql = `
    UPDATE reminder_recipients
    SET recipient_status = 'CANCELLED',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [recipientId], client);
  return res.rows[0] ? mapRecipientRow(res.rows[0]) : null;
}
