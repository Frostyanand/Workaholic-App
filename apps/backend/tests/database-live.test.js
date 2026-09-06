import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, withTransaction, pool, testConnection } from '../src/core/db.js';
import * as usersRepo from '../src/modules/users/users.repository.js';
import * as workspacesRepo from '../src/modules/workspaces/workspaces.repository.js';
import * as sessionsRepo from '../src/modules/auth/sessions.repository.js';
import * as devicesRepo from '../src/modules/auth/devices.repository.js';

describe('Phase 2 — Live PostgreSQL 16 Verification Audit', () => {
  let isDbLive = false;

  async function cleanDatabase() {
    try {
      await query(
        'TRUNCATE TABLE users, workspaces, workspace_memberships, devices, sessions RESTART IDENTITY CASCADE;',
      );
    } catch {
      // ignore
    }
  }

  beforeAll(async () => {
    try {
      const res = await testConnection(pool);
      if (res && res.connected === 1) {
        isDbLive = true;
        await cleanDatabase();
      }
    } catch {
      isDbLive = false;
    }
  });

  afterAll(async () => {
    if (isDbLive) {
      await cleanDatabase();
    }
  });

  it('verifies live PostgreSQL 16 connection and version', async () => {
    expect(isDbLive, 'PostgreSQL 16 should be reachable on localhost:5432').toBe(true);
    const versionRes = await query('SELECT version()');
    expect(versionRes.rows[0].version).toContain('PostgreSQL 16');
  });

  describe('Step 4: PostgreSQL Invariant & Constraint Verification', () => {
    it('enforces case-insensitive uniqueness on active user emails and allows reuse after soft-delete', async () => {
      const email = 'audit_alice@test-audit.workaholic.local';

      // 1. Insert Alice
      const user1 = await usersRepo.createUser({
        displayName: 'Alice Audit',
        email,
      });
      expect(user1.id).toBeDefined();

      // 2. Inserting duplicate lowercase or uppercase email must fail with 23505 (unique_violation)
      await expect(
        usersRepo.createUser({
          displayName: 'Alice Duplicate',
          email: email.toUpperCase(),
        }),
      ).rejects.toThrow();

      // 3. Soft-delete Alice
      await usersRepo.softDeleteUser(user1.id);

      // 4. Now inserting the same email must succeed because deleted_at IS NOT NULL on user1
      const user2 = await usersRepo.createUser({
        displayName: 'Alice Reborn',
        email,
      });
      expect(user2.id).toBeDefined();
      expect(user2.id).not.toBe(user1.id);
    });

    it('enforces CHECK constraint on workspaces.workspace_type (PERSONAL, TEAM)', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Workspace Tester',
        email: 'ws_type_test@test-audit.workaholic.local',
      });

      // Valid insert
      const validWs = await query(
        "INSERT INTO workspaces (name, workspace_type, owner_user_id) VALUES ('Valid WS', 'TEAM', $1) RETURNING id",
        [user.id],
      );
      expect(validWs.rows[0].id).toBeDefined();

      // Invalid insert must fail with check_violation
      await expect(
        query(
          "INSERT INTO workspaces (name, workspace_type, owner_user_id) VALUES ('Invalid WS', 'ENTERPRISE', $1)",
          [user.id],
        ),
      ).rejects.toThrow();
    });

    it('enforces CHECK constraints on workspace_memberships role and status', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Member Tester',
        email: 'mem_test@test-audit.workaholic.local',
      });
      const ws = await query(
        "INSERT INTO workspaces (name, workspace_type, owner_user_id) VALUES ('Member WS', 'PERSONAL', $1) RETURNING id",
        [user.id],
      );
      const wsId = ws.rows[0].id;

      // Invalid role
      await expect(
        query(
          "INSERT INTO workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'SUPERUSER', 'ACTIVE')",
          [wsId, user.id],
        ),
      ).rejects.toThrow();

      // Invalid status
      await expect(
        query(
          "INSERT INTO workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'MEMBER', 'BANNED')",
          [wsId, user.id],
        ),
      ).rejects.toThrow();
    });

    it('enforces composite uniqueness on workspace_memberships (workspace_id, user_id)', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Unique Member',
        email: 'uq_mem@test-audit.workaholic.local',
      });
      const ws = await query(
        "INSERT INTO workspaces (name, owner_user_id) VALUES ('UQ WS', $1) RETURNING id",
        [user.id],
      );
      const wsId = ws.rows[0].id;

      await query(
        "INSERT INTO workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'MEMBER', 'ACTIVE')",
        [wsId, user.id],
      );

      // Second membership for same user in same workspace must fail
      await expect(
        query(
          "INSERT INTO workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')",
          [wsId, user.id],
        ),
      ).rejects.toThrow();
    });

    it('enforces CHECK constraints on devices (platform and trust_state)', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Device User',
        email: 'device_user@test-audit.workaholic.local',
      });

      // Invalid platform
      await expect(
        query("INSERT INTO devices (user_id, platform, device_name) VALUES ($1, 'IOS', 'iPhone')", [
          user.id,
        ]),
      ).rejects.toThrow();

      // Invalid trust_state
      await expect(
        query(
          "INSERT INTO devices (user_id, platform, device_name, trust_state) VALUES ($1, 'WEB', 'Chrome', 'UNKNOWN')",
          [user.id],
        ),
      ).rejects.toThrow();
    });

    it('enforces CHECK constraint on sessions.session_type', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Session User',
        email: 'session_user@test-audit.workaholic.local',
      });

      await expect(
        query(
          "INSERT INTO sessions (user_id, session_token_hash, session_type, expires_at) VALUES ($1, 'hash_inv', 'OAUTH', NOW() + INTERVAL '1 hour')",
          [user.id],
        ),
      ).rejects.toThrow();
    });

    it('enforces RESTRICT on workspace owner deletion to preserve workspace integrity', async () => {
      const owner = await usersRepo.createUser({
        displayName: 'Owner User',
        email: 'owner_restrict@test-audit.workaholic.local',
      });
      await query("INSERT INTO workspaces (name, owner_user_id) VALUES ('Protected WS', $1)", [
        owner.id,
      ]);

      // Hard DELETE on owner must fail because workspaces.owner_user_id references owner.id ON DELETE RESTRICT
      await expect(query('DELETE FROM users WHERE id = $1', [owner.id])).rejects.toThrow();
    });

    it('enforces CASCADE deletion on workspace_memberships when workspace is deleted', async () => {
      const owner = await usersRepo.createUser({
        displayName: 'Cascade WS Owner',
        email: 'cascade_ws@test-audit.workaholic.local',
      });
      const member = await usersRepo.createUser({
        displayName: 'Cascade Member',
        email: 'cascade_mem@test-audit.workaholic.local',
      });

      const ws = await query(
        "INSERT INTO workspaces (name, owner_user_id) VALUES ('Cascade WS', $1) RETURNING id",
        [owner.id],
      );
      const wsId = ws.rows[0].id;

      await query(
        "INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')",
        [wsId, member.id],
      );

      // Verify membership exists
      const before = await query('SELECT * FROM workspace_memberships WHERE workspace_id = $1', [
        wsId,
      ]);
      expect(before.rows.length).toBe(1);

      // Delete workspace
      await query('DELETE FROM workspaces WHERE id = $1', [wsId]);

      // Verify membership was cascaded
      const after = await query('SELECT * FROM workspace_memberships WHERE workspace_id = $1', [
        wsId,
      ]);
      expect(after.rows.length).toBe(0);
    });

    it('enforces SET NULL on sessions.device_id when device is deleted', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Device Cascade User',
        email: 'dev_cascade@test-audit.workaholic.local',
      });

      const device = await devicesRepo.registerDevice({
        userId: user.id,
        platform: 'WINDOWS',
        deviceName: 'Workstation',
      });

      const session = await sessionsRepo.createSession({
        userId: user.id,
        deviceId: device.id,
        sessionTokenHash: 'set_null_token_hash_123',
        sessionType: 'DESKTOP',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      expect(session.deviceId).toBe(device.id);

      // Delete the device
      await query('DELETE FROM devices WHERE id = $1', [device.id]);

      // Session should still exist, but device_id must now be NULL (ON DELETE SET NULL)
      const res = await query('SELECT device_id FROM sessions WHERE id = $1', [session.id]);
      expect(res.rows[0].device_id).toBeNull();
    });
  });

  describe('Step 5: Actual Repository Operations & Tenant Isolation', () => {
    it('executes full Users repository lifecycle against PostgreSQL', async () => {
      // 1. Create
      const user = await usersRepo.createUser({
        displayName: 'Repository User',
        email: 'repo_user@test-audit.workaholic.local',
        timezone: 'Europe/London',
        locale: 'en-GB',
        preferences: { notifications: true },
      });
      expect(user.id).toBeDefined();
      expect(user.displayName).toBe('Repository User');
      expect(user.timezone).toBe('Europe/London');
      expect(user.preferences).toEqual({ notifications: true });

      // 2. Find by ID
      const byId = await usersRepo.findUserById(user.id);
      expect(byId.email).toBe('repo_user@test-audit.workaholic.local');

      // 3. Find by Email (case-insensitive)
      const byEmail = await usersRepo.findUserByEmail('REPO_USER@test-audit.workaholic.local');
      expect(byEmail.id).toBe(user.id);

      // 4. Update
      const updated = await usersRepo.updateUser(user.id, {
        displayName: 'Repository User Updated',
        preferences: { notifications: false, theme: 'dark' },
      });
      expect(updated.displayName).toBe('Repository User Updated');
      expect(updated.preferences.theme).toBe('dark');

      // 5. Soft Delete
      const deleted = await usersRepo.softDeleteUser(user.id);
      expect(deleted).toBe(true);

      // 6. Verify excluded from active find queries
      expect(await usersRepo.findUserById(user.id)).toBeNull();
      expect(await usersRepo.findUserByEmail('repo_user@test-audit.workaholic.local')).toBeNull();
    });

    it('executes full Workspaces repository lifecycle and enforces strict tenant isolation', async () => {
      // Create User A and User B
      const userA = await usersRepo.createUser({
        displayName: 'Tenant A',
        email: 'tenant_a@test-audit.workaholic.local',
      });
      const userB = await usersRepo.createUser({
        displayName: 'Tenant B',
        email: 'tenant_b@test-audit.workaholic.local',
      });

      // Create Workspace A for User A
      const { workspace: wsA, membership: memA } =
        await workspacesRepo.createWorkspaceWithMembership({
          name: 'Workspace Alpha',
          workspaceType: 'TEAM',
          ownerUserId: userA.id,
        });
      expect(wsA.id).toBeDefined();
      expect(wsA.name).toBe('Workspace Alpha');
      expect(memA.role).toBe('OWNER');
      expect(memA.status).toBe('ACTIVE');

      // Create Workspace B for User B
      const { workspace: wsB } = await workspacesRepo.createWorkspaceWithMembership({
        name: 'Workspace Beta',
        workspaceType: 'PERSONAL',
        ownerUserId: userB.id,
      });

      // Tenant isolation: User A sees only Workspace A; User B sees only Workspace B
      const userAWorkspaces = await workspacesRepo.findWorkspacesForUser(userA.id);
      const userBWorkspaces = await workspacesRepo.findWorkspacesForUser(userB.id);

      expect(userAWorkspaces.map(w => w.id)).toContain(wsA.id);
      expect(userAWorkspaces.map(w => w.id)).not.toContain(wsB.id);

      expect(userBWorkspaces.map(w => w.id)).toContain(wsB.id);
      expect(userBWorkspaces.map(w => w.id)).not.toContain(wsA.id);

      // Add User B as member to Workspace A
      const addedMem = await workspacesRepo.addWorkspaceMembership({
        workspaceId: wsA.id,
        userId: userB.id,
        role: 'MEMBER',
      });
      expect(addedMem.role).toBe('MEMBER');

      // Now User B sees Workspace A as well
      const userBWorkspacesAfter = await workspacesRepo.findWorkspacesForUser(userB.id);
      expect(userBWorkspacesAfter.map(w => w.id)).toContain(wsA.id);

      // Update User B role to ADMIN in Workspace A
      const updatedMem = await workspacesRepo.updateMembershipRole(wsA.id, userB.id, 'ADMIN');
      expect(updatedMem.role).toBe('ADMIN');

      // Verify members list in Workspace A
      const members = await workspacesRepo.findWorkspaceMemberships(wsA.id);
      expect(members.length).toBe(2);

      // Soft delete Workspace A
      await workspacesRepo.softDeleteWorkspace(wsA.id);
      expect(await workspacesRepo.findWorkspaceById(wsA.id)).toBeNull();

      // Soft deleted workspace is not returned in user workspace queries
      const userAWorkspacesAfterDelete = await workspacesRepo.findWorkspacesForUser(userA.id);
      expect(userAWorkspacesAfterDelete.map(w => w.id)).not.toContain(wsA.id);
    });

    it('executes full Sessions and Devices repository lifecycles against PostgreSQL', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Auth Test User',
        email: 'auth_test_user@test-audit.workaholic.local',
      });

      // Register device
      const device = await devicesRepo.registerDevice({
        userId: user.id,
        platform: 'WINDOWS',
        deviceName: 'Workaholic Workstation',
        applicationVersion: '1.0.0',
        trustState: 'UNTRUSTED',
      });
      expect(device.id).toBeDefined();

      // Update device trust
      const trusted = await devicesRepo.updateDeviceTrustState(device.id, 'TRUSTED');
      expect(trusted.trustState).toBe('TRUSTED');

      // List user devices
      const devices = await devicesRepo.findDevicesForUser(user.id);
      expect(devices.length).toBe(1);
      expect(devices[0].id).toBe(device.id);

      // Create session
      const tokenHash = 'live_test_token_hash_abc_123';
      const session = await sessionsRepo.createSession({
        userId: user.id,
        deviceId: device.id,
        sessionTokenHash: tokenHash,
        sessionType: 'DESKTOP',
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      });
      expect(session.id).toBeDefined();

      // Lookup active session
      const activeSession = await sessionsRepo.findActiveSessionByTokenHash(tokenHash);
      expect(activeSession).not.toBeNull();
      expect(activeSession.userId).toBe(user.id);
      expect(activeSession.userDisplayName).toBe('Auth Test User');

      // Touch session
      const touched = await sessionsRepo.touchSession(session.id);
      expect(touched).toBe(true);

      // Revoke single session
      const revoked = await sessionsRepo.revokeSession(session.id);
      expect(revoked).toBe(true);
      expect(await sessionsRepo.findActiveSessionByTokenHash(tokenHash)).toBeNull();

      // Create another session and test revokeAllUserSessions
      await sessionsRepo.createSession({
        userId: user.id,
        sessionTokenHash: 'live_test_token_2',
        sessionType: 'WEB',
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      });
      const revokedCount = await sessionsRepo.revokeAllUserSessions(user.id);
      expect(revokedCount).toBeGreaterThanOrEqual(1);
      expect(await sessionsRepo.findActiveSessionByTokenHash('live_test_token_2')).toBeNull();
    });
  });

  describe('Step 6 & 7: Transaction Semantics & Error Handling', () => {
    it('commits atomic multi-entity transaction and releases connection', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Tx Success User',
        email: 'tx_success@test-audit.workaholic.local',
      });

      const result = await withTransaction(async client => {
        const wsRes = await query(
          "INSERT INTO workspaces (name, owner_user_id) VALUES ('Tx Success WS', $1) RETURNING id",
          [user.id],
          client,
        );
        const memRes = await query(
          "INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER') RETURNING id",
          [wsRes.rows[0].id, user.id],
          client,
        );
        return { wsId: wsRes.rows[0].id, memId: memRes.rows[0].id };
      });

      // Verify records actually committed in database
      const wsCheck = await query('SELECT id FROM workspaces WHERE id = $1', [result.wsId]);
      const memCheck = await query('SELECT id FROM workspace_memberships WHERE id = $1', [
        result.memId,
      ]);
      expect(wsCheck.rows.length).toBe(1);
      expect(memCheck.rows.length).toBe(1);
    });

    it('rolls back all modifications on error and leaves zero partial state', async () => {
      const user = await usersRepo.createUser({
        displayName: 'Tx Fail User',
        email: 'tx_fail@test-audit.workaholic.local',
      });

      let createdWsId = null;

      await expect(
        withTransaction(async client => {
          const wsRes = await query(
            "INSERT INTO workspaces (name, owner_user_id) VALUES ('Should Be Rolled Back WS', $1) RETURNING id",
            [user.id],
            client,
          );
          createdWsId = wsRes.rows[0].id;

          // Intentionally violate check constraint on membership role to trigger rollback
          await query(
            "INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'INVALID_ROLE')",
            [createdWsId, user.id],
            client,
          );
        }),
      ).rejects.toThrow();

      // Verify workspace insertion was rolled back completely
      expect(createdWsId).not.toBeNull();
      const wsCheck = await query('SELECT id FROM workspaces WHERE id = $1', [createdWsId]);
      expect(wsCheck.rows.length).toBe(0);
    });

    it('sanitizes errors and never leaks database credentials in error messages', async () => {
      try {
        // Trigger a unique constraint violation
        await query(
          "INSERT INTO users (display_name, email) VALUES ('User 1', 'unique_err@test-audit.workaholic.local')",
        );
        await query(
          "INSERT INTO users (display_name, email) VALUES ('User 2', 'unique_err@test-audit.workaholic.local')",
        );
      } catch (err) {
        expect(err.message).not.toContain('workaholic_dev_secret');
        expect(err.message).not.toMatch(/postgresql:\/\/[^@]+@/);
      }
    });
  });
});
