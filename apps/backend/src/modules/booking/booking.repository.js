import { pool } from '../../core/db.js';

export function mapBookingPageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    workspaceId: row.workspace_id,
    calendarId: row.calendar_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    timezone: row.timezone,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapBookingTypeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingPageId: row.booking_page_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    duration: parseInt(row.duration, 10),
    bufferBefore: parseInt(row.buffer_before, 10),
    bufferAfter: parseInt(row.buffer_after, 10),
    minimumNotice: parseInt(row.minimum_notice, 10),
    maximumHorizon: parseInt(row.maximum_horizon, 10),
    cancellationDeadline: parseInt(row.cancellation_deadline, 10),
    reschedulingEnabled: Boolean(row.rescheduling_enabled),
    location: row.location,
    meetingUrl: row.meeting_url,
    createTask: Boolean(row.create_task),
    taskPriority: row.task_priority,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapAvailabilityRuleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingPageId: row.booking_page_id,
    weekday: parseInt(row.weekday, 10),
    startTime: row.start_time,
    endTime: row.end_time,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAvailabilityExceptionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingPageId: row.booking_page_id,
    exceptionDate: row.exception_date,
    isUnavailable: Boolean(row.is_unavailable),
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBookingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingTypeId: row.booking_type_id,
    bookingPageId: row.booking_page_id,
    ownerUserId: row.owner_user_id,
    workspaceId: row.workspace_id,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestNotes: row.guest_notes,
    startAt: row.start_at,
    endAt: row.end_at,
    bufferStartAt: row.buffer_start_at,
    bufferEndAt: row.buffer_end_at,
    timezone: row.timezone,
    status: row.status,
    calendarEventId: row.calendar_event_id,
    taskId: row.task_id,
    cancellationReason: row.cancellation_reason,
    rescheduledFromBookingId: row.rescheduled_from_booking_id,
    rescheduledToBookingId: row.rescheduled_to_booking_id,
    manageToken: row.manage_token,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
    deletedAt: row.deleted_at,
    ...(row.booking_type_name ? { bookingTypeName: row.booking_type_name } : {}),
    ...(row.booking_page_name ? { bookingPageName: row.booking_page_name } : {}),
    ...(row.booking_page_slug ? { bookingPageSlug: row.booking_page_slug } : {}),
  };
}

// =========================================================
// Booking Pages Repository
// =========================================================

export async function createBookingPage(data, client = pool) {
  const sql = `
    INSERT INTO booking_pages (
      owner_user_id, workspace_id, calendar_id, name, slug, description, timezone, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const values = [
    data.ownerUserId,
    data.workspaceId,
    data.calendarId || null,
    data.name,
    data.slug,
    data.description || null,
    data.timezone || 'UTC',
    data.status || 'ACTIVE',
  ];
  const result = await client.query(sql, values);
  return mapBookingPageRow(result.rows[0]);
}

export async function updateBookingPage(id, data, client = pool) {
  const updates = [];
  const values = [id];
  let paramIdx = 2;

  const fields = ['name', 'slug', 'description', 'timezone', 'status', 'calendar_id'];
  for (const field of fields) {
    const camel =
      field === 'calendar_id'
        ? 'calendarId'
        : field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (data[camel] !== undefined) {
      updates.push(`${field} = $${paramIdx++}`);
      values.push(data[camel]);
    }
  }

  if (updates.length === 0) {
    return getBookingPageById(id, client);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  const sql = `
    UPDATE booking_pages
    SET ${updates.join(', ')}
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
  const result = await client.query(sql, values);
  return mapBookingPageRow(result.rows[0]);
}

export async function getBookingPageById(id, client = pool) {
  const sql = `SELECT * FROM booking_pages WHERE id = $1 AND deleted_at IS NULL;`;
  const result = await client.query(sql, [id]);
  return mapBookingPageRow(result.rows[0]);
}

export async function getBookingPageBySlug(slug, client = pool) {
  const sql = `SELECT * FROM booking_pages WHERE slug = $1 AND deleted_at IS NULL;`;
  const result = await client.query(sql, [slug]);
  return mapBookingPageRow(result.rows[0]);
}

