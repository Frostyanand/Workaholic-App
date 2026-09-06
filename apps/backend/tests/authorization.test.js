import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import {
  requireWorkspaceAccess,
  hasMinimumRole,
  assertCanManageRole,
  assertResourceTenantIsolation,
  ROLE_HIERARCHY,
} from '../src/core/authorization.js';
import { ForbiddenError, NotFoundError } from '../src/core/errors.js';
import { sendSuccess } from '../src/core/response.js';
import { WORKSPACE_ROLE, MEMBERSHIP_STATUS } from '@workaholic/shared';

describe('Authorization Boundary & Tenant Isolation (Task 3.4)', () => {
  describe('Role Hierarchy & Assertion Utilities', () => {
    it('ranks roles in correct hierarchical order', () => {
      expect(ROLE_HIERARCHY[WORKSPACE_ROLE.OWNER]).toBeGreaterThan(
        ROLE_HIERARCHY[WORKSPACE_ROLE.ADMIN],
      );
      expect(ROLE_HIERARCHY[WORKSPACE_ROLE.ADMIN]).toBeGreaterThan(
        ROLE_HIERARCHY[WORKSPACE_ROLE.MEMBER],
      );
      expect(ROLE_HIERARCHY[WORKSPACE_ROLE.MEMBER]).toBeGreaterThan(
        ROLE_HIERARCHY[WORKSPACE_ROLE.VIEWER],
      );
    });

    it('evaluates hasMinimumRole correctly across all roles', () => {
      expect(hasMinimumRole(WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.ADMIN)).toBe(true);
      expect(hasMinimumRole(WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.ADMIN)).toBe(true);
      expect(hasMinimumRole(WORKSPACE_ROLE.MEMBER, WORKSPACE_ROLE.ADMIN)).toBe(false);
      expect(hasMinimumRole(WORKSPACE_ROLE.VIEWER, WORKSPACE_ROLE.MEMBER)).toBe(false);
      expect(hasMinimumRole(WORKSPACE_ROLE.VIEWER, WORKSPACE_ROLE.VIEWER)).toBe(true);
    });

    it('assertCanManageRole allows OWNER to manage any lower role', () => {
      expect(() =>
        assertCanManageRole(WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.MEMBER, WORKSPACE_ROLE.ADMIN),
      ).not.toThrow();
    });

    it('assertCanManageRole allows ADMIN to promote MEMBER to VIEWER or MEMBER', () => {
      expect(() =>
        assertCanManageRole(WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.VIEWER, WORKSPACE_ROLE.MEMBER),
      ).not.toThrow();
    });

    it('assertCanManageRole forbids ADMIN from modifying another ADMIN or granting OWNER', () => {
      expect(() =>
        assertCanManageRole(WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.MEMBER),
      ).toThrow(ForbiddenError);

      expect(() =>
        assertCanManageRole(WORKSPACE_ROLE.ADMIN, WORKSPACE_ROLE.MEMBER, WORKSPACE_ROLE.OWNER),
      ).toThrow(ForbiddenError);
    });

    it('assertCanManageRole forbids MEMBER and VIEWER from managing any roles', () => {
      expect(() =>
        assertCanManageRole(WORKSPACE_ROLE.MEMBER, WORKSPACE_ROLE.VIEWER, WORKSPACE_ROLE.MEMBER),
      ).toThrow(ForbiddenError);
      expect(() =>
        assertCanManageRole(WORKSPACE_ROLE.VIEWER, WORKSPACE_ROLE.VIEWER, WORKSPACE_ROLE.VIEWER),
      ).toThrow(ForbiddenError);
    });

    it('assertCanManageRole protects workspace OWNER role from alteration', () => {
      expect(() =>
        assertCanManageRole(WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.OWNER, WORKSPACE_ROLE.ADMIN),
      ).toThrow(ForbiddenError);
    });

    it('assertResourceTenantIsolation blocks cross-workspace resource access', () => {
      const validResource = { id: 'task_1', workspaceId: 'ws_a' };
      expect(() => assertResourceTenantIsolation(validResource, 'ws_a')).not.toThrow();
      expect(() => assertResourceTenantIsolation(validResource, 'ws_b')).toThrow(NotFoundError);
    });
  });

  describe('Fastify requireWorkspaceAccess preHandler Hook', () => {
    let app;
    let mockMemberships;

    let currentUser = null;

    beforeEach(async () => {
      currentUser = null;
      mockMemberships = [
        {
          workspaceId: '123e4567-e89b-12d3-a456-426614174001',
          userId: 'usr_owner',
          role: WORKSPACE_ROLE.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        {
          workspaceId: '123e4567-e89b-12d3-a456-426614174001',
          userId: 'usr_admin',
          role: WORKSPACE_ROLE.ADMIN,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        {
          workspaceId: '123e4567-e89b-12d3-a456-426614174001',
          userId: 'usr_member',
          role: WORKSPACE_ROLE.MEMBER,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        {
          workspaceId: '123e4567-e89b-12d3-a456-426614174001',
          userId: 'usr_suspended',
          role: WORKSPACE_ROLE.MEMBER,
          status: MEMBERSHIP_STATUS.SUSPENDED,
        },
      ];

      const mockRepo = {
        findWorkspaceMemberships: async wsId => mockMemberships.filter(m => m.workspaceId === wsId),
      };

      app = createApp({ logger: false });

      // Simulated authentication hook
      app.addHook('preHandler', async req => {
        if (currentUser) {
          req.user = currentUser;
        }
      });

      // Test route requiring any active membership
      app.get(
        '/test/workspaces/:workspaceId/general',
        {
          preHandler: [
            requireWorkspaceAccess({
              repository: mockRepo,
            }),
          ],
        },
        async (request, reply) => sendSuccess(reply, { workspace: request.workspace }),
      );

      // Test route requiring minimum role of ADMIN
      app.get(
        '/test/workspaces/:workspaceId/admin-only',
        {
          preHandler: [
            requireWorkspaceAccess({
              minimumRole: WORKSPACE_ROLE.ADMIN,
              repository: mockRepo,
            }),
          ],
        },
        async (request, reply) => sendSuccess(reply, { workspace: request.workspace }),
      );

      // Test route requiring specific allowed roles
      app.get(
        '/test/workspaces/:workspaceId/owner-only',
        {
          preHandler: [
            requireWorkspaceAccess({
              allowedRoles: [WORKSPACE_ROLE.OWNER],
              repository: mockRepo,
            }),
          ],
        },
        async (request, reply) => sendSuccess(reply, { workspace: request.workspace }),
      );

      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    const targetWs = '123e4567-e89b-12d3-a456-426614174001';

    it('rejects unauthenticated request with 401', async () => {
      currentUser = null;
      const res = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/general`,
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('allows active member into general workspace endpoint', async () => {
      currentUser = { id: 'usr_member' };

      const res = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/general`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.workspace.id).toBe(targetWs);
      expect(body.data.workspace.role).toBe(WORKSPACE_ROLE.MEMBER);
    });

    it('rejects user who is not a member with 404 NOT_FOUND (IDOR prevention)', async () => {
      currentUser = { id: 'usr_stranger' };

      const res = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/general`,
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('rejects user with SUSPENDED membership with 404 NOT_FOUND', async () => {
      currentUser = { id: 'usr_suspended' };

      const res = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/general`,
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('allows OWNER and ADMIN to admin-only endpoint, but rejects MEMBER with 403 FORBIDDEN', async () => {
      // Test ADMIN: succeeds
      currentUser = { id: 'usr_admin' };
      const adminRes = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/admin-only`,
      });
      expect(adminRes.statusCode).toBe(200);

      // Test OWNER: succeeds
      currentUser = { id: 'usr_owner' };
      const ownerRes = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/admin-only`,
      });
      expect(ownerRes.statusCode).toBe(200);

      // Test MEMBER: rejected with 403
      currentUser = { id: 'usr_member' };
      const memberRes = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/admin-only`,
      });
      expect(memberRes.statusCode).toBe(403);
      const memberBody = JSON.parse(memberRes.payload);
      expect(memberBody.error.code).toBe('FORBIDDEN');
    });

    it('allows only OWNER to owner-only endpoint, rejecting ADMIN with 403 FORBIDDEN', async () => {
      currentUser = { id: 'usr_admin' };
      const adminRes = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/owner-only`,
      });
      expect(adminRes.statusCode).toBe(403);

      currentUser = { id: 'usr_owner' };
      const ownerRes = await app.inject({
        method: 'GET',
        url: `/test/workspaces/${targetWs}/owner-only`,
      });
      expect(ownerRes.statusCode).toBe(200);
    });
  });
});
