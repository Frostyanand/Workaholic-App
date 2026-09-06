import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';

/**
 * Tasks module route definitions.
 * Establishes task boundaries, project scoping, and standard collection envelope.
 */
export async function tasksRoutes(fastify, _opts) {
  fastify.get('/', { preHandler: [requireAuth] }, async (_request, reply) => {
    return sendSuccess(reply, [], 200, { limit: 50, offset: 0, total: 0 });
  });
}
