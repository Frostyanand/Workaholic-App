import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { createCalendar } from '../src/modules/calendar/calendars.repository.js';
import { createEvent } from '../src/modules/calendar/events.repository.js';

describe('Phase 19: Public Calendar and Share Links Integration Tests', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;
  let calendarA;
  let calendarB;
  let privateEvent;
  let publicEvent;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create Users
    userA = await createUser({
      displayName: 'Calendar Owner A',
      email: `pubcal_user_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Calendar Owner B',
      email: `pubcal_user_b_${Date.now()}@example.com`,
    });

    // 2. Create Workspaces
    const wsA = await createWorkspaceWithMembership({
      name: 'Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsA.workspace;

    const wsB = await createWorkspaceWithMembership({
      name: 'Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsB.workspace;

    // 3. Create Sessions
    tokenA = `pubcal_tok_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenB = `pubcal_tok_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // 4. Create Calendars
    calendarA = await createCalendar({
      workspaceId: workspaceA.id,
      ownerUserId: userA.id,
      name: 'Personal Calendar A',
      color: '#3B82F6',
      visibility: 'PRIVATE',
      timezone: 'America/New_York',
    });

    calendarB = await createCalendar({
      workspaceId: workspaceB.id,
      ownerUserId: userB.id,
      name: 'Personal Calendar B',
      color: '#10B981',
      visibility: 'PRIVATE',
      timezone: 'UTC',
    });

    // 5. Create Events in Calendar A
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startIso1 = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
    const endIso1 = new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString();

    privateEvent = await createEvent({
      calendarId: calendarA.id,
      workspaceId: workspaceA.id,
      title: 'Top Secret Medical Checkup',
      description: 'Confidential doctor notes and health records',
      location: 'Private Clinic Room 402',
      meetingUrl: 'https://telehealth.private/room/1234',
      startAt: startIso1,
      endAt: endIso1,
      visibility: 'PRIVATE',
      status: 'CONFIRMED',
    });

    const startIso2 = new Date(tomorrow.setHours(14, 0, 0, 0)).toISOString();
    const endIso2 = new Date(tomorrow.setHours(15, 30, 0, 0)).toISOString();

    publicEvent = await createEvent({
      calendarId: calendarA.id,
      workspaceId: workspaceA.id,
      title: 'Public Community Q&A',
      description: 'Internal organizing description that should not leak',
      location: 'Community Hall',
      startAt: startIso2,
      endAt: endIso2,
      visibility: 'PUBLIC',
      status: 'CONFIRMED',
    });

    // Create an event in Calendar B to verify non-enumeration
    await createEvent({
      calendarId: calendarB.id,
      workspaceId: workspaceB.id,
      title: 'Calendar B Private Event',
      startAt: startIso1,
      endAt: endIso1,
      visibility: 'PRIVATE',
      status: 'CONFIRMED',
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    await query(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [workspaceA.id, workspaceB.id]);
    await query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA.id, userB.id]);
  });

  // =========================================================================
  // TM-PUBLIC-001: Public calendar can be enabled
  // =========================================================================
  it('TM-PUBLIC-001 (API): Enables a public calendar link and returns bearer capability', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.calendarId).toBe(calendarA.id);
    expect(body.data.status).toBe('ACTIVE');
    expect(body.data.token).toBeDefined();
    expect(body.data.token.startsWith('pcal_')).toBe(true);
    expect(body.data.url).toBe(`/public/calendar/${body.data.token}`);

    // Verify GET active link returns decrypted token and same active status
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.data.id).toBe(body.data.id);
    expect(getBody.data.token).toBe(body.data.token);
    expect(getBody.data.url).toBe(body.data.url);
    expect(getBody.data.status).toBe('ACTIVE');
  });

  // =========================================================================
  // TM-PUBLIC-002: Public link displays permitted events (unauthenticated)
  // =========================================================================
  it('TM-PUBLIC-002 (E2E/API): Anonymous viewer can access public calendar feed without authentication', async () => {
    // Fetch active link
    const linkRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const linkToken = linkRes.json().data.token;

    // Anonymous request (no auth headers, no session)
    const pubRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${linkToken}`,
    });

    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(pubRes.headers['cache-control']).toContain('no-store');

    const feed = pubRes.json().data;
    expect(feed.calendar).toBeDefined();
    expect(feed.calendar.name).toBe('Personal Calendar A');
    expect(feed.calendar.timezone).toBe('America/New_York');
    expect(feed.events).toBeDefined();
    expect(feed.events.length).toBe(2);
  });

  // =========================================================================
  // TM-PUBLIC-003, TM-PUBLIC-004, TM-PUBLIC-005: Privacy Projection
  // =========================================================================
  it('TM-PUBLIC-003 & TM-PUBLIC-004 (SECURITY): Private events reveal only busy state, masking title', async () => {
    const linkRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const linkToken = linkRes.json().data.token;

    const pubRes = await app.inject({
      method: 'GET',
      url: `/api/v1/public/calendars/${linkToken}`,
    });

    expect(pubRes.statusCode).toBe(200);
    const feed = pubRes.json().data;
    const rawResponseText = pubRes.body;

    // The private event MUST appear with title 'Busy' and busy: true
    const projectedPrivate = feed.events.find(e => e.id === privateEvent.id);
    expect(projectedPrivate).toBeDefined();
    expect(projectedPrivate.title).toBe('Busy');
    expect(projectedPrivate.busy).toBe(true);
    expect(projectedPrivate.start).toBe(privateEvent.startAt);
    expect(projectedPrivate.end).toBe(privateEvent.endAt);

    // SECURITY: The string "Top Secret Medical Checkup" MUST NOT appear anywhere in the HTTP response body
    expect(rawResponseText.includes('Top Secret Medical Checkup')).toBe(false);
    expect(rawResponseText.includes('Medical Checkup')).toBe(false);
  });

  it('TM-PUBLIC-005 (SECURITY): Private event metadata (description, location, meeting URL, workspace) is stripped', async () => {
    const linkRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const linkToken = linkRes.json().data.token;

    const pubRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${linkToken}`,
    });

    const feed = pubRes.json().data;
    const rawResponseText = pubRes.body;

    // Sensitive metadata must not exist on any event in the feed
    for (const event of feed.events) {
      expect(event.description).toBeUndefined();
      expect(event.location).toBeUndefined();
      expect(event.meetingUrl).toBeUndefined();
      expect(event.workspaceId).toBeUndefined();
      expect(event.userId).toBeUndefined();
      expect(event.createdBy).toBeUndefined();
      expect(event.taskIds).toBeUndefined();
      expect(event.projectIds).toBeUndefined();
    }

    // Verify response text contains zero trace of sensitive fields
    expect(rawResponseText.includes('Confidential doctor notes')).toBe(false);
    expect(rawResponseText.includes('Private Clinic Room 402')).toBe(false);
    expect(rawResponseText.includes('https://telehealth.private')).toBe(false);
    expect(rawResponseText.includes('Internal organizing description')).toBe(false);
    expect(rawResponseText.includes(workspaceA.id)).toBe(false);
    expect(rawResponseText.includes(userA.id)).toBe(false);

    // Public event retains its public title
    const projectedPublic = feed.events.find(e => e.id === publicEvent.id);
    expect(projectedPublic).toBeDefined();
    expect(projectedPublic.title).toBe('Public Community Q&A');
    expect(projectedPublic.busy).toBe(true);
  });

  // =========================================================================
  // TM-PUBLIC-008: Public link cannot enumerate private resources
  // =========================================================================
  it('TM-PUBLIC-008 (SECURITY): Public link cannot access or enumerate events from other calendars or workspaces', async () => {
    const linkRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const linkToken = linkRes.json().data.token;

    const pubRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${linkToken}`,
    });

    const feed = pubRes.json().data;
    const rawResponseText = pubRes.body;

    // Calendar B's events MUST NOT be included
    expect(rawResponseText.includes('Calendar B Private Event')).toBe(false);
    expect(feed.events.some(e => e.title === 'Calendar B Private Event')).toBe(false);
    expect(rawResponseText.includes(calendarB.id)).toBe(false);
    expect(rawResponseText.includes(workspaceB.id)).toBe(false);
  });

  // =========================================================================
  // Expiration Handling
  // =========================================================================
  it('rejects expired public links with 410 or invalid status', async () => {
    // Create link with past expiration
    const pastExpiresAt = new Date(Date.now() - 3600000).toISOString();
    const expRes = await app.inject({
      method: 'POST',
      url: `/api/v1/calendars/${calendarB.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspaceB.id,
      },
      payload: {
        expiresAt: pastExpiresAt,
      },
    });

    expect(expRes.statusCode).toBe(201);
    const expToken = expRes.json().data.token;

    // Try accessing expired link anonymously
    const pubRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${expToken}`,
    });

    expect(pubRes.statusCode).toBe(410);
    const errorBody = pubRes.json();
    expect(errorBody.error.code).toBe('LINK_EXPIRED');
  });

  // =========================================================================
  // TM-PUBLIC-006 & TM-PUBLIC-007: Revocation
  // =========================================================================
  it('TM-PUBLIC-006 & TM-PUBLIC-007 (API/SECURITY): Public link can be revoked and immediately becomes inaccessible', async () => {
    // 1. Get current active token for Calendar A
    const linkRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const { token: linkToken } = linkRes.json().data;

    // Verify it is accessible before revocation
    const beforeRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${linkToken}`,
    });
    expect(beforeRes.statusCode).toBe(200);

    // 2. Revoke the link
    const revokeRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json().data.revoked).toBe(true);

    // 3. Subsequent authenticated GET returns null
    const afterGetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(afterGetRes.statusCode).toBe(200);
    expect(afterGetRes.json().data).toBeNull();

    // 4. SECURITY: Revoked link token immediately returns 410 or inaccessible
    const afterPubRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${linkToken}`,
    });
    expect(afterPubRes.statusCode).toBe(410);
    expect(afterPubRes.json().error.code).toBe('RESOURCE_REVOKED');
  });

  // =========================================================================
  // Link Regeneration (BR-PUBCAL-005)
  // =========================================================================
  it('regenerates public link, atomically invalidating old token and activating new one', async () => {
    // 1. Create a fresh link
    const initialRes = await app.inject({
      method: 'POST',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {},
    });
    expect(initialRes.statusCode).toBe(201);
    const oldToken = initialRes.json().data.token;
    const oldLinkId = initialRes.json().data.id;

    // Verify old token works
    const oldAccessRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${oldToken}`,
    });
    expect(oldAccessRes.statusCode).toBe(200);

    // 2. Regenerate link
    const regenRes = await app.inject({
      method: 'POST',
      url: `/api/v1/calendars/${calendarA.id}/public-link/regenerate`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {},
    });
    expect(regenRes.statusCode).toBe(201);
    const newToken = regenRes.json().data.token;
    const newLinkId = regenRes.json().data.id;

    expect(newToken).not.toBe(oldToken);
    expect(newLinkId).not.toBe(oldLinkId);

    // 3. Old token MUST immediately cease functioning
    const oldCheckRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${oldToken}`,
    });
    expect(oldCheckRes.statusCode).toBe(410);

    // 4. New token MUST work
    const newCheckRes = await app.inject({
      method: 'GET',
      url: `/public/calendars/${newToken}`,
    });
    expect(newCheckRes.statusCode).toBe(200);
    expect(newCheckRes.json().data.calendar.name).toBe('Personal Calendar A');
  });

  // =========================================================================
  // Authorization Boundaries
  // =========================================================================
  it('rejects unauthorized management attempts across workspace boundaries', async () => {
    // User B attempts to access Calendar A's public link
    const resGet = await app.inject({
      method: 'GET',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(resGet.statusCode).toBe(404);

    // User B attempts to create public link on Calendar A
    const resPost = await app.inject({
      method: 'POST',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspaceB.id,
      },
      payload: {},
    });
    expect(resPost.statusCode).toBe(404);

    // User B attempts to revoke Calendar A's public link
    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/v1/calendars/${calendarA.id}/public-link`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(resDel.statusCode).toBe(404);
  });

  // =========================================================================
  // Malformed Token Handling
  // =========================================================================
  it('rejects malformed or non-existent tokens with 400 or 404', async () => {
    // Malformed token syntax (too short)
    const shortRes = await app.inject({
      method: 'GET',
      url: '/public/calendars/short',
    });
    expect(shortRes.statusCode).toBe(400);

    // Non-existent validly formatted token
    const nonExistentRes = await app.inject({
      method: 'GET',
      url: '/public/calendars/pcal_0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    expect(nonExistentRes.statusCode).toBe(404);
  });
});
