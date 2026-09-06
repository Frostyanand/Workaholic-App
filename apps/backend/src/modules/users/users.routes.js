import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { validateRequest } from '../../core/validation.js';
import { updateUserSchema } from '@workaholic/shared';
import { usersService } from './users.service.js';

/**
 * Users module route definitions.
 * Establishes profile endpoints and user context boundary.
 * Conforms to docs/15.API-SPECIFICATION.md Section 3 & Section 9.
 */
export async function usersRoutes(fastify, _opts) {
  fastify.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    // If request.user has a real database ID, fetch authoritative profile via service
    if (request.user?.id) {
      try {
        const profile = await usersService.getUserProfile(request.user.id);
        return sendSuccess(reply, profile);
      } catch {
        // Fallback to request.user context if user is a stub
        return sendSuccess(reply, request.user);
      }
    }
    return sendSuccess(reply, request.user);
  });

  fastify.patch(
    '/me',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ body: updateUserSchema })],
    },
    async (request, reply) => {
      const updated = await usersService.updateUserProfile(request.user.id, request.validated.body);
      return sendSuccess(reply, updated);
    },
  );
}
