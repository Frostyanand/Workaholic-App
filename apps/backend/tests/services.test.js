import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UsersService } from '../src/modules/users/users.service.js';
import { WorkspacesService } from '../src/modules/workspaces/workspaces.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AuthenticationRequiredError,
} from '../src/core/errors.js';
import { createApp } from '../src/app.js';
import { WORKSPACE_ROLE, MEMBERSHIP_STATUS, DEVICE_TRUST_STATE } from '@workaholic/shared';

describe('API Structure & Service Layer Architecture (Task 3.3)', () => {
  describe('UsersService', () => {
    let mockRepo;
    let service;

    beforeEach(() => {
      mockRepo = {
        findUserById: async id =>
          id === 'usr_valid' ? { id: 'usr_valid', email: 'user@test.com' } : null,
        findUserByEmail: async email =>
          email === 'taken@test.com' ? { id: 'usr_taken', email: 'taken@test.com' } : null,
        createUser: async data => ({ id: 'usr_created', ...data }),
        updateUser: async (id, data) => ({ id, ...data }),
        softDeleteUser: async id => ({ id, deletedAt: new Date() }),
      };
      service = new UsersService(mockRepo);
    });

    it('returns user profile when user exists', async () => {
      const user = await service.getUserProfile('usr_valid');
      expect(user.id).toBe('usr_valid');
    });

    it('throws NotFoundError when user does not exist', async () => {
      await expect(service.getUserProfile('usr_missing')).rejects.toThrow(NotFoundError);
    });

    it('prevents creating user with duplicate email', async () => {
      await expect(
        service.createUser({ email: 'taken@test.com', displayName: 'Dup' }),
      ).rejects.toThrow(ConflictError);
    });

    it('creates user with valid data', async () => {
      const created = await service.createUser({ email: 'new@test.com', displayName: 'New' });
      expect(created.id).toBe('usr_created');
      expect(created.email).toBe('new@test.com');
    });

    it('prevents updating user email to an existing email belonging to another user', async () => {
      await expect(
        service.updateUserProfile('usr_valid', { email: 'taken@test.com' }),
      ).rejects.toThrow(ConflictError);
    });

    it('allows updating user profile fields', async () => {
      const updated = await service.updateUserProfile('usr_valid', { displayName: 'Updated' });
      expect(updated.displayName).toBe('Updated');
    });

    it('soft-deletes user account', async () => {
      const deleted = await service.deleteUser('usr_valid');
      expect(deleted.deletedAt).toBeDefined();
    });
  });

  describe('WorkspacesService', () => {
    let mockRepo;
    let service;

    beforeEach(() => {
      mockRepo = {
        findWorkspacesForUser: async userId =>
          userId === 'usr_owner' ? [{ id: 'ws_1', name: 'Primary' }] : [],
        findWorkspaceById: async id =>
          id === 'ws_1'
            ? { id: 'ws_1', name: 'Primary', ownerUserId: 'usr_owner' }
            : id === 'ws_secret'
              ? { id: 'ws_secret', name: 'Other User Workspace', ownerUserId: 'usr_other' }
              : null,
        findWorkspaceMemberships: async id => {
          if (id === 'ws_1') {
            return [
              {
                workspaceId: 'ws_1',
                userId: 'usr_owner',
                role: WORKSPACE_ROLE.OWNER,
                status: MEMBERSHIP_STATUS.ACTIVE,
              },
              {
                workspaceId: 'ws_1',
                userId: 'usr_admin',
                role: WORKSPACE_ROLE.ADMIN,
                status: MEMBERSHIP_STATUS.ACTIVE,
              },
              {
                workspaceId: 'ws_1',
                userId: 'usr_member',
                role: WORKSPACE_ROLE.MEMBER,
                status: MEMBERSHIP_STATUS.ACTIVE,
              },
            ];
          }
          if (id === 'ws_secret') {
            return [
              {
                workspaceId: 'ws_secret',
                userId: 'usr_other',
                role: WORKSPACE_ROLE.OWNER,
                status: MEMBERSHIP_STATUS.ACTIVE,
              },
            ];
          }
          return [];
        },
        createWorkspaceWithMembership: async data => ({
          id: 'ws_new',
          name: data.name,
          ownerUserId: data.ownerUserId,
        }),
        addWorkspaceMembership: async (wsId, userId, role, status) => ({
          id: 'mem_new',
          workspaceId: wsId,
          userId,
          role,
          status,
        }),
        updateMembershipRole: async (wsId, userId, role) => ({
          workspaceId: wsId,
          userId,
          role,
        }),
      };
      service = new WorkspacesService(mockRepo);
    });

    it('retrieves workspaces for user', async () => {
      const workspaces = await service.getUserWorkspaces('usr_owner');
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].id).toBe('ws_1');
    });

    it('retrieves workspace when user is an active member', async () => {
      const ws = await service.getWorkspaceById('ws_1', 'usr_owner');
      expect(ws.id).toBe('ws_1');
      expect(ws.membership.role).toBe(WORKSPACE_ROLE.OWNER);
    });

    it('returns NotFoundError when user is not a member of the workspace (tenant isolation)', async () => {
      // Must not leak existence of ws_secret to usr_owner
      await expect(service.getWorkspaceById('ws_secret', 'usr_owner')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('creates workspace with owner membership', async () => {
      const ws = await service.createWorkspace('usr_creator', { name: 'My Workspace' });
      expect(ws.id).toBe('ws_new');
      expect(ws.ownerUserId).toBe('usr_creator');
    });

    it('allows OWNER to add a member', async () => {
      const member = await service.addMember('ws_1', 'usr_owner', {
        userId: 'usr_new_member',
        role: WORKSPACE_ROLE.MEMBER,
      });
      expect(member.userId).toBe('usr_new_member');
      expect(member.role).toBe(WORKSPACE_ROLE.MEMBER);
    });

    it('allows ADMIN to add a regular member', async () => {
      const member = await service.addMember('ws_1', 'usr_admin', {
        userId: 'usr_new_member',
        role: WORKSPACE_ROLE.MEMBER,
      });
      expect(member.userId).toBe('usr_new_member');
    });

    it('forbids ADMIN from adding an OWNER', async () => {
      await expect(
        service.addMember('ws_1', 'usr_admin', {
          userId: 'usr_new_owner',
          role: WORKSPACE_ROLE.OWNER,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('forbids regular MEMBER from adding new members', async () => {
      await expect(
        service.addMember('ws_1', 'usr_member', {
          userId: 'usr_candidate',
          role: WORKSPACE_ROLE.MEMBER,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows OWNER to update member role', async () => {
      const updated = await service.updateMemberRole(
        'ws_1',
        'usr_owner',
        'usr_member',
        WORKSPACE_ROLE.ADMIN,
      );
      expect(updated.role).toBe(WORKSPACE_ROLE.ADMIN);
    });

    it('forbids modifying workspace owner role without ownership transfer', async () => {
      await expect(
        service.updateMemberRole('ws_1', 'usr_owner', 'usr_owner', WORKSPACE_ROLE.MEMBER),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('AuthService', () => {
    let mockSessions;
    let mockDevices;
    let service;

    beforeEach(() => {
      mockSessions = {
        findActiveSessionByTokenHash: async hash =>
          hash === 'valid_hash'
            ? {
                id: 'sess_1',
                userId: 'usr_1',
                sessionTokenHash: 'valid_hash',
                expiresAt: new Date(Date.now() + 10000),
              }
            : null,
        touchSession: async id => ({ id, lastSeenAt: new Date() }),
        revokeSession: async id => (id === 'sess_1' ? { id, revokedAt: new Date() } : null),
        revokeAllUserSessions: async userId => [{ userId, revokedAt: new Date() }],
      };
      mockDevices = {
        registerDevice: async data => ({ id: 'dev_1', ...data }),
        findDevicesForUser: async userId => [{ id: 'dev_1', userId }],
        updateDeviceTrustState: async (id, state) =>
          id === 'dev_1' ? { id, trustState: state } : null,
      };
      service = new AuthService(mockSessions, mockDevices);
    });

    it('validates active session and touches last_seen_at', async () => {
      const session = await service.validateSession('valid_hash');
      expect(session.id).toBe('sess_1');
      expect(session.userId).toBe('usr_1');
    });

    it('throws AuthenticationRequiredError on invalid session token', async () => {
      await expect(service.validateSession('invalid_hash')).rejects.toThrow(
        AuthenticationRequiredError,
      );
    });

    it('throws AuthenticationRequiredError when token is missing', async () => {
      await expect(service.validateSession(null)).rejects.toThrow(AuthenticationRequiredError);
    });

    it('revokes session successfully', async () => {
      const revoked = await service.revokeSession('sess_1');
      expect(revoked.revokedAt).toBeDefined();
    });

    it('throws NotFoundError when revoking non-existent session', async () => {
      await expect(service.revokeSession('sess_missing')).rejects.toThrow(NotFoundError);
    });

    it('revokes all sessions for user', async () => {
      const result = await service.revokeAllUserSessions('usr_1');
      expect(result.length).toBe(1);
    });

    it('registers client device', async () => {
      const device = await service.registerDevice('usr_1', {
        platform: 'WEB',
        deviceName: 'Chrome on Windows',
      });
      expect(device.id).toBe('dev_1');
      expect(device.platform).toBe('WEB');
    });

    it('updates device trust state', async () => {
      const updated = await service.updateDeviceTrust('dev_1', DEVICE_TRUST_STATE.TRUSTED);
      expect(updated.trustState).toBe(DEVICE_TRUST_STATE.TRUSTED);
    });
  });

  describe('HTTP Route Integration (Route -> Service -> Repository Flow)', () => {
    let app;

    beforeEach(async () => {
      app = createApp({ logger: false });

      // Simulate authenticated user context
      app.addHook('preHandler', async request => {
        request.user = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'pilot@workaholic.local',
          displayName: 'Pilot',
        };
      });

      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('GET /api/v1/users/me returns authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('POST /api/v1/workspaces validates input and rejects empty name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces',
        payload: {
          name: '',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.fields.name).toBe('Workspace name cannot be empty');
    });

    it('GET /api/v1/workspaces/:id rejects invalid UUID param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/invalid-uuid',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.fields.id).toBe('Invalid UUID identifier');
    });
  });
});
