import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';

/**
 * Users module route definitions.
 * Establishes profile endpoints and user context boundary.
 */
export async function usersRoutes(fastify, _opts) {
  fastify.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    return sendSuccess(reply, request.user);
  });
}
