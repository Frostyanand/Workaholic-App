import { sendSuccess } from '../../core/response.js';
import { requireAuth } from './auth.middleware.js';
import { validateRequest } from '../../core/validation.js';
import { authService } from './auth.service.js';
import { googleAuthService } from './google-auth.service.js';
import { accountBootstrapService } from './account-bootstrap.service.js';
import { oauthBoundaryService } from './oauth-boundary.service.js';
import * as securityEventsRepo from './security-events.repository.js';
import {
  googleAuthInputSchema,
  oauthAuthorizeQuerySchema,
  oauthCallbackInputSchema,
  updateDeviceTrustInputSchema,
  securityEventsQuerySchema,
} from '@workaholic/shared';

/**
 * Authentication and identity module route definitions.
 * Conforms to docs/IMPLEMENTATION-PLAN.md Section 11 (Phase 4),
 * docs/12.PRIVACY-SECURITY.md, and docs/15.API-SPECIFICATION.md.
 */
export async function authRoutes(fastify, _opts) {
  // Helper to extract client IP safely
  const getClientIp = request => {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      '127.0.0.1'
    );
  };

  const getUserAgent = request => {
    return request.headers['user-agent'] || 'Unknown Client';
  };

  // 1. Session status check endpoint
  fastify.get('/session', async (request, reply) => {
    return sendSuccess(reply, {
      authenticated: request.user !== null,
      user: request.user,
      ...(request.session ? { session: request.session } : {}),
    });
  });

  // 2. Google Sign-In & Authentication Exchange (Task 4.1 & Task 4.6)
  fastify.post(
    '/google',
    {
      preValidation: [validateRequest({ body: googleAuthInputSchema })],
    },
    async (request, reply) => {
      const { idToken, device } = request.body;
      const ipAddress = getClientIp(request);
      const userAgent = getUserAgent(request);

      // 1. Verify Google identity (Strict boundary: "Who is this user?")
      const googleIdentity = await googleAuthService.verifyGoogleIdToken(idToken);

      // 2. Resolve or bootstrap user account (Task 4.6)
      const { user, isNewUser } =
        await accountBootstrapService.bootstrapOrResolveUser(googleIdentity);

      // 3. Register or resolve device if provided (Task 4.4)
      let registeredDevice = null;
      const platformHeader = request.headers['x-platform'];
      const deviceNameHeader = request.headers['x-device-name'];
      const appVersionHeader = request.headers['x-app-version'];

      const deviceData =
        device ||
        (platformHeader
          ? {
              platform: ['WEB', 'WINDOWS', 'ANDROID'].includes(platformHeader.toUpperCase())
                ? platformHeader.toUpperCase()
                : 'WEB',
              deviceName: deviceNameHeader || 'Client Device',
              applicationVersion: appVersionHeader || '1.0.0',
            }
          : null);

      if (deviceData) {
        registeredDevice = await authService.registerDevice(user.id, {
          platform: deviceData.platform || 'WEB',
          deviceName: deviceData.deviceName || 'Client Device',
          applicationVersion: deviceData.applicationVersion || null,
        });
      }

      // 4. Create secure cryptographic session (Task 4.3)
      const sessionType =
        registeredDevice?.platform === 'ANDROID'
          ? 'MOBILE'
          : registeredDevice?.platform === 'WINDOWS'
            ? 'DESKTOP'
            : 'WEB';

      const { session, rawToken } = await authService.createSession(user.id, {
        deviceId: registeredDevice?.id || null,
        sessionType,
        ipAddress,
        userAgent,
      });

      // 5. Set HttpOnly session cookie
      const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      reply.header(
        'Set-Cookie',
        `workaholic_session=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`,
      );

      return sendSuccess(
        reply,
        {
          token: rawToken,
          user: {
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            profileImageReference: user.profileImageReference || null,
          },
          session: {
            id: session.id,
            sessionType: session.sessionType,
            expiresAt: session.expiresAt,
          },
          isNewUser,
        },
        200,
      );
    },
  );

  // 3. User logout (Task 4.3)
  fastify.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const sessionId = request.session?.id;
    if (sessionId) {
      await authService.logout(sessionId, request.user.id, {
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });
    }

    // Clear session cookie
    reply.header(
      'Set-Cookie',
      'workaholic_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
    );

    return sendSuccess(reply, { loggedOut: true });
  });

  // 4. Revoke all active sessions (Task 4.3)
  fastify.post('/revoke-all', { preHandler: [requireAuth] }, async (request, reply) => {
    const count = await authService.revokeAllUserSessions(request.user.id, {
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    reply.header(
      'Set-Cookie',
      'workaholic_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
    );

    return sendSuccess(reply, { revokedCount: count });
  });

  // 5. List active sessions for user (Task 4.3)
  fastify.get('/sessions', { preHandler: [requireAuth] }, async (request, reply) => {
    const sessions = await authService.getUserSessions(request.user.id);
    // Never expose sessionTokenHash!
    const sanitized = sessions.map(s => ({
      id: s.id,
      deviceId: s.deviceId,
      sessionType: s.sessionType,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      isCurrent: s.id === request.session?.id,
    }));
    return sendSuccess(reply, sanitized);
  });

  // 6. Revoke a specific session (Task 4.3)
  fastify.post('/sessions/:id/revoke', { preHandler: [requireAuth] }, async (request, reply) => {
    await authService.revokeUserSession(request.params.id, request.user.id, {
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return sendSuccess(reply, { revoked: true });
  });

  // 7. Device tracking endpoints (Task 4.4)
  fastify.get('/devices', { preHandler: [requireAuth] }, async (request, reply) => {
    const devices = await authService.getUserDevices(request.user.id);
    return sendSuccess(reply, devices);
  });

  fastify.patch(
    '/devices/:id/trust',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ body: updateDeviceTrustInputSchema })],
    },
    async (request, reply) => {
      const updated = await authService.updateDeviceTrust(
        request.params.id,
        request.body.trustState,
        request.user.id,
      );
      return sendSuccess(reply, updated);
    },
  );

  fastify.delete('/devices/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    await authService.revokeDeviceAndSessions(request.params.id, request.user.id, {
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return sendSuccess(reply, { revoked: true });
  });

  // 8. Security audit events endpoint (Task 4.5)
  fastify.get(
    '/security-events',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ query: securityEventsQuerySchema })],
    },
    async (request, reply) => {
      const { limit = 20, offset = 0, eventType } = request.query;
      const [events, total] = await Promise.all([
        securityEventsRepo.findSecurityEventsForUser(request.user.id, { limit, offset, eventType }),
        securityEventsRepo.countSecurityEventsForUser(request.user.id, { eventType }),
      ]);

      return sendSuccess(reply, events, 200, { limit, offset, total });
    },
  );

  // 9. Google API OAuth endpoints (Task 4.2)
  fastify.get(
    '/google/authorize',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ query: oauthAuthorizeQuerySchema })],
    },
    async (request, reply) => {
      const { service, redirectUri } = request.query;
      const result = oauthBoundaryService.generateAuthorizationUrl({
        userId: request.user.id,
        service,
        redirectUri,
      });
      return sendSuccess(reply, result);
    },
  );

  fastify.post(
    '/google/callback',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ body: oauthCallbackInputSchema })],
    },
    async (request, reply) => {
      const { code, state, service } = request.body;
      const result = await oauthBoundaryService.exchangeAuthorizationCode({
        userId: request.user.id,
        code,
        state,
        service,
      });
      return sendSuccess(reply, result);
    },
  );

  fastify.get('/google/status', { preHandler: [requireAuth] }, async (request, reply) => {
    const status = await oauthBoundaryService.getIntegrationStatus(request.user.id);
    return sendSuccess(reply, status);
  });

  fastify.delete('/google', { preHandler: [requireAuth] }, async (request, reply) => {
    const result = await oauthBoundaryService.disconnectGoogleIntegration(request.user.id);
    return sendSuccess(reply, result);
  });
}
