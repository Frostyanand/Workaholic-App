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
import { googleTasksSyncService } from '../src/modules/integrations/google/google-tasks-sync.service.js';
import { MockGoogleTasksAdapter } from '../src/modules/integrations/google/google-tasks.adapter.js';
import { googleDriveSyncService } from '../src/modules/integrations/google/google-drive-sync.service.js';
import { MockGoogleDriveAdapter } from '../src/modules/integrations/google/google-drive.adapter.js';
import { syncCoordinator } from '../src/modules/integrations/sync-coordinator.js';
import { classifySyncError } from '../src/modules/integrations/sync-error-classifier.js';
import {
  isValidTransition,
  assertValidTransition,
  isSyncStale,
} from '../src/modules/integrations/sync-state-machine.js';
import * as extMappingsRepo from '../src/modules/integrations/external-mappings.repository.js';
import * as syncDiagRepo from '../src/modules/integrations/sync-diagnostics.repository.js';
import * as eventsRepo from '../src/modules/calendar/events.repository.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as integrationsRepo from '../src/modules/auth/integrations.repository.js';
import { jobQueue } from '../src/core/queue.js';
import {
  JOB_TYPE,
  SYNC_STATE_MACHINE,
  PROVIDER_ERROR_CATEGORY,
  SYNC_FAILURE_REASON,
  SYNC_DIAGNOSTIC_STATUS,
} from '@workaholic/shared';

