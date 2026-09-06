import { AuthenticationRequiredError } from '../../core/errors.js';

/**
 * Fastify preHandler hook ensuring the request carries an authenticated user context.
 * Complies with docs/15.API-SPECIFICATION.md Section 4 & Section 15.
 */
export async function requireAuth(request, _reply) {
  if (!request.user) {
    throw new AuthenticationRequiredError('Authentication required');
  }
}
