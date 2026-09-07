import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import * as projectsRepo from '../src/modules/projects/projects.repository.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';

describe('Project Live PostgreSQL 16 & API Integration (Task 6.1 & 6.2, TM-PROJECT-001 to TM-PROJECT-005)', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let sessionTokenA;
  let sessionTokenB;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // Clean test state
    await query('DELETE FROM projects WHERE name LIKE $1', ['[LIVE_PROJECT_TEST]%']);

    // Create test users
    userA = await createUser({
      displayName: 'Project Live Tester A',
      email: `proj_test_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Project Live Tester B',
      email: `proj_test_b_${Date.now()}@example.com`,
    });

    // Create test workspaces
    const resA = await createWorkspaceWithMembership({
      name: 'Project Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = resA.workspace;

    const resB = await createWorkspaceWithMembership({
      name: 'Project Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = resB.workspace;

    // Create sessions
    const rawTokenA = `live_proj_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    const rawTokenB = `live_proj_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;
  });

  afterAll(async () => {
    await query('DELETE FROM projects WHERE name LIKE $1', ['[LIVE_PROJECT_TEST]%']);
  });

  it('TM-PROJECT-001 (API): creates project via POST /api/v1/projects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        name: '[LIVE_PROJECT_TEST] Project 1',
        description: 'First live test project',
        status: 'ACTIVE',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe('[LIVE_PROJECT_TEST] Project 1');
    expect(body.data.workspaceId).toBe(workspaceA.id);
  });

  it('lists projects with pagination via GET /api/v1/projects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?search=LIVE_PROJECT_TEST',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('retrieves single project with members via GET /api/v1/projects/:id', async () => {
    // Create project
    const created = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: '[LIVE_PROJECT_TEST] Details Project',
      ownerUserId: userA.id,
    });
    await projectsRepo.addProjectMember(created.id, userA.id, 'OWNER');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${created.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe(created.id);
    expect(body.data.members).toBeInstanceOf(Array);
    expect(body.data.members.length).toBe(1);
    expect(body.data.members[0].userId).toBe(userA.id);
  });

  it('updates project via PATCH /api/v1/projects/:id', async () => {
    const created = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: '[LIVE_PROJECT_TEST] Before Update',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${created.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        name: '[LIVE_PROJECT_TEST] After Update',
        status: 'ON_HOLD',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('[LIVE_PROJECT_TEST] After Update');
    expect(body.data.status).toBe('ON_HOLD');
  });

  it('manages project members via POST & DELETE /api/v1/projects/:id/members', async () => {
    const created = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: '[LIVE_PROJECT_TEST] Member Project',
    });

    // Add userB as member
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/members`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        userId: userB.id,
        role: 'MEMBER',
      },
    });
    expect(addRes.statusCode).toBe(201);

    // List members
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${created.id}/members`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data.some(m => m.userId === userB.id)).toBe(true);

    // Remove userB
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${created.id}/members/${userB.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(delRes.statusCode).toBe(200);
  });

  it('performs soft-delete and restore via DELETE and POST /restore', async () => {
    const created = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: '[LIVE_PROJECT_TEST] Soft Delete Project',
    });

    // Delete
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${created.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(delRes.statusCode).toBe(200);

    // Attempt get -> 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${created.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(getRes.statusCode).toBe(404);

    // Restore
    const restRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/restore`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(restRes.statusCode).toBe(200);

    // Confirm active again
    const activeRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${created.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(activeRes.statusCode).toBe(200);
  });

  it('TM-PROJECT-005 (AUTHZ): prevents cross-workspace project access and mutations (tenant isolation)', async () => {
    const projA = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: '[LIVE_PROJECT_TEST] Secret Project A',
    });

    // User B in Workspace B attempts to access Project A
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projA.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(getRes.statusCode).toBe(404);

    // User B attempts to patch Project A
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projA.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
      payload: { name: 'Hacked Project Name' },
    });
    expect(patchRes.statusCode).toBe(404);

    // User B attempts to delete Project A
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projA.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(delRes.statusCode).toBe(404);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
    });
    expect(res.statusCode).toBe(401);
  });

  it('TM-PROJECT-002 & TM-PROJECT-003 (DB): Tasks can belong to projects and preserve consistency', async () => {
    const project = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: '[LIVE_PROJECT_TEST] Task Parent Project',
    });

    const task = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      projectId: project.id,
      title: '[LIVE_PROJECT_TEST] Associated Task',
      createdBy: userA.id,
    });

    expect(task.projectId).toBe(project.id);

    // Verify task count is aggregated on project
    const projWithCounts = await projectsRepo.findProjectById(project.id, workspaceA.id);
    expect(projWithCounts.taskCount).toBe(1);
    expect(projWithCounts.completedTaskCount).toBe(0);

    // Complete task
    await tasksRepo.updateTask(task.id, workspaceA.id, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      version: 1,
    });

    const projAfterComplete = await projectsRepo.findProjectById(project.id, workspaceA.id);
    expect(projAfterComplete.completedTaskCount).toBe(1);
  });

  it('TM-PROJECT-004 (DB): Project deletion follows configured policy (ON DELETE SET NULL preserves task independence, BR-PROJECT-001)', async () => {
    const project = await projectsRepo.createProject({
      workspaceId: workspaceA.id,
      name: '[LIVE_PROJECT_TEST] Disposable Project',
    });

    const task = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      projectId: project.id,
      title: '[LIVE_PROJECT_TEST] Independent Task',
      createdBy: userA.id,
    });

    expect(task.projectId).toBe(project.id);

    // Hard delete project in database to test database-level FK cascade policy
    await query('DELETE FROM projects WHERE id = $1', [project.id]);

    // Task must still exist, with project_id set to NULL
    const survivingTask = await tasksRepo.findTaskById(task.id, workspaceA.id);
    expect(survivingTask).not.toBeNull();
    expect(survivingTask.id).toBe(task.id);
    expect(survivingTask.projectId).toBeNull();
  });
});
