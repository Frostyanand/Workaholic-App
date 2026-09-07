import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import * as boardsRepo from '../src/modules/boards/boards.repository.js';
import * as columnsRepo from '../src/modules/boards/columns.repository.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';

describe('Boards & Columns Live PostgreSQL 16 & API Integration (TM-BOARD-001, 002, 003, 005, 006)', () => {
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
    await query('DELETE FROM boards WHERE name LIKE $1', ['[LIVE_BOARD_TEST]%']);

    userA = await createUser({
      displayName: 'Board Live Tester A',
      email: `board_test_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Board Live Tester B',
      email: `board_test_b_${Date.now()}@example.com`,
    });

    const resA = await createWorkspaceWithMembership({
      name: 'Board Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = resA.workspace;

    const resB = await createWorkspaceWithMembership({
      name: 'Board Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = resB.workspace;

    const rawTokenA = `live_board_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    const rawTokenB = `live_board_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;
  });

  afterAll(async () => {
    await query('DELETE FROM boards WHERE name LIKE $1', ['[LIVE_BOARD_TEST]%']);
  });

  it('TM-BOARD-001 (API): creates a board with default columns via POST /api/v1/boards', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        name: '[LIVE_BOARD_TEST] Main Kanban',
        description: 'Product workflow board',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe('[LIVE_BOARD_TEST] Main Kanban');
    expect(body.data.columns).toHaveLength(3);
    expect(body.data.columns[0].name).toBe('To Do');
    expect(body.data.columns[1].name).toBe('In Progress');
    expect(body.data.columns[2].name).toBe('Done');
  });

  it('lists boards via GET /api/v1/boards', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/boards?search=LIVE_BOARD_TEST',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('TM-BOARD-002 (API, DB): adds custom column to board and verifies in DB', async () => {
    const board = await boardsRepo.createBoard({
      workspaceId: workspaceA.id,
      name: '[LIVE_BOARD_TEST] Column Test Board',
      createdBy: userA.id,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/boards/${board.id}/columns`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        name: 'Quality Assurance',
        statusMapping: 'IN_PROGRESS',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('Quality Assurance');
    expect(body.data.position).toBe(0);

    // Verify in real DB
    const dbCol = await columnsRepo.findColumnById(body.data.id);
    expect(dbCol).not.toBeNull();
    expect(dbCol.name).toBe('Quality Assurance');
    expect(dbCol.statusMapping).toBe('IN_PROGRESS');
  });

  it('TM-BOARD-005 (API, DB): reorders columns and verifies persistence in PostgreSQL', async () => {
    const board = await boardsRepo.createBoard({
      workspaceId: workspaceA.id,
      name: '[LIVE_BOARD_TEST] Reorder DB Board',
      createdBy: userA.id,
    });

    const colA = await columnsRepo.createColumn({ boardId: board.id, name: 'Col A', position: 0 });
    const colB = await columnsRepo.createColumn({ boardId: board.id, name: 'Col B', position: 1 });
    const colC = await columnsRepo.createColumn({ boardId: board.id, name: 'Col C', position: 2 });

    // Reverse order: C, B, A
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/boards/${board.id}/columns/reorder`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        columnIds: [colC.id, colB.id, colA.id],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].id).toBe(colC.id);
    expect(body.data[0].position).toBe(0);
    expect(body.data[1].id).toBe(colB.id);
    expect(body.data[1].position).toBe(1);
    expect(body.data[2].id).toBe(colA.id);
    expect(body.data[2].position).toBe(2);

    // Verify DB direct query
    const dbCols = await columnsRepo.listColumnsByBoard(board.id);
    expect(dbCols[0].id).toBe(colC.id);
    expect(dbCols[2].id).toBe(colA.id);
  });

  it('TM-BOARD-003 & TM-BOARD-004 (API, DOMAIN): moves task between columns and updates status', async () => {
    const board = await boardsRepo.createBoard({
      workspaceId: workspaceA.id,
      name: '[LIVE_BOARD_TEST] Movement Board',
      createdBy: userA.id,
    });

    const colTodo = await columnsRepo.createColumn({
      boardId: board.id,
      name: 'To Do',
      position: 0,
      statusMapping: 'TODO',
    });
    const colDone = await columnsRepo.createColumn({
      boardId: board.id,
      name: 'Done',
      position: 1,
      statusMapping: 'COMPLETED',
    });

    const task = await tasksRepo.createTask({
      workspaceId: workspaceA.id,
      boardId: board.id,
      boardColumnId: colTodo.id,
      title: '[LIVE_BOARD_TEST] Draggable Task',
      status: 'TODO',
      createdBy: userA.id,
    });

    expect(task.status).toBe('TODO');

    // Move to Done column
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/boards/${board.id}/tasks/${task.id}/move`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        columnId: colDone.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.boardColumnId).toBe(colDone.id);
    expect(body.data.status).toBe('COMPLETED');
    expect(body.data.completedAt).not.toBeNull();

    // Verify task listing on board reflects updated column
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/boards/${board.id}/tasks?boardColumnId=${colDone.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data.some(t => t.id === task.id)).toBe(true);
  });

  it('TM-BOARD-006 (AUTHZ): prevents unauthorized cross-workspace board access and modifications', async () => {
    const boardA = await boardsRepo.createBoard({
      workspaceId: workspaceA.id,
      name: '[LIVE_BOARD_TEST] Secret Board A',
      createdBy: userA.id,
    });

    // User B attempts to access Board A -> 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/boards/${boardA.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(getRes.statusCode).toBe(404);

    // User B attempts to add column to Board A -> 404
    const colRes = await app.inject({
      method: 'POST',
      url: `/api/v1/boards/${boardA.id}/columns`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
      payload: { name: 'Unauthorized Column' },
    });
    expect(colRes.statusCode).toBe(404);

    // User B attempts to delete Board A -> 404
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/boards/${boardA.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
        'x-workspace-id': workspaceB.id,
      },
    });
    expect(delRes.statusCode).toBe(404);
  });
});
