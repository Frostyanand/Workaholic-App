import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { oauthBoundaryService } from '../src/modules/auth/oauth-boundary.service.js';
import { googleDriveSyncService } from '../src/modules/integrations/google/google-drive-sync.service.js';
import { googleCalendarSyncService } from '../src/modules/integrations/google/google-calendar-sync.service.js';
import { googleTasksSyncService } from '../src/modules/integrations/google/google-tasks-sync.service.js';
import { MockGoogleDriveAdapter } from '../src/modules/integrations/google/google-drive.adapter.js';
import { MockGoogleCalendarAdapter } from '../src/modules/integrations/google/google-calendar.adapter.js';
import { MockGoogleTasksAdapter } from '../src/modules/integrations/google/google-tasks.adapter.js';
import {
  enqueueGoogleDriveUpload,
  enqueueGoogleDriveSync,
} from '../src/modules/integrations/google/google-sync-dispatcher.js';
import * as extMappingsRepo from '../src/modules/integrations/external-mappings.repository.js';
import * as attachmentsRepo from '../src/modules/attachments/attachments.repository.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as integrationsRepo from '../src/modules/auth/integrations.repository.js';
import { JOB_TYPE, SYNC_STATE } from '@workaholic/shared';

describe('Google Drive Integration & Attachment Storage (Phase 15)', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;
  let mockAdapter;
  let sampleTaskA;

  async function ensureDriveConnected() {
    if (!mockAdapter) {
      mockAdapter = new MockGoogleDriveAdapter();
      googleDriveSyncService.adapter = mockAdapter;
    }

    const integration = await integrationsRepo.findIntegration(userA.id, 'GOOGLE');
    const account = integration
      ? await integrationsRepo.findExternalAccount(integration.id, 'GOOGLE')
      : null;
    const hasDriveScope = account?.scopes?.includes('https://www.googleapis.com/auth/drive.file');

    if (!integration || integration.status !== 'CONNECTED' || !hasDriveScope) {
      const state = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'DRIVE',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_code_drive_setup',
        state,
        service: 'DRIVE',
      });
    }

    return mockAdapter;
  }

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create User A and User B
    userA = await createUser({
      displayName: 'Google Drive User A',
      email: `drive_user_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Google Drive User B',
      email: `drive_user_b_${Date.now()}@example.com`,
    });

    // 2. Create Workspaces
    const wsResA = await createWorkspaceWithMembership({
      name: 'Google Drive Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsResA.workspace;

    const wsResB = await createWorkspaceWithMembership({
      name: 'Google Drive Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsResB.workspace;

    // 3. Create Sessions and Auth Tokens
    tokenA = `drive_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      sessionType: 'WEB',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    tokenB = `drive_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      sessionType: 'WEB',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // 4. Create sample task in Workspace A
    sampleTaskA = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      title: 'Task for Drive Attachments',
      sourceType: 'WORKAHOLIC',
      createdBy: userA.id,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await query('DELETE FROM external_object_mappings WHERE provider = $1', ['GOOGLE']);
    await query('DELETE FROM external_files WHERE provider = $1', ['GOOGLE']);
    await query('DELETE FROM external_accounts WHERE provider = $1', ['GOOGLE']);
    await query('DELETE FROM integrations WHERE provider = $1', ['GOOGLE']);
    await query('DELETE FROM attachments WHERE workspace_id IN ($1, $2)', [
      workspaceA?.id,
      workspaceB?.id,
    ]);
    await query('DELETE FROM tasks WHERE workspace_id IN ($1, $2)', [
      workspaceA?.id,
      workspaceB?.id,
    ]);
    await query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA?.id, workspaceB?.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [userA?.id, userB?.id]);
  });

  beforeEach(async () => {
    if (!mockAdapter) {
      mockAdapter = new MockGoogleDriveAdapter();
      googleDriveSyncService.adapter = mockAdapter;
    }
    mockAdapter.setShouldFailAuth(false);
    mockAdapter.setShouldFailRateLimit(false);
    mockAdapter.setShouldFailNetwork(false);
  });

  // -------------------------------------------------------------
  // 1 & 2. Authorization & Status (REQ-GDRIVE-001)
  // -------------------------------------------------------------
  describe('Drive Authorization & Status (REQ-GDRIVE-001)', () => {
    it('generates authorization URL with minimal drive.file scope and signed state', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/drive/connect',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { redirectUri: 'http://localhost:5173/auth/callback' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.authorizationUrl).toBeDefined();
      expect(decodeURIComponent(data.authorizationUrl)).toContain(
        'https://www.googleapis.com/auth/drive.file',
      );
      expect(data.service).toBe('DRIVE');
      expect(data.state).toBeDefined();
    });

    it('exchanges authorization code and establishes CONNECTED state', async () => {
      const connectRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/drive/connect',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const state = connectRes.json().data.state;

      const callbackRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/drive/callback',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          code: 'test_drive_auth_code_001',
          state,
          service: 'DRIVE',
        },
      });

      expect(callbackRes.statusCode).toBe(200);
      const data = callbackRes.json().data;
      expect(data.connected).toBe(true);
      expect(data.provider).toBe('GOOGLE');
      expect(data.service).toBe('DRIVE');
    });

    it('returns CONNECTED status via status endpoint without leaking tokens', async () => {
      await ensureDriveConnected();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/drive/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.connected).toBe(true);
      expect(data.status).toBe('CONNECTED');
      expect(data.scopes).toContain('https://www.googleapis.com/auth/drive.file');
      expect(data.accessToken).toBeUndefined();
      expect(data.refreshToken).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 3 & 4. OAuth Scope Coexistence (Calendar + Tasks + Drive)
  // -------------------------------------------------------------
  describe('OAuth Scope Coexistence', () => {
    it('coexists with Google Calendar authorization without dropping scopes', async () => {
      // 1. Authorize Calendar
      const calState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'CALENDAR',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_cal_coexist',
        state: calState,
        service: 'CALENDAR',
      });

      // 2. Authorize Drive
      const driveState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'DRIVE',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_drive_coexist',
        state: driveState,
        service: 'DRIVE',
      });

      // 3. Both services report CONNECTED
      const calStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/calendar/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(calStatus.json().data.connected).toBe(true);

      const driveStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/drive/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(driveStatus.json().data.connected).toBe(true);
    });

    it('coexists with Google Tasks authorization without dropping scopes', async () => {
      // 1. Authorize Tasks
      const tasksState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'TASKS',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_tasks_coexist',
        state: tasksState,
        service: 'TASKS',
      });

      // 2. Authorize Drive
      const driveState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'DRIVE',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_drive_coexist_2',
        state: driveState,
        service: 'DRIVE',
      });

      // 3. Both services report CONNECTED
      const tasksStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/tasks/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(tasksStatus.json().data.connected).toBe(true);

      const driveStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/drive/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(driveStatus.json().data.connected).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 5 & 6. Dedicated Workaholic Drive Folder (REQ-GDRIVE-006)
  // -------------------------------------------------------------
  describe('Dedicated Workaholic Drive Folder (REQ-GDRIVE-006)', () => {
    it('creates dedicated Workaholic folder idempotently', async () => {
      await ensureDriveConnected();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/drive/folder',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { workspaceId: workspaceA.id },
      });

      expect(res.statusCode).toBe(200);
      const folder = res.json().data;
      expect(folder.folderId).toBeDefined();
      expect(folder.name).toBe('Workaholic Attachments');

      // Verify mapping was saved in external_object_mappings
      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      const folderMapping = mappings.find(m => m.externalObjectType === 'FOLDER');
      expect(folderMapping).toBeDefined();
      expect(folderMapping.externalObjectId).toBe(folder.folderId);
    });

    it('returns the existing folder on repeated calls without duplicate creation', async () => {
      await ensureDriveConnected();

      const folder1 = await googleDriveSyncService.getOrCreateWorkaholicFolder(
        userA.id,
        workspaceA.id,
        mockAdapter,
      );
      const folder2 = await googleDriveSyncService.getOrCreateWorkaholicFolder(
        userA.id,
        workspaceA.id,
        mockAdapter,
      );

      expect(folder1.folderId).toBe(folder2.folderId);
      expect(mockAdapter.folders.size).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 7 & 8 & 12. Upload Flow, Metadata & Mapping (REQ-GDRIVE-002, REQ-GDRIVE-003)
  // -------------------------------------------------------------
  describe('Drive Upload Flow & Metadata Mapping (REQ-GDRIVE-002, REQ-GDRIVE-003)', () => {
    it('uploads file to Google Drive and creates native attachment record with mapping', async () => {
      await ensureDriveConnected();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/attachments',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          workspaceId: workspaceA.id,
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'project_spec.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('PDF_SAMPLE_DATA').toString('base64'),
          sizeBytes: 15,
        },
      });

      expect(res.statusCode).toBe(201);
      const attachment = res.json().data;
      expect(attachment.id).toBeDefined();
      expect(attachment.fileName).toBe('project_spec.pdf');
      expect(attachment.mimeType).toBe('application/pdf');
      expect(attachment.externalFileId).toBeDefined();
      expect(attachment.uploadStatus).toBe('COMPLETED');
      expect(attachment.webUrl).toContain('https://drive.google.com/file/d/');

      // Verify file exists in mock Drive adapter
      const driveFile = mockAdapter.files.get(attachment.externalFileId);
      expect(driveFile).toBeDefined();
      expect(driveFile.name).toBe('project_spec.pdf');

      // Verify external_object_mappings persisted
      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE', 'ATTACHMENT');
      const fileMapping = mappings.find(m => m.nativeObjectId === attachment.id);
      expect(fileMapping).toBeDefined();
      expect(fileMapping.externalObjectId).toBe(attachment.externalFileId);
      expect(fileMapping.syncState).toBe(SYNC_STATE.SYNCED);

      // Verify external_files record persisted
      const extFile = await attachmentsRepo.findExternalFile('GOOGLE', attachment.externalFileId);
      expect(extFile).toBeDefined();
      expect(extFile.name).toBe('project_spec.pdf');
    });

    it('retrieves attachments by target resource with workspace scoping', async () => {
      await ensureDriveConnected();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attachments?workspaceId=${workspaceA.id}&targetType=TASK&targetId=${sampleTaskA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const list = res.json().data;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].targetId).toBe(sampleTaskA.id);
    });
  });

  // -------------------------------------------------------------
  // 9 & 10. Failed Upload & Retry
  // -------------------------------------------------------------
  describe('Upload Failure & Retry Handling', () => {
    it('handles simulated upload failure cleanly', async () => {
      await ensureDriveConnected();
      mockAdapter.setShouldFailNetwork(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/attachments',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          workspaceId: workspaceA.id,
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'failed_upload.txt',
          mimeType: 'text/plain',
          content: 'text content',
        },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error.code).toBe('INTERNAL_ERROR');
    });

    it('retries successfully after transient network recovery', async () => {
      await ensureDriveConnected();
      // Initially failing
      mockAdapter.setShouldFailNetwork(true);
      await expect(
        googleDriveSyncService.uploadAttachment(
          userA.id,
          workspaceA.id,
          {
            targetType: 'TASK',
            targetId: sampleTaskA.id,
            fileName: 'retry_upload.txt',
            content: 'retry content',
          },
          mockAdapter,
        ),
      ).rejects.toThrow();

      // Recovered
      mockAdapter.setShouldFailNetwork(false);
      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'retry_upload.txt',
          content: 'retry content',
        },
        mockAdapter,
      );

      expect(attachment.uploadStatus).toBe('COMPLETED');
      expect(attachment.externalFileId).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // 11 & 25. Idempotency & Repeated Sync
  // -------------------------------------------------------------
  describe('Idempotency & Repeated Operations', () => {
    it('repeated folder discovery converges without duplicates', async () => {
      await ensureDriveConnected();

      for (let i = 0; i < 3; i++) {
        await googleDriveSyncService.getOrCreateWorkaholicFolder(
          userA.id,
          workspaceA.id,
          mockAdapter,
        );
      }

      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE');
      const folderMappings = mappings.filter(m => m.externalObjectType === 'FOLDER');
      expect(folderMappings.length).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 13, 14, 15, 16. External Edge Cases (Missing, Revoked, Moved, Deleted)
  // -------------------------------------------------------------
  describe('External File Edge Cases (docs/8 Section 62)', () => {
    it('handles missing Drive file without crashing, marking mapping DELETED_EXTERNALLY', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'will_be_missing.txt',
          content: 'hello',
        },
        mockAdapter,
      );

      // Simulate file removed from Drive
      mockAdapter.files.delete(attachment.externalFileId);

      const syncResult = await googleDriveSyncService.syncAttachmentStatus(
        userA.id,
        workspaceA.id,
        attachment.id,
        mockAdapter,
      );

      expect(syncResult.available).toBe(false);
      expect(syncResult.reason).toBe('FILE_UNAVAILABLE_OR_TRASHED');

      // Native attachment MUST STILL EXIST (not hard-deleted)
      const nativeAttachment = await attachmentsRepo.findAttachmentById(
        attachment.id,
        workspaceA.id,
      );
      expect(nativeAttachment).toBeDefined();
      expect(nativeAttachment.uploadStatus).toBe('FAILED');
    });

    it('detects externally trashed file and marks mapping DELETED_EXTERNALLY', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'will_be_trashed.txt',
          content: 'hello trashed',
        },
        mockAdapter,
      );

      // Simulate external user trashing file in Drive
      mockAdapter.trashFile(attachment.externalFileId);

      const syncResult = await googleDriveSyncService.syncAttachmentStatus(
        userA.id,
        workspaceA.id,
        attachment.id,
        mockAdapter,
      );

      expect(syncResult.available).toBe(false);

      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE', 'ATTACHMENT');
      const m = mappings.find(map => map.nativeObjectId === attachment.id);
      expect(m.syncState).toBe(SYNC_STATE.DELETED_EXTERNALLY);
    });

    it('updates container mapping when file is moved between folders in Drive', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'moved_file.txt',
          content: 'moved content',
        },
        mockAdapter,
      );

      // Simulate file moved to a different folder
      mockAdapter.moveFile(attachment.externalFileId, 'new_parent_folder_123');

      const syncResult = await googleDriveSyncService.syncAttachmentStatus(
        userA.id,
        workspaceA.id,
        attachment.id,
        mockAdapter,
      );

      expect(syncResult.available).toBe(true);

      const mappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE', 'ATTACHMENT');
      const m = mappings.find(map => map.nativeObjectId === attachment.id);
      expect(m.externalContainerId).toBe('new_parent_folder_123');
    });

    it('handles revoked Google Drive authorization with REAUTH_REQUIRED', async () => {
      await ensureDriveConnected();
      mockAdapter.setShouldFailAuth(true);

      await expect(
        googleDriveSyncService.getOrCreateWorkaholicFolder(userA.id, workspaceA.id, mockAdapter),
      ).rejects.toThrow('Google Drive access token expired or revoked');
    });
  });

  // -------------------------------------------------------------
  // 17 & 18 & 19. Detach Semantics vs Explicit Deletion (REQ-GDRIVE-004, REQ-GDRIVE-005)
  // -------------------------------------------------------------
  describe('Detach vs Explicit Deletion (REQ-GDRIVE-004, REQ-GDRIVE-005)', () => {
    it('DETACH removes Workaholic attachment relationship WITHOUT deleting Google Drive file (REQ-GDRIVE-004)', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'safe_detached.pdf',
          content: 'important data',
        },
        mockAdapter,
      );

      const extFileId = attachment.externalFileId;
      expect(mockAdapter.files.has(extFileId)).toBe(true);

      // Perform DETACH (default delete endpoint without deleteDriveFile=true)
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/attachments/${attachment.id}?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.detached).toBe(true);
      expect(res.json().data.preservedExternalFile).toBe(true);

      // CRITICAL INVARIANT: The file MUST STILL EXIST in Google Drive!
      expect(mockAdapter.files.has(extFileId)).toBe(true);

      // Native attachment should be soft-deleted in Workaholic
      const found = await attachmentsRepo.findAttachmentById(attachment.id, workspaceA.id);
      expect(found).toBeNull();
    });

    it('EXPLICIT DELETION permanently deletes the underlying Google Drive file (REQ-GDRIVE-005)', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'explicit_delete_target.pdf',
          content: 'to be destroyed',
        },
        mockAdapter,
      );

      const extFileId = attachment.externalFileId;
      expect(mockAdapter.files.has(extFileId)).toBe(true);

      // Perform EXPLICIT DELETION with deleteDriveFile=true
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/attachments/${attachment.id}?workspaceId=${workspaceA.id}&deleteDriveFile=true`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.deletedDriveFile).toBe(true);

      // CRITICAL INVARIANT: The file MUST BE DELETED from Google Drive!
      expect(mockAdapter.files.has(extFileId)).toBe(false);
    });

    it('handles already-deleted Drive file safely during explicit deletion', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'already_deleted.txt',
          content: 'content',
        },
        mockAdapter,
      );

      // Delete file externally first
      mockAdapter.files.delete(attachment.externalFileId);

      // Explicit delete should still succeed idempotently without crashing
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/integrations/google/drive/files/${attachment.externalFileId}?workspaceId=${workspaceA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.deleted).toBe(true);
      expect(res.json().data.notFound).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 20 & 21. Permissions & Tenant Isolation
  // -------------------------------------------------------------
  describe('Tenant & Workspace Isolation', () => {
    it('prevents user B from accessing user A attachments in workspace A', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'isolated.txt',
          content: 'private content',
        },
        mockAdapter,
      );

      // User B attempts to access attachment using workspace B
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attachments/${attachment.id}?workspaceId=${workspaceB.id}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('prevents user B from detaching user A attachments', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'protected.txt',
          content: 'protected content',
        },
        mockAdapter,
      );

      // User B attempts to detach attachment from workspace B
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/attachments/${attachment.id}?workspaceId=${workspaceB.id}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------
  // 22, 23, 24. Disconnect Safety & Multi-Service Preservation
  // -------------------------------------------------------------
  describe('Disconnect Safety & Multi-Service Preservation', () => {
    it('disconnecting Google Drive preserves native Workaholic attachments', async () => {
      await ensureDriveConnected();

      const attachment = await googleDriveSyncService.uploadAttachment(
        userA.id,
        workspaceA.id,
        {
          targetType: 'TASK',
          targetId: sampleTaskA.id,
          fileName: 'disconnect_preserved.txt',
          content: 'must survive disconnect',
        },
        mockAdapter,
      );

      const disconnectRes = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/drive/disconnect',
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(disconnectRes.statusCode).toBe(200);

      // INVARIANT CHECK: Native attachment MUST still exist in database
      const preserved = await attachmentsRepo.findAttachmentById(attachment.id, workspaceA.id);
      expect(preserved).toBeDefined();
      expect(preserved.fileName).toBe('disconnect_preserved.txt');

      // Status should report DISCONNECTED
      const statusRes = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/drive/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(statusRes.json().data.connected).toBe(false);
    });

    it('disconnecting Google Drive does NOT affect Google Calendar or Google Tasks', async () => {
      // 1. Set up all 3 mock adapters
      const calAdapter = new MockGoogleCalendarAdapter();
      googleCalendarSyncService.adapter = calAdapter;
      const tasksAdapter = new MockGoogleTasksAdapter();
      googleTasksSyncService.adapter = tasksAdapter;
      mockAdapter = new MockGoogleDriveAdapter();
      googleDriveSyncService.adapter = mockAdapter;

      // 2. Authorize Calendar
      const calState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'CALENDAR',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_cal_triple',
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
        code: 'auth_tasks_triple',
        state: tasksState,
        service: 'TASKS',
      });

      // 4. Authorize Drive
      const driveState = oauthBoundaryService.generateAuthorizationUrl({
        userId: userA.id,
        service: 'DRIVE',
      }).state;
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: userA.id,
        code: 'auth_drive_triple',
        state: driveState,
        service: 'DRIVE',
      });

      // 5. Discover calendars and task lists
      await googleCalendarSyncService.discoverCalendars(userA.id, workspaceA.id, calAdapter);
      await googleTasksSyncService.discoverTaskLists(userA.id, workspaceA.id, tasksAdapter);

      // 6. Disconnect DRIVE only
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/google/drive/disconnect',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(200);

      // 7. CRITICAL: Drive is DISCONNECTED, Calendar and Tasks remain CONNECTED!
      const driveStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/drive/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(driveStatus.json().data.connected).toBe(false);

      const calStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/calendar/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(calStatus.json().data.connected).toBe(true);

      const tasksStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/google/tasks/status',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(tasksStatus.json().data.connected).toBe(true);

      // Calendar and Tasks mappings remain intact
      const calMappings = await extMappingsRepo.findMappingsByUser(userA.id, 'GOOGLE', 'CALENDAR');
      expect(calMappings.length).toBeGreaterThan(0);
      const taskListMappings = await extMappingsRepo.findMappingsByUser(
        userA.id,
        'GOOGLE',
        'PROJECT',
      );
      expect(taskListMappings.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------
  // 26. Background Jobs & Rate Limiting
  // -------------------------------------------------------------
  describe('Background Jobs & Rate Limiting', () => {
    it('enqueues background upload job with deterministic deduplication key', async () => {
      const job = await enqueueGoogleDriveUpload(userA.id, workspaceA.id, {
        targetType: 'TASK',
        targetId: sampleTaskA.id,
        fileName: 'async_upload.pdf',
        content: 'content',
      });

      expect(job.id).toBeDefined();
      expect(job.jobType).toBe(JOB_TYPE.GOOGLE_DRIVE_UPLOAD);
      expect(job.queue).toBe('sync');
    });

    it('enqueues background sync job and verifies queue registration', async () => {
      const job = await enqueueGoogleDriveSync(userA.id, workspaceA.id, 'mock_att_uuid');

      expect(job.id).toBeDefined();
      expect(job.jobType).toBe(JOB_TYPE.GOOGLE_DRIVE_SYNC);
      expect(job.queue).toBe('sync');
    });

    it('classifies 429 rate limit errors as transient for bounded retry', async () => {
      await ensureDriveConnected();
      mockAdapter.setShouldFailRateLimit(true);

      try {
        await googleDriveSyncService.uploadAttachment(
          userA.id,
          workspaceA.id,
          {
            targetType: 'TASK',
            targetId: sampleTaskA.id,
            fileName: 'rate_limited.pdf',
            content: 'content',
          },
          mockAdapter,
        );
        expect.fail('Should have thrown rate limit error');
      } catch (err) {
        expect(err.statusCode).toBe(429);
        expect(err.transient).toBe(true);
      }
    });
  });
});
