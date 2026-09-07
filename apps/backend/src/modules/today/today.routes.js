import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import { todayQuerySchema } from '@workaholic/shared';
import { todayService } from './today.service.js';

/**
 * Today / Command Center route definitions conforming to
 * API-SPECIFICATION.md and UX-SPECIFICATION.md Sections 6 & 7.
 */
export async function todayRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // GET /api/v1/today - Unified Command Center Cockpit
  fastify.get(
    '/',
    {
      preHandler: [...authHooks, validateRequest({ query: todayQuerySchema })],
    },
    async (request, reply) => {
      const data = await todayService.getTodayCockpit(request.workspace.id, {
        date: request.query?.date,
        timezone: request.query?.timezone,
        user: request.user,
      });
      return sendSuccess(reply, data);
    },
  );
}
