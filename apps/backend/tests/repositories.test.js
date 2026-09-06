import { describe, it, expect, vi } from 'vitest';
import * as usersRepo from '../src/modules/users/users.repository.js';
import * as workspacesRepo from '../src/modules/workspaces/workspaces.repository.js';
import * as sessionsRepo from '../src/modules/auth/sessions.repository.js';
import * as devicesRepo from '../src/modules/auth/devices.repository.js';

describe('Task 2.5 — Data Access Layer & Repositories (Pure pg & Parameterized SQL)', () => {
  describe('Users Repository', () => {
    it('creates a user with parameterized SQL and returns mapped domain object', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        display_name: 'Jane Doe',
        email: 'jane@example.com',
        profile_image_reference: null,
        timezone: 'UTC',
        locale: 'en',
        preferences: { theme: 'dark' },
        created_at: new Date('2026-09-01T00:00:00Z'),
        updated_at: new Date('2026-09-01T00:00:00Z'),
        deleted_at: null,
      };

      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [mockRow] }),
      };

      const user = await usersRepo.createUser(
        {
          displayName: 'Jane Doe',
          email: 'jane@example.com',
          preferences: { theme: 'dark' },
        },
        mockClient,
      );

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO users');
      expect(sql).toContain('$1, $2, $3, $4, $5, $6::jsonb');
      expect(params[0]).toBe('Jane Doe');
      expect(params[1]).toBe('jane@example.com');
      expect(params[5]).toBe(JSON.stringify({ theme: 'dark' }));

      // Clean camelCase domain object
      expect(user.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(user.displayName).toBe('Jane Doe');
      expect(user.email).toBe('jane@example.com');
      expect(user.preferences).toEqual({ theme: 'dark' });
      expect(user.display_name).toBeUndefined();
    });

    it('rejects invalid inputs when creating a user', async () => {
      await expect(usersRepo.createUser(null)).rejects.toThrow('userData must be an object');
      await expect(usersRepo.createUser({})).rejects.toThrow('displayName and email are required');
    });

    it('finds active user by ID and respects soft deletion', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              display_name: 'Jane Doe',
              email: 'jane@example.com',
              profile_image_reference: null,
              timezone: 'UTC',
              locale: 'en',
              preferences: {},
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: null,
            },
          ],
        }),
      };

      const user = await usersRepo.findUserById('123e4567-e89b-12d3-a456-426614174000', mockClient);
      expect(user).not.toBeNull();
      expect(user.displayName).toBe('Jane Doe');

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('WHERE id = $1 AND deleted_at IS NULL');
      expect(params).toEqual(['123e4567-e89b-12d3-a456-426614174000']);
    });

    it('finds active user by email with case-insensitive search', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      const user = await usersRepo.findUserByEmail('JANE@example.com', mockClient);
      expect(user).toBeNull();

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL');
      expect(params).toEqual(['JANE@example.com']);
    });

    it('updates user profile with parameterized clauses', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: '123',
              display_name: 'Jane Updated',
              email: 'jane@example.com',
              preferences: {},
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: null,
            },
          ],
        }),
      };

      const updated = await usersRepo.updateUser(
        '123',
        { displayName: 'Jane Updated', timezone: 'America/New_York' },
        mockClient,
      );

      expect(updated.displayName).toBe('Jane Updated');
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('UPDATE users');
      expect(sql).toContain('display_name = $2');
      expect(sql).toContain('timezone = $3');
      expect(sql).toContain('updated_at = CURRENT_TIMESTAMP');
      expect(params).toEqual(['123', 'Jane Updated', 'America/New_York']);
    });

    it('soft-deletes user setting deleted_at', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [{ id: '123', deleted_at: new Date() }],
        }),
      };

      const result = await usersRepo.softDeleteUser('123', mockClient);
      expect(result).toBe(true);
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('SET deleted_at = CURRENT_TIMESTAMP');
      expect(params).toEqual(['123']);
    });
  });

  describe('Workspaces Repository & Tenant Isolation', () => {
    it('creates workspace and owner membership atomically inside a transaction', async () => {
      const wsRow = {
        id: 'ws_123',
        name: 'My Workspace',
        workspace_type: 'PERSONAL',
        owner_user_id: 'user_123',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      const memRow = {
        id: 'mem_123',
        workspace_id: 'ws_123',
        user_id: 'user_123',
        role: 'OWNER',
        status: 'ACTIVE',
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTxClient = {
        query: vi.fn().mockImplementation(sql => {
          if (sql.includes('INSERT INTO workspaces')) {
            return Promise.resolve({ rows: [wsRow] });
          }
          if (sql.includes('INSERT INTO workspace_memberships')) {
            return Promise.resolve({ rows: [memRow] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const mockPool = {
        connect: vi.fn().mockResolvedValue({
          ...mockTxClient,
          release: vi.fn(),
        }),
      };

      const result = await workspacesRepo.createWorkspaceWithMembership(
        {
          name: 'My Workspace',
          workspaceType: 'PERSONAL',
          ownerUserId: 'user_123',
        },
        mockPool,
      );

      expect(result.workspace.id).toBe('ws_123');
      expect(result.workspace.name).toBe('My Workspace');
      expect(result.membership.role).toBe('OWNER');
      expect(result.membership.status).toBe('ACTIVE');

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockTxClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockTxClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rolls back transaction if membership insertion fails during workspace creation', async () => {
      const mockTxClient = {
        query: vi.fn().mockImplementation(sql => {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return Promise.resolve();
          if (sql.includes('INSERT INTO workspaces')) {
            return Promise.resolve({ rows: [{ id: 'ws_fail' }] });
          }
          if (sql.includes('INSERT INTO workspace_memberships')) {
            return Promise.reject(new Error('Foreign key violation'));
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };

      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockTxClient),
      };

      await expect(
        workspacesRepo.createWorkspaceWithMembership(
          {
            name: 'Failing Workspace',
            ownerUserId: 'user_not_exist',
          },
          mockPool,
        ),
      ).rejects.toThrow('Foreign key violation');

      expect(mockTxClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockTxClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockTxClient.release).toHaveBeenCalled();
    });

    it('finds workspaces for user enforcing tenant isolation and active memberships', async () => {
      const mockRows = [
        {
          id: 'ws_abc',
          name: 'Team Project',
          workspace_type: 'TEAM',
          owner_user_id: 'owner_999',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          member_role: 'ADMIN',
          member_status: 'ACTIVE',
        },
      ];

      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: mockRows }),
      };

      const workspaces = await workspacesRepo.findWorkspacesForUser('user_test', mockClient);
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].id).toBe('ws_abc');
      expect(workspaces[0].memberRole).toBe('ADMIN');

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain("wm.status = 'ACTIVE'");
      expect(sql).toContain('w.deleted_at IS NULL');
      expect(params).toEqual(['user_test']);
    });
  });

  describe('Sessions & Devices Repositories', () => {
    it('creates a session with parameterized values', async () => {
      const mockSessionRow = {
        id: 'sess_123',
        user_id: 'user_123',
        device_id: null,
        session_token_hash: 'token_hash_abc',
        session_type: 'WEB',
        expires_at: new Date('2026-12-31T23:59:59Z'),
        revoked_at: null,
        created_at: new Date(),
        last_seen_at: new Date(),
      };

      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [mockSessionRow] }),
      };

      const session = await sessionsRepo.createSession(
        {
          userId: 'user_123',
          sessionTokenHash: 'token_hash_abc',
          sessionType: 'WEB',
          expiresAt: '2026-12-31T23:59:59Z',
        },
        mockClient,
      );

      expect(session.id).toBe('sess_123');
      expect(session.sessionTokenHash).toBe('token_hash_abc');
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO sessions');
      expect(params[0]).toBe('user_123');
      expect(params[2]).toBe('token_hash_abc');
    });

    it('finds active session by token hash ensuring not revoked and not expired', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 'sess_123',
              user_id: 'user_123',
              device_id: null,
              session_token_hash: 'valid_hash',
              session_type: 'WEB',
              expires_at: new Date('2026-12-31T23:59:59Z'),
              revoked_at: null,
              created_at: new Date(),
              last_seen_at: new Date(),
              display_name: 'Test User',
              email: 'test@example.com',
            },
          ],
        }),
      };

      const session = await sessionsRepo.findActiveSessionByTokenHash('valid_hash', mockClient);
      expect(session).not.toBeNull();
      expect(session.userDisplayName).toBe('Test User');

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('s.revoked_at IS NULL');
      expect(sql).toContain('s.expires_at > CURRENT_TIMESTAMP');
      expect(sql).toContain('u.deleted_at IS NULL');
      expect(params).toEqual(['valid_hash']);
    });

    it('revokes all sessions for a user upon security event', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValue({ rowCount: 3, rows: [{ id: '1' }, { id: '2' }, { id: '3' }] }),
      };

      const count = await sessionsRepo.revokeAllUserSessions('user_123', mockClient);
      expect(count).toBe(3);

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('UPDATE sessions');
      expect(sql).toContain('SET revoked_at = CURRENT_TIMESTAMP');
      expect(params).toEqual(['user_123']);
    });

    it('registers a device and updates trust state', async () => {
      const mockDeviceRow = {
        id: 'dev_123',
        user_id: 'user_123',
        platform: 'WINDOWS',
        device_name: 'Anurag Surface',
        application_version: '1.0.0',
        push_token_reference: null,
        trust_state: 'UNTRUSTED',
        last_seen_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [mockDeviceRow] }),
      };

      const device = await devicesRepo.registerDevice(
        {
          userId: 'user_123',
          platform: 'WINDOWS',
          deviceName: 'Anurag Surface',
          applicationVersion: '1.0.0',
        },
        mockClient,
      );

      expect(device.id).toBe('dev_123');
      expect(device.platform).toBe('WINDOWS');
      expect(device.trustState).toBe('UNTRUSTED');

      // Update trust state
      const updatedRow = { ...mockDeviceRow, trust_state: 'TRUSTED' };
      mockClient.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const updated = await devicesRepo.updateDeviceTrustState('dev_123', 'TRUSTED', mockClient);
      expect(updated.trustState).toBe('TRUSTED');
    });
  });
});
