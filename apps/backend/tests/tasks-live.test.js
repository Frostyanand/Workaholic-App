import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as labelsRepo from '../src/modules/tasks/labels.repository.js';
import * as dependenciesRepo from '../src/modules/tasks/dependencies.repository.js';
import * as workBlocksRepo from '../src/modules/tasks/work-blocks.repository.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';

describe('Task Management Live PostgreSQL 16 Integration (Task 5.1, 5.2, 5.17, 5.18)', () => {
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
    await query('DELETE FROM tasks WHERE title LIKE $1', ['[LIVE_TEST]%']);
    await query('DELETE FROM labels WHERE name LIKE $1', ['[LIVE_TEST]%']);

    // Create test users
    userA = await createUser({
      displayName: 'Task Tester A',
      email: `task_test_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Task Tester B',
      email: `task_test_b_${Date.now()}@example.com`,
    });

    // Create test workspaces
    const resA = await createWorkspaceWithMembership({
      name: 'Task Live Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = resA.workspace;

    const resB = await createWorkspaceWithMembership({
      name: 'Task Live Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = resB.workspace;

    // Create authenticated sessions
    const rawTokenA = `live_task_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    const rawTokenB = `live_task_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;
  });

  afterAll(async () => {
    if (workspaceA) {
      await query('DELETE FROM tasks WHERE workspace_id = $1', [workspaceA.id]);
      await query('DELETE FROM labels WHERE workspace_id = $1', [workspaceA.id]);
      await query('DELETE FROM workspaces WHERE id = $1', [workspaceA.id]);
    }
    if (workspaceB) {
      await query('DELETE FROM tasks WHERE workspace_id = $1', [workspaceB.id]);
      await query('DELETE FROM labels WHERE workspace_id = $1', [workspaceB.id]);
      await query('DELETE FROM workspaces WHERE id = $1', [workspaceB.id]);
    }
    if (userA) await query('DELETE FROM users WHERE id = $1', [userA.id]);
    if (userB) await query('DELETE FROM users WHERE id = $1', [userB.id]);
  });

  describe('PostgreSQL Database Constraints & Invariants', () => {
    it('enforces chk_tasks_title_not_empty constraint on database level', async () => {
      await expect(
        query(`INSERT INTO tasks (workspace_id, title, created_by) VALUES ($1, $2, $3)`, [
          workspaceA.id,
          '   ',
          userA.id,
        ]),
      ).rejects.toThrow(/chk_tasks_title_not_empty/);
    });

    it('enforces chk_tasks_status constraint on database level (rejects INVALID and DONE)', async () => {
      await expect(
        query(
          `INSERT INTO tasks (workspace_id, title, status, created_by) VALUES ($1, $2, $3, $4)`,
          [workspaceA.id, '[LIVE_TEST] Invalid Status', 'INVALID_STATUS', userA.id],
        ),
      ).rejects.toThrow(/chk_tasks_status/);

      // Verifies DONE cannot be stored as an independent database state
      await expect(
        query(
          `INSERT INTO tasks (workspace_id, title, status, created_by) VALUES ($1, $2, $3, $4)`,
          [workspaceA.id, '[LIVE_TEST] Legacy DONE Status', 'DONE', userA.id],
        ),
      ).rejects.toThrow(/chk_tasks_status/);
    });

    it('enforces chk_tasks_priority constraint on database level (P0-P4 only)', async () => {
      await expect(
        query(
          `INSERT INTO tasks (workspace_id, title, priority, created_by) VALUES ($1, $2, $3, $4)`,
          [workspaceA.id, '[LIVE_TEST] Invalid Priority', 'HIGH', userA.id], // String 'HIGH' rejected at DDL level, must be P0-P4
        ),
      ).rejects.toThrow(/chk_tasks_priority/);

      // P0 through P4 valid
      const validTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: '[LIVE_TEST] Valid P1 Priority',
        priority: 'P1',
        createdBy: userA.id,
      });
      expect(validTask.priority).toBe('P1');
    });

    it('enforces chk_task_dependencies_not_self constraint', async () => {
      const task = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: '[LIVE_TEST] Self Dep Task',
        createdBy: userA.id,
      });

      await expect(
        dependenciesRepo.createDependency({
          taskId: task.id,
          dependsOnTaskId: task.id,
        }),
      ).rejects.toThrow(/chk_task_dependencies_not_self/);
    });

    it('enforces unique active label name per workspace (case-insensitive)', async () => {
      await labelsRepo.createLabel({
        workspaceId: workspaceA.id,
        name: '[LIVE_TEST] Backend',
      });

      // Same name different case in same workspace fails
      await expect(
        labelsRepo.createLabel({
          workspaceId: workspaceA.id,
          name: '[live_test] backend',
        }),
      ).rejects.toThrow(/uq_labels_workspace_name/);

      // Same name in DIFFERENT workspace succeeds (tenant isolation)
      const labelB = await labelsRepo.createLabel({
        workspaceId: workspaceB.id,
        name: '[LIVE_TEST] Backend',
      });
      expect(labelB.id).toBeDefined();
    });

    it('enforces chk_task_work_blocks_time (end_at must be strictly after start_at)', async () => {
      const task = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: '[LIVE_TEST] Work Block Task',
        createdBy: userA.id,
      });

      await expect(
        workBlocksRepo.createWorkBlock({
          taskId: task.id,
          startAt: '2026-09-07T12:00:00.000Z',
          endAt: '2026-09-07T11:00:00.000Z',
        }),
      ).rejects.toThrow(/chk_task_work_blocks_time/);
    });
  });

  describe('Recursive Hierarchy Query (PostgreSQL Recursive CTE)', () => {
    it('accurately resolves multi-level ancestor chain using recursive SQL CTE', async () => {
      const taskGrandparent = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: '[LIVE_TEST] Grandparent',
        createdBy: userA.id,
      });

      const taskParent = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        parentTaskId: taskGrandparent.id,
        title: '[LIVE_TEST] Parent',
        createdBy: userA.id,
      });

      const taskChild = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        parentTaskId: taskParent.id,
        title: '[LIVE_TEST] Child',
        createdBy: userA.id,
      });

      const ancestors = await tasksRepo.getTaskAncestors(taskChild.id, workspaceA.id);
      expect(ancestors).toContain(taskParent.id);
      expect(ancestors).toContain(taskGrandparent.id);
    });
  });

  describe('Full HTTP Fastify API Flow on Live PostgreSQL (TM-TASK-001 to TM-TASK-015)', () => {
    let createdTaskId;
    let createdLabelId;

    it('POST /api/v1/tasks creates a task (TM-TASK-001, TM-TASK-004, TM-TASK-005)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: '[LIVE_TEST] Build Task API',
          description: 'Full live test suite',
          priority: 'P0',
          status: 'TODO',
          dueAt: '2026-10-01T12:00:00.000Z',
          estimatedDuration: 90,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.title).toBe('[LIVE_TEST] Build Task API');
      expect(body.data.priority).toBe('P0');
      expect(body.data.estimatedDuration).toBe(90);
      createdTaskId = body.data.id;
    });

    it('GET /api/v1/tasks/:id retrieves full composite task', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe(createdTaskId);
      expect(body.data.subtasks).toEqual([]);
      expect(body.data.labels).toEqual([]);
      expect(body.data.dependencies).toEqual([]);
    });

    it('PATCH /api/v1/tasks/:id updates a task and checks version (TM-TASK-002, Task 5.19)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: '[LIVE_TEST] Build Task API Updated',
          priority: 'P1',
          version: 1, // Current version is 1
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.title).toBe('[LIVE_TEST] Build Task API Updated');
      expect(body.data.priority).toBe('P1');
      expect(body.data.version).toBe(2);

      // Stale version update must fail with 409 Conflict
      const staleRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: '[LIVE_TEST] Stale mutation',
          version: 1, // Old version
        },
      });

      expect(staleRes.statusCode).toBe(409);
      expect(JSON.parse(staleRes.payload).error.code).toBe('CONFLICT');
    });

    it('POST /api/v1/tasks/:id/complete marks task completed without modifying due date (TM-TASK-003)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/complete`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('COMPLETED');
      expect(body.data.completedAt).toBeDefined();
      expect(body.data.dueAt).toBe('2026-10-01T12:00:00.000Z');
    });

    it('POST /api/v1/tasks/:id/reopen restores incomplete status', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/reopen`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('TODO');
      expect(body.data.completedAt).toBeNull();
    });

    it('POST /api/v1/tasks/labels creates a label and attaches to task (TM-TASK-007)', async () => {
      const labelRes = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/labels',
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          name: '[LIVE_TEST] Core Feature',
          color: '#10B981',
        },
      });

      expect(labelRes.statusCode).toBe(201);
      createdLabelId = JSON.parse(labelRes.payload).data.id;

      // Attach label to task
      const attachRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/labels`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          labelId: createdLabelId,
        },
      });

      expect(attachRes.statusCode).toBe(201);

      // Verify label is attached
      const getTask = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      const taskBody = JSON.parse(getTask.payload);
      expect(taskBody.data.labels.some(l => l.id === createdLabelId)).toBe(true);
    });

    it('POST /api/v1/tasks/:id/subtasks creates hierarchical subtask (TM-TASK-008)', async () => {
      const subtaskRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/subtasks`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: '[LIVE_TEST] Subtask 1',
          priority: 'P2',
        },
      });

      expect(subtaskRes.statusCode).toBe(201);
      const subtaskBody = JSON.parse(subtaskRes.payload);
      expect(subtaskBody.data.parentTaskId).toBe(createdTaskId);
    });

    it('POST /api/v1/tasks/:id/dependencies creates task dependency (TM-TASK-010)', async () => {
      const targetTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: '[LIVE_TEST] Dependency Prerequisite',
        createdBy: userA.id,
      });

      const depRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/dependencies`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          dependsOnTaskId: targetTask.id,
          dependencyType: 'BLOCKS',
        },
      });

      expect(depRes.statusCode).toBe(201);
      const depBody = JSON.parse(depRes.payload);
      expect(depBody.data.taskId).toBe(createdTaskId);
      expect(depBody.data.dependsOnTaskId).toBe(targetTask.id);
    });

    it('POST /api/v1/tasks/:id/links attaches external and internal links (Task 5.11)', async () => {
      const linkRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/links`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          url: 'https://github.com/Frostyanand/Workaholic-App',
          title: 'Repository Reference',
        },
      });

      expect(linkRes.statusCode).toBe(201);
      const body = JSON.parse(linkRes.payload);
      expect(body.data.url).toBe('https://github.com/Frostyanand/Workaholic-App');

      // Dangerous javascript: link rejected
      const badLinkRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/links`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          url: 'javascript:alert("hacked")',
        },
      });
      expect(badLinkRes.statusCode).toBe(400);
    });

    it('POST /api/v1/tasks/:id/work-blocks creates scheduled work block (Task 5.13)', async () => {
      const blockRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/work-blocks`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          startAt: '2026-09-07T14:00:00.000Z',
          endAt: '2026-09-07T16:00:00.000Z',
          timezone: 'Asia/Kolkata',
        },
      });

      expect(blockRes.statusCode).toBe(201);
      const body = JSON.parse(blockRes.payload);
      expect(body.data.startAt).toBeDefined();
      expect(body.data.endAt).toBeDefined();
    });

    it('GET /api/v1/tasks filters overdue tasks correctly (TM-TASK-012, TM-TASK-013)', async () => {
      // Create past-due task
      await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: '[LIVE_TEST] Overdue Task',
        status: 'TODO',
        dueAt: '2020-01-01T00:00:00.000Z',
        createdBy: userA.id,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tasks?overdue=true',
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every(t => t.isOverdue === true)).toBe(true);
    });

    it('DELETE /api/v1/tasks/:id soft deletes task and POST :id/restore restores it (TM-TASK-014, TM-TASK-015)', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(delRes.statusCode).toBe(200);

      // Normal GET must return 404 (TM-TASK-015)
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(getRes.statusCode).toBe(404);

      // Restore task
      const restoreRes = await app.inject({
        method: 'POST',
        url: `/api/v1/tasks/${createdTaskId}/restore`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(restoreRes.statusCode).toBe(200);

      // Verify accessible again
      const verifyRes = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(verifyRes.statusCode).toBe(200);
    });

    it('strictly prevents cross-workspace task access (IDOR / Tenant Isolation)', async () => {
      // User B attempts to access User A's task in Workspace A
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${createdTaskId}`,
        headers: {
          authorization: `Bearer ${sessionTokenB}`,
          'x-workspace-id': workspaceB.id,
        },
      });

      // Must return 404 Not Found to prevent existence disclosure
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.payload).error.code).toBe('NOT_FOUND');
    });
  });
});
