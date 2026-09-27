import { requireAuth } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../core/response.js';
import { validateBody } from '../../core/validation.js';
import { oauthBoundaryService } from '../auth/oauth-boundary.service.js';
import { googleCalendarSyncService } from './google/google-calendar-sync.service.js';
import { googleTasksSyncService } from './google/google-tasks-sync.service.js';
import { googleDriveSyncService } from './google/google-drive-sync.service.js';
import {
  enqueueGoogleCalendarSync,
  enqueueGoogleTasksSync,
  enqueueGoogleDriveUpload,
  enqueueGoogleDriveSync,
} from './google/google-sync-dispatcher.js';
import {
  googleConnectSchema,
  googleCallbackSchema,
  googleSyncOptionsSchema,
  googleTasksSyncOptionsSchema,
  googleDriveUploadSchema,
  googleDriveSyncOptionsSchema,
  syncDiagnosticQuerySchema,
  syncRecoverySchema,
} from '@workaholic/shared';
import * as syncDiagRepo from './sync-diagnostics.repository.js';
import { syncCoordinator } from './sync-coordinator.js';
import { pool } from '../../core/db.js';

/**
 * Fastify plugin for External Integrations API
 * Conforms to docs/15.API-SPECIFICATION.md Section 62 & 63
 */
export async function integrationsRoutes(fastify) {
  // 1. GET /api/v1/integrations - List user's external integrations
  fastify.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const googleStatus = await oauthBoundaryService.getIntegrationStatus(request.user.id);
    const integrations = [
      {
        provider: 'GOOGLE',
        ...googleStatus,
      },
    ];
    return sendSuccess(reply, integrations);
  });

  // 2. POST /api/v1/integrations/google/calendar/connect - Initiate Google Calendar OAuth
  fastify.post(
    '/google/calendar/connect',
    {
      preHandler: [requireAuth, validateBody(googleConnectSchema)],
    },
    async (request, reply) => {
      const { redirectUri } = request.body || {};
      const auth = oauthBoundaryService.generateAuthorizationUrl({
        userId: request.user.id,
        service: 'CALENDAR',
        redirectUri,
      });
      return sendSuccess(reply, auth);
    },
  );

  // 3. POST /api/v1/integrations/google/calendar/callback - Complete Google Calendar OAuth
  fastify.post(
    '/google/calendar/callback',
    {
      preHandler: [requireAuth, validateBody(googleCallbackSchema)],
    },
    async (request, reply) => {
      const { code, state, service = 'CALENDAR' } = request.body;
      const result = await oauthBoundaryService.exchangeAuthorizationCode({
        userId: request.user.id,
        code,
        state,
        service,
      });

      // Auto-discover calendars if workspace context is present
      const workspaceId = request.workspace?.id;
      let discoveredCalendars = [];
      if (workspaceId) {
        try {
          discoveredCalendars = await googleCalendarSyncService.discoverCalendars(
            request.user.id,
            workspaceId,
          );
        } catch {
          // Non-fatal on callback; user can discover later
        }
      }

      return sendSuccess(reply, {
        ...result,
        discoveredCalendars,
      });
    },
  );

  // 4. GET /api/v1/integrations/google/calendar/status - Get Calendar integration status
  fastify.get('/google/calendar/status', { preHandler: [requireAuth] }, async (request, reply) => {
    const status = await oauthBoundaryService.getIntegrationStatus(request.user.id, 'CALENDAR');
    return sendSuccess(reply, status);
  });

  // 5. GET /api/v1/integrations/google/calendar/calendars - Discover/list Google calendars
  fastify.get(
    '/google/calendar/calendars',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const workspaceId = request.query?.workspaceId || request.workspace?.id;
      if (!workspaceId) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'workspaceId query parameter or workspace context is required',
            requestId: request.id,
          },
        });
      }

      const calendars = await googleCalendarSyncService.discoverCalendars(
        request.user.id,
        workspaceId,
      );
      return sendSuccess(reply, calendars);
    },
  );

  // 6. POST /api/v1/integrations/google/calendar/sync - Trigger synchronization
  fastify.post(
    '/google/calendar/sync',
    {
      preHandler: [requireAuth, validateBody(googleSyncOptionsSchema)],
    },
    async (request, reply) => {
      const workspaceId = request.query?.workspaceId || request.workspace?.id;
      if (!workspaceId) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'workspaceId query parameter or workspace context is required',
            requestId: request.id,
          },
        });
      }

      const { calendarMappingId, force = false } = request.body || {};
      const runAsync = request.query?.async === 'true' || request.body?.async === true;

      if (runAsync) {
        // Enqueue background job via Phase 12 JobQueue
        const job = await enqueueGoogleCalendarSync(
          request.user.id,
          workspaceId,
          calendarMappingId,
          { force },
        );
        return sendSuccess(reply, {
          jobId: job.id,
          status: 'QUEUED',
          message: 'Google Calendar synchronization queued in background',
        });
      }

      // Synchronous execution
      const result = await googleCalendarSyncService.syncCalendar(
        request.user.id,
        workspaceId,
        calendarMappingId,
        { force },
      );
      return sendSuccess(reply, result);
    },
  );

  // 7. POST /api/v1/integrations/google/calendar/disconnect - Disconnect Google Calendar
  fastify.post(
    '/google/calendar/disconnect',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await googleCalendarSyncService.disconnect(request.user.id);
      return sendSuccess(reply, result);
    },
  );

  // 8. POST /api/v1/integrations/google/tasks/connect - Initiate Google Tasks OAuth
  fastify.post(
    '/google/tasks/connect',
    {
      preHandler: [requireAuth, validateBody(googleConnectSchema)],
    },
    async (request, reply) => {
      const { redirectUri } = request.body || {};
      const auth = oauthBoundaryService.generateAuthorizationUrl({
        userId: request.user.id,
        service: 'TASKS',
        redirectUri,
      });
      return sendSuccess(reply, auth);
    },
  );

  // 9. POST /api/v1/integrations/google/tasks/callback - Complete Google Tasks OAuth
  fastify.post(
    '/google/tasks/callback',
    {
      preHandler: [requireAuth, validateBody(googleCallbackSchema)],
    },
    async (request, reply) => {
      const { code, state, service = 'TASKS' } = request.body;
      const result = await oauthBoundaryService.exchangeAuthorizationCode({
        userId: request.user.id,
        code,
        state,
        service,
      });

      // Auto-discover task lists if workspace context is present
      const workspaceId = request.workspace?.id;
      let discoveredTaskLists = [];
      if (workspaceId) {
        try {
          discoveredTaskLists = await googleTasksSyncService.discoverTaskLists(
            request.user.id,
            workspaceId,
          );
        } catch {
          // Non-fatal on callback; user can discover later
        }
      }

      return sendSuccess(reply, {
        ...result,
        discoveredTaskLists,
      });
    },
  );

  // 10. GET /api/v1/integrations/google/tasks/status - Get Google Tasks integration status
  fastify.get('/google/tasks/status', { preHandler: [requireAuth] }, async (request, reply) => {
    const status = await oauthBoundaryService.getIntegrationStatus(request.user.id, 'TASKS');
    return sendSuccess(reply, status);
  });

  // 11. GET /api/v1/integrations/google/tasks/task-lists - Discover/list Google task lists
  fastify.get('/google/tasks/task-lists', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId = request.query?.workspaceId || request.workspace?.id;
    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId query parameter or workspace context is required',
          requestId: request.id,
        },
      });
    }

    const taskLists = await googleTasksSyncService.discoverTaskLists(request.user.id, workspaceId);
    return sendSuccess(reply, taskLists);
  });

  // 12. POST /api/v1/integrations/google/tasks/sync - Trigger Google Tasks synchronization
  fastify.post(
    '/google/tasks/sync',
    {
      preHandler: [requireAuth, validateBody(googleTasksSyncOptionsSchema)],
    },
    async (request, reply) => {
      const workspaceId = request.query?.workspaceId || request.workspace?.id;
      if (!workspaceId) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'workspaceId query parameter or workspace context is required',
            requestId: request.id,
          },
        });
      }

      const { taskListMappingId, force = false } = request.body || {};
      const runAsync = request.query?.async === 'true' || request.body?.async === true;

      if (runAsync) {
        const job = await enqueueGoogleTasksSync(request.user.id, workspaceId, taskListMappingId, {
          force,
        });
        return sendSuccess(reply, {
          jobId: job.id,
          status: 'QUEUED',
          message: 'Google Tasks synchronization queued in background',
        });
      }

      const result = await googleTasksSyncService.syncTasks(
        request.user.id,
        workspaceId,
        taskListMappingId,
        { force },
      );
      return sendSuccess(reply, result);
    },
  );

  // 13. POST /api/v1/integrations/google/tasks/disconnect - Disconnect Google Tasks
  fastify.post(
    '/google/tasks/disconnect',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await googleTasksSyncService.disconnect(request.user.id);
      return sendSuccess(reply, result);
    },
  );

  // 14. POST /api/v1/integrations/google/drive/connect - Initiate Google Drive OAuth
  fastify.post('/google/drive/connect', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = googleConnectSchema.safeParse(request.body || {});
    const redirectUri = parsed.success ? parsed.data.redirectUri : undefined;

    const authData = oauthBoundaryService.generateAuthorizationUrl({
      userId: request.user.id,
      service: 'DRIVE',
      redirectUri,
    });

    return sendSuccess(reply, authData);
  });

  // 15. POST /api/v1/integrations/google/drive/callback - Complete Google Drive OAuth
  fastify.post('/google/drive/callback', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = googleCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Invalid callback payload',
          details: parsed.error.format(),
          requestId: request.id,
        },
      });
    }

    const { code, state } = parsed.data;
    const result = await oauthBoundaryService.exchangeAuthorizationCode({
      userId: request.user.id,
      code,
      state,
      service: 'DRIVE',
    });

    return sendSuccess(reply, result);
  });

  // 16. GET /api/v1/integrations/google/drive/status - Get Google Drive integration status
  fastify.get('/google/drive/status', { preHandler: [requireAuth] }, async (request, reply) => {
    const status = await oauthBoundaryService.getIntegrationStatus(request.user.id, 'DRIVE');
    return sendSuccess(reply, status);
  });

  // 17. POST /api/v1/integrations/google/drive/folder - Get or create dedicated Workaholic folder
  fastify.post('/google/drive/folder', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId =
      request.body?.workspaceId || request.query?.workspaceId || request.workspace?.id;
    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required in body, query, or workspace context',
          requestId: request.id,
        },
      });
    }

    const folder = await googleDriveSyncService.getOrCreateWorkaholicFolder(
      request.user.id,
      workspaceId,
    );
    return sendSuccess(reply, folder);
  });

  // 18. POST /api/v1/integrations/google/drive/upload - Upload file to Google Drive
  fastify.post('/google/drive/upload', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId =
      request.body?.workspaceId || request.query?.workspaceId || request.workspace?.id;
    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required in body, query, or workspace context',
          requestId: request.id,
        },
      });
    }

    const parsed = googleDriveUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Invalid upload payload',
          details: parsed.error.format(),
          requestId: request.id,
        },
      });
    }

    if (parsed.data.async) {
      const job = await enqueueGoogleDriveUpload(request.user.id, workspaceId, parsed.data);
      return sendSuccess(reply, { queued: true, jobId: job.id }, 202);
    }

    const attachment = await googleDriveSyncService.uploadAttachment(
      request.user.id,
      workspaceId,
      parsed.data,
    );
    return sendSuccess(reply, attachment, 201);
  });

  // 19. POST /api/v1/integrations/google/drive/sync - Reconcile attachment status with Drive
  fastify.post('/google/drive/sync', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId =
      request.body?.workspaceId || request.query?.workspaceId || request.workspace?.id;
    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required in body, query, or workspace context',
          requestId: request.id,
        },
      });
    }

    const parsed = googleDriveSyncOptionsSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Invalid sync options',
          details: parsed.error.format(),
          requestId: request.id,
        },
      });
    }

    if (parsed.data.async) {
      const job = await enqueueGoogleDriveSync(
        request.user.id,
        workspaceId,
        parsed.data.attachmentId,
      );
      return sendSuccess(reply, { queued: true, jobId: job.id }, 202);
    }

    const result = await googleDriveSyncService.syncAttachmentStatus(
      request.user.id,
      workspaceId,
      parsed.data.attachmentId,
    );
    return sendSuccess(reply, result);
  });

  // 20. DELETE /api/v1/integrations/google/drive/files/:fileId - Explicitly delete Google Drive file
  fastify.delete(
    '/google/drive/files/:fileId',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const workspaceId = request.query?.workspaceId || request.workspace?.id;
      const result = await googleDriveSyncService.explicitDeleteDriveFile(
        request.user.id,
        workspaceId,
        { externalFileId: request.params.fileId },
      );
      return sendSuccess(reply, result);
    },
  );

  // 21. POST /api/v1/integrations/google/drive/disconnect - Disconnect Google Drive
  fastify.post(
    '/google/drive/disconnect',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await googleDriveSyncService.disconnect(request.user.id);
      return sendSuccess(reply, result);
    },
  );

  // 22. DELETE /api/v1/integrations/google - Disconnect Google Integration entirely
  fastify.delete('/google', { preHandler: [requireAuth] }, async (request, reply) => {
    const result = await googleCalendarSyncService.disconnect(request.user.id);
    await googleTasksSyncService.disconnect(request.user.id);
    await googleDriveSyncService.disconnect(request.user.id);
    return sendSuccess(reply, result);
  });

  // 23. GET /api/v1/integrations/google/diagnostics - Get synchronization diagnostics
  fastify.get('/google/diagnostics', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = syncDiagnosticQuerySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Invalid diagnostic query parameters',
          details: parsed.error.format(),
          requestId: request.id,
        },
      });
    }

    const { service, status, limit, offset } = parsed.data;
    const history = await syncDiagRepo.getDiagnosticsByUser(request.user.id, {
      service,
      status,
      limit,
      offset,
    });
    const stats = await syncDiagRepo.getDiagnosticStats(request.user.id);

    return sendSuccess(reply, {
      diagnostics: history,
      stats,
      limit,
      offset,
    });
  });

  // 24. POST /api/v1/integrations/google/recover - Trigger sync recovery and stale lock reset
  fastify.post('/google/recover', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = syncRecoverySchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Invalid recovery parameters',
          details: parsed.error.format(),
          requestId: request.id,
        },
      });
    }

    const { service, resetCursor } = parsed.data;
    const lockRecovery = await syncCoordinator.recoverStaleSync(request.user.id);

    let resetCount = 0;
    if (resetCursor) {
      let sql = `
        UPDATE external_object_mappings
        SET sync_cursor = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND provider = 'GOOGLE'
      `;
      const params = [request.user.id];
      if (service !== 'ALL') {
        sql += ` AND external_object_type = $2`;
        params.push(service);
      }
      const res = await pool.query(sql, params);
      resetCount = res.rowCount;
    }

    return sendSuccess(reply, {
      ...lockRecovery,
      service,
      resetCursors: resetCount,
      timestamp: new Date().toISOString(),
    });
  });
}
