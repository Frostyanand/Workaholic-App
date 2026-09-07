import { pool } from '../../core/db.js';
import { extractAllDayDates } from '@workaholic/shared';

/**
 * Maps raw SQL row to clean event domain object
 */
export function mapEventRow(row) {
  if (!row) return null;

  const event = {
    id: row.id,
    calendarId: row.calendar_id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    startAt: row.start_at ? new Date(row.start_at).toISOString() : null,
    endAt: row.end_at ? new Date(row.end_at).toISOString() : null,
    timezone: row.timezone,
    isAllDay: Boolean(row.is_all_day),
    location: row.location,
    meetingUrl: row.meeting_url,
    visibility: row.visibility,
    status: row.status,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    recurrenceRuleId: row.recurrence_rule_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    taskIds: Array.isArray(row.task_ids) ? row.task_ids.filter(Boolean) : [],
    projectIds: Array.isArray(row.project_ids) ? row.project_ids.filter(Boolean) : [],
    ...(row.calendar_name ? { calendarName: row.calendar_name } : {}),
    ...(row.calendar_color ? { calendarColor: row.calendar_color } : {}),
  };

  // Authoritative whole-date semantics for all-day events
  if (event.isAllDay && event.startAt && event.endAt) {
    const dates = extractAllDayDates(event.startAt, event.endAt);
    event.startDate = dates.startDate;
    event.endDate = dates.endDate;
  }

  return event;
}

