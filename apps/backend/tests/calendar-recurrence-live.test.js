import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import * as calendarsRepo from '../src/modules/calendar/calendars.repository.js';

describe('Calendar Recurrence Live Integration (Phase 10: Events, Exceptions, Splits)', () => {
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
    await query('DELETE FROM calendars WHERE name LIKE $1', ['[LIVE_REC_TEST]%']);

    userA = await createUser({
      displayName: 'Recurrence Tester A',
      email: `rec_test_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Recurrence Tester B',
      email: `rec_test_b_${Date.now()}@example.com`,
    });

    const resA = await createWorkspaceWithMembership({
      name: 'Recurrence Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = resA.workspace;

    const resB = await createWorkspaceWithMembership({
      name: 'Recurrence Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = resB.workspace;

    const rawTokenA = `live_rec_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    const rawTokenB = `live_rec_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;

    calendarA = await calendarsRepo.createCalendar({
      workspaceId: workspaceA.id,
      ownerUserId: userA.id,
      name: '[LIVE_REC_TEST] Main Calendar',
      color: '#4F46E5',
      sourceType: 'WORKAHOLIC',
      visibility: 'PRIVATE',
      timezone: 'UTC',
      isDefault: true,
    });
  });

  it('creates recurring event and dynamically expands occurrences across range', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Weekly Team Sync',
        startAt: '2026-06-01T10:00:00.000Z',
        endAt: '2026-06-01T11:00:00.000Z',
        timezone: 'UTC',
        recurrence: {
          frequency: 'WEEKLY',
          interval: 1,
          startAt: '2026-06-01T10:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body).data;
    expect(created.title).toBe('Weekly Team Sync');
    expect(created.recurrenceRuleId).toBeTruthy();

    // Query 3-week window: June 1 to June 22
    const rangeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/events?start=2026-06-01T00:00:00.000Z&end=2026-06-22T23:59:59.999Z',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(rangeRes.statusCode).toBe(200);
    const events = JSON.parse(rangeRes.body).data;
    // Should expand to 4 occurrences: June 1, June 8, June 15, June 22
    const syncOccurrences = events.filter(e => e.baseEventId === created.id);
    expect(syncOccurrences).toHaveLength(4);
    expect(syncOccurrences[0].startAt).toBe('2026-06-01T10:00:00.000Z');
    expect(syncOccurrences[1].startAt).toBe('2026-06-08T10:00:00.000Z');
    expect(syncOccurrences[2].startAt).toBe('2026-06-15T10:00:00.000Z');
    expect(syncOccurrences[3].startAt).toBe('2026-06-22T10:00:00.000Z');
  });

  it('modifies a single occurrence (THIS) without affecting other occurrences', async () => {
    // Create series
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Daily Standup',
        startAt: '2026-07-01T09:00:00.000Z',
        endAt: '2026-07-01T09:30:00.000Z',
        timezone: 'UTC',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-07-01T09:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });
    const event = JSON.parse(createRes.body).data;

    // Modify July 2 occurrence
    const occKey = '2026-07-02T09:00:00.000Z';
    const editRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/events/${event.id}/occurrences/${encodeURIComponent(occKey)}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        editMode: 'THIS',
        title: 'Extended Product Standup',
        startAt: '2026-07-02T10:00:00.000Z',
        endAt: '2026-07-02T11:00:00.000Z',
      },
    });

    expect(editRes.statusCode).toBe(200);

    // Verify in range query
    const rangeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/events?start=2026-07-01T00:00:00.000Z&end=2026-07-03T23:59:59.999Z',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    const events = JSON.parse(rangeRes.body).data.filter(e => e.baseEventId === event.id);
    expect(events).toHaveLength(3);

    // July 1 is unchanged
    expect(events[0].title).toBe('Daily Standup');
    expect(events[0].startAt).toBe('2026-07-01T09:00:00.000Z');
    expect(events[0].isException).toBe(false);

    // July 2 is modified & rescheduled
    expect(events[1].title).toBe('Extended Product Standup');
    expect(events[1].startAt).toBe('2026-07-02T10:00:00.000Z');
    expect(events[1].endAt).toBe('2026-07-02T11:00:00.000Z');
    expect(events[1].occurrenceKey).toBe(occKey);
    expect(events[1].isException).toBe(true);

    // July 3 is unchanged
    expect(events[2].title).toBe('Daily Standup');
    expect(events[2].startAt).toBe('2026-07-03T09:00:00.000Z');
    expect(events[2].isException).toBe(false);
  });

  it('cancels a single occurrence (DELETE) without changing series', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Morning Yoga',
        startAt: '2026-08-01T07:00:00.000Z',
        endAt: '2026-08-01T08:00:00.000Z',
        timezone: 'UTC',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-08-01T07:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });
    const event = JSON.parse(createRes.body).data;

    // Cancel August 2 occurrence
    const cancelKey = '2026-08-02T07:00:00.000Z';
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/events/${event.id}/occurrences/${encodeURIComponent(cancelKey)}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(delRes.statusCode).toBe(200);

    // Range query August 1-3
    const rangeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/events?start=2026-08-01T00:00:00.000Z&end=2026-08-03T23:59:59.999Z',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    const yogaEvents = JSON.parse(rangeRes.body).data.filter(e => e.baseEventId === event.id);
    expect(yogaEvents).toHaveLength(2);
    expect(yogaEvents.map(e => e.startAt)).toEqual([
      '2026-08-01T07:00:00.000Z',
      '2026-08-03T07:00:00.000Z',
    ]);
  });

  it('splits recurrence series correctly with THIS_AND_FOLLOWING', async () => {
    // 1. Create weekly event on Monday at 11:00 UTC
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Design Critique',
        startAt: '2026-09-07T11:00:00.000Z', // Monday
        endAt: '2026-09-07T12:00:00.000Z',
        timezone: 'UTC',
        recurrence: {
          frequency: 'WEEKLY',
          interval: 1,
          startAt: '2026-09-07T11:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });
    const originalEvent = JSON.parse(createRes.body).data;

    // 2. Split series from Sept 21 onwards (change title to 'Advanced Design Critique')
    const splitKey = '2026-09-21T11:00:00.000Z';
    const splitRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/events/${originalEvent.id}/occurrences/${encodeURIComponent(splitKey)}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        editMode: 'THIS_AND_FOLLOWING',
        title: 'Advanced Design Critique',
        startAt: '2026-09-21T11:00:00.000Z',
      },
    });

    expect(splitRes.statusCode).toBe(200);
    const splitData = JSON.parse(splitRes.body).data;
    expect(splitData.editMode).toBe('THIS_AND_FOLLOWING');
    expect(splitData.newSeries.eventId).toBeTruthy();
    expect(splitData.newSeries.eventId).not.toBe(originalEvent.id);

    // 3. Query the entire month of September (Sept 1 to Sept 30)
    const rangeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/events?start=2026-09-01T00:00:00.000Z&end=2026-09-30T23:59:59.999Z',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    const monthEvents = JSON.parse(rangeRes.body).data.filter(
      e => e.baseEventId === originalEvent.id || e.baseEventId === splitData.newSeries.eventId,
    );

    // There are 4 Mondays in September 2026: Sept 7, Sept 14, Sept 21, Sept 28.
    expect(monthEvents).toHaveLength(4);

    // Historical occurrences (Sept 7, Sept 14) belong to original series
    expect(monthEvents[0].baseEventId).toBe(originalEvent.id);
    expect(monthEvents[0].title).toBe('Design Critique');
    expect(monthEvents[0].startAt).toBe('2026-09-07T11:00:00.000Z');

    expect(monthEvents[1].baseEventId).toBe(originalEvent.id);
    expect(monthEvents[1].title).toBe('Design Critique');
    expect(monthEvents[1].startAt).toBe('2026-09-14T11:00:00.000Z');

    // New series occurrences (Sept 21, Sept 28) belong to new series with new title
    expect(monthEvents[2].baseEventId).toBe(splitData.newSeries.eventId);
    expect(monthEvents[2].title).toBe('Advanced Design Critique');
    expect(monthEvents[2].startAt).toBe('2026-09-21T11:00:00.000Z');

    expect(monthEvents[3].baseEventId).toBe(splitData.newSeries.eventId);
    expect(monthEvents[3].title).toBe('Advanced Design Critique');
    expect(monthEvents[3].startAt).toBe('2026-09-28T11:00:00.000Z');
  });

  it('enforces workspace tenant isolation on occurrence mutations (IDOR protection)', async () => {
    // User A creates recurring event in workspace A
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        calendarId: calendarA.id,
        title: 'Secret Executive Meeting',
        startAt: '2026-10-01T10:00:00.000Z',
        endAt: '2026-10-01T11:00:00.000Z',
        timezone: 'UTC',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-10-01T10:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });
    const event = JSON.parse(createRes.body).data;

    // User B in workspace B attempts to edit User A's occurrence
    const illegalEditRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/events/${event.id}/occurrences/${encodeURIComponent('2026-10-02T10:00:00.000Z')}`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
      payload: {
        editMode: 'THIS',
        title: 'Hacked Title',
      },
    });

    // Must be rejected as 404 (or 403) due to workspace isolation
    expect(illegalEditRes.statusCode).toBe(404);

    // User B attempts to cancel User A's occurrence
    const illegalCancelRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/events/${event.id}/occurrences/${encodeURIComponent('2026-10-02T10:00:00.000Z')}`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(illegalCancelRes.statusCode).toBe(404);
  });
});
