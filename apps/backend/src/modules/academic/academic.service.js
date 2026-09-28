/**
 * Academic & Day Order Domain Service
 * Encapsulates semester lifecycle, Day Order calculation, holiday shifting,
 * idempotent event generation, and exception management.
 */

import { withTransaction, pool } from '../../core/db.js';
import * as acadRepo from './academic.repository.js';
import { calculateDayOrderSequence } from './day-order.engine.js';
import { createCalendar, findCalendarsByWorkspace } from '../calendar/calendars.repository.js';
import { SEMESTER_STATUS, ACADEMIC_DAY_STATUS, ACADEMIC_EXCEPTION_TYPE } from '@workaholic/shared';

export class AcademicService {
  constructor(dbPool = pool) {
    this.pool = dbPool;
  }

  // --- SEMESTER LIFECYCLE ---

  async createSemester(workspaceId, userId, data) {
    return withTransaction(async client => {
      // 1. Ensure or create an academic calendar for the workspace if not specified
      let calendarId = data.calendarId || null;
      if (!calendarId) {
        const existingCals = await findCalendarsByWorkspace(workspaceId, client);
        const acadCal = existingCals.find(
          c => c.sourceType === 'DAY_ORDER' || c.sourceType === 'COLLEGE',
        );
        if (acadCal) {
          calendarId = acadCal.id;
        } else {
          const newCal = await createCalendar(
            {
              workspaceId,
              ownerUserId: userId,
              name: `Academic - ${data.name}`,
              color: '#6366F1',
              sourceType: 'DAY_ORDER',
              timezone: data.timezone || 'UTC',
            },
            client,
          );
          calendarId = newCal.id;
        }
      }

      // 2. Create the semester record
      const semester = await acadRepo.createSemester(
        {
          ...data,
          workspaceId,
          calendarId,
          createdBy: userId,
          status: SEMESTER_STATUS.UPCOMING,
        },
        client,
      );

      // 3. Compute initial Day Order sequence across semester dates
      const initialSequence = calculateDayOrderSequence({
        startDate: semester.startDate,
        endDate: semester.endDate,
        dayOrderCount: semester.dayOrderCount,
      });

      // 4. Store initial calendar dates
      await acadRepo.bulkUpsertAcademicDates(semester.id, workspaceId, initialSequence, client);

      return semester;
    });
  }

