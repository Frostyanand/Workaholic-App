import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { oauthBoundaryService } from '../src/modules/auth/oauth-boundary.service.js';
import { googleTasksSyncService } from '../src/modules/integrations/google/google-tasks-sync.service.js';
import { MockGoogleTasksAdapter } from '../src/modules/integrations/google/google-tasks.adapter.js';
import { enqueueGoogleTasksSync } from '../src/modules/integrations/google/google-sync-dispatcher.js';
import { jobQueue } from '../src/core/queue.js';
import { JobWorker } from '../src/core/worker.js';
import * as extMappingsRepo from '../src/modules/integrations/external-mappings.repository.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as projectsRepo from '../src/modules/projects/projects.repository.js';
import * as integrationsRepo from '../src/modules/auth/integrations.repository.js';
import * as eventsRepo from '../src/modules/calendar/events.repository.js';
import { googleCalendarSyncService } from '../src/modules/integrations/google/google-calendar-sync.service.js';
import { MockGoogleCalendarAdapter } from '../src/modules/integrations/google/google-calendar.adapter.js';
import { JOB_TYPE, JOB_STATUS, SYNC_STATE } from '@workaholic/shared';

describe('Google Tasks Integration & Two-Way Sync (Phase 14)', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;
  let mockAdapter;
  let primaryListMapping;

  async function ensureConnectedAndMapped() {
    mockAdapter = new MockGoogleTasksAdapter();
    googleTasksSyncService.adapter = mockAdapter;

    const integration = await integrationsRepo.findIntegration(userA.id, 'GOOGLE');
    if (!integration || integration.status !== 'CONNECTED') {
      const state = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'TASKS',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_code_setup',
        state,
        service: 'TASKS',
      });
    }

    const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
    let primary = mappings.find(m => m.externalObjectId === '@default');
    if (!primary) {
      await googleTasksSyncService.discoverTaskLists(userA.id, workspaceA.id, mockAdapter);
      const reloaded = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      primary = reloaded.find(m => m.externalObjectId === '@default');
    }
    primaryListMapping = primary;
    return primary;
  }

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create User A and User B
    userA = await createUser({
      displayName: 'Google Tasks User A',
      email: `tasks_user_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Google Tasks User B',
      email: `tasks_user_b_${Date.now()}@example.com`,
    });

    // 2. Create Workspaces
    const wsResA = await createWorkspaceWithMembership({
      name: 'Google Tasks Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsResA.workspace;

    const wsResB = await createWorkspaceWithMembership({
      name: 'Google Tasks Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsResB.workspace;

    // 3. Create Sessions
    tokenA = `tasks_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenB = `tasks_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // 4. Initialize Mock Adapter and bind to service
    mockAdapter = new MockGoogleTasksAdapter();
    googleTasksSyncService.adapter = mockAdapter;
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
    await query('DELETE FROM tasks WHERE workspace_id IN ($1, $2)', [workspaceA.id, workspaceB.id]);
    await query('DELETE FROM projects WHERE workspace_id IN ($1, $2)', [
      workspaceA.id,
      workspaceB.id,
    ]);
    await query('DELETE FROM background_jobs WHERE queue IN ($1, $2)', ['default', 'sync']);
    await query('DELETE FROM sessions WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
    await query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA.id, workspaceB.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
  });

  beforeEach(() => {
    mockAdapter = new MockGoogleTasksAdapter();
    googleTasksSyncService.adapter = mockAdapter;
  });

  // =========================================================================
  // 1. OAuth Initiation, State Validation, & Code Exchange (TM-GTASK-001)
  // =========================================================================
  describe('OAuth Flow & Security Boundaries (TM-GTASK-001)', () => {
    it('rejects unauthenticated requests to initiate Google Tasks connect', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/tasks/connect',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it('generates authorization URL with CSRF state token and minimal tasks scopes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/tasks/connect',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { redirectUri: 'http://localhost:5173/auth/google/callback' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(body.data.authorizationUrl).toContain('tasks');
      expect(body.data.state).toBeDefined();
      expect(body.data.scopes).toContain('https://www.googleapis.com/auth/tasks');
      // Must not request unrelated scopes like calendar or drive
      expect(body.data.authorizationUrl).not.toContain('calendar');
      expect(body.data.authorizationUrl).not.toContain('drive');
    });

    it('rejects callback with missing or forged state token (CSRF defense)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/tasks/callback',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          code: 'valid_auth_code_123',
          state: 'forged_or_expired_state',
          service: 'TASKS',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('completes OAuth exchange, encrypts tokens, and NEVER leaks credentials to client', async () => {
      const connectRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/tasks/connect',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {},
      });
      const { state } = connectRes.json().data;

      const callbackRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/tasks/callback',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          code: 'legit_google_tasks_auth_code',
          state,
          service: 'TASKS',
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

      // Verify Database: tokens must be encrypted AES-256-GCM ciphertext
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
        url: '/api/v1/integrations/google/tasks/status',
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
  // 2. Task List Discovery & Idempotent Mapping (TM-GTASK-002)
  // =========================================================================
  describe('Task List Discovery & Identity Mapping (TM-GTASK-002)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });
    it('discovers Google task lists and creates persistent native project mappings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/tasks/task-lists?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const taskLists = res.json().data;
      expect(taskLists.length).toBeGreaterThanOrEqual(2);

      const defaultList = taskLists.find(l => l.isDefault);
      expect(defaultList).toBeDefined();
      expect(defaultList.googleTaskListId).toBe('@default');
      expect(defaultList.mappingId).toBeDefined();
      expect(defaultList.nativeProjectId).toBeDefined();

      // Check external_object_mappings table
      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        defaultList.externalAccountId,
        'TASK_LIST',
        '@default',
      );
      expect(mapping).toBeDefined();
      expect(mapping.nativeObjectType).toBe('PROJECT');
      expect(mapping.syncState).toBe(SYNC_STATE.SYNCED);
    });

    it('repeated discovery is idempotent and does not create duplicate mappings or projects', async () => {
      const res1 = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/tasks/task-lists?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const res2 = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/tasks/task-lists?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res1.json().data.length).toBe(res2.json().data.length);

      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      const listMappings = mappings.filter(m => m.externalObjectType === 'TASK_LIST');
      expect(listMappings.length).toBe(2);
    });

    it('enforces tenant isolation: User B cannot access User A task lists', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/integrations/google/tasks/task-lists?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('NOT_CONNECTED');
    });
  });

  // =========================================================================
  // 3. Task Import (Google -> Workaholic) & Provenance (TM-GTASK-003)
  // =========================================================================
  describe('Task Import (Google → Workaholic) (TM-GTASK-003)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('imports Google tasks with correct provenance and separate external IDs (REQ-GTASK-003)', async () => {
      const gTask1 = {
        id: 'gtask_inbound_001',
        title: 'Review Google Tasks Spec',
        notes: 'Check requirements REQ-GTASK-001 through 005',
        due: '2026-10-15T00:00:00.000Z',
        status: 'needsAction',
      };
      await mockAdapter.createTask('token', '@default', gTask1);

      const syncResult = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        primaryListMapping.id,
      );

      expect(syncResult.imported).toBeGreaterThanOrEqual(1);

      // Verify native task
      const { tasks: nativeTasks } = await tasksRepo.listTasks(workspaceA.id, {
        projectId: primaryListMapping.nativeObjectId,
      });

      const importedTask = nativeTasks.find(t => t.title === 'Review Google Tasks Spec');
      expect(importedTask).toBeDefined();
      expect(importedTask.description).toBe('Check requirements REQ-GTASK-001 through 005');
      expect(importedTask.status).toBe('TODO');
      expect(importedTask.sourceType).toBe('GOOGLE'); // Provenance check
      expect(importedTask.sourceReference).toBe('gtask_inbound_001');
      // Invariant: Native ID must remain distinct from external ID
      expect(importedTask.id).not.toBe('gtask_inbound_001');

      // Verify mapping
      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryListMapping.externalAccountId,
        'TASK',
        'gtask_inbound_001',
      );
      expect(mapping).toBeDefined();
      expect(mapping.nativeObjectId).toBe(importedTask.id);
      expect(mapping.syncState).toBe('SYNCED');
    });

    it('imports completed tasks and records completedAt timestamp', async () => {
      const completedGTask = {
        id: 'gtask_inbound_completed_002',
        title: 'Submit Documentation',
        notes: 'All documents reviewed',
        status: 'completed',
        completed: '2026-10-10T14:30:00.000Z',
      };
      await mockAdapter.createTask('token', '@default', completedGTask);

      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mapping = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryListMapping.externalAccountId,
        'TASK',
        'gtask_inbound_completed_002',
      );
      const native = await tasksRepo.findTaskById(mapping.nativeObjectId, workspaceA.id);
      expect(native.status).toBe('COMPLETED');
      expect(native.completedAt).toBeDefined();
    });

    it('repeated import is idempotent and does not create duplicate tasks', async () => {
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const { tasks: nativeTasks } = await tasksRepo.listTasks(workspaceA.id, {
        projectId: primaryListMapping.nativeObjectId,
      });

      const matches = nativeTasks.filter(t => t.title === 'Review Google Tasks Spec');
      expect(matches.length).toBe(1);
    });

    it('handles external cancellation/deletion without destroying native data (REQ-GTASK-005)', async () => {
      // 1. Create and sync task
      await mockAdapter.createTask('token', '@default', {
        id: 'gtask_to_delete_ext',
        title: 'Task to be deleted externally',
        status: 'needsAction',
      });
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mappingBefore = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryListMapping.externalAccountId,
        'TASK',
        'gtask_to_delete_ext',
      );
      expect(mappingBefore).toBeDefined();

      // 2. Delete task in Google
      await mockAdapter.deleteTask('token', '@default', 'gtask_to_delete_ext');

      // 3. Sync
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      // 4. Verify native task still exists (not hard deleted) and marked CANCELLED
      const nativeTask = await tasksRepo.findTaskById(mappingBefore.nativeObjectId, workspaceA.id);
      expect(nativeTask).toBeDefined();
      expect(nativeTask.status).toBe('CANCELLED');

      // Mapping marked DELETED_EXTERNALLY
      const mappingAfter = await extMappingsRepo.findMappingByExternalId(
        'GOOGLE',
        primaryListMapping.externalAccountId,
        'TASK',
        'gtask_to_delete_ext',
      );
      expect(mappingAfter.syncState).toBe('DELETED_EXTERNALLY');
    });
  });

  // =========================================================================
  // 4. Outbound Task Export (Workaholic -> Google Tasks) (TM-GTASK-004)
  // =========================================================================
  describe('Outbound Task Export (Workaholic → Google Tasks) (TM-GTASK-004)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('exports newly created native Workaholic tasks to Google Tasks', async () => {
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Prepare Sprint Retrospective',
        description: 'Prepare metrics and retro board',
        priority: 'P1',
        dueAt: '2026-10-20T17:00:00.000Z',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      const syncResult = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        primaryListMapping.id,
      );

      expect(syncResult.exported).toBeGreaterThanOrEqual(1);

      // Verify task exists in mock Google adapter
      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'TASK',
        nativeTask.id,
      );
      expect(mapping).toBeDefined();
      expect(mapping.externalObjectId).toBeDefined();

      const gTask = await mockAdapter.getTask('token', '@default', mapping.externalObjectId);
      expect(gTask).toBeDefined();
      expect(gTask.title).toBe('Prepare Sprint Retrospective');
      expect(gTask.notes).toBe('Prepare metrics and retro board');
      expect(gTask.status).toBe('needsAction');
    });

    it('propagates completion status changes from Workaholic to Google Tasks', async () => {
      // 1. Create and export task
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Fix Critical Production Bug',
        status: 'TODO',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'TASK',
        nativeTask.id,
      );

      // 2. Mark native task COMPLETED
      await tasksRepo.updateTask(nativeTask.id, workspaceA.id, {
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      });

      // 3. Sync
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      // 4. Verify Google task is now completed
      const gTask = await mockAdapter.getTask('token', '@default', mapping.externalObjectId);
      expect(gTask.status).toBe('completed');
      expect(gTask.completed).toBeDefined();
    });

    it('propagates task reopen status changes from Workaholic to Google Tasks', async () => {
      // 1. Create and complete task
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Verify Regression Tests',
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'TASK',
        nativeTask.id,
      );

      // 2. Reopen native task to TODO
      await tasksRepo.updateTask(nativeTask.id, workspaceA.id, {
        status: 'TODO',
        completedAt: null,
      });

      // 3. Sync
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      // 4. Verify Google task status is needsAction
      const gTask = await mockAdapter.getTask('token', '@default', mapping.externalObjectId);
      expect(gTask.status).toBe('needsAction');
    });
  });

  // =========================================================================
  // 5. Rich Feature Preservation (TM-GTASK-005 / REQ-GTASK-004)
  // =========================================================================
  describe('Rich Feature Preservation (TM-GTASK-005 / REQ-GTASK-004)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('preserves native Workaholic-only fields (priority, labels, duration) without data loss', async () => {
      // 1. Create rich native task with Workaholic-only features
      const richTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Architect Micro-Frontend System',
        description: 'Detailed architectural proposal',
        priority: 'P0', // Critical Workaholic priority
        labels: ['architecture', 'q4-initiative', 'frontend'],
        estimatedDuration: 180, // 3 hours
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      // 2. Sync to Google Tasks
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'TASK',
        richTask.id,
      );

      // 3. Modify title in Google Tasks to trigger external update
      await mockAdapter.updateTask('token', '@default', mapping.externalObjectId, {
        title: 'Architect Micro-Frontend System (Updated in Google)',
      });

      // 4. Sync back from Google Tasks
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      // 5. Verify rich native fields are preserved and NOT wiped or replaced with defaults!
      const reloadedTask = await tasksRepo.findTaskById(richTask.id, workspaceA.id);
      expect(reloadedTask.title).toBe('Architect Micro-Frontend System (Updated in Google)');
      expect(reloadedTask.priority).toBe('P0'); // PRESERVED
      expect(reloadedTask.estimatedDuration).toBe(180); // PRESERVED
    });
  });

  // =========================================================================
  // 6. Conflict Resolution & Idempotency (TM-GTASK-006)
  // =========================================================================
  describe('Conflict Resolution & Convergence (TM-GTASK-006)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('Case A: Only native changed -> native authoritative, pushes to Google Tasks', async () => {
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Case A Task Initial',
        description: 'Initial description',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'TASK',
        nativeTask.id,
      );

      // Update only native
      await tasksRepo.updateTask(nativeTask.id, workspaceA.id, {
        title: 'Case A Task Native Edited',
      });

      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const gTask = await mockAdapter.getTask('token', '@default', mapping.externalObjectId);
      expect(gTask.title).toBe('Case A Task Native Edited');
    });

    it('Case B: Only external changed -> external authoritative, updates Workaholic', async () => {
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Case B Task Initial',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'TASK',
        nativeTask.id,
      );

      // Update only external Google task
      await mockAdapter.updateTask('token', '@default', mapping.externalObjectId, {
        title: 'Case B Task External Edited',
      });

      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const reloaded = await tasksRepo.findTaskById(nativeTask.id, workspaceA.id);
      expect(reloaded.title).toBe('Case B Task External Edited');
    });

    it('Case C: Both changed -> deterministic conflict resolution (timestamp-based or native priority)', async () => {
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Case C Task Initial',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });
      await googleTasksSyncService.syncTasks(userA.id, workspaceA.id, primaryListMapping.id);

      const mapping = await extMappingsRepo.findMappingByNativeId(
        'GOOGLE',
        userA.id,
        'TASK',
        nativeTask.id,
      );

      // Both changed simultaneously
      await tasksRepo.updateTask(nativeTask.id, workspaceA.id, {
        title: 'Case C Native Conflict Edit',
      });
      await mockAdapter.updateTask('token', '@default', mapping.externalObjectId, {
        title: 'Case C External Conflict Edit',
      });

      const syncResult = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        primaryListMapping.id,
      );

      // Conflict must be resolved deterministically without crashing or deadlock
      expect(syncResult.conflicts).toBeDefined();

      const reloaded = await tasksRepo.findTaskById(nativeTask.id, workspaceA.id);
      expect(reloaded).toBeDefined();
      expect(reloaded.title).toMatch(/Case C (Native|External) Conflict Edit/);
    });

    it('Case D: Neither changed -> no mutations performed, fast path', async () => {
      const result = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        primaryListMapping.id,
      );
      expect(result.conflicts).toBe(0);
    });

    it('Case E: Repeated synchronization converges and remains idempotent', async () => {
      const _res1 = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        primaryListMapping.id,
      );
      const res2 = await googleTasksSyncService.syncTasks(
        userA.id,
        workspaceA.id,
        primaryListMapping.id,
      );

      expect(res2.conflicts).toBe(0);
      expect(res2.imported).toBe(0);
      expect(res2.exported).toBe(0);
    });
  });

  // =========================================================================
  // 7. Background Job Queue Execution (TM-GTASK-007)
  // =========================================================================
  describe('Background Job Queue Execution (TM-GTASK-007)', () => {
    beforeEach(async () => {
      await ensureConnectedAndMapped();
    });

    it('enqueues and processes Google Tasks sync job via Phase 12 JobWorker', async () => {
      const job = await enqueueGoogleTasksSync(userA.id, workspaceA.id, primaryListMapping.id);
      expect(job).toBeDefined();
      expect(job.jobType).toBe(JOB_TYPE.GOOGLE_TASKS_SYNC);

      const worker = new JobWorker({
        queue: jobQueue,
        queueName: 'sync',
        pollIntervalMs: 50,
      });

      worker.start();

      let jobRecord;
      for (let i = 0; i < 20; i++) {
        jobRecord = await jobQueue.getJob(job.id);
        if (jobRecord && jobRecord.status === JOB_STATUS.COMPLETED) break;
        await new Promise(resolve => setTimeout(resolve, 75));
      }
      await worker.stop();

      expect(jobRecord.status).toBe(JOB_STATUS.COMPLETED);
    });

    it('handles transient rate limit errors with retryable failure', async () => {
      mockAdapter.setShouldFailRateLimit(true);

      const job = await enqueueGoogleTasksSync(userA.id, workspaceA.id, primaryListMapping.id);

      const worker = new JobWorker({
        queue: jobQueue,
        queueName: 'sync',
        pollIntervalMs: 50,
      });

      worker.start();

      let jobRecord;
      for (let i = 0; i < 20; i++) {
        jobRecord = await jobQueue.getJob(job.id);
        if (
          jobRecord &&
          jobRecord.attempts >= 1 &&
          (jobRecord.status === JOB_STATUS.PENDING || jobRecord.status === JOB_STATUS.FAILED)
        ) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 75));
      }
      await worker.stop();

      expect([JOB_STATUS.PENDING, JOB_STATUS.FAILED]).toContain(jobRecord.status);
      expect(jobRecord.attempts).toBeGreaterThanOrEqual(1);

      mockAdapter.setShouldFailRateLimit(false);
    });
  });

  // =========================================================================
  // 8. Disconnect Safety & Data Preservation (TM-GTASK-008 / REQ-GTASK-005)
  // =========================================================================
  describe('Disconnect Safety & Data Preservation (TM-GTASK-008 / REQ-GTASK-005)', () => {
    it('disconnecting Google Tasks preserves all native Workaholic tasks and projects', async () => {
      await ensureConnectedAndMapped();

      // Create a native task in the synchronized project
      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: primaryListMapping.nativeObjectId,
        title: 'Critical Project Task to Preserve',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      // Perform disconnect
      const disconnectRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/tasks/disconnect',
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(disconnectRes.statusCode).toBe(200);
      expect(disconnectRes.json().data.disconnected).toBe(true);

      // INVARIANT CHECK: Native task MUST still exist in database
      const preservedTask = await tasksRepo.findTaskById(nativeTask.id, workspaceA.id);
      expect(preservedTask).toBeDefined();
      expect(preservedTask.title).toBe('Critical Project Task to Preserve');

      // INVARIANT CHECK: Native project MUST still exist in database
      const preservedProject = await projectsRepo.findProjectById(
        primaryListMapping.nativeObjectId,
        workspaceA.id,
      );
      expect(preservedProject).toBeDefined();

      // Mappings for TASKS should be removed
      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      const taskMappings = mappings.filter(
        m => m.externalObjectType === 'TASK' || m.externalObjectType === 'TASK_LIST',
      );
      expect(taskMappings.length).toBe(0);
    });

    it('disconnecting Google Tasks preserves Google Calendar authorization, mappings, and events when both are connected', async () => {
      // 1. Set up both Calendar and Tasks mock adapters
      const calAdapter = new MockGoogleCalendarAdapter();
      googleCalendarSyncService.adapter = calAdapter;
      mockAdapter = new MockGoogleTasksAdapter();
      googleTasksSyncService.adapter = mockAdapter;

      // 2. Authorize Calendar
      const calState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'CALENDAR',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_code_calendar_dual',
        state: calState,
        service: 'CALENDAR',
      });

      // 3. Authorize Tasks
      const tasksState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'TASKS',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_code_tasks_dual',
        state: tasksState,
        service: 'TASKS',
      });

      // 4. Discover calendars & task lists
      const [calMapping] = await googleCalendarSyncService.discoverCalendars(
        userA.id,
        workspaceA.id,
        calAdapter,
      );
      const [taskMapping] = await googleTasksSyncService.discoverTaskLists(
        userA.id,
        workspaceA.id,
        mockAdapter,
      );

      // 5. Create native calendar event and native task
      const nativeEvent = await eventsRepo.createEvent({
        calendarId: calMapping.calendarId,
        workspaceId: workspaceA.id,
        title: 'Important Preserved Calendar Meeting',
        startAt: '2026-10-15T10:00:00.000Z',
        endAt: '2026-10-15T11:00:00.000Z',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      const nativeTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        projectId: taskMapping.nativeProjectId,
        title: 'Tasks Todo to Disconnect',
        sourceType: 'WORKAHOLIC',
        createdBy: userA.id,
      });

      // Map event
      await extMappingsRepo.upsertMapping({
        workspaceId: workspaceA.id,
        userId: userA.id,
        provider: 'GOOGLE',
        externalAccountId: calMapping.externalAccountId,
        externalObjectType: 'EVENT',
        externalObjectId: 'google_event_dual_test',
        nativeObjectType: 'EVENT',
        nativeObjectId: nativeEvent.id,
        syncState: SYNC_STATE.IN_SYNC,
      });

      // Map task
      await extMappingsRepo.upsertMapping({
        workspaceId: workspaceA.id,
        userId: userA.id,
        provider: 'GOOGLE',
        externalAccountId: taskMapping.externalAccountId,
        externalObjectType: 'TASK',
        externalObjectId: 'google_task_dual_test',
        nativeObjectType: 'TASK',
        nativeObjectId: nativeTask.id,
        syncState: SYNC_STATE.IN_SYNC,
      });

      // 6. Verify before disconnect: both services report CONNECTED
      const calStatusBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/calendar/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(calStatusBefore.json().data.status).toBe('CONNECTED');
      expect(calStatusBefore.json().data.connected).toBe(true);

      const tasksStatusBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/tasks/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(tasksStatusBefore.json().data.status).toBe('CONNECTED');
      expect(tasksStatusBefore.json().data.connected).toBe(true);

      // 7. Disconnect Tasks via API
      const disconnectRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/tasks/disconnect',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(disconnectRes.statusCode).toBe(200);
      expect(disconnectRes.json().data.disconnected).toBe(true);

      // 8. CRITICAL INVARIANT: Tasks is DISCONNECTED, Calendar remains CONNECTED
      const tasksStatusAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/tasks/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(tasksStatusAfter.json().data.status).toBe('DISCONNECTED');
      expect(tasksStatusAfter.json().data.connected).toBe(false);

      const calStatusAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/calendar/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(calStatusAfter.json().data.status).toBe('CONNECTED');
      expect(calStatusAfter.json().data.connected).toBe(true);

      // 9. Calendar mappings MUST REMAIN intact and active
      const calMappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE', 'CALENDAR');
      expect(calMappings.length).toBeGreaterThan(0);
      const eventMappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE', 'EVENT');
      expect(eventMappings.length).toBeGreaterThan(0);

      // 10. Native event MUST STILL EXIST
      const preservedEvent = await eventsRepo.findEventById(nativeEvent.id, workspaceA.id);
      expect(preservedEvent).toBeDefined();
      expect(preservedEvent.title).toBe('Important Preserved Calendar Meeting');

      // 11. Native task MUST STILL EXIST
      const preservedTask = await tasksRepo.findTaskById(nativeTask.id, workspaceA.id);
      expect(preservedTask).toBeDefined();
      expect(preservedTask.title).toBe('Tasks Todo to Disconnect');

      // 12. Task mappings must be purged
      const taskMappingsAfter = await extMappingsRepo.findMappingsByUser(
        userA.id,
        'GOOGLE',
        'TASK',
      );
      expect(taskMappingsAfter.length).toBe(0);
    });
  });
});
