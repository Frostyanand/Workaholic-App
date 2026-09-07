import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import * as calendarsRepo from '../src/modules/calendar/calendars.repository.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as projectsRepo from '../src/modules/projects/projects.repository.js';

describe('Calendar Live PostgreSQL 16 & API Integration (Phase 8, TM-CAL-001 to TM-CAL-013)', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let sessionTokenA;
  let sessionTokenB;
  let calendarA;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // Clean test state
    await query('DELETE FROM calendars WHERE name LIKE $1', ['[LIVE_CAL_TEST]%']);

    // Create test users
    userA = await createUser({
      displayName: 'Calendar Tester A',
      email: `cal_test_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Calendar Tester B',
      email: `cal_test_b_${Date.now()}@example.com`,
    });

    // Create workspaces
    const resA = await createWorkspaceWithMembership({
      name: 'Calendar Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = resA.workspace;

    const resB = await createWorkspaceWithMembership({
      name: 'Calendar Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = resB.workspace;

    // Create sessions
    const rawTokenA = `live_cal_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    const rawTokenB = `live_cal_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;

    // Create primary calendar in Workspace A
    calendarA = await calendarsRepo.createCalendar({
      workspaceId: workspaceA.id,
      name: '[LIVE_CAL_TEST] Primary Calendar',
      color: '#3B82F6',
      isDefault: true,
      sourceType: 'WORKAHOLIC',
      visibility: 'PRIVATE',
      timezone: 'UTC',
    });
  });

  afterAll(async () => {
    await query('DELETE FROM calendars WHERE name LIKE $1', ['[LIVE_CAL_TEST]%']);
    if (app) await app.close();
  });

  it('TM-CAL-001 & TM-CAL-002: Create timed event and verify timestamp persistence', async () => {
    const startAt = '2026-09-15T14:00:00.000Z';
    const endAt = '2026-09-15T15:30:00.000Z';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Project Architecture Sync',
        description: 'Review system design decisions',
        location: 'Meeting Room 3',
        meetingUrl: 'https://meet.google.com/xyz-abc-123',
        startAt,
        endAt,
        timezone: 'UTC',
        isAllDay: false,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBeDefined();
    expect(body.data.title).toBe('Project Architecture Sync');
    expect(body.data.startAt).toBe(startAt);
    expect(body.data.endAt).toBe(endAt);
    expect(body.data.isAllDay).toBe(false);
    expect(body.data.location).toBe('Meeting Room 3');
  });

  it('TM-CAL-003: Create single-day all-day event with authoritative whole-date semantics', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Midterm Break Holiday',
        isAllDay: true,
        startDate: '2026-09-15',
        endDate: '2026-09-15',
        sourceType: 'HOLIDAY',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.isAllDay).toBe(true);
    expect(body.data.startDate).toBe('2026-09-15');
    expect(body.data.endDate).toBe('2026-09-15');
    expect(body.data.startAt).toBe('2026-09-15T00:00:00.000Z');
    expect(body.data.endAt).toBe('2026-09-15T23:59:59.999Z');
    expect(body.data.sourceType).toBe('HOLIDAY');
  });

  it('TM-CAL-004: Create multi-day all-day event spanning 3 whole calendar days', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Engineering Hackathon',
        isAllDay: true,
        startDate: '2026-09-15',
        endDate: '2026-09-17',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.isAllDay).toBe(true);
    expect(body.data.startDate).toBe('2026-09-15');
    expect(body.data.endDate).toBe('2026-09-17');
    expect(body.data.startAt).toBe('2026-09-15T00:00:00.000Z');
    expect(body.data.endAt).toBe('2026-09-17T23:59:59.999Z');
  });

  it('TM-CAL-005, 006, 007, 008: Temporal range query returns unified calendar objects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/calendar/events?start=2026-09-01T00:00:00.000Z&end=2026-09-30T23:59:59.999Z&includeTasks=true&includeWorkBlocks=true`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);

    // Verify all-day event presence
    const allDayEvt = body.data.find(e => e.title === 'Midterm Break Holiday');
    expect(allDayEvt).toBeDefined();
    expect(allDayEvt.isAllDay).toBe(true);
    expect(allDayEvt.startDate).toBe('2026-09-15');
  });

  it('TM-CAL-009: Edit event title and times', async () => {
    // Create an event to edit
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Old Title',
        startAt: '2026-09-20T10:00:00.000Z',
        endAt: '2026-09-20T11:00:00.000Z',
      },
    });
    const createdId = JSON.parse(createRes.payload).data.id;

    // Patch event
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/calendar/events/${createdId}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        title: 'Updated Title',
        startAt: '2026-09-20T10:30:00.000Z',
        endAt: '2026-09-20T12:00:00.000Z',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = JSON.parse(patchRes.payload).data;
    expect(updated.title).toBe('Updated Title');
    expect(updated.startAt).toBe('2026-09-20T10:30:00.000Z');
    expect(updated.endAt).toBe('2026-09-20T12:00:00.000Z');
  });

  it('TM-CAL-010: Cancel / soft-delete event', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Event To Delete',
        startAt: '2026-09-21T10:00:00.000Z',
        endAt: '2026-09-21T11:00:00.000Z',
      },
    });
    const createdId = JSON.parse(createRes.payload).data.id;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/events/${createdId}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(delRes.statusCode).toBe(200);

    // Verify GET returns 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendar/events/${createdId}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('TM-CAL-012: Tenant and workspace isolation prevents unauthorized access', async () => {
    // User B tries to view events from Workspace A
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/calendar/events?start=2026-09-01T00:00:00.000Z&end=2026-09-30T23:59:59.999Z`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(res.statusCode).toBe(404);

    // User B can access their own workspace B
    const resB = await app.inject({
      method: 'GET',
      url: `/api/v1/calendar/events?start=2026-09-01T00:00:00.000Z&end=2026-09-30T23:59:59.999Z`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(resB.statusCode).toBe(200);
  });

  it('Informational conflict warning generated on overlapping timed events', async () => {
    const startAt = '2026-09-25T14:00:00.000Z';
    const endAt = '2026-09-25T15:00:00.000Z';

    // 1. Initial event
    await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'First Meeting',
        startAt,
        endAt,
      },
    });

    // 2. Overlapping second event (14:30 to 15:30)
    const conflictRes = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Second Meeting',
        startAt: '2026-09-25T14:30:00.000Z',
        endAt: '2026-09-25T15:30:00.000Z',
      },
    });

    // Successfully creates (201) per BR-CAL / CALENDAR-SPECIFICATION.md Section 14
    expect(conflictRes.statusCode).toBe(201);
    const body = JSON.parse(conflictRes.payload);
    expect(body.data.id).toBeDefined();
    // But returns informational conflicts list!
    expect(Array.isArray(body.data.conflicts)).toBe(true);
    expect(body.data.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(body.data.conflicts[0].title).toBe('First Meeting');
  });

  it('Links tasks and projects to calendar event', async () => {
    // Create test task and project in workspace A
    const task = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: 'Linked Task for Calendar Event',
      createdBy: userA.id,
    });

    const project = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: 'Linked Project for Calendar Event',
      ownerUserId: userA.id,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Sprint Planning Meeting',
        startAt: '2026-09-26T09:00:00.000Z',
        endAt: '2026-09-26T10:00:00.000Z',
        taskIds: [task.id],
        projectIds: [project.id],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.taskIds).toContain(task.id);
    expect(body.data.projectIds).toContain(project.id);
  });
});
