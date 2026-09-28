import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';

describe('Workspaces Module & Access Control Tests (Phase 4 / Audit)', () => {
  let app;
  let ownerUser;
  let adminUser;
  let regularUser;
  let outsideUser;
  let testWorkspace;
  let ownerToken;
  let adminToken;
  let regularToken;
  let outsideToken;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create Users
    ownerUser = await createUser({
      displayName: 'Owner User',
      email: `owner_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    adminUser = await createUser({
      displayName: 'Admin User',
      email: `admin_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    regularUser = await createUser({
      displayName: 'Regular User',
      email: `regular_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    outsideUser = await createUser({
      displayName: 'Outside User',
      email: `outside_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    // 2. Create Workspace with ownerUser as OWNER
    const wsResult = await createWorkspaceWithMembership({
      name: 'Audit Test Workspace',
      workspaceType: 'TEAM',
      ownerUserId: ownerUser.id,
    });
    testWorkspace = wsResult.workspace;

    // 3. Add adminUser to workspace as ADMIN
    await query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role, status, joined_at)
       VALUES ($1, $2, 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP)`,
      [testWorkspace.id, adminUser.id],
    );

    // 4. Create Sessions and auth tokens
    const makeSession = async user => {
      const rawToken = `tok_${user.id}_${Date.now()}`;
      const tokenHash = hashSessionToken(rawToken);
      const expiresAt = new Date(Date.now() + 86400 * 1000);
      await createSession({
        userId: user.id,
        sessionTokenHash: tokenHash,
        sessionType: 'WEB',
        expiresAt,
      });
      return rawToken;
    };

    ownerToken = await makeSession(ownerUser);
    adminToken = await makeSession(adminUser);
    regularToken = await makeSession(regularUser);
    outsideToken = await makeSession(outsideUser);
  });

  afterAll(async () => {
    if (testWorkspace?.id) {
      await query(`DELETE FROM workspace_memberships WHERE workspace_id = $1`, [testWorkspace.id]);
      await query(`DELETE FROM workspaces WHERE id = $1`, [testWorkspace.id]);
    }
    const userIds = [ownerUser?.id, adminUser?.id, regularUser?.id, outsideUser?.id].filter(
      Boolean,
    );
    if (userIds.length > 0) {
      await query(`DELETE FROM sessions WHERE user_id = ANY($1)`, [userIds]);
      await query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
  });

  it('GET /api/v1/workspaces returns workspaces for the authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    const found = body.data.find(w => w.id === testWorkspace.id);
    expect(found).toBeDefined();
    expect(found.name).toBe('Audit Test Workspace');
  });

  it('POST /api/v1/workspaces creates a new workspace and sets caller as OWNER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: { authorization: `Bearer ${outsideToken}` },
      payload: {
        name: 'Outside User Workspace',
        workspaceType: 'PERSONAL',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.workspace.name).toBe('Outside User Workspace');
    expect(body.data.workspace.ownerUserId).toBe(outsideUser.id);
    expect(body.data.membership.role).toBe('OWNER');

    // Cleanup created workspace
    await query(`DELETE FROM workspace_memberships WHERE workspace_id = $1`, [
      body.data.workspace.id,
    ]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [body.data.workspace.id]);
  });

  it('GET /api/v1/workspaces/:id returns workspace details with membership for active members', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${testWorkspace.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBe(testWorkspace.id);
    expect(body.data.membership.role).toBe('ADMIN');
  });

  it('GET /api/v1/workspaces/:id returns 404 for non-members (tenant isolation)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${testWorkspace.id}`,
      headers: { authorization: `Bearer ${outsideToken}` },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/v1/workspaces/:id/members lists active members for a member', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${testWorkspace.id}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/v1/workspaces/:id/members allows OWNER to add member by email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${testWorkspace.id}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: regularUser.email,
        role: 'MEMBER',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.userId).toBe(regularUser.id);
    expect(body.data.role).toBe('MEMBER');
  });

  it('POST /api/v1/workspaces/:id/members forbids regular MEMBER from adding members', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${testWorkspace.id}/members`,
      headers: { authorization: `Bearer ${regularToken}` },
      payload: {
        userId: outsideUser.id,
        role: 'MEMBER',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('PATCH /api/v1/workspaces/:id/members/:userId allows OWNER to promote member to ADMIN', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${testWorkspace.id}/members/${regularUser.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        role: 'ADMIN',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.role).toBe('ADMIN');
  });

  it('PATCH /api/v1/workspaces/:id/members/:userId forbids modifying owner role', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${testWorkspace.id}/members/${ownerUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        role: 'MEMBER',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('DELETE /api/v1/workspaces/:id/members/:userId allows ADMIN/OWNER to remove member', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${testWorkspace.id}/members/${regularUser.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.removed).toBe(true);
    expect(body.data.member.status).toBe('REMOVED');
  });

  it('DELETE /api/v1/workspaces/:id/members/:userId prevents removing the workspace OWNER', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${testWorkspace.id}/members/${ownerUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
