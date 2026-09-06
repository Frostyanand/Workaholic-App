import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import {
  generateSessionToken,
  hashSessionToken,
  generateOAuthState,
  encryptCredentials,
  decryptCredentials,
} from '../src/core/crypto.js';
import {
  googleAuthService,
  createMockGoogleIdToken,
  GoogleAuthService,
} from '../src/modules/auth/google-auth.service.js';
import {
  OAuthBoundaryService,
  GOOGLE_API_SCOPES,
} from '../src/modules/auth/oauth-boundary.service.js';
import { AccountBootstrapService } from '../src/modules/auth/account-bootstrap.service.js';
import { AuthenticationFailedError, ValidationError } from '../src/core/errors.js';

describe('Phase 4: Authentication and Identity', () => {
  // =========================================================================
  // Cryptographic Foundation (Task 4.3 & Security Specs)
  // =========================================================================
  describe('Cryptographic Foundation (crypto.js)', () => {
    it('generates cryptographically secure session tokens with 256-bit entropy', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(typeof token1).toBe('string');
      expect(token1).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });

    it('hashes tokens deterministically with SHA-256 and never matches raw token', () => {
      const rawToken = generateSessionToken();
      const hash1 = hashSessionToken(rawToken);
      const hash2 = hashSessionToken(rawToken);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(rawToken);
    });

    it('throws error when attempting to hash empty or invalid token', () => {
      expect(() => hashSessionToken('')).toThrow(TypeError);
      expect(() => hashSessionToken(null)).toThrow(TypeError);
    });

    it('generates secure OAuth CSRF state parameters', () => {
      const state1 = generateOAuthState();
      const state2 = generateOAuthState();

      expect(state1).toHaveLength(48); // 24 bytes hex = 48 chars
      expect(state1).not.toBe(state2);
    });

    it('encrypts and decrypts sensitive credentials with AES-256-GCM', () => {
      const secretCredentials = {
        accessToken: 'ya29.mock_access_token_123',
        refreshToken: '1//0g_mock_refresh_token_456',
      };

      const encrypted = encryptCredentials(secretCredentials);
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain('ya29');
      expect(encrypted).not.toContain('mock_refresh_token');

      const decrypted = decryptCredentials(encrypted);
      expect(decrypted).toEqual(secretCredentials);
    });

    it('fails decryption when ciphertext or authentication tag is tampered with', () => {
      const encrypted = encryptCredentials({ secret: 'value' });
      const decoded = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));

      // Tamper with ciphertext
      decoded.ciphertext = decoded.ciphertext.slice(0, -2) + 'aa';
      const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64');

      expect(() => decryptCredentials(tampered)).toThrow();
    });
  });

  // =========================================================================
  // Task 4.1: Google Authentication & Identity Verification
  // =========================================================================
  describe('Task 4.1: Google Authentication & Identity Verification', () => {
    it('verifies a valid Google OpenID Connect ID token and extracts identity claims', async () => {
      const validToken = createMockGoogleIdToken({
        sub: 'google_user_987654321',
        email: 'sarah.connor@example.com',
        name: 'Sarah Connor',
        picture: 'https://lh3.googleusercontent.com/avatar1',
      });

      const identity = await googleAuthService.verifyGoogleIdToken(validToken);

      expect(identity.provider).toBe('GOOGLE');
      expect(identity.subject).toBe('google_user_987654321');
      expect(identity.email).toBe('sarah.connor@example.com');
      expect(identity.emailVerified).toBe(true);
      expect(identity.displayName).toBe('Sarah Connor');
      expect(identity.picture).toBe('https://lh3.googleusercontent.com/avatar1');
    });

    it('rejects tokens with missing or unapproved issuer', async () => {
      const invalidIssuerToken = createMockGoogleIdToken({
        iss: 'https://evil-auth-provider.com',
      });

      await expect(googleAuthService.verifyGoogleIdToken(invalidIssuerToken)).rejects.toThrow(
        AuthenticationFailedError,
      );
    });

    it('rejects expired Google ID tokens', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiredToken = createMockGoogleIdToken({
        exp: nowSec - 300, // expired 5 minutes ago
      });

      await expect(googleAuthService.verifyGoogleIdToken(expiredToken)).rejects.toThrow(/expired/i);
    });

    it('rejects tokens where email is not verified', async () => {
      const unverifiedToken = createMockGoogleIdToken({
        email_verified: false,
      });

      await expect(googleAuthService.verifyGoogleIdToken(unverifiedToken)).rejects.toThrow(
        /verified/i,
      );
    });

    it('rejects malformed token strings', async () => {
      await expect(googleAuthService.verifyGoogleIdToken('not-a-valid-jwt')).rejects.toThrow(
        AuthenticationFailedError,
      );
      await expect(googleAuthService.verifyGoogleIdToken('')).rejects.toThrow(
        AuthenticationFailedError,
      );
      await expect(googleAuthService.verifyGoogleIdToken(null)).rejects.toThrow(
        AuthenticationFailedError,
      );
    });

    it('enforces audience check when configured', async () => {
      const token = createMockGoogleIdToken({
        aud: 'client-id-alpha',
      });

      const service = new GoogleAuthService({ clientId: 'client-id-bravo' });
      await expect(service.verifyGoogleIdToken(token)).rejects.toThrow(/audience does not match/i);
    });
  });

  // =========================================================================
  // Task 4.6: Account Bootstrap Engine
  // =========================================================================
  describe('Task 4.6: Account Bootstrap Engine', () => {
    let mockUsersRepo;
    let mockWorkspacesRepo;
    let mockExternalIdentitiesRepo;
    let mockTxHelper;
    let bootstrapService;

    beforeEach(() => {
      const users = new Map();
      const workspaces = new Map();
      const memberships = [];
      const externalIdentities = new Map();

      mockUsersRepo = {
        findUserById: async id => users.get(id) || null,
        findUserByEmail: async email => {
          for (const u of users.values()) {
            if (u.email.toLowerCase() === email.toLowerCase()) return u;
          }
          return null;
        },
        createUser: async data => {
          const user = {
            id: `usr_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            ...data,
          };
          users.set(user.id, user);
          return user;
        },
      };

      mockWorkspacesRepo = {
        createWorkspaceWithMembership: async data => {
          const ws = { id: `ws_${Date.now()}`, ...data };
          workspaces.set(ws.id, ws);
          const m = {
            id: `mem_${Date.now()}`,
            workspaceId: ws.id,
            userId: data.ownerUserId,
            role: 'OWNER',
            status: 'ACTIVE',
          };
          memberships.push(m);
          return { workspace: ws, membership: m };
        },
        createWorkspace: async data => {
          const ws = { id: `ws_${Date.now()}`, ...data };
          workspaces.set(ws.id, ws);
          return ws;
        },
        createMembership: async data => {
          const m = { id: `mem_${Date.now()}`, ...data };
          memberships.push(m);
          return m;
        },
      };

      mockExternalIdentitiesRepo = {
        findExternalIdentity: async (provider, subject) =>
          externalIdentities.get(`${provider}:${subject}`) || null,
        createExternalIdentity: async data => {
          const ei = { id: `ei_${Date.now()}`, ...data };
          externalIdentities.set(`${data.provider}:${data.providerSubject}`, ei);
          return ei;
        },
      };

      mockTxHelper = async workFn => workFn({});

      bootstrapService = new AccountBootstrapService(
        mockUsersRepo,
        mockWorkspacesRepo,
        mockExternalIdentitiesRepo,
        mockTxHelper,
      );
    });

    it('atomically creates user, personal workspace, OWNER membership, and external identity on first login', async () => {
      const identity = {
        provider: 'GOOGLE',
        subject: 'google_sub_101',
        email: 'newbie@example.com',
        displayName: 'New User',
        picture: 'https://avatar.example.com/101',
      };

      const result = await bootstrapService.bootstrapOrResolveUser(identity);

      expect(result.isNewUser).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('newbie@example.com');
      expect(result.workspace).toBeDefined();
      expect(result.workspace.name).toBe('Personal');
      expect(result.workspace.workspaceType).toBe('PERSONAL');
      expect(result.workspace.ownerUserId).toBe(result.user.id);
      expect(result.membership.role).toBe('OWNER');
      expect(result.membership.status).toBe('ACTIVE');
      expect(result.externalIdentity.providerSubject).toBe('google_sub_101');
    });

    it('resolves existing user idempotently on second login without duplicate provisioning', async () => {
      const identity = {
        provider: 'GOOGLE',
        subject: 'google_sub_102',
        email: 'returning@example.com',
        displayName: 'Returning User',
      };

      const firstLogin = await bootstrapService.bootstrapOrResolveUser(identity);
      expect(firstLogin.isNewUser).toBe(true);

      const secondLogin = await bootstrapService.bootstrapOrResolveUser(identity);
      expect(secondLogin.isNewUser).toBe(false);
      expect(secondLogin.user.id).toBe(firstLogin.user.id);
      expect(secondLogin.workspace).toBeUndefined(); // Did not recreate workspace
    });

    it('links external identity when an active user already exists with matching email', async () => {
      // Pre-create user with email
      const preExistingUser = await mockUsersRepo.createUser({
        displayName: 'Existing Person',
        email: 'exists@example.com',
      });

      const identity = {
        provider: 'GOOGLE',
        subject: 'google_sub_exists_103',
        email: 'exists@example.com',
        displayName: 'Existing Person',
      };

      const result = await bootstrapService.bootstrapOrResolveUser(identity);

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(preExistingUser.id);

      // Verify external identity was linked
      const linked = await mockExternalIdentitiesRepo.findExternalIdentity(
        'GOOGLE',
        'google_sub_exists_103',
      );
      expect(linked).toBeDefined();
      expect(linked.userId).toBe(preExistingUser.id);
    });

    it('rejects login if user account is deactivated (soft-deleted)', async () => {
      const preExistingUser = await mockUsersRepo.createUser({
        displayName: 'Deactivated User',
        email: 'banned@example.com',
        deletedAt: new Date(),
      });
      await mockExternalIdentitiesRepo.createExternalIdentity({
        userId: preExistingUser.id,
        provider: 'GOOGLE',
        providerSubject: 'google_banned_104',
      });

      // Stub findExternalIdentity to return soft delete flag
      mockExternalIdentitiesRepo.findExternalIdentity = async () => ({
        userId: preExistingUser.id,
        userDeletedAt: new Date(),
      });

      const identity = {
        provider: 'GOOGLE',
        subject: 'google_banned_104',
        email: 'banned@example.com',
      };

      await expect(bootstrapService.bootstrapOrResolveUser(identity)).rejects.toThrow(
        /deactivated/i,
      );
    });
  });

  // =========================================================================
  // Task 4.2: Google API Authorization Boundary
  // =========================================================================
  describe('Task 4.2: Google API Authorization (OAuth Scope Boundary)', () => {
    let mockIntegrationsRepo;
    let mockSecurityEventsRepo;
    let oauthService;

    beforeEach(() => {
      const integrations = new Map();
      const accounts = new Map();

      mockIntegrationsRepo = {
        upsertIntegration: async data => {
          const record = { id: `int_${Date.now()}`, ...data };
          integrations.set(`${data.userId}:${data.provider}`, record);
          return record;
        },
        findIntegration: async (userId, provider) =>
          integrations.get(`${userId}:${provider}`) || null,
        deleteIntegration: async id => {
          for (const [key, val] of integrations.entries()) {
            if (val.id === id) integrations.delete(key);
          }
          return true;
        },
        upsertExternalAccount: async data => {
          const acc = { id: `acc_${Date.now()}`, ...data };
          accounts.set(`${data.integrationId}:${data.provider}`, acc);
          return acc;
        },
        findExternalAccount: async (integrationId, provider) =>
          accounts.get(`${integrationId}:${provider}`) || null,
      };

      mockSecurityEventsRepo = {
        recordSecurityEvent: async () => ({ id: 'evt_1' }),
      };

      oauthService = new OAuthBoundaryService(mockIntegrationsRepo, mockSecurityEventsRepo);
    });

    it('generates authorization URL with minimal scopes specifically for Calendar', () => {
      const result = oauthService.generateAuthorizationUrl({
        userId: 'usr_100',
        service: 'CALENDAR',
      });

      expect(result.service).toBe('CALENDAR');
      expect(result.scopes).toEqual(GOOGLE_API_SCOPES.CALENDAR);
      expect(result.authorizationUrl).toContain('calendar.events');
      expect(result.authorizationUrl).not.toContain('drive');
      expect(result.authorizationUrl).not.toContain('tasks');
      expect(result.state).toHaveLength(48);
    });

    it('generates authorization URL with minimal scopes specifically for Tasks', () => {
      const result = oauthService.generateAuthorizationUrl({
        userId: 'usr_100',
        service: 'TASKS',
      });

      expect(result.service).toBe('TASKS');
      expect(result.scopes).toEqual(GOOGLE_API_SCOPES.TASKS);
      expect(result.authorizationUrl).toContain('tasks');
      expect(result.authorizationUrl).not.toContain('calendar');
    });

    it('generates authorization URL with minimal scopes specifically for Drive', () => {
      const result = oauthService.generateAuthorizationUrl({
        userId: 'usr_100',
        service: 'DRIVE',
      });

      expect(result.service).toBe('DRIVE');
      expect(result.scopes).toEqual(GOOGLE_API_SCOPES.DRIVE);
      expect(result.authorizationUrl).toContain('drive.file');
      expect(result.authorizationUrl).not.toContain('calendar');
    });

    it('rejects unsupported service names', () => {
      expect(() =>
        oauthService.generateAuthorizationUrl({
          userId: 'usr_100',
          service: 'GMAIL',
        }),
      ).toThrow(ValidationError);
    });

    it('validates CSRF state and rejects tampered or expired states', () => {
      const { state } = oauthService.generateAuthorizationUrl({
        userId: 'usr_100',
        service: 'CALENDAR',
      });

      // Rejects state with different user
      expect(() => oauthService.verifyState(state, 'usr_attacker', 'CALENDAR')).toThrow(
        ValidationError,
      );

      // Rejects invalid state string
      expect(() => oauthService.verifyState('invalid_state', 'usr_100', 'CALENDAR')).toThrow(
        ValidationError,
      );
    });

    it('exchanges code, encrypts credentials, and stores integration state without returning secrets', async () => {
      const { state } = oauthService.generateAuthorizationUrl({
        userId: 'usr_100',
        service: 'CALENDAR',
      });

      const exchangeResult = await oauthService.exchangeAuthorizationCode({
        userId: 'usr_100',
        code: 'auth_code_xyz',
        state,
        service: 'CALENDAR',
      });

      expect(exchangeResult.connected).toBe(true);
      expect(exchangeResult.provider).toBe('GOOGLE');
      expect(exchangeResult.service).toBe('CALENDAR');
      expect(exchangeResult.scopes).toEqual(GOOGLE_API_SCOPES.CALENDAR);
      // Critical security check: raw tokens must NEVER be returned in response!
      expect(exchangeResult.accessToken).toBeUndefined();
      expect(exchangeResult.refreshToken).toBeUndefined();

      // Check integration status
      const status = await oauthService.getIntegrationStatus('usr_100');
      expect(status.connected).toBe(true);
      expect(status.scopes).toEqual(GOOGLE_API_SCOPES.CALENDAR);
    });

    it('disconnects Google API integration without deleting the Workaholic user account', async () => {
      const { state } = oauthService.generateAuthorizationUrl({
        userId: 'usr_100',
        service: 'CALENDAR',
      });

      await oauthService.exchangeAuthorizationCode({
        userId: 'usr_100',
        code: 'auth_code_xyz',
        state,
        service: 'CALENDAR',
      });

      const disconnectResult = await oauthService.disconnectGoogleIntegration('usr_100');
      expect(disconnectResult.disconnected).toBe(true);

      const statusAfter = await oauthService.getIntegrationStatus('usr_100');
      expect(statusAfter.connected).toBe(false);
    });
  });

  // =========================================================================
  // Task 4.3, 4.4, 4.5: Session Lifecycle & HTTP Pipeline Integration
  // =========================================================================
  describe('Session Lifecycle & HTTP Integration (Fastify Pipeline)', () => {
    let app;

    beforeEach(async () => {
      app = createApp({ logger: false });
    });

    it('rejects access to protected endpoints when no authentication token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects malformed Bearer tokens with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer invalid_or_nonexistent_token_123',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('authenticates user via POST /api/v1/auth/google, sets HttpOnly cookie, and provides valid session token', async () => {
      const validToken = createMockGoogleIdToken({
        sub: 'google_sub_auth_test',
        email: 'google.tester@example.com',
        name: 'Google Tester',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: {
          idToken: validToken,
          device: {
            platform: 'WEB',
            deviceName: 'Firefox on Linux',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.token).toBeDefined();
      expect(body.data.token).toHaveLength(64); // 32-byte hex token
      expect(body.data.user.email).toBe('google.tester@example.com');
      expect(body.data.session.id).toBeDefined();

      // Verify Set-Cookie header contains HttpOnly session
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('workaholic_session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');

      const rawSessionToken = body.data.token;

      // Access protected endpoint using the returned Bearer token
      const protectedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: `Bearer ${rawSessionToken}`,
        },
      });

      expect(protectedRes.statusCode).toBe(200);
      const protectedBody = JSON.parse(protectedRes.payload);
      expect(protectedBody.data.email).toBe('google.tester@example.com');

      // Access session endpoint using cookie transport
      const sessionRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: {
          cookie: `workaholic_session=${rawSessionToken}`,
        },
      });

      expect(sessionRes.statusCode).toBe(200);
      const sessionBody = JSON.parse(sessionRes.payload);
      expect(sessionBody.data.authenticated).toBe(true);
      expect(sessionBody.data.user.email).toBe('google.tester@example.com');
    });

    it('handles logout by revoking active session and clearing cookie', async () => {
      const validToken = createMockGoogleIdToken({
        sub: 'google_sub_logout_test',
        email: 'logout.tester@example.com',
      });

      // 1. Log in
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: { idToken: validToken },
      });
      const rawToken = JSON.parse(loginRes.payload).data.token;

      // 2. Log out
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(logoutRes.statusCode).toBe(200);
      const logoutBody = JSON.parse(logoutRes.payload);
      expect(logoutBody.data.loggedOut).toBe(true);
      expect(logoutRes.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970');

      // 3. Try to access protected endpoint with the revoked token -> must fail
      const afterLogoutRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(afterLogoutRes.statusCode).toBe(401);
    });

    it('supports revoking all user sessions simultaneously', async () => {
      const validToken = createMockGoogleIdToken({
        sub: 'google_sub_revoke_all_test',
        email: 'revoke.all@example.com',
      });

      // Login device 1
      const login1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: { idToken: validToken, device: { platform: 'WEB', deviceName: 'Browser' } },
      });
      const token1 = JSON.parse(login1.payload).data.token;

      // Login device 2
      const login2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: { idToken: validToken, device: { platform: 'WINDOWS', deviceName: 'Desktop' } },
      });
      const token2 = JSON.parse(login2.payload).data.token;

      // Call revoke-all with token1
      const revokeAllRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/revoke-all',
        headers: { authorization: `Bearer ${token1}` },
      });

      expect(revokeAllRes.statusCode).toBe(200);
      expect(JSON.parse(revokeAllRes.payload).data.revokedCount).toBeGreaterThanOrEqual(2);

      // Both tokens must now be rejected
      const check1 = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${token1}` },
      });
      const check2 = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${token2}` },
      });

      expect(check1.statusCode).toBe(401);
      expect(check2.statusCode).toBe(401);
    });

    it('enforces IDOR protection when revoking specific sessions', async () => {
      // User 1
      const login1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: {
          idToken: createMockGoogleIdToken({ sub: 'user_idor_1', email: 'user1@example.com' }),
        },
      });
      const session1Id = JSON.parse(login1.payload).data.session.id;

      // User 2
      const login2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: {
          idToken: createMockGoogleIdToken({ sub: 'user_idor_2', email: 'user2@example.com' }),
        },
      });
      const token2 = JSON.parse(login2.payload).data.token;

      // User 2 attempts to revoke User 1's session -> must be shielded with 404 NOT_FOUND
      const attackRes = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/sessions/${session1Id}/revoke`,
        headers: { authorization: `Bearer ${token2}` },
      });

      expect(attackRes.statusCode).toBe(404);
      expect(JSON.parse(attackRes.payload).error.code).toBe('NOT_FOUND');
    });

    it('lists registered devices and updates trust state', async () => {
      const validToken = createMockGoogleIdToken({
        sub: 'google_sub_device_test',
        email: 'device.tester@example.com',
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: {
          idToken: validToken,
          device: { platform: 'WINDOWS', deviceName: 'Office PC' },
        },
      });
      const rawToken = JSON.parse(loginRes.payload).data.token;

      // List devices
      const devicesRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/devices',
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(devicesRes.statusCode).toBe(200);
      const devices = JSON.parse(devicesRes.payload).data;
      expect(devices.length).toBeGreaterThanOrEqual(1);
      const deviceId = devices[0].id;
      expect(devices[0].platform).toBe('WINDOWS');

      // Update trust state to TRUSTED
      const trustRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/auth/devices/${deviceId}/trust`,
        headers: { authorization: `Bearer ${rawToken}` },
        payload: { trustState: 'TRUSTED' },
      });

      expect(trustRes.statusCode).toBe(200);
      expect(JSON.parse(trustRes.payload).data.trustState).toBe('TRUSTED');

      // Revoke device
      const deleteDevRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/auth/devices/${deviceId}`,
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(deleteDevRes.statusCode).toBe(200);
      expect(JSON.parse(deleteDevRes.payload).data.revoked).toBe(true);
    });

    it('records and returns security audit events for authenticated user', async () => {
      const validToken = createMockGoogleIdToken({
        sub: 'google_sub_events_test',
        email: 'events.tester@example.com',
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: { idToken: validToken },
      });
      const rawToken = JSON.parse(loginRes.payload).data.token;

      const eventsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/security-events',
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(eventsRes.statusCode).toBe(200);
      const body = JSON.parse(eventsRes.payload);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.some(e => e.eventType === 'LOGIN_SUCCESS')).toBe(true);

      // Verify metadata does NOT leak tokens or secrets
      for (const ev of body.data) {
        const str = JSON.stringify(ev);
        expect(str).not.toContain(rawToken);
        expect(str).not.toContain('password');
      }
    });
  });
});
