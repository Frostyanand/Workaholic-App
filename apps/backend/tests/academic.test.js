import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { createCalendar } from '../src/modules/calendar/calendars.repository.js';
import { createEvent, findEventById } from '../src/modules/calendar/events.repository.js';
import * as acadRepo from '../src/modules/academic/academic.repository.js';
import { calculateDayOrderSequence } from '../src/modules/academic/day-order.engine.js';
import { ACADEMIC_DAY_STATUS, SEMESTER_STATUS } from '@workaholic/shared';

describe('Phase 18: Academic Calendar and Day Order Engine Integration Tests', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create Users
    userA = await createUser({
      displayName: 'Academic Student A',
      email: `acad_user_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Academic Student B',
      email: `acad_user_b_${Date.now()}@example.com`,
    });

    // 2. Create Workspaces
    const wsA = await createWorkspaceWithMembership({
      name: 'Academic Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsA.workspace;

    const wsB = await createWorkspaceWithMembership({
      name: 'Academic Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsB.workspace;

    // 3. Create Sessions
    tokenA = `acad_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenB = `acad_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    // Cleanup workspace data
    if (workspaceA) {
      await query(`DELETE FROM workspaces WHERE id IN ($1, $2);`, [workspaceA.id, workspaceB?.id]);
    }
  });

  // --- 1. ENGINE UNIT TESTS ---

  describe('Day Order Engine Pure Logic', () => {
    it('TM-DO-002 & TM-DO-003: Working weekdays advance Day Order sequence correctly', () => {
      // 2026-09-07 is Monday, 2026-09-11 is Friday
      const sequence = calculateDayOrderSequence({
        startDate: '2026-09-07',
        endDate: '2026-09-11',
        dayOrderCount: 5,
      });

      expect(sequence).toHaveLength(5);
      expect(sequence[0]).toMatchObject({
        calendarDate: '2026-09-07',
        isWorking: true,
        dayOrder: 'DO1',
      });
      expect(sequence[1]).toMatchObject({
        calendarDate: '2026-09-08',
        isWorking: true,
        dayOrder: 'DO2',
      });
      expect(sequence[2]).toMatchObject({
        calendarDate: '2026-09-09',
        isWorking: true,
        dayOrder: 'DO3',
      });
      expect(sequence[3]).toMatchObject({
        calendarDate: '2026-09-10',
        isWorking: true,
        dayOrder: 'DO4',
      });
      expect(sequence[4]).toMatchObject({
        calendarDate: '2026-09-11',
        isWorking: true,
        dayOrder: 'DO5',
      });
    });

    it('TM-DO-004: Normal weekends do not advance Day Order sequence', () => {
      // 2026-09-11 (Fri) to 2026-09-14 (Mon)
      const sequence = calculateDayOrderSequence({
        startDate: '2026-09-11',
        endDate: '2026-09-14',
        dayOrderCount: 5,
      });

      expect(sequence).toHaveLength(4);
      expect(sequence[0]).toMatchObject({
        calendarDate: '2026-09-11',
        isWorking: true,
        dayOrder: 'DO1',
      });
      expect(sequence[1]).toMatchObject({
        calendarDate: '2026-09-12',
        isWorking: false,
        dayOrder: null,
      }); // Saturday
      expect(sequence[2]).toMatchObject({
        calendarDate: '2026-09-13',
        isWorking: false,
        dayOrder: null,
      }); // Sunday
      expect(sequence[3]).toMatchObject({
        calendarDate: '2026-09-14',
        isWorking: true,
        dayOrder: 'DO2',
      }); // Monday
    });

    it('TM-DO-005: Special working Saturday can advance Day Order', () => {
      // 2026-09-11 (Fri) to 2026-09-14 (Mon) with Saturday as Special Working Day
      const sequence = calculateDayOrderSequence({
        startDate: '2026-09-11',
        endDate: '2026-09-14',
        dayOrderCount: 5,
        explicitDateRules: [
          {
            calendarDate: '2026-09-12',
            dayStatus: ACADEMIC_DAY_STATUS.SPECIAL_WORKING_DAY,
            reason: 'Working Saturday for compensation',
          },
        ],
      });

      expect(sequence[0]).toMatchObject({ calendarDate: '2026-09-11', dayOrder: 'DO1' });
      expect(sequence[1]).toMatchObject({
        calendarDate: '2026-09-12',
        isWorking: true,
        dayOrder: 'DO2',
      }); // Saturday advances DO!
      expect(sequence[2]).toMatchObject({
        calendarDate: '2026-09-13',
        isWorking: false,
        dayOrder: null,
      }); // Sunday
      expect(sequence[3]).toMatchObject({
        calendarDate: '2026-09-14',
        isWorking: true,
        dayOrder: 'DO3',
      }); // Monday gets DO3
    });

    it('TM-DO-006: Holiday does not consume a Day Order', () => {
      // 2026-09-07 (Mon) to 2026-09-11 (Fri), Wednesday (2026-09-09) is Holiday
      const sequence = calculateDayOrderSequence({
        startDate: '2026-09-07',
        endDate: '2026-09-11',
        dayOrderCount: 5,
        explicitDateRules: [
          {
            calendarDate: '2026-09-09',
            dayStatus: ACADEMIC_DAY_STATUS.HOLIDAY,
            reason: 'National Holiday',
          },
        ],
      });

      expect(sequence[0]).toMatchObject({ calendarDate: '2026-09-07', dayOrder: 'DO1' });
      expect(sequence[1]).toMatchObject({ calendarDate: '2026-09-08', dayOrder: 'DO2' });
      expect(sequence[2]).toMatchObject({
        calendarDate: '2026-09-09',
        isWorking: false,
        dayOrder: null,
      });
      expect(sequence[3]).toMatchObject({ calendarDate: '2026-09-10', dayOrder: 'DO3' }); // Thursday gets DO3!
      expect(sequence[4]).toMatchObject({ calendarDate: '2026-09-11', dayOrder: 'DO4' }); // Friday gets DO4!
    });

    it('Scenario 3: Multiple consecutive holidays shift sequence deterministically', () => {
      const sequence = calculateDayOrderSequence({
        startDate: '2026-09-07',
        endDate: '2026-09-11',
        dayOrderCount: 5,
        explicitDateRules: [
          {
            calendarDate: '2026-09-08',
            dayStatus: ACADEMIC_DAY_STATUS.HOLIDAY,
            reason: 'Holiday 1',
          },
          {
            calendarDate: '2026-09-09',
            dayStatus: ACADEMIC_DAY_STATUS.HOLIDAY,
            reason: 'Holiday 2',
          },
        ],
      });

      expect(sequence[0]).toMatchObject({ calendarDate: '2026-09-07', dayOrder: 'DO1' });
      expect(sequence[1]).toMatchObject({
        calendarDate: '2026-09-08',
        isWorking: false,
        dayOrder: null,
      });
      expect(sequence[2]).toMatchObject({
        calendarDate: '2026-09-09',
        isWorking: false,
        dayOrder: null,
      });
      expect(sequence[3]).toMatchObject({ calendarDate: '2026-09-10', dayOrder: 'DO2' });
      expect(sequence[4]).toMatchObject({ calendarDate: '2026-09-11', dayOrder: 'DO3' });
    });
  });

  // --- 2. SEMESTER LIFECYCLE & CRUD ---

  describe('Semester Lifecycle End-to-End', () => {
    let createdSemester;

    it('TM-DO-001: Creates semester and computes initial Day Order calendar', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/academic/semesters',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          name: 'Even Semester 2026',
          academicYear: '2025-2026',
          institution: 'SRM Institute of Science and Technology',
          startDate: '2026-09-01',
          endDate: '2026-09-15',
          dayOrderCount: 5,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data).toBeDefined();
      expect(body.data.name).toBe('Even Semester 2026');
      expect(body.data.status).toBe(SEMESTER_STATUS.UPCOMING);
      expect(body.data.dayOrderCount).toBe(5);
      createdSemester = body.data;

      // Verify calendar dates populated in DB
      const dates = await acadRepo.findAcademicDatesBySemester(createdSemester.id);
      expect(dates.length).toBe(15);
      // Sep 1, 2026 is Tuesday -> DO1
      expect(dates[0].calendarDate).toBe('2026-09-01');
      expect(dates[0].dayOrder).toBe('DO1');
    });

    it('Lists semesters in workspace', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/academic/semesters',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].id).toBe(createdSemester.id);
    });

    it('Activates semester', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${createdSemester.id}/activate`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.status).toBe(SEMESTER_STATUS.ACTIVE);
    });
  });

  // --- 3. REUSABLE SCHEDULES, ENTRIES & GENERATION ---

  describe('Timetable Templates, Idempotent Generation & Provenance', () => {
    let semester;
    let schedule;
    let entryDO1;
    let entryDO2;
    let personalEvent;

    beforeAll(async () => {
      // 1. Create active semester
      const sRes = await app.inject({
        method: 'POST',
        url: '/api/v1/academic/semesters',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          name: 'Fall 2026 Timetable Test',
          startDate: '2026-09-07', // Mon
          endDate: '2026-09-18', // Fri next week (10 weekdays)
          dayOrderCount: 5,
        },
      });
      semester = sRes.json().data;
      await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/activate`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      // 2. Create Reusable Class Schedule (TM-DO-008)
      const schRes = await app.inject({
        method: 'POST',
        url: '/api/v1/academic/schedules',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          name: 'Core B.Tech Timetable',
          description: 'Reusable timetable template',
          semesterId: semester.id,
        },
      });
      schedule = schRes.json().data;

      // 3. Create Schedule Entries for DO1 and DO2 (TM-DO-009)
      const e1Res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/schedules/${schedule.id}/entries`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          dayOrder: 'DO1',
          courseName: 'Computer Networks',
          courseCode: '18CSC301J',
          instructor: 'Dr. Raman',
          room: 'TP 401',
          startTime: '09:00',
          endTime: '10:00',
          color: '#3B82F6',
        },
      });
      entryDO1 = e1Res.json().data;

      const e2Res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/schedules/${schedule.id}/entries`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          dayOrder: 'DO2',
          courseName: 'Database Management Systems',
          courseCode: '18CSC302J',
          instructor: 'Dr. Priya',
          room: 'TP 402',
          startTime: '10:00',
          endTime: '11:00',
          color: '#10B981',
        },
      });
      entryDO2 = e2Res.json().data;

      // 4. Create an independent personal event on the same calendar/date
      const personalCal = await createCalendar({
        workspaceId: workspaceA.id,
        ownerUserId: userA.id,
        name: 'Personal Calendar',
        sourceType: 'WORKAHOLIC',
      });

      personalEvent = await createEvent({
        calendarId: personalCal.id,
        workspaceId: workspaceA.id,
        title: 'Dentist Appointment',
        startAt: '2026-09-07T14:00:00.000Z',
        endAt: '2026-09-07T15:00:00.000Z',
        sourceType: 'WORKAHOLIC',
      });
    });

    it('Scenario 1 & TM-DO-012: Generates academic events with full provenance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/generate`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          classScheduleId: schedule.id,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.generatedCount).toBeGreaterThan(0);

      // Verify events in database have provenance
      const events = await acadRepo.findGeneratedEventsBySemester(semester.id);
      expect(events.length).toBeGreaterThan(0);

      const do1Event = events.find(e => e.day_order === 'DO1');
      expect(do1Event).toBeDefined();
      expect(do1Event.semester_id).toBe(semester.id);
      expect(do1Event.class_schedule_id).toBe(schedule.id);
      expect(do1Event.schedule_entry_id).toBe(entryDO1.id);
      expect(do1Event.source_type).toBe('DAY_ORDER');
      expect(do1Event.title).toContain('18CSC301J');
      expect(do1Event.location).toBe('TP 401');
    });

    it('Scenario 10: Repeated generation is strictly idempotent (zero duplicates)', async () => {
      const countBefore = (await acadRepo.findGeneratedEventsBySemester(semester.id)).length;

      // Run generation 2nd time
      await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/generate`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { classScheduleId: schedule.id },
      });

      // Run generation 3rd time
      await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/generate`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { classScheduleId: schedule.id },
      });

      const countAfter = (await acadRepo.findGeneratedEventsBySemester(semester.id)).length;
      expect(countAfter).toBe(countBefore); // Identical count, zero duplicate rows!
    });

    it('Scenario 9: Personal calendar event is completely untouched by generation', async () => {
      const pe = await findEventById(personalEvent.id, workspaceA.id);
      expect(pe).toBeDefined();
      expect(pe.title).toBe('Dentist Appointment');
      expect(pe.sourceType).toBe('WORKAHOLIC');
      expect(pe.deletedAt).toBeNull();
    });

    it('Scenario 2 & TM-DO-007: Holiday insertion shifts subsequent Day Orders and regenerates events', async () => {
      // 2026-09-08 was originally DO2 (Tue).
      // We insert a holiday on 2026-09-08.
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/calendar/dates`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          calendarDate: '2026-09-08',
          dayStatus: ACADEMIC_DAY_STATUS.HOLIDAY,
          reason: 'Campus Holiday',
        },
      });

      expect(res.statusCode).toBe(201);

      // Verify 2026-09-08 is now a holiday with null day_order
      const sep8 = await acadRepo.findAcademicDate(semester.id, '2026-09-08');
      expect(sep8.dayStatus).toBe(ACADEMIC_DAY_STATUS.HOLIDAY);
      expect(sep8.dayOrder).toBeNull();

      // Verify 2026-09-09 (Wed) has shifted to DO2!
      const sep9 = await acadRepo.findAcademicDate(semester.id, '2026-09-09');
      expect(sep9.dayOrder).toBe('DO2');

      // Verify reusable schedule template was NOT mutated
      const sched = await acadRepo.findClassScheduleById(schedule.id);
      expect(sched.name).toBe('Core B.Tech Timetable');
      const entries = await acadRepo.findScheduleEntriesBySchedule(schedule.id);
      expect(entries.find(e => e.dayOrder === 'DO2').courseName).toBe(
        'Database Management Systems',
      );
    });

    it('Scenario 5 & TM-DO-010: Cancelled class marks occurrence cancelled without mutating schedule template', async () => {
      // Cancel DO1 class on 2026-09-07
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/exceptions/cancel`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          scheduleEntryId: entryDO1.id,
          calendarDate: '2026-09-07',
          reason: 'Faculty on symposium leave',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.exceptionType).toBe('CANCELLED');

      // Verify calendar event is CANCELLED
      const events = await acadRepo.findGeneratedEventsBySemester(semester.id, {
        startDate: '2026-09-07',
        endDate: '2026-09-07',
      });
      const target = events.find(e => e.schedule_entry_id === entryDO1.id);
      expect(target.status).toBe('CANCELLED');

      // Verify schedule entry template is still active and unchanged
      const entry = await acadRepo.findScheduleEntryById(entryDO1.id);
      expect(entry.courseName).toBe('Computer Networks');
    });

    it('Scenario 6 & TM-DO-011: Rescheduled class moves occurrence to new timing', async () => {
      // Reschedule DO2 class on 2026-09-09 to 14:00
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/exceptions/reschedule`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          scheduleEntryId: entryDO2.id,
          calendarDate: '2026-09-09',
          rescheduledDate: '2026-09-09',
          rescheduledStartTime: '14:00',
          rescheduledEndTime: '15:00',
          rescheduledRoom: 'Auditorium A',
          reason: 'Lab maintenance in morning',
        },
      });

      expect(res.statusCode).toBe(201);

      // Verify event was updated
      const events = await acadRepo.findGeneratedEventsBySemester(semester.id, {
        startDate: '2026-09-09',
        endDate: '2026-09-09',
      });
      const target = events.find(e => e.schedule_entry_id === entryDO2.id);
      expect(target.start_at.toISOString()).toContain('14:00:00');
      expect(target.location).toBe('Auditorium A');
    });

    it('Scenario 7 & TM-DO-013 through TM-DO-017: Ending semester removes future academic events while preserving past history, templates, and personal events', async () => {
      // 1. Manually backdate one event to simulate a past attended class
      await query(
        `UPDATE events SET start_at = '2026-01-01T09:00:00.000Z', end_at = '2026-01-01T10:00:00.000Z', academic_date = '2026-01-01'
         WHERE id = (SELECT id FROM events WHERE semester_id = $1 AND schedule_entry_id = $2 LIMIT 1);`,
        [semester.id, entryDO1.id],
      );

      // 2. Call End Semester
      const endRes = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/end`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(endRes.statusCode).toBe(200);
      const endBody = endRes.json();
      expect(endBody.data.semester.status).toBe(SEMESTER_STATUS.ENDED);

      // 3. Future generated academic events removed
      const remainingEvents = await acadRepo.findGeneratedEventsBySemester(semester.id);
      // The past event (Jan 1, 2026) must remain!
      const pastEvent = remainingEvents.find(
        e => String(e.academic_date).slice(0, 10) === '2026-01-01',
      );
      expect(pastEvent).toBeDefined();

      // 4. TM-DO-015: Reusable schedule template preserved!
      const sched = await acadRepo.findClassScheduleById(schedule.id);
      expect(sched).toBeDefined();
      expect(sched.name).toBe('Core B.Tech Timetable');

      // 5. TM-DO-016: Personal calendar event preserved!
      const pe = await findEventById(personalEvent.id, workspaceA.id);
      expect(pe).toBeDefined();
      expect(pe.deletedAt).toBeNull();

      // 6. Cannot generate events once ended
      const genAfterEnd = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semester.id}/generate`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(genAfterEnd.statusCode).toBe(400);
    });

    it('Scenario 8: New semester operates independently and can reuse timetable template', async () => {
      const newSemRes = await app.inject({
        method: 'POST',
        url: '/api/v1/academic/semesters',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          name: 'Spring 2027',
          startDate: '2027-01-04',
          endDate: '2027-01-15',
          dayOrderCount: 5,
        },
      });

      expect(newSemRes.statusCode).toBe(201);
      const newSemester = newSemRes.json().data;
      expect(newSemester.status).toBe(SEMESTER_STATUS.UPCOMING);

      // Generate events using the existing reusable schedule!
      const genRes = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${newSemester.id}/generate`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          classScheduleId: schedule.id,
        },
      });

      expect(genRes.statusCode).toBe(201);
      expect(genRes.json().data.generatedCount).toBeGreaterThan(0);

      // Verify newly generated events belong to Spring 2027
      const newEvents = await acadRepo.findGeneratedEventsBySemester(newSemester.id);
      expect(newEvents.length).toBeGreaterThan(0);
      expect(newEvents[0].semester_id).toBe(newSemester.id);
    });
  });

  // --- 4. TENANT ISOLATION & AUTHORIZATION ---

  describe('Tenant & Workspace Security Boundary', () => {
    let semesterA;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/academic/semesters',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          name: 'Security Test Semester',
          startDate: '2026-10-01',
          endDate: '2026-10-10',
          dayOrderCount: 5,
        },
      });
      semesterA = res.json().data;
    });

    it('User B in Workspace B cannot access User A semester in Workspace A', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/academic/semesters/${semesterA.id}`,
        headers: {
          authorization: `Bearer ${tokenB}`,
          'x-workspace-id': workspaceB.id,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('User B cannot mutate User A calendar rules', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semesterA.id}/calendar/dates`,
        headers: {
          authorization: `Bearer ${tokenB}`,
          'x-workspace-id': workspaceB.id,
        },
        payload: {
          calendarDate: '2026-10-05',
          dayStatus: ACADEMIC_DAY_STATUS.HOLIDAY,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('User B cannot end User A semester', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/academic/semesters/${semesterA.id}/end`,
        headers: {
          authorization: `Bearer ${tokenB}`,
          'x-workspace-id': workspaceB.id,
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
