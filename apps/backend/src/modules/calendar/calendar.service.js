import { withTransaction, pool } from '../../core/db.js';
import { NotFoundError, ValidationError } from '../../core/errors.js';
import { normalizeAllDayBounds, extractAllDayDates, formatISODate } from '@workaholic/shared';
import * as calendarsRepo from './calendars.repository.js';
import * as eventsRepo from './events.repository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const calendarService = {
  /**
   * Ensures at least one default calendar exists in the workspace
   */
  async ensureDefaultCalendar(workspaceId, user = null, client = pool) {
    const existing = await calendarsRepo.findCalendarsByWorkspace(workspaceId, {}, client);
    if (existing.length > 0) {
      return existing.find(c => c.isDefault) || existing[0];
    }

    return calendarsRepo.createCalendar(
      {
        workspaceId,
        ownerUserId: user?.id || null,
        name: 'Personal',
        description: 'Default personal calendar',
        color: '#3B82F6',
        sourceType: 'WORKAHOLIC',
        visibility: 'PRIVATE',
        timezone: user?.timezone || 'UTC',
        isDefault: true,
      },
      client,
    );
  },

  /**
   * List all calendars in workspace
   */
  async listCalendars(workspaceId, user = null, options = {}) {
    if (!UUID_REGEX.test(workspaceId)) return [];
    await this.ensureDefaultCalendar(workspaceId, user);
    return calendarsRepo.findCalendarsByWorkspace(workspaceId, options);
  },

  /**
   * Get calendar by ID
   */
  async getCalendar(calendarId, workspaceId) {
    const calendar = await calendarsRepo.findCalendarById(calendarId, workspaceId);
    if (!calendar) {
      throw new NotFoundError(`Calendar ${calendarId} not found`);
    }
    return calendar;
  },

  /**
   * Create a new calendar
   */
  async createCalendar(workspaceId, user, data) {
    return withTransaction(async client => {
      if (data.isDefault) {
        await calendarsRepo.clearDefaultCalendar(workspaceId, client);
      }

      return calendarsRepo.createCalendar(
        {
          ...data,
          workspaceId,
          ownerUserId: user?.id || null,
        },
        client,
      );
    });
  },

  /**
   * Update an existing calendar
   */
  async updateCalendar(calendarId, workspaceId, patch) {
    return withTransaction(async client => {
      const existing = await calendarsRepo.findCalendarById(calendarId, workspaceId, client);
      if (!existing) {
        throw new NotFoundError(`Calendar ${calendarId} not found`);
      }

      if (patch.isDefault) {
        await calendarsRepo.clearDefaultCalendar(workspaceId, client);
      }

      return calendarsRepo.updateCalendar(calendarId, workspaceId, patch, client);
    });
  },

  /**
   * Delete calendar
   */
  async deleteCalendar(calendarId, workspaceId) {
    return withTransaction(async client => {
      const existing = await calendarsRepo.findCalendarById(calendarId, workspaceId, client);
      if (!existing) {
        throw new NotFoundError(`Calendar ${calendarId} not found`);
      }

      const deleted = await calendarsRepo.softDeleteCalendar(calendarId, workspaceId, client);
      // Ensure there is still a default calendar if the deleted one was default
      const remaining = await calendarsRepo.findCalendarsByWorkspace(workspaceId, {}, client);
      if (remaining.length > 0 && !remaining.some(c => c.isDefault)) {
        await calendarsRepo.updateCalendar(
          remaining[0].id,
          workspaceId,
          { isDefault: true },
          client,
        );
      }
      return deleted;
    });
  },

  /**
   * Temporal unified range query for events, work blocks, and task deadlines
   */
  async getEventsRange(workspaceId, user, options = {}) {
    const {
      start = new Date(Date.now() - 30 * 86400000).toISOString(),
      end = new Date(Date.now() + 60 * 86400000).toISOString(),
      calendarIds,
      sourceType,
      timezone = 'UTC',
      includeTasks = false,
      includeWorkBlocks = true,
    } = options;

    if (!UUID_REGEX.test(workspaceId)) {
      return {
        events: [],
        workBlocks: [],
        deadlines: [],
        meta: {
          range: { start, end },
          timezone,
        },
      };
    }

    const events = await eventsRepo.findEventsByRange(workspaceId, {
      start,
      end,
      calendarIds,
      sourceType,
    });

    let workBlocks = [];
    if (includeWorkBlocks) {
      const wbSql = `
        SELECT wb.*, t.title AS task_title, t.priority AS task_priority, c.color AS calendar_color
        FROM task_work_blocks wb
        JOIN tasks t ON wb.task_id = t.id
        LEFT JOIN calendars c ON wb.calendar_id = c.id
        WHERE t.workspace_id = $1
          AND t.deleted_at IS NULL
          AND wb.start_at <= $3
          AND wb.end_at >= $2
          ${calendarIds && calendarIds.length > 0 ? 'AND (wb.calendar_id IS NULL OR wb.calendar_id = ANY($4))' : ''}
        ORDER BY wb.start_at ASC;
      `;
      const wbParams = [workspaceId, start, end];
      if (calendarIds && calendarIds.length > 0) {
        wbParams.push(calendarIds);
      }
      const wbRes = await pool.query(wbSql, wbParams);
      workBlocks = wbRes.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        calendarId: row.calendar_id,
        calendarColor: row.calendar_color || '#10B981',
        title: `Work Block: ${row.task_title}`,
        startAt: new Date(row.start_at).toISOString(),
        endAt: new Date(row.end_at).toISOString(),
        timezone: row.timezone,
        status: row.status,
        isWorkBlock: true,
        isAllDay: false,
      }));
    }

    let deadlines = [];
    if (includeTasks) {
      const taskSql = `
        SELECT t.id, t.title, t.due_at, t.priority, t.status, t.project_id
        FROM tasks t
        WHERE t.workspace_id = $1
          AND t.deleted_at IS NULL
          AND t.due_at IS NOT NULL
          AND t.due_at >= $2
          AND t.due_at <= $3
        ORDER BY t.due_at ASC;
      `;
      const taskRes = await pool.query(taskSql, [workspaceId, start, end]);
      deadlines = taskRes.rows.map(row => {
        const dueDate = new Date(row.due_at);
        const isoDate = formatISODate(dueDate);
        return {
          id: `deadline-${row.id}`,
          taskId: row.id,
          title: `Due: ${row.title}`,
          startAt: `${isoDate}T00:00:00.000Z`,
          endAt: `${isoDate}T23:59:59.999Z`,
          startDate: isoDate,
          endDate: isoDate,
          isAllDay: true,
          isDeadline: true,
          priority: row.priority,
          status: row.status,
        };
      });
    }

    return {
      events,
      workBlocks,
      deadlines,
      meta: {
        range: { start, end },
        timezone,
      },
    };
  },

  /**
   * Get event by ID
   */
  async getEvent(eventId, workspaceId) {
    const event = await eventsRepo.findEventById(eventId, workspaceId);
    if (!event) {
      throw new NotFoundError(`Event ${eventId} not found`);
    }
    return event;
  },

  /**
   * Create an event with whole-date all-day handling and informational conflict check
   */
  async createEvent(workspaceId, user, payload) {
    const {
      calendarId,
      title,
      description,
      location,
      meetingUrl,
      visibility = 'PRIVATE',
      status = 'CONFIRMED',
      sourceType = 'WORKAHOLIC',
      sourceReference,
      recurrenceRuleId,
      timezone = 'UTC',
      isAllDay = false,
      startDate,
      endDate,
      startAt,
      endAt,
      taskIds = [],
      projectIds = [],
    } = payload;

    // Validate calendar exists in workspace
    const calendar = await calendarsRepo.findCalendarById(calendarId, workspaceId);
    if (!calendar) {
      throw new NotFoundError(`Calendar ${calendarId} not found in workspace`);
    }

    let resolvedStartAt;
    let resolvedEndAt;
    let resolvedIsAllDay = Boolean(isAllDay);

    if (resolvedIsAllDay) {
      if (startDate) {
        const bounds = normalizeAllDayBounds(startDate, endDate || startDate);
        resolvedStartAt = bounds.startAt;
        resolvedEndAt = bounds.endAt;
      } else if (startAt) {
        const dates = extractAllDayDates(startAt, endAt || startAt);
        const bounds = normalizeAllDayBounds(dates.startDate, dates.endDate);
        resolvedStartAt = bounds.startAt;
        resolvedEndAt = bounds.endAt;
      } else {
        throw new ValidationError('All-day event requires startDate or startAt');
      }
    } else {
      if (!startAt || !endAt) {
        throw new ValidationError('Timed event requires startAt and endAt');
      }
      if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        throw new ValidationError('endAt must be strictly after startAt for timed events');
      }
      resolvedStartAt = new Date(startAt).toISOString();
      resolvedEndAt = new Date(endAt).toISOString();
    }

    // Informational conflict detection (BR-CAL / CALENDAR-SPECIFICATION.md Section 14)
    let conflicts = [];
    if (!resolvedIsAllDay && status === 'CONFIRMED') {
      conflicts = await eventsRepo.findConflictingEvents(
        workspaceId,
        calendarId,
        resolvedStartAt,
        resolvedEndAt,
        null,
      );
    }

    const createdEvent = await withTransaction(async client => {
      const event = await eventsRepo.createEvent(
        {
          calendarId,
          workspaceId,
          title,
          description,
          startAt: resolvedStartAt,
          endAt: resolvedEndAt,
          timezone,
          isAllDay: resolvedIsAllDay,
          location,
          meetingUrl,
          visibility,
          status,
          sourceType,
          sourceReference,
          recurrenceRuleId,
          createdBy: user?.id || null,
        },
        client,
      );

      if (taskIds.length > 0) {
        await eventsRepo.linkEventTasks(event.id, taskIds, client);
      }
      if (projectIds.length > 0) {
        await eventsRepo.linkEventProjects(event.id, projectIds, client);
      }

      return eventsRepo.findEventById(event.id, workspaceId, client);
    });

    return {
      ...createdEvent,
      ...(conflicts.length > 0 ? { conflicts } : {}),
    };
  },

  /**
   * Update an existing event
   */
  async updateEvent(eventId, workspaceId, _user, patch) {
    const existing = await eventsRepo.findEventById(eventId, workspaceId);
    if (!existing) {
      throw new NotFoundError(`Event ${eventId} not found`);
    }

    const patchData = { ...patch };
    const calendarId = patch.calendarId || existing.calendarId;

    if (patch.isAllDay !== undefined || patch.startDate || patch.startAt || patch.endAt) {
      const targetIsAllDay =
        patch.isAllDay !== undefined ? Boolean(patch.isAllDay) : existing.isAllDay;

      if (targetIsAllDay) {
        const start =
          patch.startDate ||
          (patch.startAt
            ? formatISODate(patch.startAt)
            : existing.startDate || formatISODate(existing.startAt));
        const end =
          patch.endDate || (patch.endAt ? formatISODate(patch.endAt) : existing.endDate || start);
        const bounds = normalizeAllDayBounds(start, end);
        patchData.startAt = bounds.startAt;
        patchData.endAt = bounds.endAt;
        patchData.isAllDay = true;
      } else {
        const start = patch.startAt || existing.startAt;
        const end = patch.endAt || existing.endAt;
        if (new Date(end).getTime() <= new Date(start).getTime()) {
          throw new ValidationError('endAt must be strictly after startAt for timed events');
        }
        patchData.startAt = new Date(start).toISOString();
        patchData.endAt = new Date(end).toISOString();
        patchData.isAllDay = false;
      }
    }

    // Informational conflict detection if timed event modified
    let conflicts = [];
    const checkIsAllDay = patchData.isAllDay !== undefined ? patchData.isAllDay : existing.isAllDay;
    const checkStart = patchData.startAt || existing.startAt;
    const checkEnd = patchData.endAt || existing.endAt;

    if (!checkIsAllDay) {
      conflicts = await eventsRepo.findConflictingEvents(
        workspaceId,
        calendarId,
        checkStart,
        checkEnd,
        eventId,
      );
    }

    const updatedEvent = await withTransaction(async client => {
      await eventsRepo.updateEvent(eventId, workspaceId, patchData, client);

      if (patch.taskIds !== undefined) {
        await eventsRepo.replaceEventTasks(eventId, patch.taskIds, client);
      }
      if (patch.projectIds !== undefined) {
        await eventsRepo.replaceEventProjects(eventId, patch.projectIds, client);
      }

      return eventsRepo.findEventById(eventId, workspaceId, client);
    });

    return {
      ...updatedEvent,
      ...(conflicts.length > 0 ? { conflicts } : {}),
    };
  },

  /**
   * Delete event
   */
  async deleteEvent(eventId, workspaceId) {
    const existing = await eventsRepo.findEventById(eventId, workspaceId);
    if (!existing) {
      throw new NotFoundError(`Event ${eventId} not found`);
    }
    return eventsRepo.softDeleteEvent(eventId, workspaceId);
  },
};
