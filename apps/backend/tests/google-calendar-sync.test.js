import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { oauthBoundaryService } from '../src/modules/auth/oauth-boundary.service.js';
import { googleCalendarSyncService } from '../src/modules/integrations/google/google-calendar-sync.service.js';
import { MockGoogleCalendarAdapter } from '../src/modules/integrations/google/google-calendar.adapter.js';
import {
  parseRrule,
  formatRrule,
} from '../src/modules/integrations/google/google-calendar.mapper.js';
import { enqueueGoogleCalendarSync } from '../src/modules/integrations/google/google-sync-dispatcher.js';
import { jobQueue } from '../src/core/queue.js';
import { JobWorker } from '../src/core/worker.js';
import * as extMappingsRepo from '../src/modules/integrations/external-mappings.repository.js';
import * as eventsRepo from '../src/modules/calendar/events.repository.js';
import * as integrationsRepo from '../src/modules/auth/integrations.repository.js';
import { JOB_TYPE, JOB_STATUS, SYNC_STATE } from '@workaholic/shared';

describe('Google Calendar Integration & Two-Way Sync (Phase 13)', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;
  let mockAdapter;
  let primaryCalMapping;

  async function ensureConnectedAndMapped() {
    mockAdapter = new MockGoogleCalendarAdapter();
    googleCalendarSyncService.adapter = mockAdapter;

    const integration = await integrationsRepo.findIntegration(userA.id, 'GOOGLE');
    if (!integration || integration.status !== 'CONNECTED') {
      const state = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'CALENDAR',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_code_setup',
        state,
        service: 'CALENDAR',
      });
    }

    const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
    let primary = mappings.find(m => m.externalObjectId === 'primary');
    if (!primary) {
      await googleCalendarSyncService.discoverCalendars(userA.id, workspaceA.id, mockAdapter);
      const reloaded = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      primary = reloaded.find(m => m.externalObjectId === 'primary');
    }
    primaryCalMapping = primary;
    return primary;
  }

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create User A and User B
    userA = await createUser({
      displayName: 'Google Sync User A',
      email: `sync_user_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Google Sync User B',
      email: `sync_user_b_${Date.now()}@example.com`,
    });

    // 2. Create Workspaces
    const wsResA = await createWorkspaceWithMembership({
      name: 'Google Sync Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsResA.workspace;

    const wsResB = await createWorkspaceWithMembership({
      name: 'Google Sync Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsResB.workspace;

    // 3. Create Sessions
    tokenA = `sync_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenB = `sync_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // 4. Initialize Mock Adapter and bind to service
    mockAdapter = new MockGoogleCalendarAdapter();
    googleCalendarSyncService.adapter = mockAdapter;
  });

  afterAll(async () => {
    // Clean up test data
    await query('DELETE FROM external_object_mappings WHERE user_id IN ($1, $2)', [
      userA.id,
      userB.id,
    ]);
    await query(
      'DELETE FROM external_accounts WHERE integration_id IN (SELECT id FROM integrations WHERE user_id IN ($1, $2))',
      [userA.id, userB.id],
    );
    await query('DELETE FROM integrations WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
    await query('DELETE FROM events WHERE workspace_id IN ($1, $2)', [
      workspaceA.id,
      workspaceB.id,
    ]);
    await query('DELETE FROM calendars WHERE workspace_id IN ($1, $2)', [
      workspaceA.id,
      workspaceB.id,
    ]);
    await query('DELETE FROM background_jobs WHERE queue IN ($1, $2)', ['default', 'sync']);
    await query('DELETE FROM sessions WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
    await query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA.id, workspaceB.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
  });

  beforeEach(() => {
    mockAdapter = new MockGoogleCalendarAdapter();
    googleCalendarSyncService.adapter = mockAdapter;
  });

  // =========================================================================
  // 1. OAuth Initiation, State Validation, & Code Exchange
  // =========================================================================
  describe('OAuth Flow & Security Boundaries', () => {
    it('rejects unauthenticated requests to initiate Google Calendar connect', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/calendar/connect',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it('generates authorization URL with CSRF state token and minimal calendar scopes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/calendar/connect',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { redirectUri: 'http://localhost:5173/auth/google/callback' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(body.data.authorizationUrl).toContain('calendar.events');
      expect(body.data.state).toBeDefined();
      expect(body.data.scopes).toContain('https://www.googleapis.com/auth/calendar.events');
      // Must not request unrelated scopes like tasks or drive
      expect(body.data.authorizationUrl).not.toContain('tasks');
      expect(body.data.authorizationUrl).not.toContain('drive');
    });

    it('rejects callback with missing or forged state token (CSRF defense)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/calendar/callback',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          code: 'valid_auth_code_123',
          state: 'forged_or_expired_state',
          service: 'CALENDAR',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('completes OAuth exchange, encrypts tokens, and NEVER leaks credentials to client', async () => {
      // 1. Generate legitimate state
      const connectRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/calendar/connect',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {},
      });
      const { state } = connectRes.json().data;

      // 2. Submit callback with legitimate state
      const callbackRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/calendar/callback',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          code: 'legit_google_auth_code',
          state,
          service: 'CALENDAR',
        },
      });

      expect(callbackRes.statusCode).toBe(200);
      const body = callbackRes.json().data;
      expect(body.connected).toBe(true);

      // SECURITY AUDIT: Verify no raw tokens returned in response
      expect(body.accessToken).toBeUndefined();
      expect(body.refreshToken).toBeUndefined();
      expect(JSON.stringify(callbackRes.json())).not.toContain('mock_access_token');
      expect(JSON.stringify(callbackRes.json())).not.toContain('mock_refresh_token');

      // 3. Verify Database: tokens must be encrypted AES-256-GCM ciphertext
      const accRes = await query(
        `SELECT ea.encrypted_credentials, i.status
         FROM external_accounts ea
         JOIN integrations i ON i.id = ea.integration_id
         WHERE i.user_id = $1 AND i.provider = 'GOOGLE'`,
        [userA.id],
      );
      expect(accRes.rows.length).toBe(1);
      expect(accRes.rows[0].status).toBe('CONNECTED');

      const rawCreds = accRes.rows[0].encrypted_credentials;
      const creds = typeof rawCreds === 'string' ? JSON.parse(rawCreds) : rawCreds;
      expect(creds.encrypted).toBeDefined();
      expect(creds.iv).toBeDefined();
      expect(creds.authTag).toBeDefined();
      expect(creds.encrypted).not.toContain('mock_access_token');
    });

    it('returns CONNECTED status via status endpoint without leaking tokens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/calendar/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.status).toBe('CONNECTED');
      expect(data.connected).toBe(true);
      expect(data.accessToken).toBeUndefined();
      expect(data.refreshToken).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. External Calendar Discovery & Idempotent Mapping
  // =========================================================================
  describe('Calendar Discovery & Identity Mapping', () => {
    it('discovers Google calendars and creates persistent native mappings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/calendar/calendars?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const calendars = res.json().data;
      expect(calendars.length).toBeGreaterThanOrEqual(2);

      const primary = calendars.find(c => c.isPrimary);
      expect(primary).toBeDefined();
      expect(primary.googleCalendarId).toBe('primary');
      expect(primary.mappingId).toBeDefined();
      expect(primary.nativeCalendarId).toBeDefined();

      // Check external_object_mappings table
      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primary.externalAccountId,
        'CALENDAR',
        'primary',
      );
      expect(mapping).toBeDefined();
      expect(mapping.nativeObjectType).toBe('CALENDAR');
      expect(mapping.syncState).toBe(SYNC_STATE.SYNCED);
    });

    it('repeated discovery is idempotent and does not create duplicate mappings', async () => {
      const res1 = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/calendar/calendars?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const res2 = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/calendar/calendars?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res1.json().data.length).toBe(res2.json().data.length);

      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      const calendarMappings = mappings.filter(m => m.externalObjectType === 'CALENDAR');
      expect(calendarMappings.length).toBe(2);
    });

    it('enforces tenant isolation: User B cannot access User A calendar mappings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/calendar/calendars?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      // User B has no connection so it fails cleanly
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('NOT_CONNECTED');
    });
  });

  // =========================================================================
  // 3. Event Import (Google -> Workaholic) & Provenance
  // =========================================================================
  describe('Event Import (Google → Workaholic)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('imports Google timed and all-day events with correct provenance and boundary normalization', async () => {
      // 1. Populate mock Google calendar with 1 timed event and 1 all-day event
      const timedGoogleEvt = {
        id: 'g_evt_timed_001',
        summary: 'Sprint Review',
        description: 'Review Q3 progress',
        location: 'Room 404',
        start: { dateTime: '2026-10-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-10-15T11:00:00Z', timeZone: 'UTC' },
        status: 'confirmed',
      };

      // All-day in Google: end.date is exclusive (2026-10-16 for single-day 2026-10-15)
      const allDayGoogleEvt = {
        id: 'g_evt_allday_002',
        summary: 'Company Holiday',
        start: { date: '2026-10-15' },
        end: { date: '2026-10-16' },
        status: 'confirmed',
      };

      await mockAdapter.createEvent('token', 'primary', timedGoogleEvt);
      await mockAdapter.createEvent('token', 'primary', allDayGoogleEvt);

      // 2. Perform synchronization
      const syncResult = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
      );

      expect(syncResult.imported).toBeGreaterThanOrEqual(2);

      // 3. Verify native Workaholic events
      const nativeEvents = await eventsRepo.findEventsByRange(workspaceA.id, {
        calendarIds: [primaryCalMapping.nativeObjectId],
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-12-31T23:59:59.999Z',
      });

      const sprintReview = nativeEvents.find(e => e.title === 'Sprint Review');
      expect(sprintReview).toBeDefined();
      expect(sprintReview.description).toBe('Review Q3 progress');
      expect(sprintReview.location).toBe('Room 404');
      expect(sprintReview.isAllDay).toBe(false);
      expect(sprintReview.sourceType).toBe('GOOGLE'); // PROVENANCE CHECK

      const holiday = nativeEvents.find(e => e.title === 'Company Holiday');
      expect(holiday).toBeDefined();
      expect(holiday.isAllDay).toBe(true);
      // All-day boundary: pure date semantics
      expect(holiday.startDate).toBe('2026-10-15');
      expect(holiday.endDate).toBe('2026-10-15');
      expect(holiday.startAt).toContain('2026-10-15');
      expect(holiday.endAt).toContain('2026-10-15');
    });

    it('preserves pure-date boundaries for all-day events across diverse timezones', async () => {
      const multiDayGoogleEvt = {
        id: 'g_evt_multiday_tz_001',
        summary: 'International Conference',
        start: { date: '2026-11-10' },
        end: { date: '2026-11-13' }, // 3-day event (10, 11, 12)
        status: 'confirmed',
      };
      await mockAdapter.createEvent('token', 'primary', multiDayGoogleEvt);

      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'g_evt_multiday_tz_001',
      );
      const conf = await eventsRepo.findEventById(mapping.nativeObjectId, workspaceA.id);
      expect(conf.isAllDay).toBe(true);
      expect(conf.startDate).toBe('2026-11-10');
      expect(conf.endDate).toBe('2026-11-12'); // Inclusive end date
    });

    it('repeated import is idempotent and does not create duplicate events', async () => {
      const _sync1 = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
      );

      const _sync2 = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
      );

      const nativeEvents = await eventsRepo.findEventsByRange(workspaceA.id, {
        calendarIds: [primaryCalMapping.nativeObjectId],
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-12-31T23:59:59.999Z',
      });

      const sprintReviews = nativeEvents.filter(e => e.title === 'Sprint Review');
      expect(sprintReviews.length).toBe(1);
    });

    it('handles external cancellation/deletion without destroying native data', async () => {
      // 1. Populate event and perform initial import
      await mockAdapter.createEvent('token', 'primary', {
        id: 'g_evt_timed_001',
        summary: 'Sprint Review',
        description: 'Review Q3 progress',
        location: 'Room 404',
        start: { dateTime: '2026-10-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-10-15T11:00:00Z', timeZone: 'UTC' },
        status: 'confirmed',
      });
      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      // 2. Simulate Google deleting/cancelling the event
      await mockAdapter.updateEvent('token', 'primary', 'g_evt_timed_001', {
        status: 'cancelled',
      });

      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      // Verify native event is marked CANCELLED, not completely purged
      const nativeEvents = await eventsRepo.findEventsByRange(workspaceA.id, {
        calendarIds: [primaryCalMapping.nativeObjectId],
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-12-31T23:59:59.999Z',
      });
      const sprintReview = nativeEvents.find(e => e.title === 'Sprint Review');
      expect(sprintReview).toBeDefined();
      expect(sprintReview.status).toBe('CANCELLED');

      // Verify mapping records DELETED_EXTERNALLY
      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'g_evt_timed_001',
      );
      expect(mapping.syncState).toBe(SYNC_STATE.DELETED_EXTERNALLY);
    });
  });

  // =========================================================================
  // 4. Event Export (Workaholic -> Google)
  // =========================================================================
  describe('Event Export (Workaholic → Google)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('exports native Workaholic event out to Google Calendar and records mapping', async () => {
      // 1. Create a native event in the mapped calendar
      const nativeEvt = await eventsRepo.createEvent({
        workspaceId: workspaceA.id,
        calendarId: primaryCalMapping.nativeObjectId,
        title: 'Native Team Retro',
        description: 'Retrospective for Phase 13',
        startTime: '2026-10-20T14:00:00.000Z',
        endTime: '2026-10-20T15:00:00.000Z',
        isAllDay: false,
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      // 2. Export event
      const exportRes = await googleCalendarSyncService.exportEvent(
        userA.id,
        workspaceA.id,
        nativeEvt.id,
      );

      expect(exportRes.action).toBe('CREATED');
      expect(exportRes.googleEventId).toBeDefined();

      // 3. Verify event exists in Google mock adapter
      const googleEvt = await mockAdapter.getEvent('token', 'primary', exportRes.googleEventId);
      expect(googleEvt).toBeDefined();
      expect(googleEvt.summary).toBe('Native Team Retro');
      expect(googleEvt.description).toBe('Retrospective for Phase 13');
      expect(googleEvt.start.dateTime).toBe('2026-10-20T14:00:00.000Z');

      // 4. Repeated export updates existing external event without creating duplicates
      const exportRes2 = await googleCalendarSyncService.exportEvent(
        userA.id,
        workspaceA.id,
        nativeEvt.id,
      );
      expect(exportRes2.action).toBe('UPDATED');
      expect(exportRes2.googleEventId).toBe(exportRes.googleEventId);
    });
  });

  // =========================================================================
  // 5. Bidirectional Conflict Handling (SYNC-SPECIFICATION.md Section 39 & 55)
  // =========================================================================
  describe('Conflict Resolution & Determinism', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('resolves conflict in favor of Google for Google-originated events', async () => {
      // 1. Create Google event and import it
      const gEvt = {
        id: 'g_conflict_001',
        summary: 'Original Google Title',
        start: { dateTime: '2026-10-25T09:00:00Z' },
        end: { dateTime: '2026-10-25T10:00:00Z' },
        status: 'confirmed',
      };
      await mockAdapter.createEvent('token', 'primary', gEvt);

      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'g_conflict_001',
      );

      // 2. Mutate both locally and externally
      await eventsRepo.updateEvent(mapping.nativeObjectId, workspaceA.id, {
        title: 'Local Divergent Title',
      });

      await mockAdapter.updateEvent('token', 'primary', 'g_conflict_001', {
        summary: 'Google Authoritative Title',
        updated: new Date(Date.now() + 1000).toISOString(),
      });

      // 3. Sync: Google-originated event must take Google's update
      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const resolved = await eventsRepo.findEventById(mapping.nativeObjectId, workspaceA.id);
      expect(resolved.title).toBe('Google Authoritative Title');
    });

    it('resolves conflict in favor of native Workaholic for native-originated events', async () => {
      // 1. Create native event and export
      const nativeEvt = await eventsRepo.createEvent({
        workspaceId: workspaceA.id,
        calendarId: primaryCalMapping.nativeObjectId,
        title: 'Native Authoritative Task',
        startTime: '2026-10-28T09:00:00.000Z',
        endTime: '2026-10-28T10:00:00.000Z',
        isAllDay: false,
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      const exportRes = await googleCalendarSyncService.exportEvent(
        userA.id,
        workspaceA.id,
        nativeEvt.id,
      );

      // 2. External side changes
      await mockAdapter.updateEvent('token', 'primary', exportRes.googleEventId, {
        summary: 'Attempted External Override',
      });

      // Local side also changes
      await eventsRepo.updateEvent(nativeEvt.id, workspaceA.id, {
        title: 'Native Final Edit',
      });

      // 3. Sync: Native event must preserve its native title and mark mapping CONFLICT
      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const resolved = await eventsRepo.findEventById(nativeEvt.id, workspaceA.id);
      expect(resolved.title).toBe('Native Final Edit');

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'EVENT',
        nativeEvt.id,
      );
      expect(mapping.syncState).toBe(SYNC_STATE.CONFLICT);
    });

    it('only native changed: retains native change without being overwritten by Google', async () => {
      // 1. Create native event and export
      const nativeEvt = await eventsRepo.createEvent({
        workspaceId: workspaceA.id,
        calendarId: primaryCalMapping.nativeObjectId,
        title: 'Native Exclusive Edit',
        startTime: '2026-10-29T09:00:00.000Z',
        endTime: '2026-10-29T10:00:00.000Z',
        isAllDay: false,
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      await googleCalendarSyncService.exportEvent(userA.id, workspaceA.id, nativeEvt.id);

      // 2. Only native changes
      await eventsRepo.updateEvent(nativeEvt.id, workspaceA.id, {
        title: 'Native Exclusive Edit Updated',
      });

      // 3. Sync
      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const resolved = await eventsRepo.findEventById(nativeEvt.id, workspaceA.id);
      expect(resolved.title).toBe('Native Exclusive Edit Updated');
    });

    it('only Google changed: applies Google update cleanly to native event', async () => {
      // 1. Create Google event and import
      const gEvt = {
        id: 'g_only_google_001',
        summary: 'Original Initial Summary',
        start: { dateTime: '2026-10-30T10:00:00Z' },
        end: { dateTime: '2026-10-30T11:00:00Z' },
        status: 'confirmed',
      };
      await mockAdapter.createEvent('token', 'primary', gEvt);
      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      // 2. Only Google changes
      await mockAdapter.updateEvent('token', 'primary', 'g_only_google_001', {
        summary: 'Updated by External Google User',
      });

      // 3. Sync
      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'g_only_google_001',
      );
      const nativeEvt = await eventsRepo.findEventById(mapping.nativeObjectId, workspaceA.id);
      expect(nativeEvt.title).toBe('Updated by External Google User');
    });

    it('handles equal timestamps or missing timestamps deterministically', async () => {
      const gEvt = {
        id: 'g_missing_ts_001',
        summary: 'Missing Timestamp Event',
        start: { dateTime: '2026-10-31T10:00:00Z' },
        end: { dateTime: '2026-10-31T11:00:00Z' },
        status: 'confirmed',
        updated: null, // missing timestamp
      };
      await mockAdapter.createEvent('token', 'primary', gEvt);

      const result = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
      );
      expect(result.status).toBe('SUCCESS');

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'g_missing_ts_001',
      );
      expect(mapping).toBeDefined();
      expect(mapping.syncState).toBe(SYNC_STATE.SYNCED);
    });

    it('synchronization write-back is not treated as a new independent change', async () => {
      // 1. Initial import of Google event
      const gEvt = {
        id: 'g_writeback_001',
        summary: 'Writeback Test Event',
        start: { dateTime: '2026-11-05T10:00:00Z' },
        end: { dateTime: '2026-11-05T11:00:00Z' },
        status: 'confirmed',
      };
      await mockAdapter.createEvent('token', 'primary', gEvt);

      const sync1 = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
      );
      expect(sync1.imported).toBeGreaterThanOrEqual(1);

      // 2. Immediately sync again without any changes on either side
      const sync2 = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
      );
      // No updates or exports should be generated on steady state
      expect(sync2.imported).toBe(0);
      expect(sync2.exported).toBe(0);

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'g_writeback_001',
      );
      expect(mapping.syncState).toBe(SYNC_STATE.SYNCED);
    });
  });

  // =========================================================================
  // 6. Recurrence & RRULE Mapping
  // =========================================================================
  describe('Recurrence & RRULE Mapper', () => {
    it('correctly maps iCalendar RRULE to Workaholic recurrence format and vice-versa', () => {
      const rrule = 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20261231T235959Z';
      const parsed = parseRrule(rrule);

      expect(parsed.freq).toBe('WEEKLY');
      expect(parsed.interval).toBe(2);
      expect(parsed.byweekday).toEqual(['MO', 'WE', 'FR']);
      expect(parsed.until).toBe('2026-12-31T23:59:59.000Z');

      const formatted = formatRrule(parsed);
      expect(formatted).toContain('FREQ=WEEKLY');
      expect(formatted).toContain('INTERVAL=2');
      expect(formatted).toContain('BYDAY=MO,WE,FR');
    });

    it('imports recurring Google series and maps recurrence attributes', async () => {
      await ensureConnectedAndMapped();

      const recurringGoogleEvt = {
        id: 'g_recurring_001',
        summary: 'Weekly Architecture Sync',
        start: { dateTime: '2026-11-01T15:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-11-01T16:00:00Z', timeZone: 'UTC' },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
        status: 'confirmed',
      };

      await mockAdapter.createEvent('token', 'primary', recurringGoogleEvt);

      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'g_recurring_001',
      );

      const nativeEvt = await eventsRepo.findEventById(mapping.nativeObjectId, workspaceA.id);
      expect(nativeEvt.recurrenceRule).toBeDefined();
      expect(nativeEvt.recurrenceRule.freq).toBe('WEEKLY');
      expect(nativeEvt.recurrenceRule.byweekday).toEqual(['MO']);
    });

    it('expands occurrences for imported recurring Google series using Phase 10 engine', async () => {
      await ensureConnectedAndMapped();

      const recurringGoogleEvt = {
        id: 'g_recurring_exp_002',
        summary: 'Daily Morning Standup',
        start: { dateTime: '2026-11-01T09:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-11-01T09:30:00Z', timeZone: 'UTC' },
        recurrence: ['RRULE:FREQ=DAILY;COUNT=5'],
        status: 'confirmed',
      };

      await mockAdapter.createEvent('token', 'primary', recurringGoogleEvt);

      await googleCalendarSyncService.syncCalendar(userA.id, workspaceA.id, primaryCalMapping.id);

      const rangeEvents = await eventsRepo.findEventsByRange(workspaceA.id, {
        calendarIds: [primaryCalMapping.nativeObjectId],
        start: '2026-11-01T00:00:00.000Z',
        end: '2026-11-06T23:59:59.999Z',
      });

      const standupOccurrences = rangeEvents.filter(e => e.title === 'Daily Morning Standup');
      expect(standupOccurrences.length).toBe(5);
    });
  });

  // =========================================================================
  // 7. Background Job Integration (Phase 12 JobQueue & JobWorker)
  // =========================================================================
  describe('Background Job Synchronization', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('enqueues background sync job with deterministic deduplication', async () => {
      const job1 = await enqueueGoogleCalendarSync(userA.id, workspaceA.id, primaryCalMapping.id);

      expect(job1.id).toBeDefined();
      expect(job1.jobType).toBe(JOB_TYPE.GOOGLE_CALENDAR_SYNC);
      expect(job1.jobKey).toBe(`google_cal_sync_${userA.id}_${primaryCalMapping.id}`);

      // Enqueueing second time while pending should deduplicate and return same job
      const job2 = await enqueueGoogleCalendarSync(userA.id, workspaceA.id, primaryCalMapping.id);
      expect(job2.id).toBe(job1.id);
    });

    it('JobWorker processes GOOGLE_CALENDAR_SYNC job asynchronously', async () => {
      const worker = new JobWorker({
        queue: jobQueue,
        queueName: 'sync',
        pollIntervalMs: 50,
      });

      worker.start();

      // Trigger sync via HTTP with ?async=true
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/integrations/google/calendar/sync?workspaceId=${workspaceA.id}&async=true`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { calendarMappingId: primaryCalMapping.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('QUEUED');
      const jobId = res.json().data.jobId;

      // Allow worker to pick up and process
      let jobRecord;
      for (let i = 0; i < 20; i++) {
        jobRecord = await jobQueue.getJob(jobId);
        if (jobRecord && jobRecord.status === JOB_STATUS.COMPLETED) break;
        await new Promise(resolve => setTimeout(resolve, 75));
      }
      await worker.stop();

      expect(jobRecord.status).toBe(JOB_STATUS.COMPLETED);
    });
  });

  // =========================================================================
  // 8. Disconnect Semantics & Data Preservation
  // =========================================================================
  describe('Disconnect Semantics', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('disconnecting Google Calendar purges credentials and marks mappings DETACHED without deleting native events', async () => {
      // 1. Ensure at least one native event exists before disconnect
      await eventsRepo.createEvent({
        workspaceId: workspaceA.id,
        calendarId: primaryCalMapping.nativeObjectId,
        title: 'Preserved Native Event',
        startTime: '2026-11-20T10:00:00.000Z',
        endTime: '2026-11-20T11:00:00.000Z',
        isAllDay: false,
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      const eventsBefore = await eventsRepo.findEventsByRange(workspaceA.id, {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-12-31T23:59:59.999Z',
      });
      expect(eventsBefore.length).toBeGreaterThan(0);

      // 2. Disconnect
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/calendar/disconnect',
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.disconnected).toBe(true);

      // 3. Credentials must be gone
      const statusRes = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/calendar/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(statusRes.json().data.status).toBe('DISCONNECTED');
      expect(statusRes.json().data.connected).toBe(false);

      // 4. Mappings marked DETACHED
      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      for (const m of mappings) {
        expect(m.syncState).toBe(SYNC_STATE.DETACHED);
      }

      // 5. Native events MUST STILL EXIST
      const eventsAfter = await eventsRepo.findEventsByRange(workspaceA.id, {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-12-31T23:59:59.999Z',
      });
      expect(eventsAfter.length).toBe(eventsBefore.length);
    });
  });
});
