import { describe, it, expect, beforeAll } from 'vitest';
import { query, testConnection, pool } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';

describe('Task Recurrence Live Integration (Phase 10.13: Decoupled Occurrence-State)', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let sessionTokenA;
  let sessionTokenB;
  let isDbLive = false;

  beforeAll(async () => {
    try {
      const conn = await testConnection(pool);
      if (conn && conn.connected === 1) {
        isDbLive = true;
      }
    } catch {
      isDbLive = false;
    }

    if (!isDbLive) {
      console.warn('PostgreSQL is not reachable; skipping live task recurrence tests.');
      return;
    }

    app = createApp({ logger: false });

    // Clean test state
    await query('DELETE FROM tasks WHERE title LIKE $1', ['[LIVE_TASK_REC_TEST]%']);

    userA = await createUser({
      displayName: 'Task Recurrence User A',
      email: `task_rec_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Task Recurrence User B',
      email: `task_rec_b_${Date.now()}@example.com`,
    });

    const resA = await createWorkspaceWithMembership({
      name: 'Task Recurrence Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = resA.workspace;

    const resB = await createWorkspaceWithMembership({
      name: 'Task Recurrence Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = resB.workspace;

    const rawTokenA = `live_task_rec_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    const rawTokenB = `live_task_rec_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;
  });

  it('creates a recurring task and links recurrence_rule_id', async () => {
    if (!isDbLive) return;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        title: '[LIVE_TASK_REC_TEST] Daily Backup Check',
        dueAt: '2026-06-01T09:00:00.000Z',
        priority: 'P2',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-06-01T09:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const task = JSON.parse(res.body).data;
    expect(task.title).toBe('[LIVE_TASK_REC_TEST] Daily Backup Check');
    expect(task.recurrenceRuleId).toBeTruthy();
    expect(task.dueAt).toBe('2026-06-01T09:00:00.000Z');
  });

  it('completing one occurrence preserves master dueAt (BR-TASK-008) and records in task_occurrences', async () => {
    if (!isDbLive) return;

    // 1. Create recurring daily task
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        title: '[LIVE_TASK_REC_TEST] Daily Standup Report',
        dueAt: '2026-07-01T10:00:00.000Z',
        priority: 'P2',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-07-01T10:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });
    const task = JSON.parse(createRes.body).data;

    // 2. Complete July 1 occurrence
    const occKey = '2026-07-01T10:00:00.000Z';
    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/occurrences/${encodeURIComponent(occKey)}/complete`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeData = JSON.parse(completeRes.body).data;
    expect(completeData.success).toBe(true);
    expect(completeData.occurrenceKey).toBe(occKey);
    expect(completeData.status).toBe('COMPLETED');

    // 3. Verify master task state: dueAt is NOT mutated (BR-TASK-008)
    const fetchRes = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const updatedTask = JSON.parse(fetchRes.body).data;
    expect(updatedTask.status).toBe('TODO');
    expect(updatedTask.completedAt).toBeNull();
    expect(updatedTask.dueAt).toBe('2026-07-01T10:00:00.000Z'); // Unchanged!

    // 4. Verify sparse record is stored in task_occurrences (NOT recurrence_exceptions)
    const dbOcc = await query(
      'SELECT * FROM task_occurrences WHERE task_id = $1 AND occurrence_key = $2',
      [task.id, occKey],
    );
    expect(dbOcc.rows).toHaveLength(1);
    expect(dbOcc.rows[0].status).toBe('COMPLETED');
    expect(dbOcc.rows[0].completed_at).toBeTruthy();
  });

  it('reopening a completed occurrence deletes sparse row and preserves master task dueAt', async () => {
    if (!isDbLive) return;

    // 1. Create recurring daily task
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        title: '[LIVE_TASK_REC_TEST] Daily Review',
        dueAt: '2026-08-01T08:00:00.000Z',
        priority: 'P1',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-08-01T08:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });
    const task = JSON.parse(createRes.body).data;
    const occKey = '2026-08-01T08:00:00.000Z';

    // 2. Complete August 1
    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/occurrences/${encodeURIComponent(occKey)}/complete`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    // 3. Reopen August 1
    const reopenRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/occurrences/${encodeURIComponent(occKey)}/reopen`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(reopenRes.statusCode).toBe(200);
    const reopenData = JSON.parse(reopenRes.body).data;
    expect(reopenData.success).toBe(true);

    // 4. Verify master task state
    const fetchRes = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const updatedTask = JSON.parse(fetchRes.body).data;
    expect(updatedTask.dueAt).toBe('2026-08-01T08:00:00.000Z');
    expect(updatedTask.status).toBe('TODO');

    // 5. Verify sparse row deleted from task_occurrences
    const dbOcc = await query(
      'SELECT * FROM task_occurrences WHERE task_id = $1 AND occurrence_key = $2',
      [task.id, occKey],
    );
    expect(dbOcc.rows).toHaveLength(0);
  });

  it('completes entire series only when ALL bounded occurrences are completed', async () => {
    if (!isDbLive) return;

    // Series with occurrenceCount: 2
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        title: '[LIVE_TASK_REC_TEST] Two-Part Project Check',
        dueAt: '2026-09-01T12:00:00.000Z',
        priority: 'P2',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-09-01T12:00:00.000Z',
          occurrenceCount: 2,
          timezone: 'UTC',
        },
      },
    });
    const task = JSON.parse(createRes.body).data;

    // Complete occurrence 2 (Sept 2, final) OUT OF ORDER before occurrence 1
    const outOfOrderRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/occurrences/${encodeURIComponent('2026-09-02T12:00:00.000Z')}/complete`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(outOfOrderRes.statusCode).toBe(200);
    const outOfOrderData = JSON.parse(outOfOrderRes.body).data;
    // Must NOT complete series because occurrence 1 is uncompleted!
    expect(outOfOrderData.seriesCompleted).toBe(false);

    let checkTask = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(JSON.parse(checkTask.body).data.status).toBe('TODO');

    // Complete occurrence 1 (Sept 1)
    const finalCompleteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/occurrences/${encodeURIComponent('2026-09-01T12:00:00.000Z')}/complete`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(finalCompleteRes.statusCode).toBe(200);
    const finalData = JSON.parse(finalCompleteRes.body).data;
    expect(finalData.seriesCompleted).toBe(true);

    // Verify master task is now COMPLETED
    const fetchRes = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    const finalTask = JSON.parse(fetchRes.body).data;
    expect(finalTask.status).toBe('COMPLETED');
    expect(finalTask.completedAt).toBeTruthy();
  });

  it('enforces tenant isolation on task occurrence completion (IDOR protection)', async () => {
    if (!isDbLive) return;

    // User A creates task in workspace A
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        title: '[LIVE_TASK_REC_TEST] Secret Task',
        dueAt: '2026-10-01T10:00:00.000Z',
        recurrence: {
          frequency: 'DAILY',
          interval: 1,
          startAt: '2026-10-01T10:00:00.000Z',
          timezone: 'UTC',
        },
      },
    });
    const task = JSON.parse(createRes.body).data;

    // User B attempts to complete User A's task occurrence
    const illegalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/occurrences/${encodeURIComponent('2026-10-01T10:00:00.000Z')}/complete`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });

    expect(illegalRes.statusCode).toBe(404);
  });
});
