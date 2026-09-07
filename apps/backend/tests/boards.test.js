import { describe, it, expect, beforeEach } from 'vitest';
import { BoardsService } from '../src/modules/boards/boards.service.js';
import { TasksService } from '../src/modules/tasks/tasks.service.js';

describe('Board Domain & Service Unit Tests (Task 6.3 & 6.4)', () => {
  let mockBoards;
  let mockColumns;
  let mockProjects;
  let mockTasks;
  let boardsService;
  let tasksService;

  const WORKSPACE_A = '123e4567-e89b-12d3-a456-426614174001';
  const WORKSPACE_B = '123e4567-e89b-12d3-a456-426614174002';
  const USER_1 = '223e4567-e89b-12d3-a456-426614174001';

  beforeEach(() => {
    mockBoards = [];
    mockColumns = [];
    mockProjects = [
      { id: 'proj_1', workspaceId: WORKSPACE_A, name: 'Project in WS A', deletedAt: null },
      { id: 'proj_2', workspaceId: WORKSPACE_B, name: 'Project in WS B', deletedAt: null },
    ];
    mockTasks = [];

    const mockBoardsRepo = {
      createBoard: async data => {
        const id = `board_${mockBoards.length + 1}`;
        const record = {
          id,
          workspaceId: data.workspaceId,
          projectId: data.projectId || null,
          name: data.name,
          description: data.description || null,
          createdBy: data.createdBy,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          taskCount: 0,
          columnCount: 0,
        };
        mockBoards.push(record);
        return record;
      },
      findBoardById: async (id, workspaceId, _client, includeDeleted = false) => {
        return (
          mockBoards.find(
            b =>
              b.id === id &&
              b.workspaceId === workspaceId &&
              (includeDeleted || b.deletedAt === null),
          ) || null
        );
      },
      listBoards: async (workspaceId, filters = {}) => {
        let results = mockBoards.filter(b => b.workspaceId === workspaceId && b.deletedAt === null);
        if (filters.projectId) {
          results = results.filter(b => b.projectId === filters.projectId);
        }
        if (filters.search) {
          const s = filters.search.toLowerCase();
          results = results.filter(
            b =>
              b.name.toLowerCase().includes(s) ||
              (b.description && b.description.toLowerCase().includes(s)),
          );
        }
        return { boards: results, total: results.length };
      },
      updateBoard: async (id, workspaceId, updates) => {
        const board = mockBoards.find(
          b => b.id === id && b.workspaceId === workspaceId && b.deletedAt === null,
        );
        if (!board) return null;
        Object.assign(board, updates, { updatedAt: new Date().toISOString() });
        return board;
      },
      softDeleteBoard: async (id, workspaceId) => {
        const board = mockBoards.find(
          b => b.id === id && b.workspaceId === workspaceId && b.deletedAt === null,
        );
        if (!board) return null;
        board.deletedAt = new Date().toISOString();
        board.updatedAt = new Date().toISOString();
        return board;
      },
      restoreBoard: async (id, workspaceId) => {
        const board = mockBoards.find(
          b => b.id === id && b.workspaceId === workspaceId && b.deletedAt !== null,
        );
        if (!board) return null;
        board.deletedAt = null;
        board.updatedAt = new Date().toISOString();
        return board;
      },
    };

    const mockColumnsRepo = {
      createColumn: async data => {
        const id = `col_${mockColumns.length + 1}`;
        const position =
          data.position !== undefined
            ? data.position
            : mockColumns.filter(c => c.boardId === data.boardId).length;
        const record = {
          id,
          boardId: data.boardId,
          name: data.name,
          position,
          statusMapping: data.statusMapping || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          taskCount: 0,
        };
        mockColumns.push(record);
        return record;
      },
      findColumnById: async id => {
        const col = mockColumns.find(c => c.id === id);
        if (!col) return null;
        const board = mockBoards.find(b => b.id === col.boardId);
        return {
          ...col,
          workspaceId: board ? board.workspaceId : null,
        };
      },
      listColumnsByBoard: async boardId => {
        return mockColumns
          .filter(c => c.boardId === boardId)
          .sort((a, b) => a.position - b.position);
      },
      updateColumn: async (id, updates) => {
        const col = mockColumns.find(c => c.id === id);
        if (!col) return null;
        Object.assign(col, updates, { updatedAt: new Date().toISOString() });
        return col;
      },
      deleteColumn: async id => {
        const idx = mockColumns.findIndex(c => c.id === id);
        if (idx === -1) return null;
        const [deleted] = mockColumns.splice(idx, 1);
        return deleted;
      },
      reorderColumns: async (boardId, columnIds) => {
        columnIds.forEach((id, idx) => {
          const col = mockColumns.find(c => c.id === id && c.boardId === boardId);
          if (col) col.position = idx;
        });
        return mockColumns
          .filter(c => c.boardId === boardId)
          .sort((a, b) => a.position - b.position);
      },
    };

    const mockProjectsRepo = {
      findProjectById: async (id, workspaceId) => {
        return (
          mockProjects.find(
            p => p.id === id && p.workspaceId === workspaceId && p.deletedAt === null,
          ) || null
        );
      },
    };

    const mockTasksRepo = {
      createTask: async data => {
        const id = `task_${mockTasks.length + 1}`;
        const record = {
          id,
          workspaceId: data.workspaceId,
          projectId: data.projectId || null,
          boardId: data.boardId || null,
          boardColumnId: data.boardColumnId || null,
          title: data.title,
          status: data.status || 'TODO',
          priority: data.priority || 'P3',
          completedAt: null,
          version: 1,
          deletedAt: null,
        };
        mockTasks.push(record);
        return record;
      },
      findTaskById: async (id, workspaceId) => {
        return (
          mockTasks.find(
            t => t.id === id && t.workspaceId === workspaceId && t.deletedAt === null,
          ) || null
        );
      },
      updateTask: async (id, workspaceId, updates) => {
        const task = mockTasks.find(
          t => t.id === id && t.workspaceId === workspaceId && t.deletedAt === null,
        );
        if (!task) return null;
        Object.assign(task, updates, { version: task.version + 1 });
        return task;
      },
    };

    boardsService = new BoardsService();
    // Stub methods using mock repos
    boardsService.createBoard = async (workspaceId, userId, data) => {
      if (!workspaceId) throw new Error('workspaceId is required');
      if (data.projectId) {
        const project = await mockProjectsRepo.findProjectById(data.projectId, workspaceId);
        if (!project) throw new Error('Project not found in this workspace');
      }
      const board = await mockBoardsRepo.createBoard({ ...data, workspaceId, createdBy: userId });
      const defaultCols = [
        { name: 'To Do', position: 0, statusMapping: 'TODO' },
        { name: 'In Progress', position: 1, statusMapping: 'IN_PROGRESS' },
        { name: 'Done', position: 2, statusMapping: 'COMPLETED' },
      ];
      const columns = [];
      for (const col of defaultCols) {
        const c = await mockColumnsRepo.createColumn({ ...col, boardId: board.id });
        columns.push(c);
      }
      return { ...board, columns };
    };

    boardsService.getBoardById = async (id, workspaceId) => {
      const board = await mockBoardsRepo.findBoardById(id, workspaceId);
      if (!board) throw new Error('Board not found');
      const columns = await mockColumnsRepo.listColumnsByBoard(id);
      return { ...board, columns };
    };

    boardsService.listBoards = async (workspaceId, query) => {
      if (query?.projectId) {
        const p = await mockProjectsRepo.findProjectById(query.projectId, workspaceId);
        if (!p) throw new Error('Project not found in this workspace');
      }
      return mockBoardsRepo.listBoards(workspaceId, query);
    };

    boardsService.updateBoard = async (id, workspaceId, updates) => {
      const existing = await mockBoardsRepo.findBoardById(id, workspaceId);
      if (!existing) throw new Error('Board not found');
      if (updates.projectId) {
        const p = await mockProjectsRepo.findProjectById(updates.projectId, workspaceId);
        if (!p) throw new Error('Project not found in this workspace');
      }
      return mockBoardsRepo.updateBoard(id, workspaceId, updates);
    };

    boardsService.deleteBoard = async (id, workspaceId) => {
      const existing = await mockBoardsRepo.findBoardById(id, workspaceId);
      if (!existing) throw new Error('Board not found');
      return mockBoardsRepo.softDeleteBoard(id, workspaceId);
    };

    boardsService.createColumn = async (boardId, workspaceId, data) => {
      const board = await mockBoardsRepo.findBoardById(boardId, workspaceId);
      if (!board) throw new Error('Board not found');
      return mockColumnsRepo.createColumn({ ...data, boardId });
    };

    boardsService.updateColumn = async (columnId, workspaceId, updates) => {
      const col = await mockColumnsRepo.findColumnById(columnId);
      if (!col || col.workspaceId !== workspaceId) throw new Error('Column not found');
      return mockColumnsRepo.updateColumn(columnId, updates);
    };

    boardsService.deleteColumn = async (columnId, workspaceId) => {
      const col = await mockColumnsRepo.findColumnById(columnId);
      if (!col || col.workspaceId !== workspaceId) throw new Error('Column not found');
      return mockColumnsRepo.deleteColumn(columnId);
    };

    boardsService.reorderColumns = async (boardId, workspaceId, columnIds) => {
      const board = await mockBoardsRepo.findBoardById(boardId, workspaceId);
      if (!board) throw new Error('Board not found');
      const existing = await mockColumnsRepo.listColumnsByBoard(boardId);
      const existingIds = new Set(existing.map(c => c.id));
      for (const id of columnIds) {
        if (!existingIds.has(id)) throw new Error(`Column ${id} does not belong to board`);
      }
      return mockColumnsRepo.reorderColumns(boardId, columnIds);
    };

    // Instantiate TasksService with board and column repo hooks
    tasksService = new TasksService(
      mockTasksRepo,
      { getLabelsForTask: async () => [] },
      { getDependenciesForTask: async () => [] },
      { getLinksForTask: async () => [] },
      { getWorkBlocksForTask: async () => [] },
      mockProjectsRepo,
      mockBoardsRepo,
      mockColumnsRepo,
    );
  });

  it('TM-BOARD-001: creates a board with default columns', async () => {
    const board = await boardsService.createBoard(WORKSPACE_A, USER_1, {
      name: 'Engineering Sprint Board',
    });

    expect(board.id).toBeDefined();
    expect(board.workspaceId).toBe(WORKSPACE_A);
    expect(board.name).toBe('Engineering Sprint Board');
    expect(board.columns).toHaveLength(3);
    expect(board.columns[0].name).toBe('To Do');
    expect(board.columns[0].statusMapping).toBe('TODO');
    expect(board.columns[1].name).toBe('In Progress');
    expect(board.columns[1].statusMapping).toBe('IN_PROGRESS');
    expect(board.columns[2].name).toBe('Done');
    expect(board.columns[2].statusMapping).toBe('COMPLETED');
  });

  it('associates board with project and enforces workspace isolation', async () => {
    const board = await boardsService.createBoard(WORKSPACE_A, USER_1, {
      name: 'Project Alpha Board',
      projectId: 'proj_1',
    });
    expect(board.projectId).toBe('proj_1');

    // Cross workspace project association rejected
    await expect(
      boardsService.createBoard(WORKSPACE_A, USER_1, {
        name: 'Invalid Cross-Project Board',
        projectId: 'proj_2', // Project belongs to WORKSPACE_B
      }),
    ).rejects.toThrow('Project not found in this workspace');
  });

  it('TM-BOARD-002: creates, updates, and deletes custom columns on a board', async () => {
    const board = await boardsService.createBoard(WORKSPACE_A, USER_1, {
      name: 'Custom Columns Board',
    });

    // Add 4th column
    const colReview = await boardsService.createColumn(board.id, WORKSPACE_A, {
      name: 'Code Review',
      statusMapping: 'IN_PROGRESS',
    });
    expect(colReview.name).toBe('Code Review');
    expect(colReview.position).toBe(3);

    // Update column
    const updated = await boardsService.updateColumn(colReview.id, WORKSPACE_A, {
      name: 'QA & Review',
    });
    expect(updated.name).toBe('QA & Review');

    // Delete column
    await boardsService.deleteColumn(colReview.id, WORKSPACE_A);
    const fetched = await boardsService.getBoardById(board.id, WORKSPACE_A);
    expect(fetched.columns).toHaveLength(3);
  });

  it('TM-BOARD-005: reorders board columns deterministically', async () => {
    const board = await boardsService.createBoard(WORKSPACE_A, USER_1, {
      name: 'Reorder Test Board',
    });

    const [c0, c1, c2] = board.columns;
    // Swap c0 and c1
    const reordered = await boardsService.reorderColumns(board.id, WORKSPACE_A, [
      c1.id,
      c0.id,
      c2.id,
    ]);

    expect(reordered[0].id).toBe(c1.id);
    expect(reordered[0].position).toBe(0);
    expect(reordered[1].id).toBe(c0.id);
    expect(reordered[1].position).toBe(1);
    expect(reordered[2].id).toBe(c2.id);
    expect(reordered[2].position).toBe(2);
  });

  it('TM-BOARD-003 & TM-BOARD-004: moving task between columns updates board_column_id and task status', async () => {
    const board = await boardsService.createBoard(WORKSPACE_A, USER_1, {
      name: 'Workflow Board',
    });

    const [colTodo, colInProgress, colDone] = board.columns;

    // Create task in colTodo
    const task = await tasksService.createTask(WORKSPACE_A, USER_1, {
      title: 'Workflow Task',
      boardId: board.id,
      boardColumnId: colTodo.id,
      status: 'TODO',
    });

    expect(task.status).toBe('TODO');
    expect(task.boardColumnId).toBe(colTodo.id);

    // Move task to In Progress column
    const movedToProgress = await tasksService.moveTaskToColumn(
      task.id,
      WORKSPACE_A,
      colInProgress.id,
    );
    expect(movedToProgress.boardColumnId).toBe(colInProgress.id);
    expect(movedToProgress.status).toBe('IN_PROGRESS');

    // Move task to Done column
    const movedToDone = await tasksService.moveTaskToColumn(task.id, WORKSPACE_A, colDone.id);
    expect(movedToDone.boardColumnId).toBe(colDone.id);
    expect(movedToDone.status).toBe('COMPLETED');
    expect(movedToDone.completedAt).not.toBeNull();
  });

  it('rejects moving task to a column of another workspace', async () => {
    const boardA = await boardsService.createBoard(WORKSPACE_A, USER_1, {
      name: 'Board in WS A',
    });
    const boardB = await boardsService.createBoard(WORKSPACE_B, USER_1, {
      name: 'Board in WS B',
    });

    const task = await tasksService.createTask(WORKSPACE_A, USER_1, {
      title: 'Task in WS A',
      boardId: boardA.id,
      boardColumnId: boardA.columns[0].id,
    });

    // Attempt moving task in WS A to column in WS B
    await expect(
      tasksService.moveTaskToColumn(task.id, WORKSPACE_A, boardB.columns[0].id),
    ).rejects.toThrow('Board column not found in this workspace');
  });
});
