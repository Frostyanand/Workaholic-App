/**
 * Academic & Day Order Repository
 * Parameterized PostgreSQL queries with explicit transaction support
 */

import { pool } from '../../core/db.js';

export function formatDbDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

// --- ROW MAPPERS ---

export function mapSemesterRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    calendarId: row.calendar_id,
    name: row.name,
    academicYear: row.academic_year,
    institution: row.institution,
    startDate: formatDbDate(row.start_date),
    endDate: formatDbDate(row.end_date),
    timezone: row.timezone,
    dayOrderCount: Number(row.day_order_count),
    status: row.status,
    metadata: row.metadata || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapAcademicDateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    semesterId: row.semester_id,
    workspaceId: row.workspace_id,
    calendarDate: formatDbDate(row.calendar_date),
    dayStatus: row.day_status,
    reason: row.reason,
    dayOrder: row.day_order,
    overrideDayOrder: row.override_day_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapClassScheduleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    semesterId: row.semester_id,
    name: row.name,
    description: row.description,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapScheduleEntryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    classScheduleId: row.class_schedule_id,
    workspaceId: row.workspace_id,
    dayOrder: row.day_order,
    courseName: row.course_name,
    courseCode: row.course_code,
    instructor: row.instructor,
    room: row.room,
    startTime: typeof row.start_time === 'string' ? row.start_time.slice(0, 5) : row.start_time,
    endTime: typeof row.end_time === 'string' ? row.end_time.slice(0, 5) : row.end_time,
    color: row.color,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAcademicExceptionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    semesterId: row.semester_id,
    workspaceId: row.workspace_id,
    scheduleEntryId: row.schedule_entry_id,
    calendarDate: formatDbDate(row.calendar_date),
    exceptionType: row.exception_type,
    reason: row.reason,
    rescheduledDate: formatDbDate(row.rescheduled_date),
    rescheduledStartTime: row.rescheduled_start_time
      ? typeof row.rescheduled_start_time === 'string'
        ? row.rescheduled_start_time.slice(0, 5)
        : row.rescheduled_start_time
      : null,
    rescheduledEndTime: row.rescheduled_end_time
      ? typeof row.rescheduled_end_time === 'string'
        ? row.rescheduled_end_time.slice(0, 5)
        : row.rescheduled_end_time
      : null,
    rescheduledRoom: row.rescheduled_room,
    eventId: row.event_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- SEMESTERS ---

export async function createSemester(semesterData, client = pool) {
  const {
    workspaceId,
    calendarId = null,
    name,
    academicYear = null,
    institution = null,
    startDate,
    endDate,
    timezone = 'UTC',
    dayOrderCount = 5,
    status = 'UPCOMING',
    metadata = {},
    createdBy = null,
  } = semesterData;

  const sql = `
    INSERT INTO semesters (
      workspace_id,
      calendar_id,
      name,
      academic_year,
      institution,
      start_date,
      end_date,
      timezone,
      day_order_count,
      status,
      metadata,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;
  `;

  const { rows } = await client.query(sql, [
    workspaceId,
    calendarId,
    name,
    academicYear,
    institution,
    startDate,
    endDate,
    timezone,
    dayOrderCount,
    status,
    JSON.stringify(metadata),
    createdBy,
  ]);

  return mapSemesterRow(rows[0]);
}

export async function findSemesterById(semesterId, client = pool) {
  const sql = `
    SELECT * FROM semesters
    WHERE id = $1 AND deleted_at IS NULL;
  `;
  const { rows } = await client.query(sql, [semesterId]);
  return mapSemesterRow(rows[0]);
}

export async function findSemestersByWorkspace(workspaceId, { status = null } = {}, client = pool) {
  let sql = `
    SELECT * FROM semesters
    WHERE workspace_id = $1 AND deleted_at IS NULL
  `;
  const params = [workspaceId];

  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY start_date DESC;`;

  const { rows } = await client.query(sql, params);
  return rows.map(mapSemesterRow);
}

export async function updateSemester(semesterId, updates, client = pool) {
  const fields = [];
  const values = [];

  const allowedFields = {
    name: 'name',
    academicYear: 'academic_year',
    institution: 'institution',
    startDate: 'start_date',
    endDate: 'end_date',
    timezone: 'timezone',
    dayOrderCount: 'day_order_count',
    calendarId: 'calendar_id',
    status: 'status',
    metadata: 'metadata',
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      values.push(key === 'metadata' ? JSON.stringify(updates[key]) : updates[key]);
      fields.push(`${col} = $${values.length}`);
    }
  }

  if (fields.length === 0) {
    return findSemesterById(semesterId, client);
  }

  values.push(semesterId);
  const sql = `
    UPDATE semesters
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${values.length} AND deleted_at IS NULL
    RETURNING *;
  `;

  const { rows } = await client.query(sql, values);
  return mapSemesterRow(rows[0]);
}

export async function setSemesterStatus(semesterId, status, client = pool) {
  const sql = `
    UPDATE semesters
    SET status = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;
  const { rows } = await client.query(sql, [status, semesterId]);
  return mapSemesterRow(rows[0]);
}

