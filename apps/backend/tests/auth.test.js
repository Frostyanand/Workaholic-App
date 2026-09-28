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
  firebaseAuthService,
  createMockFirebaseIdToken,
  FirebaseAuthService,
} from '../src/modules/auth/firebase-auth.service.js';
import {
  OAuthBoundaryService,
  GOOGLE_API_SCOPES,
} from '../src/modules/auth/oauth-boundary.service.js';
import { AccountBootstrapService } from '../src/modules/auth/account-bootstrap.service.js';
import { AuthenticationFailedError } from '../src/core/errors.js';

describe('Phase 4: Authentication and Identity (Firebase Authority)', () => {
  // =========================================================================
  // 1. Cryptographic Foundation (Task 4.3 & Security Specs)
  // =========================================================================
  describe('1. Cryptographic Foundation (crypto.js)', () => {
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
      decoded.ciphertext =
        decoded.ciphertext.slice(0, -2) + (decoded.ciphertext.slice(-2) === 'aa' ? 'bb' : 'aa');
      const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64');

      expect(() => decryptCredentials(tampered)).toThrow();
    });
  });

  // =========================================================================
  // 2. Firebase Authentication & Identity Verification (Task 4.1 & System Arch §13, 14)
  // =========================================================================
  describe('2. Firebase Authentication Token Verification (firebase-auth.service.js)', () => {
    it('verifies a valid Firebase ID token and extracts normalized identity claims', async () => {
      const validToken = createMockFirebaseIdToken({
        uid: 'firebase_user_987654321',
        email: 'sarah.connor@example.com',
        name: 'Sarah Connor',
        picture: 'https://lh3.googleusercontent.com/avatar1',
        email_verified: true,
        signInProvider: 'google.com',
      });

      const identity = await firebaseAuthService.verifyFirebaseIdToken(validToken);

      expect(identity.provider).toBe('FIREBASE');
      expect(identity.subject).toBe('firebase_user_987654321');
      expect(identity.email).toBe('sarah.connor@example.com');
      expect(identity.emailVerified).toBe(true);
      expect(identity.displayName).toBe('Sarah Connor');
      expect(identity.picture).toBe('https://lh3.googleusercontent.com/avatar1');
      expect(identity.signInProvider).toBe('google.com');
    });

    it('rejects tokens with missing or invalid issuer', async () => {
      const invalidIssuerToken = createMockFirebaseIdToken({
        iss: 'https://evil-auth-provider.com',
      });

      await expect(firebaseAuthService.verifyFirebaseIdToken(invalidIssuerToken)).rejects.toThrow(
        AuthenticationFailedError,
      );
    });

    it('rejects tokens with mismatched audience (Firebase project ID)', async () => {
      const mismatchedAudToken = createMockFirebaseIdToken({
        aud: 'other-firebase-project',
      });

      await expect(firebaseAuthService.verifyFirebaseIdToken(mismatchedAudToken)).rejects.toThrow(
        /audience does not match/i,
      );
    });

    it('rejects expired Firebase ID tokens', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiredToken = createMockFirebaseIdToken({
        exp: nowSec - 300, // expired 5 minutes ago
      });

      await expect(firebaseAuthService.verifyFirebaseIdToken(expiredToken)).rejects.toThrow(
        /expired/i,
      );
    });

    it('preserves emailVerified metadata without rejecting unverified email', async () => {
      const unverifiedToken = createMockFirebaseIdToken({
        uid: 'firebase_unverified_user',
        email: 'unverified@example.com',
        email_verified: false,
      });

      const identity = await firebaseAuthService.verifyFirebaseIdToken(unverifiedToken);
      expect(identity.subject).toBe('firebase_unverified_user');
      expect(identity.email).toBe('unverified@example.com');
      expect(identity.emailVerified).toBe(false);
    });

    it('rejects malformed or empty token strings', async () => {
      await expect(firebaseAuthService.verifyFirebaseIdToken('not-a-valid-jwt')).rejects.toThrow(
        AuthenticationFailedError,
      );
      await expect(firebaseAuthService.verifyFirebaseIdToken('')).rejects.toThrow(
        AuthenticationFailedError,
      );
      await expect(firebaseAuthService.verifyFirebaseIdToken(null)).rejects.toThrow(
        AuthenticationFailedError,
      );
    });

    it('strictly forbids mock/test verification in production mode', async () => {
      const prodService = new FirebaseAuthService({
        env: 'production',
        projectId: 'workaholic-prod',
      });

      const mockToken = createMockFirebaseIdToken({}, 'workaholic-prod');
      await expect(prodService.verifyFirebaseIdToken(mockToken)).rejects.toThrow(
        /FATAL SECURITY INVARIANT/i,
      );
    });

    it('sanitizes Firebase Admin SDK errors cleanly into AuthenticationFailedError', async () => {
      const mockAdminAuth = {
        verifyIdToken: async () => {
          const err = new Error('Token revoked');
          err.code = 'auth/id-token-revoked';
          throw err;
        },
      };

      const customService = new FirebaseAuthService({
        env: 'test',
        adminAuth: mockAdminAuth,
      });

      // Pass token that doesn't end with mock signature to invoke adminAuth path
      await expect(
        customService.verifyFirebaseIdToken('header.payload.real_firebase_signature'),
      ).rejects.toThrow(/revoked/i);
    });
  });

  // =========================================================================
  // 3. Google API OAuth Boundary (Task 4.2 & Integration Spec §4, 5)
  // =========================================================================
  describe('3. Google API OAuth Boundary (oauth-boundary.service.js)', () => {
    let mockIntegrationsRepo;
    let oauthService;

    beforeEach(() => {
      mockIntegrationsRepo = {
        findIntegration: async () => ({ id: 'mock_int_1', status: 'CONNECTED' }),
        findIntegrationWithAccount: async () => null,
        upsertIntegrationWithAccount: async data => ({
          integration: { id: 'mock_int_1', status: 'CONNECTED' },
          externalAccount: { id: 'mock_ext_1', provider: 'GOOGLE' },
          ...data,
        }),
        deleteIntegration: async () => true,
        disconnectIntegration: async () => true,
      };

      oauthService = new OAuthBoundaryService(mockIntegrationsRepo);
    });

    it('generates scoped OAuth authorization URL for Calendar with isolated scope', () => {
      const auth = oauthService.generateAuthorizationUrl({
        userId: 'user-uuid-1',
        service: 'CALENDAR',
      });

      expect(auth.authorizationUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(auth.authorizationUrl).toContain(encodeURIComponent(GOOGLE_API_SCOPES.CALENDAR[0]));
      expect(auth.authorizationUrl).not.toContain(encodeURIComponent(GOOGLE_API_SCOPES.TASKS[0]));
      expect(auth.authorizationUrl).not.toContain(encodeURIComponent(GOOGLE_API_SCOPES.DRIVE[0]));
      expect(auth.state).toHaveLength(48);
    });

    it('enforces that Google API authorization is independent from Workaholic authentication', async () => {
      // Disconnecting Google integration should succeed without touching native user/session
      const disconnected = await oauthService.disconnectGoogleIntegration('user-uuid-1');
      expect(disconnected.disconnected).toBe(true);
    });
  });

  // =========================================================================
  // 4. Account Bootstrap Engine (Task 4.6 & System Arch §14)
  // =========================================================================
  describe('4. Account Bootstrap Engine (account-bootstrap.service.js)', () => {
    let mockUsersRepo;
    let mockWorkspacesRepo;
    let mockExternalIdentitiesRepo;
    let bootstrapService;

    beforeEach(() => {
      const storedUsers = new Map();
      const storedIdentities = new Map();
      const storedWorkspaces = new Map();

      mockUsersRepo = {
        findUserById: async id => storedUsers.get(id) || null,
        findUserByEmail: async email => {
          for (const u of storedUsers.values()) {
            if (u.email === email.toLowerCase()) return u;
          }
          return null;
        },
        createUser: async data => {
          const user = { id: `user_${Date.now()}_${Math.random()}`, ...data };
          storedUsers.set(user.id, user);
          return user;
        },
      };

      mockWorkspacesRepo = {
        createWorkspaceWithMembership: async data => {
          const workspace = { id: `ws_${Date.now()}_${Math.random()}`, ...data };
          storedWorkspaces.set(workspace.id, workspace);
          const membership = {
            id: `mem_${Date.now()}`,
            workspaceId: workspace.id,
            userId: data.ownerUserId,
            role: 'OWNER',
          };
          return { workspace, membership };
        },
      };

      mockExternalIdentitiesRepo = {
        findExternalIdentity: async (provider, subject) => {
          return storedIdentities.get(`${provider}:${subject}`) || null;
        },
        createExternalIdentity: async data => {
          const key = `${data.provider}:${data.providerSubject}`;
          if (storedIdentities.has(key)) {
            const err = new Error('duplicate key value violates unique constraint');
            err.code = '23505';
            throw err;
          }
          const rec = { id: `ext_${Date.now()}`, ...data };
          storedIdentities.set(key, rec);
          return rec;
        },
      };

      // Mock txHelper that passes through to callback
      const mockTx = async fn => fn({});

      bootstrapService = new AccountBootstrapService(
        mockUsersRepo,
        mockWorkspacesRepo,
        mockExternalIdentitiesRepo,
        mockTx,
      );
    });

    it('bootstraps new user, personal workspace, owner membership, and FIREBASE external identity on first login', async () => {
      const result = await bootstrapService.bootstrapOrResolveUser({
        provider: 'FIREBASE',
        subject: 'firebase_uid_new_user',
        email: 'brandnew@example.com',
        displayName: 'Brand New User',
        picture: 'https://example.com/avatar.jpg',
      });

      expect(result.isNewUser).toBe(true);
      expect(result.user.displayName).toBe('Brand New User');
      expect(result.user.email).toBe('brandnew@example.com');
      expect(result.workspace.name).toBe('Personal');
      expect(result.workspace.workspaceType).toBe('PERSONAL');
      expect(result.membership.role).toBe('OWNER');
      expect(result.externalIdentity.provider).toBe('FIREBASE');
      expect(result.externalIdentity.providerSubject).toBe('firebase_uid_new_user');
    });

    it('idempotently resolves existing user without creating duplicate entities on subsequent logins', async () => {
      const identity = {
        provider: 'FIREBASE',
        subject: 'firebase_uid_idempotent',
        email: 'idempotent@example.com',
        displayName: 'Idempotent User',
      };

      const first = await bootstrapService.bootstrapOrResolveUser(identity);
      expect(first.isNewUser).toBe(true);

      const second = await bootstrapService.bootstrapOrResolveUser(identity);
      expect(second.isNewUser).toBe(false);
      expect(second.user.id).toBe(first.user.id);
      expect(second.workspace).toBeUndefined();
    });

    it('enforces Identity Isolation: Firebase UID is authoritative, changing email does not change user', async () => {
      const first = await bootstrapService.bootstrapOrResolveUser({
        provider: 'FIREBASE',
        subject: 'firebase_uid_isolation_test',
        email: 'original@example.com',
        displayName: 'Original Name',
      });

      // Subsequent login with same Firebase UID but changed email
      const second = await bootstrapService.bootstrapOrResolveUser({
        provider: 'FIREBASE',
        subject: 'firebase_uid_isolation_test',
        email: 'changed@example.com',
        displayName: 'Changed Name',
      });

      expect(second.user.id).toBe(first.user.id);
      expect(second.isNewUser).toBe(false);
    });

    it('distinguishes Firebase UID A from Firebase UID B even with different accounts', async () => {
      const userA = await bootstrapService.bootstrapOrResolveUser({
        provider: 'FIREBASE',
        subject: 'firebase_uid_A',
        email: 'usera@example.com',
      });

      const userB = await bootstrapService.bootstrapOrResolveUser({
        provider: 'FIREBASE',
        subject: 'firebase_uid_B',
        email: 'userb@example.com',
      });

      expect(userA.user.id).not.toBe(userB.user.id);
      expect(userA.workspace.id).not.toBe(userB.workspace.id);
    });
  });

  // =========================================================================
  // 5. Session Lifecycle & HTTP Integration (Fastify Pipeline)
  // =========================================================================
  describe('5. Session Lifecycle & HTTP Integration (Fastify Pipeline)', () => {
    let app;

    beforeEach(async () => {
      app = await createApp();
    });

    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
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

    it('authenticates user via canonical POST /api/v1/auth/session, sets HttpOnly cookie, and provides valid session token', async () => {
      const validToken = createMockFirebaseIdToken({
        uid: 'firebase_sub_auth_test',
        email: 'firebase.tester@example.com',
        name: 'Firebase Tester',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: {
          idToken: validToken,
          device: {
            platform: 'WEB',
            deviceName: 'Chrome on Windows',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.token).toBeDefined();
      expect(body.data.token).toHaveLength(64); // 32-byte hex token
      expect(body.data.user.email).toBe('firebase.tester@example.com');
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
      expect(protectedBody.data.email).toBe('firebase.tester@example.com');

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
      expect(sessionBody.data.user.email).toBe('firebase.tester@example.com');
    });

    it('supports alias endpoint POST /api/v1/auth/firebase identically', async () => {
      const validToken = createMockFirebaseIdToken({
        uid: 'firebase_alias_test_uid',
        email: 'alias.tester@example.com',
        name: 'Alias Tester',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/firebase',
        payload: {
          idToken: validToken,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.token).toBeDefined();
      expect(body.data.user.email).toBe('alias.tester@example.com');
    });

    it('does NOT retain POST /api/v1/auth/google as an authentication endpoint', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: { idToken: 'some_token' },
      });

      // Route must not exist (404 NOT FOUND)
      expect(res.statusCode).toBe(404);
    });

    it('handles logout by revoking active session and clearing cookie', async () => {
      const validToken = createMockFirebaseIdToken({
        uid: 'firebase_uid_logout_test',
        email: 'logout.tester@example.com',
      });

      // 1. Log in
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: { idToken: validToken },
      });
      const rawToken = JSON.parse(loginRes.payload).data.token;

      // 2. Log out
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${rawToken}`,
        },
      });

      expect(logoutRes.statusCode).toBe(200);
      expect(JSON.parse(logoutRes.payload).data.loggedOut).toBe(true);
      expect(logoutRes.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970');

      // 3. Subsequent request with revoked token must fail with 401
      const afterRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: `Bearer ${rawToken}`,
        },
      });
      expect(afterRes.statusCode).toBe(401);
    });

    it('supports revoking all user sessions simultaneously', async () => {
      const validToken = createMockFirebaseIdToken({
        uid: 'firebase_uid_revoke_all_test',
        email: 'revokeall@example.com',
      });

      // Login device 1
      const login1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: { idToken: validToken, device: { platform: 'WEB', deviceName: 'Web 1' } },
      });
      const token1 = JSON.parse(login1.payload).data.token;

      // Login device 2
      const login2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: {
          idToken: validToken,
          device: { platform: 'WINDOWS', deviceName: 'Desktop App' },
        },
      });
      const token2 = JSON.parse(login2.payload).data.token;

      // Revoke all
      const revokeRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/revoke-all',
        headers: { authorization: `Bearer ${token1}` },
      });
      expect(revokeRes.statusCode).toBe(200);
      expect(JSON.parse(revokeRes.payload).data.revokedCount).toBeGreaterThanOrEqual(2);

      // Both tokens are now invalid
      const check1 = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${token1}` },
      });
      expect(check1.statusCode).toBe(401);

      const check2 = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${token2}` },
      });
      expect(check2.statusCode).toBe(401);
    });

    it('enforces IDOR protection when revoking specific sessions', async () => {
      // User 1
      const login1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: {
          idToken: createMockFirebaseIdToken({
            uid: 'firebase_user_1',
            email: 'user1@example.com',
          }),
        },
      });
      const session1Id = JSON.parse(login1.payload).data.session.id;

      // User 2
      const login2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: {
          idToken: createMockFirebaseIdToken({
            uid: 'firebase_user_2',
            email: 'user2@example.com',
          }),
        },
      });
      const token2 = JSON.parse(login2.payload).data.token;

      // User 2 attempts to revoke User 1's session
      const idorRes = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/sessions/${session1Id}/revoke`,
        headers: { authorization: `Bearer ${token2}` },
      });

      expect(idorRes.statusCode).toBe(404); // NOT_FOUND prevents leaking existence
    });

    it('lists registered devices and updates trust state', async () => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: {
          idToken: createMockFirebaseIdToken({
            uid: 'firebase_device_tester',
            email: 'device.tester@example.com',
          }),
          device: { platform: 'WINDOWS', deviceName: 'Dell XPS' },
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

      // Update trust state
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/auth/devices/${deviceId}/trust`,
        headers: { authorization: `Bearer ${rawToken}` },
        payload: { trustState: 'TRUSTED' },
      });

      expect(patchRes.statusCode).toBe(200);
      expect(JSON.parse(patchRes.payload).data.trustState).toBe('TRUSTED');
    });

    it('records and returns security audit events for authenticated user', async () => {
      const validToken = createMockFirebaseIdToken({
        uid: 'firebase_security_audit_tester',
        email: 'audit.tester@example.com',
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
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
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].eventType).toBe('LOGIN_SUCCESS');
      // Verify no sensitive token hash leaked
      expect(body.data[0].metadata?.sessionTokenHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. Google Workspace Onboarding & OAuth Boundary Integration
  // =========================================================================
  describe('6. Google Workspace Onboarding & OAuth Authorization Boundary', () => {
    let app;
    let rawToken;

    beforeEach(async () => {
      app = await createApp();
      const validToken = createMockFirebaseIdToken({
        uid: 'firebase_workspace_onboarding_user',
        email: 'workspace.onboarding@example.com',
        name: 'Workspace Tester',
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/session',
        payload: { idToken: validToken },
      });
      const body = JSON.parse(loginRes.payload);
      rawToken = body.data.token;
    });

    it('reports DISCONNECTED with all services false when user has not authorized Google', async () => {
      const statusRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google/status',
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(statusRes.statusCode).toBe(200);
      const body = JSON.parse(statusRes.payload).data;
      expect(body.connected).toBe(false);
      expect(body.status).toBe('DISCONNECTED');
      expect(body.services).toEqual({
        calendar: false,
        tasks: false,
        drive: false,
      });
      // Security invariant: Zero secrets or tokens exposed
      expect(body.accessToken).toBeUndefined();
      expect(body.refreshToken).toBeUndefined();
      expect(body.clientSecret).toBeUndefined();
    });

    it('generates authorization URL with narrowest scopes for WORKSPACE service', async () => {
      const authRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google/authorize?service=WORKSPACE',
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(authRes.statusCode).toBe(200);
      const body = JSON.parse(authRes.payload).data;
      expect(body.service).toBe('WORKSPACE');
      expect(body.state).toBeDefined();
      expect(body.authorizationUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
      // Verify all 4 narrowest scopes are present
      expect(body.scopes).toContain('https://www.googleapis.com/auth/calendar.events');
      expect(body.scopes).toContain('https://www.googleapis.com/auth/calendar.readonly');
      expect(body.scopes).toContain('https://www.googleapis.com/auth/tasks');
      expect(body.scopes).toContain('https://www.googleapis.com/auth/drive.file');
      expect(body.authorizationUrl).toContain(
        encodeURIComponent('https://www.googleapis.com/auth/calendar.events'),
      );
    });

    it('completes OAuth exchange for WORKSPACE and activates calendar, tasks, and drive services', async () => {
      // 1. Initiate authorization to create state
      const authRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google/authorize?service=WORKSPACE',
        headers: { authorization: `Bearer ${rawToken}` },
      });
      const { state } = JSON.parse(authRes.payload).data;

      // 2. Complete callback with code and state
      const callbackRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google/callback',
        headers: { authorization: `Bearer ${rawToken}` },
        payload: {
          code: 'test_google_auth_code_workspace_123',
          state,
          service: 'WORKSPACE',
        },
      });

      expect(callbackRes.statusCode).toBe(200);
      const callbackBody = JSON.parse(callbackRes.payload).data;
      expect(callbackBody.connected).toBe(true);
      expect(callbackBody.service).toBe('WORKSPACE');

      // 3. Verify status endpoint reports connected with all 3 services enabled
      const statusRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google/status',
        headers: { authorization: `Bearer ${rawToken}` },
      });

      expect(statusRes.statusCode).toBe(200);
      const statusBody = JSON.parse(statusRes.payload).data;
      expect(statusBody.connected).toBe(true);
      expect(statusBody.services).toEqual({
        calendar: true,
        tasks: true,
        drive: true,
      });
      // Encrypted credential security invariant: refresh and access tokens NOT leaked
      expect(statusBody.refreshToken).toBeUndefined();
      expect(statusBody.accessToken).toBeUndefined();
      expect(statusBody.encryptedCredentials).toBeUndefined();
    });

    it('returns error HTML and posts GOOGLE_AUTH_ERROR on callback error or denial', async () => {
      const errorRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google/callback?error=access_denied&error_description=User%20denied%20consent',
      });

      expect(errorRes.statusCode).toBe(200);
      expect(errorRes.headers['content-type']).toContain('text/html');
      expect(errorRes.payload).toContain('Authorization Cancelled');
      expect(errorRes.payload).toContain('GOOGLE_AUTH_ERROR');
      expect(errorRes.payload).toContain('access_denied');
    });
  });
});
