import { AuthenticationRequiredError } from '../../core/errors.js';
import { authService as defaultAuthService } from './auth.service.js';

/**
 * Extracts raw session token from Authorization Bearer header or session cookie.
 * Conforms to docs/15.API-SPECIFICATION.md Section 4 & docs/12.PRIVACY-SECURITY.md Section 4.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {string|null}
 */
export function extractTokenFromRequest(request) {
  if (!request || !request.headers) return null;

  // 1. Authorization: Bearer <rawToken>
  const authHeader = request.headers['authorization'];
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }

  // 2. Cookie: workaholic_session=<rawToken>
  const cookieHeader = request.headers['cookie'];
  if (cookieHeader && typeof cookieHeader === 'string') {
    const match = cookieHeader.match(/(?:^|;\s*)workaholic_session=([^;]+)/);
    if (match && match[1].trim().length > 0) {
      return decodeURIComponent(match[1].trim());
    }
  }

  return null;
}

/**
 * PreHandler hook that extracts and validates session tokens, populating request.user and request.session.
 * Does not block unauthenticated requests to public routes.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} _reply
 */
export async function authenticateRequest(request, _reply) {
  // If user context already established (e.g. mock test injection), skip
  if (request.user) {
    return;
  }

  const token = extractTokenFromRequest(request);
  if (!token) {
    return;
  }

  try {
    const session = await defaultAuthService.validateRawToken(token);
    if (session) {
      request.session = {
        id: session.id,
        sessionType: session.sessionType,
        deviceId: session.deviceId,
        expiresAt: session.expiresAt,
      };
      request.user = {
        id: session.userId,
        email: session.userEmail || '',
        displayName: session.userDisplayName || '',
      };
    }
  } catch (err) {
    request.authError = err;
  }
}

/**
 * Fastify preHandler hook ensuring the request carries an authenticated user context.
 * Complies with docs/15.API-SPECIFICATION.md Section 4 & Section 15.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function requireAuth(request, reply) {
  if (!request.user && !request.authError) {
    await authenticateRequest(request, reply);
  }

  if (request.authError) {
    throw request.authError;
  }

  if (!request.user) {
    throw new AuthenticationRequiredError('Authentication required');
  }
}
