import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';

/**
 * Notes module route definitions.
 * Establishes note collection, linking, and standard collection envelope.
 */
export async function notesRoutes(fastify, _opts) {
  fastify.get('/', { preHandler: [requireAuth] }, async (_request, reply) => {
    return sendSuccess(reply, [], 200, { limit: 50, offset: 0, total: 0 });
  });
}