describe('Phase 16: Synchronization Hardening Specification & Reliability Suite', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;
  let mockCalAdapter;
  let mockTasksAdapter;
  let mockDriveAdapter;
  let primaryCalMapping;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();

    // Setup User A
    userA = await createUser({
      email: `sync_harden_a_${Date.now()}@example.com`,
      displayName: 'Sync Harden User A',
    });
    const sessionTokenA = `sess_sync_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(sessionTokenA),
      expiresAt: new Date(Date.now() + 86400000),
    });
    tokenA = sessionTokenA;

    const wsA = await createWorkspaceWithMembership({
      name: 'Sync Harden Workspace A',
      ownerUserId: userA.id,
    });
    workspaceA = wsA.workspace;

    // Setup User B (Tenant isolation checks)
    userB = await createUser({
      email: `sync_harden_b_${Date.now()}@example.com`,
      displayName: 'Sync Harden User B',
    });
    const sessionTokenB = `sess_sync_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(sessionTokenB),
      expiresAt: new Date(Date.now() + 86400000),
    });
    tokenB = sessionTokenB;

    const wsB = await createWorkspaceWithMembership({
      name: 'Sync Harden Workspace B',
      ownerUserId: userB.id,
    });
    workspaceB = wsB.workspace;
  });

  afterAll(async () => {
    await app.close();
    // Clean up test data
    if (userA && userB) {
      await query('DELETE FROM sync_diagnostics WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
      await query('DELETE FROM external_object_mappings WHERE user_id IN ($1, $2)', [
        userA.id,
        userB.id,
      ]);
      await query(
        'DELETE FROM external_accounts WHERE integration_id IN (SELECT id FROM integrations WHERE user_id IN ($1, $2))',
        [userA.id, userB.id],
      );
      await query('DELETE FROM integrations WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
      if (workspaceA && workspaceB) {
        await query('DELETE FROM events WHERE workspace_id IN ($1, $2)', [
          workspaceA.id,
          workspaceB.id,
        ]);
        await query('DELETE FROM calendars WHERE workspace_id IN ($1, $2)', [
          workspaceA.id,
          workspaceB.id,
        ]);
        await query('DELETE FROM tasks WHERE workspace_id IN ($1, $2)', [
          workspaceA.id,
          workspaceB.id,
        ]);
        await query('DELETE FROM workspace_memberships WHERE workspace_id IN ($1, $2)', [
          workspaceA.id,
          workspaceB.id,
        ]);
        await query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA.id, workspaceB.id]);
      }
      await query('DELETE FROM background_jobs WHERE queue IN ($1, $2)', ['default', 'sync']);
      await query('DELETE FROM sessions WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
      await query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
    }
  });

  beforeEach(async () => {
    mockCalAdapter = new MockGoogleCalendarAdapter();
    googleCalendarSyncService.adapter = mockCalAdapter;

    mockTasksAdapter = new MockGoogleTasksAdapter();
    googleTasksSyncService.adapter = mockTasksAdapter;

    mockDriveAdapter = new MockGoogleDriveAdapter();
    googleDriveSyncService.adapter = mockDriveAdapter;

    // Ensure User A has valid Google connection
    const state = oauthBoundaryService.generateAuthorizationUrl({
      userId: userA.id,
      service: 'CALENDAR',
    }).state;
    await oauthBoundaryService.exchangeAuthorizationCode({
      userId: userA.id,
      code: 'code_sync_harden',
      state,
      service: 'CALENDAR',
    });

    // Discover calendars
    await googleCalendarSyncService.discoverCalendars(userA.id, workspaceA.id, mockCalAdapter);
    const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE', 'CALENDAR');
    primaryCalMapping = mappings.find(m => m.externalObjectId === 'primary');
  });

  // =========================================================================
  // 1. IDEMPOTENCY
  // =========================================================================
  describe('1. Idempotency (Sync #1, Sync #2, Sync #3 Convergence)', () => {
    it('1. First sync applies changes, Second sync produces no duplicate changes, Third sync maintains stable state', async () => {
      // Setup external Google event
      mockCalAdapter.seedEvents('primary', [
        {
          id: 'idem_event_1',
          summary: 'Idempotent Test Event',
          start: { dateTime: '2026-10-01T10:00:00Z' },
          end: { dateTime: '2026-10-01T11:00:00Z' },
          updated: '2026-09-20T12:00:00.000Z',
          etag: '"etag_idem_1"',
        },
      ]);

      // Sync #1 -> Creates event
      const res1 = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );
      expect(res1.status).toBe('SUCCESS');
      expect(res1.imported).toBe(1);

      // Verify record exists in DB
      const dbRes1 = await query('SELECT * FROM events WHERE workspace_id = $1 AND title = $2', [
        workspaceA.id,
        'Idempotent Test Event',
      ]);
      expect(dbRes1.rows.length).toBe(1);

      // Sync #2 -> Idempotent, 0 created, 0 updated, 0 duplicates
      const res2 = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );
      expect(res2.status).toBe('SUCCESS');
      expect(res2.imported).toBe(0);

      const dbRes2 = await query('SELECT * FROM events WHERE workspace_id = $1 AND title = $2', [
        workspaceA.id,
        'Idempotent Test Event',
      ]);
      expect(dbRes2.rows.length).toBe(1);

      // Sync #3 -> Still unchanged
      const res3 = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );
      expect(res3.status).toBe('SUCCESS');
      expect(res3.imported).toBe(0);

      const dbRes3 = await query('SELECT * FROM events WHERE workspace_id = $1 AND title = $2', [
        workspaceA.id,
        'Idempotent Test Event',
      ]);
      expect(dbRes3.rows.length).toBe(1);
    });

    it('2. Does not make unnecessary provider writes on unchanged records', async () => {
      let providerCreateCount = 0;
      let providerUpdateCount = 0;

      const origCreate = mockCalAdapter.createEvent.bind(mockCalAdapter);
      const origUpdate = mockCalAdapter.updateEvent.bind(mockCalAdapter);
      mockCalAdapter.createEvent = async (...args) => {
        providerCreateCount++;
        return origCreate(...args);
      };
      mockCalAdapter.updateEvent = async (...args) => {
        providerUpdateCount++;
        return origUpdate(...args);
      };

      try {
        // Native event created
        await eventsRepo.createEvent({
          calendarId: primaryCalMapping.nativeObjectId,
          workspaceId: workspaceA.id,
          title: 'Native Event For Unnecessary Writes Check',
          startAt: new Date('2026-10-02T14:00:00Z'),
          endAt: new Date('2026-10-02T15:00:00Z'),
          isAllDay: false,
          createdBy: userA.id,
        });

        // Sync #1: Exports event to provider
        await googleCalendarSyncService.syncCalendar(
          userA.id,
          workspaceA.id,
          primaryCalMapping.id,
          {},
          mockCalAdapter,
        );
        expect(providerCreateCount).toBe(1);
        expect(providerUpdateCount).toBe(0);

        // Sync #2: Event unchanged -> 0 creates, 0 updates to provider
        await googleCalendarSyncService.syncCalendar(
          userA.id,
          workspaceA.id,
          primaryCalMapping.id,
          {},
          mockCalAdapter,
        );
        expect(providerCreateCount).toBe(1);
        expect(providerUpdateCount).toBe(0);

        // Sync #3: Still 0 additional calls
        await googleCalendarSyncService.syncCalendar(
          userA.id,
          workspaceA.id,
          primaryCalMapping.id,
          {},
          mockCalAdapter,
        );
        expect(providerCreateCount).toBe(1);
        expect(providerUpdateCount).toBe(0);
      } finally {
        mockCalAdapter.createEvent = origCreate;
        mockCalAdapter.updateEvent = origUpdate;
      }
    });
  });

  // =========================================================================
  // 2. CONFLICT HANDLING
  // =========================================================================
  describe('2. Conflict Handling & Convergence', () => {
    it('3. Native-only change pushes to external without conflict', async () => {
      // Create and sync event
      const native = await eventsRepo.createEvent({
        calendarId: primaryCalMapping.nativeObjectId,
        workspaceId: workspaceA.id,
        title: 'Initial Native Title',
        startAt: new Date('2026-10-03T10:00:00Z'),
        endAt: new Date('2026-10-03T11:00:00Z'),
        isAllDay: false,
        createdBy: userA.id,
      });

      await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );

      // Mutate native only
      await eventsRepo.updateEvent(native.id, workspaceA.id, {
        title: 'Updated Native Title',
      });

      const res = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );
      expect(res.exported).toBeGreaterThanOrEqual(1);

      // Verify mapping remains SYNCED
      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'EVENT',
        native.id,
      );
      expect(mapping.syncState).toBe('SYNCED');
    });

    it('4. External-only change pulls to native without conflict', async () => {
      mockCalAdapter.seedEvents('primary', [
        {
          id: 'ext_only_event',
          summary: 'Original Ext Title',
          start: { dateTime: '2026-10-04T10:00:00Z' },
          end: { dateTime: '2026-10-04T11:00:00Z' },
          updated: '2026-09-20T10:00:00.000Z',
          etag: '"etag_orig"',
        },
      ]);

      await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );

      // External changes
      mockCalAdapter.seedEvents('primary', [
        {
          id: 'ext_only_event',
          summary: 'Changed Ext Title',
          start: { dateTime: '2026-10-04T10:00:00Z' },
          end: { dateTime: '2026-10-04T11:00:00Z' },
          updated: '2026-09-20T15:00:00.000Z',
          etag: '"etag_updated"',
        },
      ]);

      await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'EVENT',
        'ext_only_event',
      );
      const nativeEvent = await eventsRepo.findEventById(mapping.nativeObjectId, workspaceA.id);
      expect(nativeEvent.title).toBe('Changed Ext Title');
      expect(mapping.syncState).toBe('SYNCED');
    });

    it('5. Simultaneous change handles deterministic conflict and avoids oscillation', async () => {
      // Event created natively
      const native = await eventsRepo.createEvent({
        calendarId: primaryCalMapping.nativeObjectId,
        workspaceId: workspaceA.id,
        title: 'Simultaneous Conflict Test',
        sourceType: 'WORKAHOLIC',
        startAt: new Date('2026-10-05T10:00:00Z'),
        endAt: new Date('2026-10-05T11:00:00Z'),
        isAllDay: false,
        createdBy: userA.id,
      });

      await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'EVENT',
        native.id,
      );

      // Simulate native change
      await eventsRepo.updateEvent(native.id, workspaceA.id, {
        title: 'Native Simultaneous Edit',
      });

      // Simulate external change
      mockCalAdapter.seedEvents('primary', [
        {
          id: mapping.externalObjectId,
          summary: 'Google Simultaneous Edit',
          start: { dateTime: '2026-10-05T10:00:00Z' },
          end: { dateTime: '2026-10-05T11:00:00Z' },
          updated: new Date(Date.now() + 5000).toISOString(),
          etag: '"etag_simultaneous"',
        },
      ]);

      // Sync handles conflict: for WORKAHOLIC originated event, flags CONFLICT and preserves native
      await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );

      const updatedMapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'EVENT',
        native.id,
      );
      expect(updatedMapping.syncState).toBe('CONFLICT');

      // Native data was not overwritten
      const checkNative = await eventsRepo.findEventById(native.id, workspaceA.id);
      expect(checkNative.title).toBe('Native Simultaneous Edit');

      // Repeated sync does not oscillate or produce infinite loops
      const repeatedRes = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        mockCalAdapter,
      );
      expect(repeatedRes.status).toBe('PARTIAL_SUCCESS');
    });
  });

  // =========================================================================
  // 3. PROVIDER ERROR CLASSIFICATION & RETRIES
  // =========================================================================
  describe('3. Provider Error Classification & Retries', () => {
    it('6. Classifies 401 as AUTHENTICATION / AUTHORIZATION_REVOKED and requires reauthorization', () => {
      const err = new Error('Invalid OAuth access token');
      err.status = 401;
      const classified = classifySyncError(err);
      expect(classified.category).toBe(PROVIDER_ERROR_CATEGORY.AUTHENTICATION);
      expect(classified.reason).toBe(SYNC_FAILURE_REASON.AUTHORIZATION_REVOKED);
      expect(classified.shouldReauth).toBe(true);
      expect(classified.isRetryable).toBe(false);
    });

    it('7. Classifies 429 as RATE_LIMIT / PROVIDER_RATE_LIMIT and marks retryable', () => {
      const err = new Error('User Rate Limit Exceeded');
      err.status = 429;
      err.code = 'RATE_LIMIT_EXCEEDED';
      const classified = classifySyncError(err);
      expect(classified.category).toBe(PROVIDER_ERROR_CATEGORY.RATE_LIMIT);
      expect(classified.reason).toBe(SYNC_FAILURE_REASON.PROVIDER_RATE_LIMIT);
      expect(classified.isRetryable).toBe(true);
    });

    it('8. Classifies 404 as NOT_FOUND / INVALID_EXTERNAL_OBJECT', () => {
      const err = new Error('Resource not found');
      err.status = 404;
      const classified = classifySyncError(err);
      expect(classified.category).toBe(PROVIDER_ERROR_CATEGORY.NOT_FOUND);
      expect(classified.reason).toBe(SYNC_FAILURE_REASON.INVALID_EXTERNAL_OBJECT);
      expect(classified.isRetryable).toBe(false);
    });

    it('9. Classifies 5xx as TRANSIENT / PROVIDER_UNAVAILABLE with retryable flag', () => {
      const err = new Error('Internal Server Error at Google');
      err.status = 503;
      const classified = classifySyncError(err);
      expect(classified.category).toBe(PROVIDER_ERROR_CATEGORY.TRANSIENT);
      expect(classified.reason).toBe(SYNC_FAILURE_REASON.PROVIDER_UNAVAILABLE);
      expect(classified.isRetryable).toBe(true);
    });

    it('10. Classifies network failures (ECONNRESET) as TRANSIENT / NETWORK_FAILURE', () => {
      const err = new Error('socket hang up');
      err.code = 'ECONNRESET';
      const classified = classifySyncError(err);
      expect(classified.category).toBe(PROVIDER_ERROR_CATEGORY.TRANSIENT);
      expect(classified.reason).toBe(SYNC_FAILURE_REASON.NETWORK_FAILURE);
      expect(classified.isRetryable).toBe(true);
    });

    it('11. Classifies 400 validation error as VALIDATION / INVALID_MAPPING and non-retryable', () => {
      const err = new Error('Invalid JSON request body');
      err.status = 400;
      const classified = classifySyncError(err);
      expect(classified.category).toBe(PROVIDER_ERROR_CATEGORY.VALIDATION);
      expect(classified.reason).toBe(SYNC_FAILURE_REASON.INVALID_MAPPING);
      expect(classified.isRetryable).toBe(false);
    });

    it('12. Classifies 403 permission error as PERMANENT / PERMISSION_DENIED', () => {
      const err = new Error('The caller does not have permission');
      err.status = 403;
      const classified = classifySyncError(err);
      expect(classified.category).toBe(PROVIDER_ERROR_CATEGORY.PERMANENT);
      expect(classified.reason).toBe(SYNC_FAILURE_REASON.PERMISSION_DENIED);
      expect(classified.isRetryable).toBe(false);
    });
  });

  // =========================================================================
  // 4. RECOVERY & RESYNCHRONIZATION
  // =========================================================================
  describe('4. Recovery & Resynchronization', () => {
    it('13. Recovers stale processing locks (> 15 minutes) and restores integration status', async () => {
      // Simulate stale lock in syncCoordinator
      const fifteenMinsAgo = Date.now() - 20 * 60 * 1000;
      expect(isSyncStale(fifteenMinsAgo)).toBe(true);

      // Put integration in SYNCING
      const integration = await integrationsRepo.findIntegration(userA.id, 'GOOGLE');
      await integrationsRepo.updateIntegrationStatus(integration.id, 'SYNCING');

      const recovery = await syncCoordinator.recoverStaleSync(userA.id);
      expect(recovery.recovered).toBe(true);
      expect(recovery.currentStatus).toBe('CONNECTED');
    });

    it('14. Full sync fallback on cursor expiration (HTTP 410)', async () => {
      let callCount = 0;
      const cursorExpiredAdapter = {
        ...mockCalAdapter,
        listEvents: async (token, calId, opts) => {
          callCount++;
          if (opts.syncToken) {
            const err = new Error('Sync token is invalid or expired');
            err.status = 410;
            err.syncTokenExpired = true;
            throw err;
          }
          return { items: [], nextSyncToken: 'fresh_token_after_410' };
        },
      };

      // Set existing syncToken
      await extMappingsRepo.updateMapping(primaryCalMapping.id, {
        syncCursor: 'old_expired_token',
      });

      const res = await googleCalendarSyncService.syncCalendar(
        userA.id,
        workspaceA.id,
        primaryCalMapping.id,
        {},
        cursorExpiredAdapter,
      );

      expect(callCount).toBe(2); // First failed with 410, second succeeded without syncToken
      expect(res.status).toBe('SUCCESS');

      const reloadedMapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'CALENDAR',
        primaryCalMapping.externalObjectId,
      );
      expect(reloadedMapping.syncCursor).toBe('fresh_token_after_410');
    });

    it('15. Resynchronization recovery API resets stale cursors on demand', async () => {
      // Set existing cursor
      await extMappingsRepo.updateMapping(primaryCalMapping.id, {
        syncCursor: 'cursor_to_reset',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/recover',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          service: 'CALENDAR',
          resetCursor: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.resetCursors).toBeGreaterThanOrEqual(1);

      const updated = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryCalMapping.externalAccountId,
        'CALENDAR',
        primaryCalMapping.externalObjectId,
      );
      expect(updated.syncCursor).toBeNull();
    });
  });

  // =========================================================================
  // 5. CONCURRENCY & DEDUPLICATION
  // =========================================================================
  describe('5. Concurrency & Deduplication', () => {
    it('16. Rejects duplicate concurrent sync requests with 409 SYNC_IN_PROGRESS', async () => {
      // Acquire lock manually
      syncCoordinator.acquireLock(userA.id, 'CALENDAR', 'primary');

      try {
        expect(() => {
          syncCoordinator.acquireLock(userA.id, 'CALENDAR', 'primary');
        }).toThrowError(/already in progress/);
      } finally {
        syncCoordinator.releaseLock(userA.id, 'CALENDAR', 'primary');
      }
    });

    it('17. Background job queue deduplication prevents duplicate active sync jobs', async () => {
      const job1 = await jobQueue.enqueue({
        queue: 'sync',
        jobType: JOB_TYPE.GOOGLE_CALENDAR_SYNC,
        payload: { userId: userA.id, workspaceId: workspaceA.id },
        jobKey: `google_cal_sync_${userA.id}_primary`,
      });

      const job2 = await jobQueue.enqueue({
        queue: 'sync',
        jobType: JOB_TYPE.GOOGLE_CALENDAR_SYNC,
        payload: { userId: userA.id, workspaceId: workspaceA.id },
        jobKey: `google_cal_sync_${userA.id}_primary`,
      });

      expect(job1.id).toBe(job2.id); // Deduplicated to existing job!
    });
  });

  // =========================================================================
  // 6. SYNCHRONIZATION DIAGNOSTICS & STATE MACHINE
  // =========================================================================
  describe('6. Synchronization Diagnostics & State Machine', () => {
    it('18. Validates valid and invalid state transitions', () => {
      expect(isValidTransition(SYNC_STATE_MACHINE.IDLE, SYNC_STATE_MACHINE.SYNCING)).toBe(true);
      expect(isValidTransition(SYNC_STATE_MACHINE.SYNCING, SYNC_STATE_MACHINE.SUCCEEDED)).toBe(
        true,
      );
      expect(isValidTransition(SYNC_STATE_MACHINE.SYNCING, SYNC_STATE_MACHINE.FAILED)).toBe(true);
      expect(isValidTransition(SYNC_STATE_MACHINE.SUCCEEDED, SYNC_STATE_MACHINE.SYNCING)).toBe(
        true,
      );

      // Illegal transition
      expect(isValidTransition(SYNC_STATE_MACHINE.DETACHED, SYNC_STATE_MACHINE.CONFLICT)).toBe(
        false,
      );
      expect(() => {
        assertValidTransition(SYNC_STATE_MACHINE.DETACHED, SYNC_STATE_MACHINE.CONFLICT);
      }).toThrowError(/Illegal synchronization state transition/);
    });

    it('19. Diagnostic records are created and queryable via GET /api/v1/integrations/google/diagnostics', async () => {
      // Record a diagnostic record
      await syncDiagRepo.recordSyncDiagnostic({
        userId: userA.id,
        workspaceId: workspaceA.id,
        provider: 'GOOGLE',
        integrationService: 'CALENDAR',
        syncDirection: 'BIDIRECTIONAL',
        status: SYNC_DIAGNOSTIC_STATUS.SUCCESS,
        recordsExamined: 10,
        recordsCreated: 2,
        recordsUpdated: 1,
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(),
        durationMs: 5000,
        correlationId: 'test_corr_123',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/diagnostics?service=CALENDAR',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.diagnostics).toBeInstanceOf(Array);
      expect(body.data.diagnostics.length).toBeGreaterThanOrEqual(1);

      const entry = body.data.diagnostics[0];
      expect(entry.integrationService).toBe('CALENDAR');
      expect(entry.status).toBe('SUCCESS');
      expect(entry.durationMs).toBe(5000);
    });
  });

  // =========================================================================
  // 7. SECURITY & TENANT ISOLATION
  // =========================================================================
  describe('7. Security & Tenant Isolation', () => {
    it('20. User B cannot view User A diagnostic data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/diagnostics',
        headers: {
          authorization: `Bearer ${tokenB}`,
          'x-workspace-id': workspaceB.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // User B has no diagnostic records
      expect(body.data.diagnostics.length).toBe(0);
    });

    it('21. Diagnostics never leak OAuth tokens or sensitive credentials', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/diagnostics',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const rawBody = res.body;
      expect(rawBody).not.toContain('access_token');
      expect(rawBody).not.toContain('refresh_token');
      expect(rawBody).not.toContain('client_secret');
    });

    it('22. Unauthenticated calls to diagnostics are rejected with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/diagnostics',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 8. GOOGLE TASKS HARDENED SYNC
  // =========================================================================
  describe('8. Google Tasks Hardening', () => {
    it('23. Google Tasks sync is idempotent across multiple runs', async () => {
      // Connect Google Tasks scope
      const state = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'TASKS',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'tasks_auth_code',
        state,
        service: 'TASKS',
      });

      mockTasksAdapter.seedTaskLists([
        { id: 'tasks_list_idem', title: 'Idempotent Tasks Project' },
      ]);
      mockTasksAdapter.seedTasks('tasks_list_idem', [
        {
          id: 'gtask_idem_1',
          title: 'Google Task 1',
          status: 'needsAction',
          updated: '2026-09-20T10:00:00.000Z',
          etag: '"etag_gtask_1"',
        },
      ]);

      // Sync #1
      const res1 = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        null,
        {},
        mockTasksAdapter,
      );
      expect(res1.status).toBe('SUCCESS');
      expect(res1.imported).toBe(1);

      // Verify task in DB
      const dbTasks = await query('SELECT * FROM tasks WHERE workspace_id = $1 AND title = $2', [
        workspaceA.id,
        'Google Task 1',
      ]);
      expect(dbTasks.rows.length).toBe(1);

      // Sync #2 -> Idempotent no-op
      const res2 = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        null,
        {},
        mockTasksAdapter,
      );
      expect(res2.status).toBe('SUCCESS');
      expect(res2.imported).toBe(0);

      // Sync #3 -> Still unchanged
      const res3 = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        null,
        {},
        mockTasksAdapter,
      );
      expect(res3.status).toBe('SUCCESS');
      expect(res3.imported).toBe(0);
    });
  });

  // =========================================================================
  // 9. GOOGLE DRIVE HARDENED SYNC
  // =========================================================================
  describe('9. Google Drive Hardening', () => {
    it('24. Handles missing or externally deleted Drive file without crashing (404 recovery)', async () => {
      // Connect Google Drive
      const state = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'DRIVE',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'drive_auth_code',
        state,
        service: 'DRIVE',
      });

      // Create native attachment with external file ID
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: 'Task For Drive Sync Hardening',
        createdBy: userA.id,
      });

      const attachRes = await query(
        `INSERT INTO attachments (
          workspace_id, owner_user_id, target_type, target_id,
          external_file_id, file_name, mime_type, source_type, upload_status
        ) VALUES ($1, $2, 'TASK', $3, $4, 'document.pdf', 'application/pdf', 'GOOGLE_DRIVE', 'COMPLETED')
        RETURNING *;`,
        [workspaceA.id, userA.id, nativeTask.id, 'drive_file_missing_404'],
      );
      const attachment = attachRes.rows[0];

      // Upsert mapping
      await extMappingsRepo.upsertMapping({
        userId: userA.id,
        workspaceId: workspaceA.id,
        provider: 'GOOGLE',
        externalAccountId: 'acc_drive_test',
        externalContainerId: 'folder_drive_test',
        externalObjectType: 'FILE',
        externalObjectId: 'drive_file_missing_404',
        nativeObjectType: 'ATTACHMENT',
        nativeObjectId: attachment.id,
        syncState: 'SYNCED',
      });

      // Mock adapter throws 404 for missing file
      const missingAdapter = {
        ...mockDriveAdapter,
        getFile: async () => {
          const err = new Error('File not found in Drive');
          err.status = 404;
          throw err;
        },
      };

      const result = await googleDriveSyncService.syncAttachmentStatus(
        userA.id,
        workspaceA.id,
        attachment.id,
        missingAdapter,
      );

      expect(result.available).toBe(false);
      expect(result.reason).toBe('FILE_UNAVAILABLE_OR_TRASHED');

      // Check mapping updated to DELETED_EXTERNALLY
      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'ATTACHMENT',
        attachment.id,
      );
      expect(mapping.syncState).toBe('DELETED_EXTERNALLY');
    });
  });
});