  async getSemester(workspaceId, semesterId) {
    const semester = await acadRepo.findSemesterById(semesterId, this.pool);
    if (!semester || semester.workspaceId !== workspaceId) {
      const err = new Error('Semester not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    return semester;
  }

  async listSemesters(workspaceId, filter = {}) {
    return acadRepo.findSemestersByWorkspace(workspaceId, filter, this.pool);
  }

  async updateSemester(workspaceId, semesterId, updates) {
    await this.getSemester(workspaceId, semesterId);
    return acadRepo.updateSemester(semesterId, updates, this.pool);
  }

  async activateSemester(workspaceId, semesterId) {
    const semester = await this.getSemester(workspaceId, semesterId);
    if (semester.status === SEMESTER_STATUS.ENDED) {
      const err = new Error('Cannot activate an ended semester');
      err.statusCode = 400;
      err.code = 'INVALID_STATE';
      throw err;
    }
    return acadRepo.setSemesterStatus(semesterId, SEMESTER_STATUS.ACTIVE, this.pool);
  }

  /**
   * Explicit End Semester operation (REQ-DO-013, REQ-DO-014, REQ-DO-015)
   * 1. Mark status ENDED
   * 2. Remove future generated academic events (start_at > NOW())
   * 3. Preserve past academic events
   * 4. Preserve reusable schedules and entries
   * 5. Preserve Day Order mappings as history
   * 6. Preserve unrelated personal and Google events
   */
  async endSemester(workspaceId, semesterId) {
    return withTransaction(async client => {
      const semester = await acadRepo.findSemesterById(semesterId, client);
      if (!semester || semester.workspaceId !== workspaceId) {
        const err = new Error('Semester not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      // Mark ENDED
      const updated = await acadRepo.setSemesterStatus(semesterId, SEMESTER_STATUS.ENDED, client);

      // Clean up ONLY future generated academic events belonging to this semester
      const nowIso = new Date().toISOString();
      const removedCount = await acadRepo.deleteFutureGeneratedEvents(semesterId, nowIso, client);

      return {
        semester: updated,
        futureEventsRemoved: removedCount,
      };
    });
  }

  // --- ACADEMIC CALENDAR & DAY ORDER ENGINE ---

  async getAcademicCalendar(workspaceId, semesterId, { startDate = null, endDate = null } = {}) {
    await this.getSemester(workspaceId, semesterId);
    return acadRepo.findAcademicDatesBySemester(semesterId, { startDate, endDate }, this.pool);
  }

  /**
   * Sets or updates a date rule (holiday, special working day, override DO)
   * and automatically recalculates subsequent Day Orders and shifts affected future events.
   */
  async setAcademicDate(workspaceId, semesterId, dateData) {
    return withTransaction(async client => {
      const semester = await acadRepo.findSemesterById(semesterId, client);
      if (!semester || semester.workspaceId !== workspaceId) {
        const err = new Error('Semester not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const { calendarDate, dayStatus, reason, overrideDayOrder } = dateData;

      // 1. Upsert explicit date rule
      const updatedRule = await acadRepo.upsertAcademicDate(
        {
          semesterId,
          workspaceId,
          calendarDate,
          dayStatus,
          reason,
          overrideDayOrder,
        },
        client,
      );

      // 2. Recalculate Day Order sequence and shift occurrences
      const recalculationResult = await this._recalculateAndShift(semester, calendarDate, client);

      return {
        dateRule: updatedRule,
        shiftedDatesCount: recalculationResult.shiftedCount,
      };
    });
  }

  /**
   * Removes explicit rule for a date (reverts to default) and recalculates subsequent Day Orders.
   */
  async removeAcademicDate(workspaceId, semesterId, calendarDate) {
    return withTransaction(async client => {
      const semester = await acadRepo.findSemesterById(semesterId, client);
      if (!semester || semester.workspaceId !== workspaceId) {
        const err = new Error('Semester not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      await acadRepo.removeAcademicDate(semesterId, calendarDate, client);

      const recalculationResult = await this._recalculateAndShift(semester, calendarDate, client);

      return {
        removed: true,
        shiftedDatesCount: recalculationResult.shiftedCount,
      };
    });
  }

  /**
   * Internal engine: Recalculates sequence from a given date onwards and shifts affected future events
   */
  async _recalculateAndShift(semester, fromDate, client) {
    // 1. Fetch all explicit rules for the semester
    const explicitRules = await acadRepo.findAcademicDatesBySemester(semester.id, {}, client);

    // 2. Recompute full Day Order sequence
    const fullSequence = calculateDayOrderSequence({
      startDate: semester.startDate,
      endDate: semester.endDate,
      dayOrderCount: semester.dayOrderCount,
      explicitDateRules: explicitRules,
    });

    // 3. Update database rows for the sequence
    await acadRepo.bulkUpsertAcademicDates(semester.id, semester.workspaceId, fullSequence, client);

    // 4. If semester is ended, do not shift/regenerate future events
    if (semester.status === SEMESTER_STATUS.ENDED) {
      return { shiftedCount: 0 };
    }

    // 5. Shift affected future generated occurrences
    // Find active class schedules for this semester or workspace
    const schedules = await acadRepo.findClassSchedulesByWorkspace(
      semester.workspaceId,
      { semesterId: semester.id },
      client,
    );
    const activeSchedule = schedules.find(s => s.isActive);
    if (!activeSchedule) {
      return { shiftedCount: 0 };
    }

    const scheduleEntries = await acadRepo.findScheduleEntriesBySchedule(activeSchedule.id, client);

    let shiftedCount = 0;
    const effectiveFromDate = fromDate || semester.startDate;

    // Filter sequence dates that are >= effectiveFromDate
    const datesToShift = fullSequence.filter(d => d.calendarDate >= effectiveFromDate);

    for (const day of datesToShift) {
      if (!day.isWorking || !day.dayOrder) {
        // Date is a holiday or non-working day: remove any generated academic events on this date
        const removed = await acadRepo.deleteGeneratedEventsForDate(
          semester.id,
          day.calendarDate,
          client,
        );
        shiftedCount += removed;
      } else {
        // Date has an active Day Order.
        // Get entries for this Day Order
        const entriesForDO = scheduleEntries.filter(e => e.dayOrder === day.dayOrder);

        // Delete any events for other day orders on this date
        // Then upsert events for this DO's entries
        const existingEvents = await acadRepo.findGeneratedEventsBySemester(
          semester.id,
          { startDate: day.calendarDate, endDate: day.calendarDate },
          client,
        );

        for (const ev of existingEvents) {
          // If existing event doesn't belong to one of the current DO entries, remove it
          if (!entriesForDO.some(e => e.id === ev.schedule_entry_id)) {
            await acadRepo.deleteGeneratedEventsForDate(semester.id, day.calendarDate, client);
            shiftedCount++;
            break;
          }
        }

        // Generate / upsert current DO entries
        for (const entry of entriesForDO) {
          await this._upsertSingleAcademicEvent(semester, activeSchedule, entry, day, client);
          shiftedCount++;
        }
      }
    }

    return { shiftedCount };
  }

  // --- REUSABLE CLASS SCHEDULES & ENTRIES ---

  async createClassSchedule(workspaceId, userId, data) {
    return acadRepo.createClassSchedule(
      {
        ...data,
        workspaceId,
        createdBy: userId,
      },
      this.pool,
    );
  }

  async getClassSchedule(workspaceId, scheduleId) {
    const schedule = await acadRepo.findClassScheduleById(scheduleId, this.pool);
    if (!schedule || schedule.workspaceId !== workspaceId) {
      const err = new Error('Class schedule not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    const entries = await acadRepo.findScheduleEntriesBySchedule(scheduleId, this.pool);
    return {
      ...schedule,
      entries,
    };
  }

  async listClassSchedules(workspaceId, filter = {}) {
    return acadRepo.findClassSchedulesByWorkspace(workspaceId, filter, this.pool);
  }

  async updateClassSchedule(workspaceId, scheduleId, updates) {
    await this.getClassSchedule(workspaceId, scheduleId);
    return acadRepo.updateClassSchedule(scheduleId, updates, this.pool);
  }

  async deleteClassSchedule(workspaceId, scheduleId) {
    await this.getClassSchedule(workspaceId, scheduleId);
    return acadRepo.deleteClassSchedule(scheduleId, this.pool);
  }

  async createScheduleEntry(workspaceId, scheduleId, data) {
    await this.getClassSchedule(workspaceId, scheduleId);
    return acadRepo.createScheduleEntry(
      {
        ...data,
        classScheduleId: scheduleId,
        workspaceId,
      },
      this.pool,
    );
  }

  async updateScheduleEntry(workspaceId, scheduleId, entryId, updates) {
    await this.getClassSchedule(workspaceId, scheduleId);
    const entry = await acadRepo.findScheduleEntryById(entryId, this.pool);
    if (!entry || entry.classScheduleId !== scheduleId) {
      const err = new Error('Schedule entry not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    return acadRepo.updateScheduleEntry(entryId, updates, this.pool);
  }

  async deleteScheduleEntry(workspaceId, scheduleId, entryId) {
    await this.getClassSchedule(workspaceId, scheduleId);
    return acadRepo.deleteScheduleEntry(entryId, this.pool);
  }

  // --- ACADEMIC EVENT GENERATION (IDEMPOTENT) ---

  async generateAcademicSchedule(
    workspaceId,
    semesterId,
    { classScheduleId = null, startDate = null, endDate = null } = {},
  ) {
    return withTransaction(async client => {
      const semester = await acadRepo.findSemesterById(semesterId, client);
      if (!semester || semester.workspaceId !== workspaceId) {
        const err = new Error('Semester not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      if (semester.status === SEMESTER_STATUS.ENDED) {
        const err = new Error('Cannot generate events for ended semester');
        err.statusCode = 400;
        err.code = 'INVALID_STATE';
        throw err;
      }

      // Determine schedule template to generate from
      let targetScheduleId = classScheduleId;
      if (!targetScheduleId) {
        const schedules = await acadRepo.findClassSchedulesByWorkspace(
          workspaceId,
          { semesterId },
          client,
        );
        const active = schedules.find(s => s.isActive);
        if (!active) {
          const err = new Error('No active class schedule template found to generate from');
          err.statusCode = 400;
          err.code = 'MISSING_SCHEDULE';
          throw err;
        }
        targetScheduleId = active.id;
      }

      const schedule = await acadRepo.findClassScheduleById(targetScheduleId, client);
      const entries = await acadRepo.findScheduleEntriesBySchedule(targetScheduleId, client);

      if (entries.length === 0) {
        return {
          generatedCount: 0,
          events: [],
          message: 'No schedule entries found in timetable template',
        };
      }

      // Fetch academic dates with Day Orders
      const calendarDates = await acadRepo.findAcademicDatesBySemester(
        semesterId,
        {
          startDate: startDate || semester.startDate,
          endDate: endDate || semester.endDate,
        },
        client,
      );

      const generatedEvents = [];

      for (const day of calendarDates) {
        if (
          !day.isWorking &&
          day.dayStatus !== ACADEMIC_DAY_STATUS.WORKING_DAY &&
          day.dayStatus !== ACADEMIC_DAY_STATUS.SPECIAL_WORKING_DAY
        ) {
          continue;
        }
        if (!day.dayOrder) continue;

        const matchingEntries = entries.filter(e => e.dayOrder === day.dayOrder);
        for (const entry of matchingEntries) {
          const ev = await this._upsertSingleAcademicEvent(semester, schedule, entry, day, client);
          if (ev) generatedEvents.push(ev);
        }
      }

      return {
        semesterId: semester.id,
        classScheduleId: schedule.id,
        generatedCount: generatedEvents.length,
        events: generatedEvents,
      };
    });
  }

  async _upsertSingleAcademicEvent(semester, schedule, entry, day, client) {
    const dateStr = day.calendarDate;

    // Check for occurrence exceptions
    const exception = await acadRepo.findAcademicException(semester.id, entry.id, dateStr, client);

    let status = 'CONFIRMED';
    let sTime = entry.startTime;
    let eTime = entry.endTime;
    let room = entry.room;
    let targetDateStr = dateStr;

    if (exception) {
      if (exception.exceptionType === ACADEMIC_EXCEPTION_TYPE.CANCELLED) {
        status = 'CANCELLED';
      } else if (exception.exceptionType === ACADEMIC_EXCEPTION_TYPE.RESCHEDULED) {
        if (exception.rescheduledDate) targetDateStr = exception.rescheduledDate;
        if (exception.rescheduledStartTime) sTime = exception.rescheduledStartTime;
        if (exception.rescheduledEndTime) eTime = exception.rescheduledEndTime;
        if (exception.rescheduledRoom) room = exception.rescheduledRoom;
      }
    }

    const startAt = `${targetDateStr}T${sTime.length === 5 ? `${sTime}:00` : sTime}.000Z`;
    const endAt = `${targetDateStr}T${eTime.length === 5 ? `${eTime}:00` : eTime}.000Z`;

    const title = entry.courseCode ? `${entry.courseCode} - ${entry.courseName}` : entry.courseName;

    return acadRepo.upsertAcademicEvent(
      {
        calendarId: semester.calendarId,
        workspaceId: semester.workspaceId,
        title,
        description: `Class: ${entry.courseName}${entry.instructor ? `\nInstructor: ${entry.instructor}` : ''}\nDay Order: ${day.dayOrder}`,
        startAt,
        endAt,
        timezone: semester.timezone || 'UTC',
        location: room || null,
        status,
        sourceType: 'DAY_ORDER',
        sourceReference: `DO:${day.dayOrder}:${entry.id}:${dateStr}`,
        semesterId: semester.id,
        classScheduleId: schedule.id,
        scheduleEntryId: entry.id,
        dayOrder: day.dayOrder,
        academicDate: dateStr,
      },
      client,
    );
  }

  // --- ACADEMIC EXCEPTIONS (CANCEL / RESCHEDULE) ---

  async cancelClass(workspaceId, semesterId, data) {
    return withTransaction(async client => {
      const semester = await acadRepo.findSemesterById(semesterId, client);
      if (!semester || semester.workspaceId !== workspaceId) {
        const err = new Error('Semester not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const { scheduleEntryId, calendarDate, reason } = data;

      // 1. Create exception record
      const exception = await acadRepo.createAcademicException(
        {
          semesterId,
          workspaceId,
          scheduleEntryId,
          calendarDate,
          exceptionType: ACADEMIC_EXCEPTION_TYPE.CANCELLED,
          reason,
        },
        client,
      );

      // 2. Find and update generated event
      const events = await acadRepo.findGeneratedEventsBySemester(
        semesterId,
        { startDate: calendarDate, endDate: calendarDate },
        client,
      );
      const targetEvent = events.find(e => e.schedule_entry_id === scheduleEntryId);
      if (targetEvent) {
        await acadRepo.cancelAcademicEvent(targetEvent.id, client);
      }

      return exception;
    });
  }

  async rescheduleClass(workspaceId, semesterId, data) {
    return withTransaction(async client => {
      const semester = await acadRepo.findSemesterById(semesterId, client);
      if (!semester || semester.workspaceId !== workspaceId) {
        const err = new Error('Semester not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const {
        scheduleEntryId,
        calendarDate,
        rescheduledDate,
        rescheduledStartTime,
        rescheduledEndTime,
        rescheduledRoom,
        reason,
      } = data;

      // 1. Create exception record
      const exception = await acadRepo.createAcademicException(
        {
          semesterId,
          workspaceId,
          scheduleEntryId,
          calendarDate,
          exceptionType: ACADEMIC_EXCEPTION_TYPE.RESCHEDULED,
          reason,
          rescheduledDate,
          rescheduledStartTime,
          rescheduledEndTime,
          rescheduledRoom,
        },
        client,
      );

      // 2. Find and update generated event to the new time and room
      const events = await acadRepo.findGeneratedEventsBySemester(
        semesterId,
        { startDate: calendarDate, endDate: calendarDate },
        client,
      );
      const targetEvent = events.find(e => e.schedule_entry_id === scheduleEntryId);
      if (targetEvent) {
        const sTime =
          rescheduledStartTime.length === 5 ? `${rescheduledStartTime}:00` : rescheduledStartTime;
        const eTime =
          rescheduledEndTime.length === 5 ? `${rescheduledEndTime}:00` : rescheduledEndTime;
        const newStartAt = `${rescheduledDate}T${sTime}.000Z`;
        const newEndAt = `${rescheduledDate}T${eTime}.000Z`;

        await acadRepo.rescheduleAcademicEvent(
          targetEvent.id,
          {
            startAt: newStartAt,
            endAt: newEndAt,
            location: rescheduledRoom || targetEvent.location,
            academicDate: calendarDate, // Retain original academic date provenance
          },
          client,
        );
      }

      return exception;
    });
  }

  async listAcademicExceptions(workspaceId, semesterId) {
    await this.getSemester(workspaceId, semesterId);
    return acadRepo.findAcademicExceptionsBySemester(semesterId, this.pool);
  }
}

export const academicService = new AcademicService();