export async function deleteSemester(semesterId, client = pool) {
  const sql = `
    UPDATE semesters
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id;
  `;
  const { rows } = await client.query(sql, [semesterId]);
  return rows.length > 0;
}

// --- ACADEMIC CALENDAR DATES ---

export async function upsertAcademicDate(data, client = pool) {
  const {
    semesterId,
    workspaceId,
    calendarDate,
    dayStatus,
    reason = null,
    dayOrder = null,
    overrideDayOrder = null,
  } = data;

  const sql = `
    INSERT INTO academic_calendar_dates (
      semester_id,
      workspace_id,
      calendar_date,
      day_status,
      reason,
      day_order,
      override_day_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (semester_id, calendar_date) DO UPDATE SET
      day_status = EXCLUDED.day_status,
      reason = EXCLUDED.reason,
      day_order = EXCLUDED.day_order,
      override_day_order = EXCLUDED.override_day_order,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const { rows } = await client.query(sql, [
    semesterId,
    workspaceId,
    calendarDate,
    dayStatus,
    reason,
    dayOrder,
    overrideDayOrder,
  ]);

  return mapAcademicDateRow(rows[0]);
}

export async function findAcademicDatesBySemester(
  semesterId,
  { startDate = null, endDate = null } = {},
  client = pool,
) {
  let sql = `
    SELECT * FROM academic_calendar_dates
    WHERE semester_id = $1
  `;
  const params = [semesterId];

  if (startDate) {
    params.push(startDate);
    sql += ` AND calendar_date >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    sql += ` AND calendar_date <= $${params.length}`;
  }

  sql += ` ORDER BY calendar_date ASC;`;

  const { rows } = await client.query(sql, params);
  return rows.map(mapAcademicDateRow);
}

export async function findAcademicDate(semesterId, calendarDate, client = pool) {
  const sql = `
    SELECT * FROM academic_calendar_dates
    WHERE semester_id = $1 AND calendar_date = $2;
  `;
  const { rows } = await client.query(sql, [semesterId, calendarDate]);
  return mapAcademicDateRow(rows[0]);
}

export async function removeAcademicDate(semesterId, calendarDate, client = pool) {
  const sql = `
    DELETE FROM academic_calendar_dates
    WHERE semester_id = $1 AND calendar_date = $2
    RETURNING id;
  `;
  const { rows } = await client.query(sql, [semesterId, calendarDate]);
  return rows.length > 0;
}

export async function bulkUpsertAcademicDates(semesterId, workspaceId, datesArray, client = pool) {
  if (!Array.isArray(datesArray) || datesArray.length === 0) return [];

  const results = [];
  for (const item of datesArray) {
    const res = await upsertAcademicDate(
      {
        semesterId,
        workspaceId,
        calendarDate: item.calendarDate,
        dayStatus: item.dayStatus,
        reason: item.reason,
        dayOrder: item.dayOrder,
        overrideDayOrder: item.overrideDayOrder,
      },
      client,
    );
    results.push(res);
  }
  return results;
}

// --- CLASS SCHEDULES (TEMPLATES) ---

