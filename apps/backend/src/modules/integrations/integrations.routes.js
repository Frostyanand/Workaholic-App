import { requireAuth } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../core/response.js';
import { validateBody } from '../../core/validation.js';
import { oauthBoundaryService } from '../auth/oauth-boundary.service.js';
import { googleCalendarSyncService } from './google/google-calendar-sync.service.js';
import { enqueueGoogleCalendarSync } from './google/google-sync-dispatcher.js';
import {
  googleConnectSchema,
  googleCallbackSchema,
  googleSyncOptionsSchema,
} from '@workaholic/shared';

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
    const status = await oauthBoundaryService.getIntegrationStatus(request.user.id);
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

  // 8. DELETE /api/v1/integrations/google - Disconnect Google Integration
  fastify.delete('/google', { preHandler: [requireAuth] }, async (request, reply) => {
    const result = await googleCalendarSyncService.disconnect(request.user.id);
    return sendSuccess(reply, result);
  });
}