/**
 * Create a new event record
 * @param {object} eventData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createEvent(eventData, client = pool) {
  if (!eventData || typeof eventData !== 'object') {
    throw new TypeError('eventData must be an object');
  }

  const {
    calendarId,
    workspaceId,
    title,
    description = null,
    startAt,
    endAt,
    timezone = 'UTC',
    isAllDay = false,
    location = null,
    meetingUrl = null,
    visibility = 'PRIVATE',
    status = 'CONFIRMED',
    sourceType = 'WORKAHOLIC',
    sourceReference = null,
    recurrenceRuleId = null,
    createdBy = null,
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
      meeting_url,
      visibility,
      status,
      source_type,
      source_reference,
      recurrence_rule_id,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *;
  `;

  const values = [
    calendarId,
    workspaceId,
    title,
    description,
    startAt,
    endAt,
    timezone,
    isAllDay,
    location,
    meetingUrl,
    visibility,
    status,
    sourceType,
    sourceReference,
    recurrenceRuleId,
    createdBy,
  ];

  const result = await client.query(sql, values);
  return mapEventRow(result.rows[0]);
}

/**
 * Link tasks to an event
 * @param {string} eventId
 * @param {string[]} taskIds
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function linkEventTasks(eventId, taskIds = [], client = pool) {
  if (!taskIds || taskIds.length === 0) return;
  for (const taskId of taskIds) {
    await client.query(
      `INSERT INTO event_tasks (event_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, taskId],
    );
  }
}

/**
 * Link projects to an event
 * @param {string} eventId
 * @param {string[]} projectIds
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function linkEventProjects(eventId, projectIds = [], client = pool) {
  if (!projectIds || projectIds.length === 0) return;
  for (const projectId of projectIds) {
    await client.query(
      `INSERT INTO event_projects (event_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, projectId],
    );
  }
}

/**
 * Replace linked tasks for an event
 * @param {string} eventId
 * @param {string[]} taskIds
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function replaceEventTasks(eventId, taskIds = [], client = pool) {
  await client.query(`DELETE FROM event_tasks WHERE event_id = $1`, [eventId]);
  await linkEventTasks(eventId, taskIds, client);
}

/**
 * Replace linked projects for an event
 * @param {string} eventId
 * @param {string[]} projectIds
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function replaceEventProjects(eventId, projectIds = [], client = pool) {
  await client.query(`DELETE FROM event_projects WHERE event_id = $1`, [eventId]);
  await linkEventProjects(eventId, projectIds, client);
}

/**
 * Find event by ID with linked task and project IDs
 * @param {string} eventId
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findEventById(eventId, workspaceId, client = pool) {
  const sql = `
    SELECT e.*,
      c.name AS calendar_name,
      c.color AS calendar_color,
      COALESCE(array_remove(array_agg(DISTINCT et.task_id), NULL), '{}') AS task_ids,
      COALESCE(array_remove(array_agg(DISTINCT ep.project_id), NULL), '{}') AS project_ids
    FROM events e
    JOIN calendars c ON e.calendar_id = c.id
    LEFT JOIN event_tasks et ON e.id = et.event_id
    LEFT JOIN event_projects ep ON e.id = ep.event_id
    WHERE e.id = $1 AND e.workspace_id = $2 AND e.deleted_at IS NULL
    GROUP BY e.id, c.name, c.color;
  `;
  const result = await client.query(sql, [eventId, workspaceId]);
  return mapEventRow(result.rows[0]);
}

/**
 * Find events in a temporal window [start, end]
 * @param {string} workspaceId
 * @param {object} options
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findEventsByRange(workspaceId, options, client = pool) {
  const { start, end, calendarIds, sourceType } = options;

  const conditions = [
    'e.workspace_id = $1',
    'e.deleted_at IS NULL',
    'e.start_at <= $3',
    'e.end_at >= $2',
  ];
  const values = [workspaceId, start, end];
  let paramIdx = 4;

  if (calendarIds && calendarIds.length > 0) {
    conditions.push(`e.calendar_id = ANY($${paramIdx++})`);
    values.push(calendarIds);
  }

  if (sourceType) {
    conditions.push(`e.source_type = $${paramIdx++}`);
    values.push(sourceType);
  }

  const sql = `
    SELECT e.*,
      c.name AS calendar_name,
      c.color AS calendar_color,
      COALESCE(array_remove(array_agg(DISTINCT et.task_id), NULL), '{}') AS task_ids,
      COALESCE(array_remove(array_agg(DISTINCT ep.project_id), NULL), '{}') AS project_ids
    FROM events e
    JOIN calendars c ON e.calendar_id = c.id
    LEFT JOIN event_tasks et ON e.id = et.event_id
    LEFT JOIN event_projects ep ON e.id = ep.event_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY e.id, c.name, c.color
    ORDER BY e.is_all_day DESC, e.start_at ASC;
  `;

  const result = await client.query(sql, values);
  return result.rows.map(mapEventRow);
}

/**
 * Find conflicting confirmed timed events in the same calendar
 * @param {string} workspaceId
 * @param {string} calendarId
 * @param {string} startAt
 * @param {string} endAt
 * @param {string|null} [excludeEventId=null]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findConflictingEvents(
  workspaceId,
  calendarId,
  startAt,
  endAt,
  excludeEventId = null,
  client = pool,
) {
  const sql = `
    SELECT e.id, e.title, e.start_at, e.end_at, e.timezone
    FROM events e
    WHERE e.workspace_id = $1
      AND e.calendar_id = $2
      AND e.deleted_at IS NULL
      AND e.status = 'CONFIRMED'
      AND e.is_all_day = FALSE
      AND e.start_at < $4
      AND e.end_at > $3
      AND ($5::uuid IS NULL OR e.id != $5)
    ORDER BY e.start_at ASC;
  `;
  const result = await client.query(sql, [workspaceId, calendarId, startAt, endAt, excludeEventId]);
  return result.rows.map(r => ({
    id: r.id,
    title: r.title,
    startAt: new Date(r.start_at).toISOString(),
    endAt: new Date(r.end_at).toISOString(),
    timezone: r.timezone,
  }));
}

/**
 * Update an existing event record
 * @param {string} eventId
 * @param {string} workspaceId
 * @param {object} patchData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateEvent(eventId, workspaceId, patchData, client = pool) {
  const allowedKeys = [
    'calendarId',
    'title',
    'description',
    'startAt',
    'endAt',
    'timezone',
    'isAllDay',
    'location',
    'meetingUrl',
    'visibility',
    'status',
    'sourceType',
    'sourceReference',
    'recurrenceRuleId',
  ];

  const columnMap = {
    calendarId: 'calendar_id',
    title: 'title',
    description: 'description',
    startAt: 'start_at',
    endAt: 'end_at',
    timezone: 'timezone',
    isAllDay: 'is_all_day',
    location: 'location',
    meetingUrl: 'meeting_url',
    visibility: 'visibility',
    status: 'status',
    sourceType: 'source_type',
    sourceReference: 'source_reference',
    recurrenceRuleId: 'recurrence_rule_id',
  };

  const updates = [];
  const values = [eventId, workspaceId];
  let paramIdx = 3;

  for (const key of allowedKeys) {
    if (patchData[key] !== undefined) {
      updates.push(`${columnMap[key]} = $${paramIdx++}`);
      values.push(patchData[key]);
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    const sql = `
      UPDATE events
      SET ${updates.join(', ')}
      WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
      RETURNING *;
    `;
    await client.query(sql, values);
  }

  return findEventById(eventId, workspaceId, client);
}

/**
 * Soft delete an event
 * @param {string} eventId
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function softDeleteEvent(eventId, workspaceId, client = pool) {
  const sql = `
    UPDATE events
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;
  const result = await client.query(sql, [eventId, workspaceId]);
  return mapEventRow(result.rows[0]);
}