export async function createClassSchedule(scheduleData, client = pool) {
  const {
    workspaceId,
    semesterId = null,
    name,
    description = null,
    isActive = true,
    createdBy = null,
  } = scheduleData;

  const sql = `
    INSERT INTO class_schedules (
      workspace_id,
      semester_id,
      name,
      description,
      is_active,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  const { rows } = await client.query(sql, [
    workspaceId,
    semesterId,
    name,
    description,
    isActive,
    createdBy,
  ]);

  return mapClassScheduleRow(rows[0]);
}

export async function findClassScheduleById(scheduleId, client = pool) {
  const sql = `
    SELECT * FROM class_schedules
    WHERE id = $1 AND deleted_at IS NULL;
  `;
  const { rows } = await client.query(sql, [scheduleId]);
  return mapClassScheduleRow(rows[0]);
}

export async function findClassSchedulesByWorkspace(
  workspaceId,
  { semesterId = null } = {},
  client = pool,
) {
  let sql = `
    SELECT * FROM class_schedules
    WHERE workspace_id = $1 AND deleted_at IS NULL
  `;
  const params = [workspaceId];

  if (semesterId) {
    params.push(semesterId);
    sql += ` AND (semester_id = $${params.length} OR semester_id IS NULL)`;
  }

  sql += ` ORDER BY created_at DESC;`;

  const { rows } = await client.query(sql, params);
  return rows.map(mapClassScheduleRow);
}

export async function updateClassSchedule(scheduleId, updates, client = pool) {
  const fields = [];
  const values = [];

  const allowedFields = {
    name: 'name',
    description: 'description',
    semesterId: 'semester_id',
    isActive: 'is_active',
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      values.push(updates[key]);
      fields.push(`${col} = $${values.length}`);
    }
  }

  if (fields.length === 0) {
    return findClassScheduleById(scheduleId, client);
  }

  values.push(scheduleId);
  const sql = `
    UPDATE class_schedules
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${values.length} AND deleted_at IS NULL
    RETURNING *;
  `;

  const { rows } = await client.query(sql, values);
  return mapClassScheduleRow(rows[0]);
}

export async function deleteClassSchedule(scheduleId, client = pool) {
  const sql = `
    UPDATE class_schedules
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id;
  `;
  const { rows } = await client.query(sql, [scheduleId]);
  return rows.length > 0;
}

// --- SCHEDULE ENTRIES ---

export async function createScheduleEntry(entryData, client = pool) {
  const {
    classScheduleId,
    workspaceId,
    dayOrder,
    courseName,
    courseCode = null,
    instructor = null,
    room = null,
    startTime,
    endTime,
    color = '#6366F1',
    metadata = {},
  } = entryData;

  const sql = `
    INSERT INTO schedule_entries (
      class_schedule_id,
      workspace_id,
      day_order,
      course_name,
      course_code,
      instructor,
      room,
      start_time,
      end_time,
      color,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;

  const { rows } = await client.query(sql, [
    classScheduleId,
    workspaceId,
    dayOrder,
    courseName,
    courseCode,
    instructor,
    room,
    startTime,
    endTime,
    color,
    JSON.stringify(metadata),
  ]);

  return mapScheduleEntryRow(rows[0]);
}

export async function findScheduleEntryById(entryId, client = pool) {
  const sql = `
    SELECT * FROM schedule_entries WHERE id = $1;
  `;
  const { rows } = await client.query(sql, [entryId]);
  return mapScheduleEntryRow(rows[0]);
}

export async function findScheduleEntriesBySchedule(scheduleId, client = pool) {
  const sql = `
    SELECT * FROM schedule_entries
    WHERE class_schedule_id = $1
    ORDER BY day_order ASC, start_time ASC;
  `;
  const { rows } = await client.query(sql, [scheduleId]);
  return rows.map(mapScheduleEntryRow);
}

export async function updateScheduleEntry(entryId, updates, client = pool) {
  const fields = [];
  const values = [];

  const allowedFields = {
    dayOrder: 'day_order',
    courseName: 'course_name',
    courseCode: 'course_code',
    instructor: 'instructor',
    room: 'room',
    startTime: 'start_time',
    endTime: 'end_time',
    color: 'color',
    metadata: 'metadata',
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      values.push(key === 'metadata' ? JSON.stringify(updates[key]) : updates[key]);
      fields.push(`${col} = $${values.length}`);
    }
  }

  if (fields.length === 0) {
    return findScheduleEntryById(entryId, client);
  }

  values.push(entryId);
  const sql = `
    UPDATE schedule_entries
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${values.length}
    RETURNING *;
  `;

  const { rows } = await client.query(sql, values);
  return mapScheduleEntryRow(rows[0]);
}

export async function deleteScheduleEntry(entryId, client = pool) {
  const sql = `
    DELETE FROM schedule_entries WHERE id = $1 RETURNING id;
  `;
  const { rows } = await client.query(sql, [entryId]);
  return rows.length > 0;
}

// --- ACADEMIC EXCEPTIONS ---

