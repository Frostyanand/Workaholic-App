import { sendSuccess } from '../../core/response.js';

/**
 * Authentication and identity module route definitions.
 * Establishes session check and baseline auth lifecycle hooks for Phase 4.
 */
export async function authRoutes(fastify, _opts) {
  // Session check endpoint
  fastify.get('/session', async (request, reply) => {
    return sendSuccess(reply, {
      authenticated: request.user !== null,
      user: request.user,
    });
  });
}
