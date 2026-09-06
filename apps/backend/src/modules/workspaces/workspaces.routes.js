import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';

/**
 * Workspaces module route definitions.
 * Establishes workspace boundaries, membership scoping, and resource isolation.
 */
export async function workspacesRoutes(fastify, _opts) {
  fastify.get('/', { preHandler: [requireAuth] }, async (_request, reply) => {
    return sendSuccess(reply, []);
  });
}
