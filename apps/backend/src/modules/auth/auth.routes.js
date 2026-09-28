import { sendSuccess } from '../../core/response.js';
import { requireAuth } from './auth.middleware.js';
import { validateRequest } from '../../core/validation.js';
import { authService } from './auth.service.js';
import { firebaseAuthService } from './firebase-auth.service.js';
import { accountBootstrapService } from './account-bootstrap.service.js';
import { oauthBoundaryService } from './oauth-boundary.service.js';
import * as securityEventsRepo from './security-events.repository.js';
import { authRateLimit } from '../../core/rate-limiter.js';
import {
  firebaseAuthInputSchema,
  oauthAuthorizeQuerySchema,
  oauthCallbackInputSchema,
  updateDeviceTrustInputSchema,
  securityEventsQuerySchema,
} from '@workaholic/shared';

/**
 * Authentication and identity module route definitions.
 * Conforms to docs/IMPLEMENTATION-PLAN.md Section 11 (Phase 4),
 * docs/6.SYSTEM-ARCHITECTURE.md Section 13 & 14, docs/12.PRIVACY-SECURITY.md,
 * and docs/15.API-SPECIFICATION.md.
 *
 * AUTHENTICATION AUTHORITY:
 * Firebase Authentication is the authentication authority ("Who is this user?").
 * Canonical endpoint: POST /api/v1/auth/session (alias: POST /api/v1/auth/firebase).
 *
 * GOOGLE API AUTHORIZATION BOUNDARY:
 * Google Calendar, Tasks, and Drive OAuth endpoints remain strictly separate
 * (/api/v1/auth/google/authorize, /callback, /status, DELETE /google).
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

  /**
   * Session Exchange Handler:
   * Exchanges a verified Firebase ID token for a native Workaholic session.
   * Resolves/bootstraps canonical Workaholic User UUID in PostgreSQL.
   */
  const handleSessionExchange = async (request, reply) => {
    const { idToken, device } = request.body;
    const ipAddress = getClientIp(request);
    const userAgent = getUserAgent(request);

    // 1. Verify Firebase identity (Strict boundary: "Who is this user?")
    const firebaseIdentity = await firebaseAuthService.verifyFirebaseIdToken(idToken);

    // 2. Resolve or bootstrap user account (Task 4.6 & System Architecture §14)
    const { user, isNewUser } =
      await accountBootstrapService.bootstrapOrResolveUser(firebaseIdentity);

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
  };

  // 2. Canonical Session Creation / Firebase Token Exchange (Task 4.1 & Task 4.6)
  fastify.post(
    '/session',
    {
      preHandler: [authRateLimit],
      preValidation: [validateRequest({ body: firebaseAuthInputSchema })],
    },
    handleSessionExchange,
  );

  // Alias endpoint for explicit Firebase credential exchange
  fastify.post(
    '/firebase',
    {
      preHandler: [authRateLimit],
      preValidation: [validateRequest({ body: firebaseAuthInputSchema })],
    },
    handleSessionExchange,
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

  // 9. Google API OAuth endpoints (Task 4.2 & Integration Spec §4, 5)
  // Strictly independent from Workaholic user authentication!
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

  // Browser redirect handler for Google OAuth popup
  fastify.get('/google/callback', async (request, reply) => {
    const { code, state, error } = request.query || {};

    if (error) {
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Cancelled - Workaholic</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
          <div style="text-align: center; padding: 24px; border: 1px solid #ef4444; border-radius: 8px; background: #1e293b;">
            <h2 style="color: #ef4444; margin: 0 0 12px;">Authorization Cancelled</h2>
            <p style="color: #94a3b8; margin: 0;">${error}</p>
            <p style="color: #64748b; font-size: 0.8rem; margin-top: 12px;">You may close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${error}' }, '*');
            }
            setTimeout(() => window.close(), 2500);
          </script>
        </body>
        </html>
      `);
    }

    const stateEntry = oauthBoundaryService.pendingStates?.get(state);
    if (!stateEntry || !code) {
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid OAuth State - Workaholic</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
          <div style="text-align: center; padding: 24px; border: 1px solid #eab308; border-radius: 8px; background: #1e293b;">
            <h2 style="color: #eab308; margin: 0 0 12px;">State Expired or Invalid</h2>
            <p style="color: #94a3b8; margin: 0;">Please return to Workaholic and try connecting again.</p>
          </div>
          <script>setTimeout(() => window.close(), 2500);</script>
        </body>
        </html>
      `);
    }

    try {
      await oauthBoundaryService.exchangeAuthorizationCode({
        userId: stateEntry.userId,
        code,
        state,
        service: stateEntry.service,
      });

      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Connected Successfully - Workaholic</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
          <div style="text-align: center; padding: 32px; border: 1px solid #334155; border-radius: 12px; background: #1e293b; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <h2 style="color: #38bdf8; margin: 0 0 12px; font-size: 1.25rem;">Connected Successfully!</h2>
            <p style="color: #94a3b8; margin: 0 0 16px; font-size: 0.875rem;">Your Google account is now connected to Workaholic.</p>
            <p style="color: #64748b; font-size: 0.75rem;">This window will close automatically...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', service: '${stateEntry.service}' }, '*');
            }
            setTimeout(() => window.close(), 1500);
          </script>
        </body>
        </html>
      `);
    } catch (err) {
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Connection Error - Workaholic</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
          <div style="text-align: center; padding: 24px; border: 1px solid #ef4444; border-radius: 8px; background: #1e293b;">
            <h2 style="color: #ef4444; margin: 0 0 12px;">Connection Failed</h2>
            <p style="color: #94a3b8; margin: 0;">${err.message}</p>
          </div>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
        </html>
      `);
    }
  });

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