export async function listBookingPagesByWorkspace(workspaceId, client = pool) {
  const sql = `
    SELECT * FROM booking_pages
    WHERE workspace_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC;
  `;
  const result = await client.query(sql, [workspaceId]);
  return result.rows.map(mapBookingPageRow);
}

export async function deleteBookingPage(id, client = pool) {
  const sql = `
    UPDATE booking_pages
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;
  const result = await client.query(sql, [id]);
  return mapBookingPageRow(result.rows[0]);
}

// =========================================================
// Booking Types Repository
// =========================================================

export async function createBookingType(data, client = pool) {
  const sql = `
    INSERT INTO booking_types (
      booking_page_id, name, slug, description, duration, buffer_before, buffer_after,
      minimum_notice, maximum_horizon, cancellation_deadline, rescheduling_enabled,
      location, meeting_url, create_task, task_priority, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *;
  `;
  const values = [
    data.bookingPageId,
    data.name,
    data.slug,
    data.description || null,
    data.duration,
    data.bufferBefore ?? 0,
    data.bufferAfter ?? 0,
    data.minimumNotice ?? 120,
    data.maximumHorizon ?? 30,
    data.cancellationDeadline ?? 60,
    data.reschedulingEnabled ?? true,
    data.location || null,
    data.meetingUrl || null,
    data.createTask ?? false,
    data.taskPriority || 'P3',
    data.isActive ?? true,
  ];
  const result = await client.query(sql, values);
  return mapBookingTypeRow(result.rows[0]);
}

export async function updateBookingType(id, data, client = pool) {
  const updates = [];
  const values = [id];
  let paramIdx = 2;

  const mapping = {
    name: 'name',
    slug: 'slug',
    description: 'description',
    duration: 'duration',
    bufferBefore: 'buffer_before',
    bufferAfter: 'buffer_after',
    minimumNotice: 'minimum_notice',
    maximumHorizon: 'maximum_horizon',
    cancellationDeadline: 'cancellation_deadline',
    reschedulingEnabled: 'rescheduling_enabled',
    location: 'location',
    meetingUrl: 'meeting_url',
    createTask: 'create_task',
    taskPriority: 'task_priority',
    isActive: 'is_active',
  };

  for (const [camel, col] of Object.entries(mapping)) {
    if (data[camel] !== undefined) {
      updates.push(`${col} = $${paramIdx++}`);
      values.push(data[camel]);
    }
  }

  if (updates.length === 0) {
    return getBookingTypeById(id, client);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  const sql = `
    UPDATE booking_types
    SET ${updates.join(', ')}
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
  const result = await client.query(sql, values);
  return mapBookingTypeRow(result.rows[0]);
}

export async function getBookingTypeById(id, client = pool) {
  const sql = `SELECT * FROM booking_types WHERE id = $1 AND deleted_at IS NULL;`;
  const result = await client.query(sql, [id]);
  return mapBookingTypeRow(result.rows[0]);
}

export async function listBookingTypesByPage(bookingPageId, activeOnly = false, client = pool) {
  let sql = `
    SELECT * FROM booking_types
    WHERE booking_page_id = $1 AND deleted_at IS NULL
  `;
  if (activeOnly) {
    sql += ` AND is_active = true`;
  }
  sql += ` ORDER BY duration ASC, name ASC;`;
  const result = await client.query(sql, [bookingPageId]);
  return result.rows.map(mapBookingTypeRow);
}

export async function deleteBookingType(id, client = pool) {
  const sql = `
    UPDATE booking_types
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;
  const result = await client.query(sql, [id]);
  return mapBookingTypeRow(result.rows[0]);
}

// =========================================================
// Availability Rules & Exceptions
// =========================================================

export async function setAvailabilityRules(bookingPageId, rules, client = pool) {
  // Wipe current rules for page and insert new set
  await client.query(`DELETE FROM availability_rules WHERE booking_page_id = $1;`, [bookingPageId]);

  if (!rules || rules.length === 0) {
    return [];
  }

  const inserted = [];
  for (const rule of rules) {
    const sql = `
      INSERT INTO availability_rules (
        booking_page_id, weekday, start_time, end_time, effective_from, effective_until, timezone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const res = await client.query(sql, [
      bookingPageId,
      rule.weekday,
      rule.startTime,
      rule.endTime,
      rule.effectiveFrom || null,
      rule.effectiveUntil || null,
      rule.timezone || 'UTC',
    ]);
    inserted.push(mapAvailabilityRuleRow(res.rows[0]));
  }
  return inserted;
}

export async function getAvailabilityRulesByPage(bookingPageId, client = pool) {
  const sql = `
    SELECT * FROM availability_rules
    WHERE booking_page_id = $1
    ORDER BY weekday ASC, start_time ASC;
  `;
  const result = await client.query(sql, [bookingPageId]);
  return result.rows.map(mapAvailabilityRuleRow);
}

export async function createAvailabilityException(data, client = pool) {
  const sql = `
    INSERT INTO availability_exceptions (
      booking_page_id, exception_date, is_unavailable, start_time, end_time, reason
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [
    data.bookingPageId,
    data.exceptionDate,
    data.isUnavailable ?? true,
    data.startTime || null,
    data.endTime || null,
    data.reason || null,
  ];
  const result = await client.query(sql, values);
  return mapAvailabilityExceptionRow(result.rows[0]);
}

export async function deleteAvailabilityException(id, client = pool) {
  const sql = `DELETE FROM availability_exceptions WHERE id = $1 RETURNING *;`;
  const result = await client.query(sql, [id]);
  return mapAvailabilityExceptionRow(result.rows[0]);
}

export async function getAvailabilityExceptionsByPage(
  bookingPageId,
  startDate = null,
  endDate = null,
  client = pool,
) {
  const conditions = ['booking_page_id = $1'];
  const values = [bookingPageId];
  let pIdx = 2;

  if (startDate) {
    conditions.push(`exception_date >= $${pIdx++}`);
    values.push(startDate);
  }
  if (endDate) {
    conditions.push(`exception_date <= $${pIdx++}`);
    values.push(endDate);
  }

  const sql = `
    SELECT * FROM availability_exceptions
    WHERE ${conditions.join(' AND ')}
    ORDER BY exception_date ASC, start_time ASC;
  `;
  const result = await client.query(sql, values);
  return result.rows.map(mapAvailabilityExceptionRow);
}

// =========================================================
// Bookings Repository
// =========================================================

export async function createBooking(data, client = pool) {
  const sql = `
    INSERT INTO bookings (
      booking_type_id, booking_page_id, owner_user_id, workspace_id,
      guest_name, guest_email, guest_notes, start_at, end_at,
      buffer_start_at, buffer_end_at, timezone, status,
      calendar_event_id, task_id, manage_token, idempotency_key,
      rescheduled_from_booking_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    RETURNING *;
  `;
  const values = [
    data.bookingTypeId,
    data.bookingPageId,
    data.ownerUserId,
    data.workspaceId,
    data.guestName,
    data.guestEmail,
    data.guestNotes || null,
    data.startAt,
    data.endAt,
    data.bufferStartAt,
    data.bufferEndAt,
    data.timezone || 'UTC',
    data.status || 'CONFIRMED',
    data.calendarEventId || null,
    data.taskId || null,
    data.manageToken,
    data.idempotencyKey || null,
    data.rescheduledFromBookingId || null,
  ];
  const result = await client.query(sql, values);
  return mapBookingRow(result.rows[0]);
}

export async function getBookingById(id, client = pool) {
  const sql = `
    SELECT b.*,
      bt.name AS booking_type_name,
      bp.name AS booking_page_name,
      bp.slug AS booking_page_slug
    FROM bookings b
    JOIN booking_types bt ON b.booking_type_id = bt.id
    JOIN booking_pages bp ON b.booking_page_id = bp.id
    WHERE b.id = $1 AND b.deleted_at IS NULL;
  `;
  const result = await client.query(sql, [id]);
  return mapBookingRow(result.rows[0]);
}

export async function getBookingByManageToken(manageToken, client = pool) {
  const sql = `
    SELECT b.*,
      bt.name AS booking_type_name,
      bp.name AS booking_page_name,
      bp.slug AS booking_page_slug
    FROM bookings b
    JOIN booking_types bt ON b.booking_type_id = bt.id
    JOIN booking_pages bp ON b.booking_page_id = bp.id
    WHERE b.manage_token = $1 AND b.deleted_at IS NULL;
  `;
  const result = await client.query(sql, [manageToken]);
  return mapBookingRow(result.rows[0]);
}

export async function getBookingByIdempotencyKey(idempotencyKey, client = pool) {
  if (!idempotencyKey) return null;
  const sql = `
    SELECT b.*,
      bt.name AS booking_type_name,
      bp.name AS booking_page_name,
      bp.slug AS booking_page_slug
    FROM bookings b
    JOIN booking_types bt ON b.booking_type_id = bt.id
    JOIN booking_pages bp ON b.booking_page_id = bp.id
    WHERE b.idempotency_key = $1 AND b.deleted_at IS NULL;
  `;
  const result = await client.query(sql, [idempotencyKey]);
  return mapBookingRow(result.rows[0]);
}

export async function updateBookingStatus(id, status, updates = {}, client = pool) {
  const setClauses = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
  const values = [id, status];
  let pIdx = 3;

  if (updates.cancelledAt !== undefined) {
    setClauses.push(`cancelled_at = $${pIdx++}`);
    values.push(updates.cancelledAt);
  }
  if (updates.cancellationReason !== undefined) {
    setClauses.push(`cancellation_reason = $${pIdx++}`);
    values.push(updates.cancellationReason);
  }
  if (updates.rescheduledToBookingId !== undefined) {
    setClauses.push(`rescheduled_to_booking_id = $${pIdx++}`);
    values.push(updates.rescheduledToBookingId);
  }
  if (updates.calendarEventId !== undefined) {
    setClauses.push(`calendar_event_id = $${pIdx++}`);
    values.push(updates.calendarEventId);
  }
  if (updates.taskId !== undefined) {
    setClauses.push(`task_id = $${pIdx++}`);
    values.push(updates.taskId);
  }

  const sql = `
    UPDATE bookings
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
  const result = await client.query(sql, values);
  return mapBookingRow(result.rows[0]);
}

export async function listBookingsByOwner(ownerUserId, filters = {}, client = pool) {
  const conditions = ['b.owner_user_id = $1', 'b.deleted_at IS NULL'];
  const values = [ownerUserId];
  let pIdx = 2;

  if (filters.bookingPageId) {
    conditions.push(`b.booking_page_id = $${pIdx++}`);
    values.push(filters.bookingPageId);
  }
  if (filters.status) {
    conditions.push(`b.status = $${pIdx++}`);
    values.push(filters.status);
  }
  if (filters.startDate) {
    conditions.push(`b.start_at >= $${pIdx++}`);
    values.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`b.end_at <= $${pIdx++}`);
    values.push(filters.endDate);
  }

  const sql = `
    SELECT b.*,
      bt.name AS booking_type_name,
      bp.name AS booking_page_name,
      bp.slug AS booking_page_slug
    FROM bookings b
    JOIN booking_types bt ON b.booking_type_id = bt.id
    JOIN booking_pages bp ON b.booking_page_id = bp.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY b.start_at ASC;
  `;
  const result = await client.query(sql, values);
  return result.rows.map(mapBookingRow);
}

export async function findConflictingConfirmedBookings(
  ownerUserId,
  bufferStartAt,
  bufferEndAt,
  excludeBookingId = null,
  client = pool,
) {
  const conditions = [
    'owner_user_id = $1',
    "status = 'CONFIRMED'",
    'deleted_at IS NULL',
    'buffer_start_at < $3',
    'buffer_end_at > $2',
  ];
  const values = [ownerUserId, bufferStartAt, bufferEndAt];

  if (excludeBookingId) {
    conditions.push('id != $4');
    values.push(excludeBookingId);
  }

  const sql = `
    SELECT * FROM bookings
    WHERE ${conditions.join(' AND ')}
    FOR UPDATE;
  `;
  const result = await client.query(sql, values);
  return result.rows.map(mapBookingRow);
}
