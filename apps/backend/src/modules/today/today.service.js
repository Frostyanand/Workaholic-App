import { pool, query } from '../../core/db.js';
import * as eventsRepo from '../calendar/events.repository.js';
import { mapTaskRow } from '../tasks/tasks.repository.js';
import { isTaskOverdue } from '../tasks/tasks.service.js';

/**
 * Validates and normalizes IANA timezone string
 * Falls back to user timezone or 'UTC'
 * @param {string} tz
 * @param {string} [fallback='UTC']
 * @returns {string}
 */
export function resolveTimezone(tz, fallback = 'UTC') {
  if (!tz || typeof tz !== 'string') return fallback;
  const trimmed = tz.trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return fallback;
  }
}

/**
 * Derives current local date in YYYY-MM-DD for a given timezone
 * @param {Date} [now=new Date()]
 * @param {string} [timezone='UTC']
 * @returns {string}
 */
export function getLocalDateString(now = new Date(), timezone = 'UTC') {
  const tz = resolveTimezone(timezone, 'UTC');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Resolves UTC timestamp boundaries for a local calendar date in a specific timezone
 * Uses PostgreSQL AT TIME ZONE for authoritative timezone conversion
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timezone - IANA timezone string
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 * @returns {Promise<{ dayStartUtc: string, dayEndUtc: string }>}
 */
export async function resolveDayBoundaries(dateStr, timezone, client = pool) {
  const sql = `
    SELECT
      (($1::text || ' 00:00:00')::timestamp AT TIME ZONE $2) AS day_start_utc,
      (($1::text || ' 23:59:59.999')::timestamp AT TIME ZONE $2) AS day_end_utc;
  `;
  const result = await query(sql, [dateStr, timezone], client);
  const row = result.rows[0];
  return {
    dayStartUtc: new Date(row.day_start_utc).toISOString(),
    dayEndUtc: new Date(row.day_end_utc).toISOString(),
  };
}

/**
 * Today Service
 * Orchestrates unified command-center cockpit read model
 */
export class TodayService {
  constructor(deps = {}) {
    this.eventsRepo = deps.eventsRepo || eventsRepo;
  }

  /**
   * Retrieves full Today Cockpit state for a workspace
   * @param {string} workspaceId
   * @param {object} options
   * @param {string} [options.date] - Optional YYYY-MM-DD
   * @param {string} [options.timezone] - Optional IANA timezone
   * @param {Date|string} [options.asOf] - Optional reference date/time for deterministic testing
   * @param {object} [options.user] - Authenticated user context
   * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
   */
  async getTodayCockpit(workspaceId, options = {}, client = pool) {
    if (!workspaceId) {
      throw new Error('workspaceId is required');
    }

    const asOfDate = options.asOf ? new Date(options.asOf) : new Date();
    const nowIso = asOfDate.toISOString();

    const userTimezone = options.user?.timezone || 'UTC';
    const effectiveTimezone = resolveTimezone(options.timezone, userTimezone);
    const targetDate = options.date || getLocalDateString(asOfDate, effectiveTimezone);

    // Resolve local day boundaries in UTC
    const { dayStartUtc, dayEndUtc } = await resolveDayBoundaries(
      targetDate,
      effectiveTimezone,
      client,
    );

    // 1. Query Tasks Due Today (status NOT IN ('COMPLETED', 'CANCELLED') and due in local day)
    const dueTodaySql = `
      SELECT t.*,
        u_assignee.display_name AS assignee_display_name,
        (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
      WHERE t.workspace_id = $1
        AND t.deleted_at IS NULL
        AND t.status NOT IN ('COMPLETED', 'CANCELLED')
        AND t.due_at >= $2 AND t.due_at <= $3
      ORDER BY
        CASE t.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          WHEN 'P3' THEN 3
          ELSE 4
        END,
        t.due_at ASC,
        t.created_at ASC;
    `;

    // 2. Query Overdue Tasks (status NOT IN ('COMPLETED', 'CANCELLED') and due_at < nowIso)
    const overdueSql = `
      SELECT t.*,
        u_assignee.display_name AS assignee_display_name,
        (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
      WHERE t.workspace_id = $1
        AND t.deleted_at IS NULL
        AND t.status NOT IN ('COMPLETED', 'CANCELLED')
        AND t.due_at IS NOT NULL
        AND t.due_at < $2
      ORDER BY
        t.due_at ASC,
        CASE t.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          WHEN 'P3' THEN 3
          ELSE 4
        END;
    `;

    // 3. Query Important Work (status NOT IN ('COMPLETED', 'CANCELLED') and priority IN ('P0', 'P1', 'P2'))
    const importantSql = `
      SELECT t.*,
        u_assignee.display_name AS assignee_display_name,
        (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
      WHERE t.workspace_id = $1
        AND t.deleted_at IS NULL
        AND t.status NOT IN ('COMPLETED', 'CANCELLED')
        AND t.priority IN ('P0', 'P1', 'P2')
      ORDER BY
        CASE t.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          ELSE 3
        END,
        t.due_at ASC NULLS LAST,
        t.created_at ASC;
    `;

    // 4. Query Scheduled Task Work Blocks for today
    const workBlocksSql = `
      SELECT wb.*,
        t.title AS task_title,
        t.priority AS task_priority,
        t.status AS task_status,
        c.name AS calendar_name,
        c.color AS calendar_color
      FROM task_work_blocks wb
      JOIN tasks t ON wb.task_id = t.id
      LEFT JOIN calendars c ON wb.calendar_id = c.id
      WHERE t.workspace_id = $1
        AND t.deleted_at IS NULL
        AND wb.start_at <= $3
        AND wb.end_at >= $2
        AND wb.status != 'CANCELLED'
      ORDER BY wb.start_at ASC;
    `;

    // 5. Query Unscheduled Important Work (P0/P1/P2 or due today, with NO active work blocks and NO scheduled event)
    const unscheduledSql = `
      SELECT t.*,
        u_assignee.display_name AS assignee_display_name,
        (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
      WHERE t.workspace_id = $1
        AND t.deleted_at IS NULL
        AND t.status NOT IN ('COMPLETED', 'CANCELLED')
        AND (t.priority IN ('P0', 'P1', 'P2') OR (t.due_at IS NOT NULL AND t.due_at <= $2))
        AND NOT EXISTS (
          SELECT 1 FROM task_work_blocks wb
          WHERE wb.task_id = t.id
            AND wb.status != 'CANCELLED'
        )
        AND NOT EXISTS (
          SELECT 1 FROM event_tasks et
          JOIN events e ON et.event_id = e.id
          WHERE et.task_id = t.id
            AND e.deleted_at IS NULL
            AND e.status != 'CANCELLED'
            AND e.end_at >= $3
        )
      ORDER BY
        CASE t.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          ELSE 3
        END,
        t.due_at ASC NULLS LAST,
        t.created_at ASC;
    `;

    // 6. Query Tasks Completed Today (completed within local day boundaries)
    const completedTodaySql = `
      SELECT t.*,
        u_assignee.display_name AS assignee_display_name,
        (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
      WHERE t.workspace_id = $1
        AND t.deleted_at IS NULL
        AND t.status = 'COMPLETED'
        AND t.completed_at >= $2 AND t.completed_at <= $3
      ORDER BY t.completed_at DESC;
    `;

    // Execute concurrent read queries
    const [
      dueTodayRes,
      overdueRes,
      importantRes,
      workBlocksRes,
      unscheduledRes,
      completedTodayRes,
      calendarEventsRaw,
    ] = await Promise.all([
      query(dueTodaySql, [workspaceId, dayStartUtc, dayEndUtc], client),
      query(overdueSql, [workspaceId, nowIso], client),
      query(importantSql, [workspaceId], client),
      query(workBlocksSql, [workspaceId, dayStartUtc, dayEndUtc], client),
      query(unscheduledSql, [workspaceId, dayEndUtc, nowIso], client),
      query(completedTodaySql, [workspaceId, dayStartUtc, dayEndUtc], client),
      this.eventsRepo.findEventsByRange(
        workspaceId,
        {
          start: dayStartUtc,
          end: dayEndUtc,
        },
        client,
      ),
    ]);

    // Map tasks with overdue status relative to asOf
    const mapTasks = rows =>
      rows.map(r => {
        const domainTask = mapTaskRow(r);
        return {
          ...domainTask,
          isOverdue: isTaskOverdue(domainTask, asOfDate),
        };
      });

    const dueToday = mapTasks(dueTodayRes.rows);
    const overdue = mapTasks(overdueRes.rows);
    const important = mapTasks(importantRes.rows);
    const unscheduled = mapTasks(unscheduledRes.rows);
    const completedToday = mapTasks(completedTodayRes.rows);

    // Map work blocks
    const workBlocks = workBlocksRes.rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      taskTitle: row.task_title,
      taskPriority: row.task_priority,
      taskStatus: row.task_status,
      calendarId: row.calendar_id,
      calendarName: row.calendar_name,
      calendarColor: row.calendar_color || '#10B981',
      title: `Work Block: ${row.task_title}`,
      startAt: new Date(row.start_at).toISOString(),
      endAt: new Date(row.end_at).toISOString(),
      timezone: row.timezone,
      status: row.status,
      isWorkBlock: true,
    }));

    // Filter and map calendar events
    // All-day events check date overlap; timed events check temporal overlap
    const calendarEvents = calendarEventsRaw
      .filter(e => {
        if (e.status === 'CANCELLED') return false;
        if (e.isAllDay) {
          const start = e.startDate || (e.startAt ? e.startAt.slice(0, 10) : '');
          const end = e.endDate || e.startDate || (e.endAt ? e.endAt.slice(0, 10) : start);
          return targetDate >= start && targetDate <= end;
        }
        return true;
      })
      .map(e => ({
        id: e.id,
        calendarId: e.calendarId,
        calendarName: e.calendarName,
        calendarColor: e.calendarColor || '#4F46E5',
        title: e.title,
        description: e.description,
        startAt: e.startAt ? new Date(e.startAt).toISOString() : null,
        endAt: e.endAt ? new Date(e.endAt).toISOString() : null,
        isAllDay: Boolean(e.isAllDay),
        startDate: e.startDate || null,
        endDate: e.endDate || null,
        location: e.location,
        meetingUrl: e.meetingUrl,
        visibility: e.visibility,
        status: e.status,
        taskIds: e.taskIds || [],
        projectIds: e.projectIds || [],
        isWorkBlock: false,
      }));

    // Combine scheduled items (work blocks + timed calendar events) for Current & Next evaluation
    const scheduledItems = [
      ...workBlocks.map(wb => ({
        ...wb,
        type: 'WORK_BLOCK',
        orderPriority: 1, // Work blocks take precedence over events on overlap
      })),
      ...calendarEvents
        .filter(e => !e.isAllDay && e.startAt && e.endAt)
        .map(ev => ({
          ...ev,
          type: 'EVENT',
          orderPriority: 2,
        })),
    ];

    // Current Work: startAt <= now < endAt
    // Priority: Work blocks take precedence over events. If same type, earliest startAt.
    const activeScheduledItems = scheduledItems
      .filter(item => {
        const start = new Date(item.startAt).getTime();
        const end = new Date(item.endAt).getTime();
        const nowTime = asOfDate.getTime();
        return start <= nowTime && end > nowTime;
      })
      .sort((a, b) => {
        if (a.orderPriority !== b.orderPriority) return a.orderPriority - b.orderPriority;
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      });

    const currentWork = activeScheduledItems.length > 0 ? activeScheduledItems[0] : null;

    // Next Work: startAt > now AND startAt <= dayEndUtc
    // Sorted strictly chronologically by startAt ASC
    const upcomingScheduledItems = scheduledItems
      .filter(item => {
        const start = new Date(item.startAt).getTime();
        const nowTime = asOfDate.getTime();
        const dayEndTime = new Date(dayEndUtc).getTime();
        return start > nowTime && start <= dayEndTime;
      })
      .sort((a, b) => {
        const timeDiff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.orderPriority - b.orderPriority;
      });

    const nextWork = upcomingScheduledItems.length > 0 ? upcomingScheduledItems[0] : null;

    return {
      date: targetDate,
      timezone: effectiveTimezone,
      dayStartUtc,
      dayEndUtc,
      currentWork,
      nextWork,
      dueToday,
      overdue,
      important,
      unscheduled,
      calendarEvents,
      workBlocks,
      completedToday,
      counts: {
        dueToday: dueToday.length,
        overdue: overdue.length,
        important: important.length,
        unscheduled: unscheduled.length,
        calendarEvents: calendarEvents.length,
        workBlocks: workBlocks.length,
        completedToday: completedToday.length,
      },
    };
  }
}

export const todayService = new TodayService();
