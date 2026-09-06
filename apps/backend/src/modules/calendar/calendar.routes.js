import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';

/**
 * Calendar module route definitions.
 * Establishes calendar events, day order, and academic schedule boundaries.
 */
export async function calendarRoutes(fastify, _opts) {
  fastify.get('/events', { preHandler: [requireAuth] }, async (_request, reply) => {
    return sendSuccess(reply, []);
  });
}
