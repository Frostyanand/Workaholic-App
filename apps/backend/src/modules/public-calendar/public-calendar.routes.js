import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createPublicLinkSchema,
  publicCalendarQuerySchema,
  publicTokenParamSchema,
} from '@workaholic/shared';
import { publicCalendarService } from './public-calendar.service.js';
import { publicEndpointRateLimit } from '../../core/rate-limiter.js';

const calendarIdParamSchema = z.object({
  calendarId: idSchema,
});

const linkIdParamSchema = z.object({
  id: idSchema,
});

/**
 * Public Calendar module routes conforming to:
 * - docs/15.API-SPECIFICATION.md Section 56 & 57
 * - docs/4.buisness-rules.md Section 18 (BR-PUBCAL-001..006)
 * - docs/9.CALENDAR-SPECIFICATION.md Section 42 & 43
 */
export async function publicCalendarRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // =========================================================
  // 1. Authenticated Public Link Management Endpoints
  // =========================================================

  // Get active public link for a calendar
  fastify.get(
    '/calendars/:calendarId/public-link',
    {
      preHandler: [...authHooks, validateRequest({ params: calendarIdParamSchema })],
    },
    async (request, reply) => {
      const link = await publicCalendarService.getActivePublicLink(
        request.workspace.id,
        request.user,
        request.params.calendarId,
      );
      return sendSuccess(reply, link);
    },
  );

  // Alias for plural /calendars/:calendarId/public-links
  fastify.get(
    '/calendars/:calendarId/public-links',
    {
      preHandler: [...authHooks, validateRequest({ params: calendarIdParamSchema })],
    },
    async (request, reply) => {
      const link = await publicCalendarService.getActivePublicLink(
        request.workspace.id,
        request.user,
        request.params.calendarId,
      );
      return sendSuccess(reply, link);
    },
  );

  // Create or enable public link for a calendar
  fastify.post(
    '/calendars/:calendarId/public-link',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: calendarIdParamSchema,
          body: createPublicLinkSchema,
        }),
      ],
    },
    async (request, reply) => {
      const link = await publicCalendarService.createOrGetPublicLink(
        request.workspace.id,
        request.user,
        request.params.calendarId,
        request.body || {},
      );
      return sendSuccess(reply, link, 201);
    },
  );

  // Alias for plural /calendars/:calendarId/public-links
  fastify.post(
    '/calendars/:calendarId/public-links',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: calendarIdParamSchema,
          body: createPublicLinkSchema,
        }),
      ],
    },
    async (request, reply) => {
      const link = await publicCalendarService.createOrGetPublicLink(
        request.workspace.id,
        request.user,
        request.params.calendarId,
        request.body || {},
      );
      return sendSuccess(reply, link, 201);
    },
  );

  // Revoke public link by calendar ID
  fastify.delete(
    '/calendars/:calendarId/public-link',
    {
      preHandler: [...authHooks, validateRequest({ params: calendarIdParamSchema })],
    },
    async (request, reply) => {
      const result = await publicCalendarService.revokePublicLink(
        request.workspace.id,
        request.user,
        request.params.calendarId,
      );
      return sendSuccess(reply, result);
    },
  );

  // Regenerate public link by calendar ID
  fastify.post(
    '/calendars/:calendarId/public-link/regenerate',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: calendarIdParamSchema,
          body: createPublicLinkSchema,
        }),
      ],
    },
    async (request, reply) => {
      const link = await publicCalendarService.regeneratePublicLink(
        request.workspace.id,
        request.user,
        request.params.calendarId,
        request.body || {},
      );
      return sendSuccess(reply, link, 201);
    },
  );

  // Revoke public link by Link ID (API-SPECIFICATION Section 56)
  fastify.delete(
    '/public-links/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: linkIdParamSchema })],
    },
    async (request, reply) => {
      const result = await publicCalendarService.revokePublicLink(
        request.workspace.id,
        request.user,
        request.params.id,
      );
      return sendSuccess(reply, result);
    },
  );

  // Regenerate public link by Link ID (API-SPECIFICATION Section 56)
  fastify.post(
    '/public-links/:id/regenerate',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: linkIdParamSchema,
          body: createPublicLinkSchema,
        }),
      ],
    },
    async (request, reply) => {
      const link = await publicCalendarService.regeneratePublicLink(
        request.workspace.id,
        request.user,
        request.params.id,
        request.body || {},
      );
      return sendSuccess(reply, link, 201);
    },
  );

  // =========================================================
  // 2. Anonymous Public Calendar Read-Only Consumption
  // =========================================================

  // Public calendar feed with privacy projection (no auth required)
  fastify.get(
    '/public/calendars/:token',
    {
      preHandler: [
        publicEndpointRateLimit,
        validateRequest({
          params: publicTokenParamSchema,
          query: publicCalendarQuerySchema,
        }),
      ],
    },
    async (request, reply) => {
      // Security headers: Disallow search engine indexing (BR-PUBCAL-006) and prevent intermediate caching
      reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      reply.header('Pragma', 'no-cache');

      const data = await publicCalendarService.getPublicCalendarProjection(
        request.params.token,
        request.query,
      );

      return sendSuccess(reply, data);
    },
  );
}

/**
 * Route plugin for top-level /public/calendars/:token route mount
 */
export async function publicConsumptionRoutes(fastify, _opts) {
  fastify.get(
    '/public/calendars/:token',
    {
      preHandler: [
        publicEndpointRateLimit,
        validateRequest({
          params: publicTokenParamSchema,
          query: publicCalendarQuerySchema,
        }),
      ],
    },
    async (request, reply) => {
      reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      reply.header('Pragma', 'no-cache');

      const data = await publicCalendarService.getPublicCalendarProjection(
        request.params.token,
        request.query,
      );

      return sendSuccess(reply, data);
    },
  );
}
