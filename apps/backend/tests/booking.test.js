import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { createCalendar } from '../src/modules/calendar/calendars.repository.js';
import { createEvent } from '../src/modules/calendar/events.repository.js';

describe('Phase 20: Booking & Availability Engine Integration Tests', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;
  let calendarA;

  let pageA;
  let typeA1;
  let typeA2;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create Users
    userA = await createUser({
      displayName: 'Dr. Host A',
      email: `booking_host_a_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    userB = await createUser({
      displayName: 'Competitor B',
      email: `booking_user_b_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    // 2. Create Workspaces
    const wsA = await createWorkspaceWithMembership({
      name: 'Host A Workspace',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsA.workspace;

    const wsB = await createWorkspaceWithMembership({
      name: 'Competitor B Workspace',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsB.workspace;

    // 3. Create Sessions
    tokenA = `book_tok_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenB = `book_tok_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // 4. Create Calendar
    calendarA = await createCalendar({
      workspaceId: workspaceA.id,
      ownerUserId: userA.id,
      name: 'Primary Consultations',
      color: '#4F46E5',
      visibility: 'PRIVATE',
      timezone: 'UTC',
      isDefault: true,
    });
  });

  afterAll(async () => {
    try {
      await query('DELETE FROM bookings WHERE workspace_id IN ($1, $2);', [
        workspaceA.id,
        workspaceB.id,
      ]);
      await query('DELETE FROM booking_pages WHERE workspace_id IN ($1, $2);', [
        workspaceA.id,
        workspaceB.id,
      ]);
      await query('DELETE FROM events WHERE workspace_id IN ($1, $2);', [
        workspaceA.id,
        workspaceB.id,
      ]);
      await query('DELETE FROM calendars WHERE workspace_id IN ($1, $2);', [
        workspaceA.id,
        workspaceB.id,
      ]);
      await query('DELETE FROM users WHERE id IN ($1, $2);', [userA.id, userB.id]);
    } catch {
      // non-fatal cleanup
    }
  });

  // =========================================================
  // 1. Authenticated Booking Page Management
  // =========================================================

  it('TM-BOOK-001 (API): Owner can create, update, and manage a booking page', async () => {
    const slug = `dr-host-${Date.now()}`;
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/booking/pages',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        name: 'Executive Consultation',
        slug,
        description: 'One-on-one executive advisory and mentorship sessions.',
        timezone: 'UTC',
        calendarId: calendarA.id,
      },
    });

    expect(resCreate.statusCode).toBe(201);
    const bodyCreate = JSON.parse(resCreate.body);
    expect(bodyCreate.data.name).toBe('Executive Consultation');
    expect(bodyCreate.data.slug).toBe(slug);
    expect(bodyCreate.data.status).toBe('ACTIVE');
    pageA = bodyCreate.data;

    // Verify default availability rules were seeded
    const resRules = await app.inject({
      method: 'GET',
      url: `/api/v1/booking/pages/${pageA.id}/availability-rules`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(resRules.statusCode).toBe(200);
    const bodyRules = JSON.parse(resRules.body);
    expect(bodyRules.data.length).toBe(5); // Mon-Fri seeded

    // Update booking page
    const resUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/booking/pages/${pageA.id}`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        description: 'Updated executive advisory sessions description.',
      },
    });
    expect(resUpdate.statusCode).toBe(200);
    const bodyUpdate = JSON.parse(resUpdate.body);
    expect(bodyUpdate.data.description).toBe('Updated executive advisory sessions description.');
  });

  it('SECURITY: Unauthorized user cannot modify or delete another user booking page', async () => {
    const resPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/booking/pages/${pageA.id}`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspaceB.id,
      },
      payload: { name: 'Hacked Page' },
    });
    // Workspace isolation throws NOT_FOUND or FORBIDDEN
    expect([403, 404]).toContain(resPatch.statusCode);

    const resDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/booking/pages/${pageA.id}`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect([403, 404]).toContain(resDelete.statusCode);
  });

  // =========================================================
  // 2. Booking Types & Availability Rules Configuration
  // =========================================================

  it('TM-BOOK-003 & TM-BOOK-004: Configure booking types with duration, buffers, notice, horizon, and task creation', async () => {
    // 30 min consultation with 15 min buffer before and 15 min buffer after
    const resType1 = await app.inject({
      method: 'POST',
      url: `/api/v1/booking/pages/${pageA.id}/types`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        name: 'Quick Consultation',
        slug: 'quick-consult',
        description: '30-minute high-impact problem solving session.',
        duration: 30,
        bufferBefore: 15,
        bufferAfter: 15,
        minimumNotice: 60, // 1 hour
        maximumHorizon: 14, // 14 days
        cancellationDeadline: 60, // 1 hour
        reschedulingEnabled: true,
        location: 'Google Meet',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        createTask: true,
        taskPriority: 'P1',
      },
    });

    expect(resType1.statusCode).toBe(201);
    typeA1 = JSON.parse(resType1.body).data;
    expect(typeA1.duration).toBe(30);
    expect(typeA1.bufferBefore).toBe(15);
    expect(typeA1.bufferAfter).toBe(15);
    expect(typeA1.createTask).toBe(true);

    // 60 min deep dive without task creation
    const resType2 = await app.inject({
      method: 'POST',
      url: `/api/v1/booking/pages/${pageA.id}/types`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        name: 'Deep Dive Strategy',
        slug: 'deep-dive',
        duration: 60,
        bufferBefore: 0,
        bufferAfter: 0,
        minimumNotice: 120,
        maximumHorizon: 30,
        cancellationDeadline: 120,
        reschedulingEnabled: true,
      },
    });

    expect(resType2.statusCode).toBe(201);
    typeA2 = JSON.parse(resType2.body).data;
    expect(typeA2.duration).toBe(60);
  });

  // =========================================================
  // 3. Public Booking Page & Availability Query
  // =========================================================

  it('TM-BOOK-002: Anonymous guest can view public booking page without authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/booking-pages/${pageA.slug}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(res.headers['cache-control']).toContain('no-store');

    const body = JSON.parse(res.body);
    expect(body.data.slug).toBe(pageA.slug);
    expect(body.data.ownerName).toBe('Dr. Host A');
    expect(body.data.bookingTypes.length).toBe(2);
    // Security: internal ids stripped or safe
    expect(body.data.workspaceId).toBeUndefined();
    expect(body.data.ownerUserId).toBeUndefined();
  });

  it('TM-BOOK-005, TM-BOOK-006, TM-BOOK-007, TM-BOOK-008: Availability respects rules, buffers, notice, and calendar conflicts without leaking private details', async () => {
    // Determine tomorrow's date string in UTC
    const tomorrow = new Date(Date.now() + 86400000);
    const y = tomorrow.getUTCFullYear();
    const m = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getUTCDate()).padStart(2, '0');
    const tomorrowStr = `${y}-${m}-${d}`;
    const weekday = tomorrow.getUTCDay();

    // Ensure tomorrow has active hours: 09:00 - 17:00
    await app.inject({
      method: 'PUT',
      url: `/api/v1/booking/pages/${pageA.id}/availability-rules`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        rules: [
          {
            weekday,
            startTime: '09:00:00',
            endTime: '17:00:00',
            timezone: 'UTC',
          },
        ],
      },
    });

    // Create a private busy event on the host's calendar tomorrow at 10:00 - 11:00 UTC
    const privateEventStart = `${tomorrowStr}T10:00:00.000Z`;
    const privateEventEnd = `${tomorrowStr}T11:00:00.000Z`;
    await createEvent({
      calendarId: calendarA.id,
      workspaceId: workspaceA.id,
      title: 'Top Secret Board Review',
      description: 'Confidential strategy discussion',
      startAt: new Date(privateEventStart),
      endAt: new Date(privateEventEnd),
      timezone: 'UTC',
      visibility: 'PRIVATE',
      status: 'CONFIRMED',
      createdBy: userA.id,
    });

    // Query availability for tomorrow for typeA1 (30 min duration, 15 min buffer before & after)
    const resAvail = await app.inject({
      method: 'GET',
      url: `/api/v1/booking-pages/${pageA.slug}/availability?bookingTypeId=${typeA1.id}&startDate=${tomorrowStr}&endDate=${tomorrowStr}&timezone=UTC`,
    });

    expect(resAvail.statusCode).toBe(200);
    const bodyAvail = JSON.parse(resAvail.body);
    const slots = bodyAvail.data.slots;
    expect(slots.length).toBeGreaterThan(0);

    // Private event was 10:00 - 11:00.
    // For typeA1 (bufferBefore=15, bufferAfter=15):
    // A slot 09:30 - 10:00 has buffer [09:15, 10:15], which overlaps 10:00 - 11:00 -> MUST BE BLOCKED!
    // A slot 10:00 - 10:30 overlaps 10:00 - 11:00 -> MUST BE BLOCKED!
    // A slot 10:30 - 11:00 overlaps 10:00 - 11:00 -> MUST BE BLOCKED!
    // A slot 11:00 - 11:30 has buffer [10:45, 11:45], which overlaps 10:00 - 11:00 -> MUST BE BLOCKED!
    // A slot 11:30 - 12:00 has buffer [11:15, 12:15], does not overlap 10:00 - 11:00 -> CAN BE AVAILABLE!

    const conflictSlot1 = slots.find(s => s.startAt === `${tomorrowStr}T09:30:00.000Z`);
    expect(conflictSlot1).toBeUndefined(); // blocked by buffer

    const conflictSlot2 = slots.find(s => s.startAt === `${tomorrowStr}T10:00:00.000Z`);
    expect(conflictSlot2).toBeUndefined(); // directly blocked

    const conflictSlot3 = slots.find(s => s.startAt === `${tomorrowStr}T10:30:00.000Z`);
    expect(conflictSlot3).toBeUndefined(); // directly blocked

    const conflictSlot4 = slots.find(s => s.startAt === `${tomorrowStr}T11:00:00.000Z`);
    expect(conflictSlot4).toBeUndefined(); // blocked by buffer

    const openSlot = slots.find(s => s.startAt === `${tomorrowStr}T11:30:00.000Z`);
    expect(openSlot).toBeDefined();

    // Verify private event details are completely invisible in the response
    const rawResponseBody = resAvail.body;
    expect(rawResponseBody).not.toContain('Top Secret');
    expect(rawResponseBody).not.toContain('Confidential');
  });

  // =========================================================
  // 4. Public Booking Confirmation, Calendar Event & Task Integration
  // =========================================================

  let confirmedBooking;

  it('TM-BOOK-009 & TM-BOOK-014: Confirmed booking creates Calendar Event and Optional Task with explicit source provenance', async () => {
    const tomorrow = new Date(Date.now() + 86400000);
    const y = tomorrow.getUTCFullYear();
    const m = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getUTCDate()).padStart(2, '0');
    const slotTime = `${y}-${m}-${d}T14:00:00.000Z`;

    const resBook = await app.inject({
      method: 'POST',
      url: `/api/v1/booking-pages/${pageA.slug}/bookings`,
      payload: {
        bookingTypeId: typeA1.id,
        startAt: slotTime,
        guestName: 'Jane Doe',
        guestEmail: 'jane.doe@example.com',
        guestNotes: 'Need advice on quantum architecture rollout.',
        timezone: 'UTC',
        idempotencyKey: `idem_book_1_${Date.now()}`,
      },
    });

    expect(resBook.statusCode).toBe(201);
    confirmedBooking = JSON.parse(resBook.body).data;
    expect(confirmedBooking.status).toBe('CONFIRMED');
    expect(confirmedBooking.guestName).toBe('Jane Doe');
    expect(confirmedBooking.manageToken).toMatch(/^bkm_[a-f0-9]{48}$/);

    // Verify associated Calendar Event in PostgreSQL
    const eventRes = await query(
      `SELECT * FROM events WHERE source_type = 'BOOKING' AND source_reference = $1;`,
      [confirmedBooking.id],
    );
    expect(eventRes.rows.length).toBe(1);
    const calEvent = eventRes.rows[0];
    expect(calEvent.title).toContain('Quick Consultation with Jane Doe');
    expect(calEvent.calendar_id).toBe(calendarA.id);

    // Verify associated Task in PostgreSQL (since typeA1 has createTask: true)
    const taskRes = await query(
      `SELECT * FROM tasks WHERE source_type = 'BOOKING' AND source_reference = $1;`,
      [confirmedBooking.id],
    );
    expect(taskRes.rows.length).toBe(1);
    const task = taskRes.rows[0];
    expect(task.title).toContain('Prepare for Quick Consultation: Jane Doe');
    expect(task.priority).toBe('P1');
  });

  it('Idempotency: Re-submitting the same booking request returns existing booking without duplicates', async () => {
    const resRetry = await app.inject({
      method: 'POST',
      url: `/api/v1/booking-pages/${pageA.slug}/bookings`,
      payload: {
        bookingTypeId: typeA1.id,
        startAt: confirmedBooking.startAt,
        guestName: 'Jane Doe',
        guestEmail: 'jane.doe@example.com',
        idempotencyKey: confirmedBooking.idempotencyKey,
      },
    });

    expect([200, 201]).toContain(resRetry.statusCode);
    const bodyRetry = JSON.parse(resRetry.body).data;
    expect(bodyRetry.id).toBe(confirmedBooking.id);

    // Verify no duplicate calendar events or tasks were created
    const eventCount = await query(
      `SELECT COUNT(*) FROM events WHERE source_type = 'BOOKING' AND source_reference = $1;`,
      [confirmedBooking.id],
    );
    expect(parseInt(eventCount.rows[0].count, 10)).toBe(1);

    const taskCount = await query(
      `SELECT COUNT(*) FROM tasks WHERE source_type = 'BOOKING' AND source_reference = $1;`,
      [confirmedBooking.id],
    );
    expect(parseInt(taskCount.rows[0].count, 10)).toBe(1);
  });

  // =========================================================
  // 5. MANDATORY CONCURRENCY & DOUBLE-BOOKING PREVENTION
  // =========================================================

  it('TM-BOOK-012 (CRITICAL): Concurrent booking requests for the same slot cannot double-book (Database Exclusion Protection)', async () => {
    const dayAfter = new Date(Date.now() + 2 * 86400000);
    const y = dayAfter.getUTCFullYear();
    const m = String(dayAfter.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dayAfter.getUTCDate()).padStart(2, '0');
    const dayAfterStr = `${y}-${m}-${d}`;
    const weekday = dayAfter.getUTCDay();

    // Ensure active availability rule for dayAfter
    await app.inject({
      method: 'PUT',
      url: `/api/v1/booking/pages/${pageA.id}/availability-rules`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        rules: [
          {
            weekday,
            startTime: '09:00:00',
            endTime: '17:00:00',
            timezone: 'UTC',
          },
        ],
      },
    });

    const contestedSlot = `${dayAfterStr}T15:00:00.000Z`;

    // Fire two concurrent requests for the exact same slot simultaneously
    const req1 = app.inject({
      method: 'POST',
      url: `/api/v1/booking-pages/${pageA.slug}/bookings`,
      payload: {
        bookingTypeId: typeA1.id,
        startAt: contestedSlot,
        guestName: 'Racer One',
        guestEmail: 'racer.one@example.com',
      },
    });

    const req2 = app.inject({
      method: 'POST',
      url: `/api/v1/booking-pages/${pageA.slug}/bookings`,
      payload: {
        bookingTypeId: typeA1.id,
        startAt: contestedSlot,
        guestName: 'Racer Two',
        guestEmail: 'racer.two@example.com',
      },
    });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // Exactly one SUCCESS (201) and exactly one CONFLICT (409)
    expect(statuses).toEqual([201, 409]);

    const failedRes = res1.statusCode === 409 ? res1 : res2;
    const failedBody = JSON.parse(failedRes.body);
    expect(failedBody.error.code).toBe('CONFLICT');

    // Verify in PostgreSQL database: EXACTLY 1 confirmed booking exists for that interval
    const dbCheck = await query(
      `SELECT COUNT(*) FROM bookings
       WHERE owner_user_id = $1 AND start_at = $2 AND status = 'CONFIRMED' AND deleted_at IS NULL;`,
      [userA.id, contestedSlot],
    );
    expect(parseInt(dbCheck.rows[0].count, 10)).toBe(1);
  });

  // =========================================================
  // 6. Guest Self-Service: View, Reschedule & Cancel
  // =========================================================

  it('TM-BOOK-011: Guest can reschedule booking to a valid slot, preserving history and updating event/task', async () => {
    const dayAfter = new Date(Date.now() + 2 * 86400000);
    const y = dayAfter.getUTCFullYear();
    const m = String(dayAfter.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dayAfter.getUTCDate()).padStart(2, '0');
    const newSlotTime = `${y}-${m}-${d}T16:00:00.000Z`;

    const resResched = await app.inject({
      method: 'POST',
      url: `/api/v1/public/bookings/${confirmedBooking.manageToken}/reschedule`,
      payload: {
        newStartAt: newSlotTime,
        reason: 'Shifted schedule',
      },
    });

    expect(resResched.statusCode).toBe(200);
    const rescheduledBooking = JSON.parse(resResched.body).data;
    expect(rescheduledBooking.status).toBe('CONFIRMED');
    expect(rescheduledBooking.startAt).toBe(newSlotTime);
    expect(rescheduledBooking.rescheduledFromBookingId).toBe(confirmedBooking.id);

    // Verify original booking is now RESCHEDULED
    const originalCheck = await query(`SELECT * FROM bookings WHERE id = $1;`, [
      confirmedBooking.id,
    ]);
    expect(originalCheck.rows[0].status).toBe('RESCHEDULED');
    expect(originalCheck.rows[0].rescheduled_to_booking_id).toBe(rescheduledBooking.id);

    // Update confirmedBooking reference to new rescheduled booking
    confirmedBooking = rescheduledBooking;
  });

  it('TM-BOOK-010: Guest can cancel booking before deadline, freeing up the slot and cancelling event/task', async () => {
    const resCancel = await app.inject({
      method: 'POST',
      url: `/api/v1/public/bookings/${confirmedBooking.manageToken}/cancel`,
      payload: {
        reason: 'Client requested cancellation',
      },
    });

    expect(resCancel.statusCode).toBe(200);
    const cancelledData = JSON.parse(resCancel.body).data;
    expect(cancelledData.status).toBe('CANCELLED');

    // Verify calendar event was cancelled
    const eventRes = await query(
      `SELECT * FROM events WHERE source_type = 'BOOKING' AND source_reference = $1;`,
      [confirmedBooking.id],
    );
    expect(eventRes.rows[0].status).toBe('CANCELLED');

    // Verify task was cancelled
    const taskRes = await query(
      `SELECT * FROM tasks WHERE source_type = 'BOOKING' AND source_reference = $1;`,
      [confirmedBooking.id],
    );
    expect(taskRes.rows[0].status).toBe('CANCELLED');
  });

  it('TM-BOOK-010 (Deadline Enforcement): Cancellation after deadline fails when prohibited', async () => {
    // Create a booking starting in 15 minutes (while cancellationDeadline is 60 minutes)
    const soonStart = new Date(Date.now() + 15 * 60000);
    const soonEnd = new Date(soonStart.getTime() + 30 * 60000);

    // Manually insert booking in DB for testing tight deadline
    const tokenSoon = 'bkm_soon_' + Date.now();
    const insertRes = await query(
      `INSERT INTO bookings (
        booking_type_id, booking_page_id, owner_user_id, workspace_id,
        guest_name, guest_email, start_at, end_at, buffer_start_at, buffer_end_at,
        timezone, status, manage_token
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *;`,
      [
        typeA1.id,
        pageA.id,
        userA.id,
        workspaceA.id,
        'Late Guest',
        'late@example.com',
        soonStart,
        soonEnd,
        soonStart,
        soonEnd,
        'UTC',
        'CONFIRMED',
        tokenSoon,
      ],
    );
    const soonBooking = insertRes.rows[0];

    const resLateCancel = await app.inject({
      method: 'POST',
      url: `/api/v1/public/bookings/${soonBooking.manage_token}/cancel`,
      payload: { reason: 'Cancelling too late' },
    });

    expect(resLateCancel.statusCode).toBe(400);
    const bodyLate = JSON.parse(resLateCancel.body);
    expect(bodyLate.error.message).toContain('Cancellations must be made at least');
  });
});
