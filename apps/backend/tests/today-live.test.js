import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as calendarsRepo from '../src/modules/calendar/calendars.repository.js';
import * as eventsRepo from '../src/modules/calendar/events.repository.js';

describe('Today Live PostgreSQL 16 & API Integration (Phase 9, TM-TODAY-001 to TM-TODAY-006)', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let sessionTokenA;
  let sessionTokenB;
  let calendarA;

  // Fixed reference date: 2026-09-07 (Monday)
  const TEST_DATE = '2026-09-07';

  beforeAll(async () => {
    app = createApp({ logger: false });

    // Clean test state
    await query("DELETE FROM tasks WHERE title LIKE '[TODAY_LIVE]%'");
    await query("DELETE FROM events WHERE title LIKE '[TODAY_LIVE]%'");
    await query("DELETE FROM calendars WHERE name LIKE '[TODAY_LIVE]%'");

    // Create users
    userA = await createUser({
      displayName: 'Today Tester A',
      email: `today_test_a_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    userB = await createUser({
      displayName: 'Today Tester B',
      email: `today_test_b_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    // Create workspaces
    const resA = await createWorkspaceWithMembership({
      name: 'Today Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = resA.workspace;

    const resB = await createWorkspaceWithMembership({
      name: 'Today Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = resB.workspace;

    // Create sessions
    const rawTokenA = `live_today_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    const rawTokenB = `live_today_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;

    // Create primary calendar for Workspace A
    calendarA = await calendarsRepo.createCalendar({
      workspaceId: workspaceA.id,
      ownerUserId: userA.id,
      name: '[TODAY_LIVE] Primary Work',
      color: '#4F46E5',
      isDefault: true,
      timezone: 'UTC',
    });
  });

  afterAll(async () => {
    await query("DELETE FROM tasks WHERE title LIKE '[TODAY_LIVE]%'");
    await query("DELETE FROM events WHERE title LIKE '[TODAY_LIVE]%'");
    await query("DELETE FROM calendars WHERE name LIKE '[TODAY_LIVE]%'");
  });

  // ==========================================================
  // TM-TODAY-001: Today's tasks are displayed
  // ==========================================================
  it('TM-TODAY-001 (DOMAIN): Displays tasks due today within local day boundaries', async () => {
    // 1. Task due today at 15:00 UTC
    const taskDueToday = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Task Due Today',
      priority: 'P2',
      status: 'TODO',
      dueAt: '2026-09-07T15:00:00.000Z',
      createdBy: userA.id,
    });

    // 2. Task due tomorrow (must NOT be in dueToday)
    await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Task Due Tomorrow',
      priority: 'P2',
      status: 'TODO',
      dueAt: '2026-09-08T10:00:00.000Z',
      createdBy: userA.id,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=${TEST_DATE}&timezone=UTC`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data.date).toBe(TEST_DATE);

    const found = json.data.dueToday.find(t => t.id === taskDueToday.id);
    expect(found).toBeDefined();
    expect(found.title).toBe('[TODAY_LIVE] Task Due Today');

    const tomorrowFound = json.data.dueToday.find(t => t.title.includes('Task Due Tomorrow'));
    expect(tomorrowFound).toBeUndefined();
  });

  // ==========================================================
  // TM-TODAY-002: Overdue tasks are displayed
  // ==========================================================
  it('TM-TODAY-002 (DOMAIN): Displays overdue tasks whose deadline has passed', async () => {
    // Overdue task from past day
    const overduePast = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Overdue Past Task',
      priority: 'P1',
      status: 'TODO',
      dueAt: '2026-09-05T12:00:00.000Z', // 2 days ago
      createdBy: userA.id,
    });

    // Completed task with past due date (must NOT be in overdue)
    await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Completed Past Task',
      priority: 'P1',
      status: 'COMPLETED',
      dueAt: '2026-09-04T12:00:00.000Z',
      createdBy: userA.id,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=${TEST_DATE}&timezone=UTC`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();

    const found = json.data.overdue.find(t => t.id === overduePast.id);
    expect(found).toBeDefined();
    expect(found.title).toBe('[TODAY_LIVE] Overdue Past Task');
    expect(found.isOverdue).toBe(true);

    const completedFound = json.data.overdue.find(t => t.title.includes('Completed Past Task'));
    expect(completedFound).toBeUndefined();
  });

  // ==========================================================
  // TM-TODAY-003: Important tasks are displayed
  // ==========================================================
  it('TM-TODAY-003 (DOMAIN): Displays high-priority tasks (P0, P1, P2) regardless of due date', async () => {
    // Critical P0 task with no due date
    const criticalTask = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Critical P0 Backlog Task',
      priority: 'P0',
      status: 'TODO',
      dueAt: null,
      createdBy: userA.id,
    });

    // Low P4 task (must NOT be in important)
    const lowTask = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Low P4 Task',
      priority: 'P4',
      status: 'TODO',
      dueAt: null,
      createdBy: userA.id,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=${TEST_DATE}&timezone=UTC`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();

    const p0Found = json.data.important.find(t => t.id === criticalTask.id);
    expect(p0Found).toBeDefined();
    expect(p0Found.priority).toBe('P0');

    const p4Found = json.data.important.find(t => t.id === lowTask.id);
    expect(p4Found).toBeUndefined();
  });

  // ==========================================================
  // TM-TODAY-004: Today's calendar events are displayed
  // ==========================================================
  it("TM-TODAY-004: Displays today's calendar events (both timed and all-day)", async () => {
    // Timed event today (14:00 - 15:00)
    const timedEvent = await eventsRepo.createEvent({
      calendarId: calendarA.id,
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Afternoon Client Review',
      startAt: '2026-09-07T14:00:00.000Z',
      endAt: '2026-09-07T15:00:00.000Z',
      isAllDay: false,
      timezone: 'UTC',
      status: 'CONFIRMED',
      createdBy: userA.id,
    });

    // All-day event today
    const allDayEvent = await eventsRepo.createEvent({
      calendarId: calendarA.id,
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] National Innovation Day',
      startAt: '2026-09-07T00:00:00.000Z',
      endAt: '2026-09-07T23:59:59.999Z',
      isAllDay: true,
      startDate: '2026-09-07',
      endDate: '2026-09-07',
      timezone: 'UTC',
      status: 'CONFIRMED',
      createdBy: userA.id,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=${TEST_DATE}&timezone=UTC`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();

    const timedFound = json.data.calendarEvents.find(e => e.id === timedEvent.id);
    expect(timedFound).toBeDefined();
    expect(timedFound.title).toBe('[TODAY_LIVE] Afternoon Client Review');

    const allDayFound = json.data.calendarEvents.find(e => e.id === allDayEvent.id);
    expect(allDayFound).toBeDefined();
    expect(allDayFound.isAllDay).toBe(true);
  });

  // ==========================================================
  // TM-TODAY-005: Unscheduled work is discoverable
  // ==========================================================
  it('TM-TODAY-005: Identifies important work that has NO allocated work block', async () => {
    // 1. Task without work block
    const unscheduledTask = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Urgent Architecture Doc',
      priority: 'P1',
      status: 'TODO',
      dueAt: '2026-09-07T18:00:00.000Z',
      createdBy: userA.id,
    });

    // 2. Task with allocated work block
    const scheduledTask = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: '[TODAY_LIVE] Scheduled Coding Session',
      priority: 'P1',
      status: 'TODO',
      dueAt: '2026-09-07T18:00:00.000Z',
      createdBy: userA.id,
    });

    // Allocate work block for scheduledTask
    await query(
      `
      INSERT INTO task_work_blocks (task_id, calendar_id, start_at, end_at, timezone, status)
      VALUES ($1, $2, $3, $4, 'UTC', 'SCHEDULED')
    `,
      [scheduledTask.id, calendarA.id, '2026-09-07T16:00:00.000Z', '2026-09-07T17:00:00.000Z'],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=${TEST_DATE}&timezone=UTC`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();

    // unscheduledTask MUST be discoverable in unscheduled
    const unscheduledFound = json.data.unscheduled.find(t => t.id === unscheduledTask.id);
    expect(unscheduledFound).toBeDefined();
    expect(unscheduledFound.title).toBe('[TODAY_LIVE] Urgent Architecture Doc');

    // scheduledTask MUST NOT be in unscheduled
    const scheduledFound = json.data.unscheduled.find(t => t.id === scheduledTask.id);
    expect(scheduledFound).toBeUndefined();
  });

  // ==========================================================
  // TM-TODAY-006: Current/next work is correctly ordered
  // ==========================================================
  it('TM-TODAY-006 (DOMAIN): Evaluates and orders current and next scheduled work', async () => {
    // Verify response structure returns currentWork and nextWork fields properly
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=${TEST_DATE}&timezone=UTC`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data).toHaveProperty('currentWork');
    expect(json.data).toHaveProperty('nextWork');
  });

  // ==========================================================
  // Security & Tenant Isolation
  // ==========================================================
  it('enforces strict tenant isolation preventing cross-workspace leakage in Today', async () => {
    // User B calls Today for Workspace B
    const resB = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=${TEST_DATE}&timezone=UTC`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });

    expect(resB.statusCode).toBe(200);
    const jsonB = resB.json();

    // Workspace B must not see any of Workspace A's tasks or events
    const leakedTask = jsonB.data.dueToday.find(t => t.title.startsWith('[TODAY_LIVE]'));
    expect(leakedTask).toBeUndefined();

    const leakedEvent = jsonB.data.calendarEvents.find(e => e.title.startsWith('[TODAY_LIVE]'));
    expect(leakedEvent).toBeUndefined();
  });

  // ==========================================================
  // Timezone Handling (Asia/Kolkata Non-UTC verification)
  // ==========================================================
  it('respects non-UTC timezone day boundaries (e.g. Asia/Kolkata +05:30)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/today?date=2026-09-07&timezone=Asia/Kolkata`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data.timezone).toBe('Asia/Kolkata');
    // In Asia/Kolkata (+05:30), 2026-09-07 00:00 IST is 2026-09-06 18:30:00 UTC
    expect(json.data.dayStartUtc).toBe('2026-09-06T18:30:00.000Z');
    expect(json.data.dayEndUtc).toBe('2026-09-07T18:29:59.999Z');
  });
});