export async function createAcademicException(exceptionData, client = pool) {
  const {
    semesterId,
    workspaceId,
    scheduleEntryId,
    calendarDate,
    exceptionType,
    reason = null,
    rescheduledDate = null,
    rescheduledStartTime = null,
    rescheduledEndTime = null,
    rescheduledRoom = null,
    eventId = null,
    createdBy = null,
  } = exceptionData;

  const sql = `
    INSERT INTO academic_exceptions (
      semester_id,
      workspace_id,
      schedule_entry_id,
      calendar_date,
      exception_type,
      reason,
      rescheduled_date,
      rescheduled_start_time,
      rescheduled_end_time,
      rescheduled_room,
      event_id,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (semester_id, schedule_entry_id, calendar_date) DO UPDATE SET
      exception_type = EXCLUDED.exception_type,
      reason = EXCLUDED.reason,
      rescheduled_date = EXCLUDED.rescheduled_date,
      rescheduled_start_time = EXCLUDED.rescheduled_start_time,
      rescheduled_end_time = EXCLUDED.rescheduled_end_time,
      rescheduled_room = EXCLUDED.rescheduled_room,
      event_id = EXCLUDED.event_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const { rows } = await client.query(sql, [
    semesterId,
    workspaceId,
    scheduleEntryId,
    calendarDate,
    exceptionType,
    reason,
    rescheduledDate,
    rescheduledStartTime,
    rescheduledEndTime,
    rescheduledRoom,
    eventId,
    createdBy,
  ]);

  return mapAcademicExceptionRow(rows[0]);
}

export async function findAcademicExceptionsBySemester(semesterId, client = pool) {
  const sql = `
    SELECT * FROM academic_exceptions
    WHERE semester_id = $1
    ORDER BY calendar_date ASC;
  `;
  const { rows } = await client.query(sql, [semesterId]);
  return rows.map(mapAcademicExceptionRow);
}

export async function findAcademicException(
  semesterId,
  scheduleEntryId,
  calendarDate,
  client = pool,
) {
  const sql = `
    SELECT * FROM academic_exceptions
    WHERE semester_id = $1 AND schedule_entry_id = $2 AND calendar_date = $3;
  `;
  const { rows } = await client.query(sql, [semesterId, scheduleEntryId, calendarDate]);
  return mapAcademicExceptionRow(rows[0]);
}

// --- ACADEMIC CALENDAR EVENTS (PROVENANCE & IDEMPOTENCY) ---

export async function upsertAcademicEvent(eventData, client = pool) {
  const {
    calendarId,
    workspaceId,
    title,
    description = null,
    startAt,
    endAt,
    timezone = 'UTC',
    location = null,
    status = 'CONFIRMED',
    sourceType = 'DAY_ORDER',
    sourceReference = null,
    createdBy = null,
    semesterId,
    classScheduleId = null,
    scheduleEntryId,
    dayOrder,
    academicDate,
  } = eventData;

  const sql = `
    INSERT INTO events (
      calendar_id,
      workspace_id,
      title,
      description,
      start_at,
      end_at,
      timezone,
      is_all_day,
      location,
      status,
      source_type,
      source_reference,
      created_by,
      semester_id,
      class_schedule_id,
      schedule_entry_id,
      day_order,
      academic_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    )
    ON CONFLICT (semester_id, schedule_entry_id, academic_date)
      WHERE semester_id IS NOT NULL AND schedule_entry_id IS NOT NULL AND deleted_at IS NULL
    DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      start_at = EXCLUDED.start_at,
      end_at = EXCLUDED.end_at,
      timezone = EXCLUDED.timezone,
      location = EXCLUDED.location,
      status = EXCLUDED.status,
      day_order = EXCLUDED.day_order,
      class_schedule_id = EXCLUDED.class_schedule_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const { rows } = await client.query(sql, [
    calendarId,
    workspaceId,
    title,
    description,
    startAt,
    endAt,
    timezone,
    location,
    status,
    sourceType,
    sourceReference,
    createdBy,
    semesterId,
    classScheduleId,
    scheduleEntryId,
    dayOrder,
    academicDate,
  ]);

  return rows[0];
}

export async function findGeneratedEventsBySemester(
  semesterId,
  { startDate = null, endDate = null } = {},
  client = pool,
) {
  let sql = `
    SELECT * FROM events
    WHERE semester_id = $1 AND deleted_at IS NULL
  `;
  const params = [semesterId];

  if (startDate) {
    params.push(startDate);
    sql += ` AND academic_date >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    sql += ` AND academic_date <= $${params.length}`;
  }

  sql += ` ORDER BY start_at ASC;`;

  const { rows } = await client.query(sql, params);
  return rows;
}

export async function deleteFutureGeneratedEvents(semesterId, cutoffDate, client = pool) {
  // Provenance-based invalidation/removal of future generated academic occurrences
  const sql = `
    DELETE FROM events
    WHERE semester_id = $1
      AND (academic_date >= $2 OR start_at >= $2)
    RETURNING id;
  `;
  const { rows } = await client.query(sql, [semesterId, cutoffDate]);
  return rows.length;
}

export async function deleteGeneratedEventsForDate(semesterId, calendarDate, client = pool) {
  const sql = `
    DELETE FROM events
    WHERE semester_id = $1 AND academic_date = $2
    RETURNING id;
  `;
  const { rows } = await client.query(sql, [semesterId, calendarDate]);
  return rows.length;
}

export async function cancelAcademicEvent(eventId, client = pool) {
  const sql = `
    UPDATE events
    SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await client.query(sql, [eventId]);
  return rows[0];
}

export async function rescheduleAcademicEvent(
  eventId,
  { startAt, endAt, location = null, academicDate = null },
  client = pool,
) {
  const sql = `
    UPDATE events
    SET
      start_at = $1,
      end_at = $2,
      location = COALESCE($3, location),
      academic_date = COALESCE($4, academic_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *;
  `;
  const { rows } = await client.query(sql, [startAt, endAt, location, academicDate, eventId]);
  return rows[0];
}
