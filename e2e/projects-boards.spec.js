import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Workaholic Projects & Boards (Phase 6)
 * Pure JavaScript ES2023 - Zero TypeScript
 * Satisfies TEST-MATRIX:
 *  - TM-PROJECT-001 (E2E): User can create projects
 *  - TM-PROJECT-002 (E2E): Tasks can belong to projects
 *  - TM-PROJECT-004 (E2E): Project deletion follows configured policy
 *  - TM-BOARD-001 (E2E): User can create a board
 *  - TM-BOARD-002 (E2E): User can create custom columns
 *  - TM-BOARD-003 (E2E): Tasks can be moved between columns
 *  - TM-BOARD-004 (E2E): Drag-and-drop / movement updates task status
 *  - TM-BOARD-007 (E2E): Empty boards render correctly
 *  - TM-BOARD-008 (E2E): Large boards remain usable
 */

test.describe('Projects & Boards E2E Journeys', () => {
  let mockProjects = [];
  let mockBoards = [];
  let mockColumns = [];
  let mockTasks = [];

  test.beforeEach(async ({ page }) => {
    // Reset deterministic in-memory state
    mockProjects = [
      {
        id: 'proj-100',
        name: 'Infrastructure Modernization',
        description: 'PostgreSQL 16 migration and index tuning',
        status: 'ACTIVE',
        color: '#4f46e5',
        startAt: '2026-09-01T00:00:00.000Z',
        dueAt: '2026-10-01T00:00:00.000Z',
        taskCount: 2,
        completedTaskCount: 1,
        progressPercentage: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    mockColumns = [
      { id: 'col-todo', boardId: 'board-200', name: 'To Do', position: 0, statusMapping: 'TODO' },
      {
        id: 'col-inprogress',
        boardId: 'board-200',
        name: 'In Progress',
        position: 1,
        statusMapping: 'IN_PROGRESS',
      },
      {
        id: 'col-done',
        boardId: 'board-200',
        name: 'Done',
        position: 2,
        statusMapping: 'COMPLETED',
      },
    ];

    mockBoards = [
      {
        id: 'board-200',
        workspaceId: 'ws-default',
        projectId: 'proj-100',
        projectName: 'Infrastructure Modernization',
        name: 'Core Sprint Board',
        description: 'Active sprint execution',
        columns: mockColumns,
        taskCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    mockTasks = [
      {
        id: 'task-101',
        title: 'Verify database foreign key cascades',
        description: 'Check ON DELETE SET NULL on tasks table',
        status: 'TODO',
        priority: 'P1',
        projectId: 'proj-100',
        boardId: 'board-200',
        boardColumnId: 'col-todo',
        version: 1,
        labels: [],
        subtasks: [],
        subtaskCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'task-102',
        title: 'Complete Phase 5 quality gates',
        description: 'Verify 0 TS, 0 lint errors, 100% pass',
        status: 'COMPLETED',
        priority: 'P0',
        projectId: 'proj-100',
        boardId: 'board-200',
        boardColumnId: 'col-done',
        completedAt: new Date().toISOString(),
        version: 1,
        labels: [],
        subtasks: [],
        subtaskCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Intercept Projects API
    await page.route('**/api/v1/projects**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      // List projects
      if (pathname === '/api/v1/projects' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockProjects }),
        });
      }

      // Create project
      if (pathname === '/api/v1/projects' && method === 'POST') {
        const body = route.request().postDataJSON();
        const newProj = {
          id: `proj-${Date.now()}`,
          name: body.name,
          description: body.description || null,
          status: body.status || 'ACTIVE',
          color: body.color || '#4f46e5',
          taskCount: 0,
          completedTaskCount: 0,
          progressPercentage: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockProjects.push(newProj);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newProj }),
        });
      }

      // Single project operations: /api/v1/projects/:id
      const matchProj = pathname.match(/^\/api\/v1\/projects\/([^/]+)$/);
      if (matchProj) {
        const pId = matchProj[1];
        const proj = mockProjects.find(p => p.id === pId);

        if (method === 'GET') {
          if (!proj) {
            return route.fulfill({
              status: 404,
              body: JSON.stringify({ error: { message: 'Not found' } }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: proj }),
          });
        }

        if (method === 'DELETE') {
          mockProjects = mockProjects.filter(p => p.id !== pId);
          // Nullify task project references (ON DELETE SET NULL TM-PROJECT-004)
          mockTasks.forEach(t => {
            if (t.projectId === pId) {
              t.projectId = null;
            }
          });
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { id: pId, deleted: true } }),
          });
        }
      }

      // Members sub-collection
      if (pathname.includes('/members')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] }),
        });
      }

      return route.continue();
    });

    // Intercept Boards & Columns API
    await page.route('**/api/v1/boards**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      // List boards
      if (pathname === '/api/v1/boards' && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockBoards }),
        });
      }

      // Create board
      if (pathname === '/api/v1/boards' && method === 'POST') {
        const body = route.request().postDataJSON();
        const newBoardId = `board-${Date.now()}`;
        const defaultCols = [
          {
            id: `col-${Date.now()}-1`,
            boardId: newBoardId,
            name: 'To Do',
            position: 0,
            statusMapping: 'TODO',
          },
          {
            id: `col-${Date.now()}-2`,
            boardId: newBoardId,
            name: 'In Progress',
            position: 1,
            statusMapping: 'IN_PROGRESS',
          },
          {
            id: `col-${Date.now()}-3`,
            boardId: newBoardId,
            name: 'Done',
            position: 2,
            statusMapping: 'COMPLETED',
          },
        ];
        defaultCols.forEach(c => mockColumns.push(c));

        const newBoard = {
          id: newBoardId,
          workspaceId: 'ws-default',
          projectId: body.projectId || null,
          name: body.name,
          description: body.description || null,
          columns: defaultCols,
          taskCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockBoards.push(newBoard);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newBoard }),
        });
      }

      // Single board: /api/v1/boards/:id
      const matchBoard = pathname.match(/^\/api\/v1\/boards\/([^/]+)$/);
      if (matchBoard) {
        const bId = matchBoard[1];
        const board = mockBoards.find(b => b.id === bId);
        if (!board) {
          return route.fulfill({
            status: 404,
            body: JSON.stringify({ error: { message: 'Not found' } }),
          });
        }
        const bColumns = mockColumns
          .filter(c => c.boardId === bId)
          .sort((a, b) => a.position - b.position);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { ...board, columns: bColumns } }),
        });
      }

      // Board Tasks: /api/v1/boards/:id/tasks
      const matchBoardTasks = pathname.match(/^\/api\/v1\/boards\/([^/]+)\/tasks$/);
      if (matchBoardTasks && method === 'GET') {
        const bId = matchBoardTasks[1];
        const bTasks = mockTasks.filter(t => t.boardId === bId);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: bTasks }),
        });
      }

      // Board Columns create: /api/v1/boards/:id/columns
      const matchCreateCol = pathname.match(/^\/api\/v1\/boards\/([^/]+)\/columns$/);
      if (matchCreateCol && method === 'POST') {
        const bId = matchCreateCol[1];
        const body = route.request().postDataJSON();
        const newCol = {
          id: `col-${Date.now()}`,
          boardId: bId,
          name: body.name,
          position: mockColumns.filter(c => c.boardId === bId).length,
          statusMapping: body.statusMapping || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockColumns.push(newCol);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newCol }),
        });
      }

      // Move board task: /api/v1/boards/:id/tasks/:taskId/move
      const matchMoveTask = pathname.match(/^\/api\/v1\/boards\/([^/]+)\/tasks\/([^/]+)\/move$/);
      if (matchMoveTask && method === 'POST') {
        const taskId = matchMoveTask[2];
        const body = route.request().postDataJSON();
        const task = mockTasks.find(t => t.id === taskId);
        if (task) {
          task.boardColumnId = body.columnId;
          if (body.status) {
            task.status = body.status;
            if (body.status === 'COMPLETED') {
              task.completedAt = new Date().toISOString();
            } else {
              task.completedAt = null;
            }
          }
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: task }),
        });
      }

      return route.continue();
    });

    // Intercept Tasks API
    await page.route('**/api/v1/tasks**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      if (pathname === '/api/v1/tasks' && method === 'GET') {
        const projectId = url.searchParams.get('projectId');
        let filtered = [...mockTasks];
        if (projectId) {
          filtered = filtered.filter(t => t.projectId === projectId);
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: filtered }),
        });
      }

      if (pathname === '/api/v1/tasks' && method === 'POST') {
        const body = route.request().postDataJSON();
        const newTask = {
          id: `task-${Date.now()}`,
          title: body.title,
          description: body.description || null,
          status: 'TODO',
          priority: body.priority || 'P3',
          projectId: body.projectId || null,
          boardId: body.boardId || null,
          boardColumnId: body.boardColumnId || null,
          version: 1,
          labels: [],
          subtasks: [],
          subtaskCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockTasks.unshift(newTask);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newTask }),
        });
      }

      return route.continue();
    });
  });

  // ==========================================
  // TM-PROJECT-001: User can create projects
  // ==========================================
  test('TM-PROJECT-001 (E2E): User can create a project via UI modal', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.locator('main h1')).toContainText('Projects');
    await expect(page.locator('text=Infrastructure Modernization')).toBeVisible();

    // Click "New Project" button
    await page.click('button:has-text("New Project")');

    // Modal dialog is displayed
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2')).toHaveText('Create New Project');

    // Fill in project details
    await modal.locator('#project-name-input').fill('Frontend Design Tokens');
    await modal
      .locator('#project-description-input')
      .fill('Consolidate CSS variables and dark mode styles');

    // Submit form
    await modal.locator('button[type="submit"]:has-text("Create Project")').click();

    // Verify dialog closes and new project card appears
    await expect(modal).not.toBeVisible();
    await expect(page.locator('text=Frontend Design Tokens')).toBeVisible();
    await expect(page.locator('text=Consolidate CSS variables and dark mode styles')).toBeVisible();
  });

  // ==========================================
  // TM-PROJECT-002: Tasks can belong to projects
  // ==========================================
  test('TM-PROJECT-002 (E2E): User can view and associate tasks with projects', async ({
    page,
  }) => {
    await page.goto('/projects/proj-100');

    await expect(page.locator('main h1')).toContainText('Infrastructure Modernization');
    await expect(page.locator('text=PostgreSQL 16 migration and index tuning')).toBeVisible();

    // Verify existing associated tasks are shown in Tasks tab
    await expect(page.locator('text=Verify database foreign key cascades')).toBeVisible();
    await expect(page.locator('text=Complete Phase 5 quality gates')).toBeVisible();

    // Create a new task within project
    await page.click('button:has-text("Add Task to Project")');
    const taskModal = page.locator('div[role="dialog"]');
    await expect(taskModal).toBeVisible();

    await taskModal.locator('#task-title-input').fill('Benchmark connection pooler latency');
    await taskModal.locator('button[type="submit"]:has-text("Create Task")').click();

    // Verify new task appears in project task list
    await expect(taskModal).not.toBeVisible();
    await expect(page.locator('text=Benchmark connection pooler latency')).toBeVisible();
  });

  // ==========================================
  // TM-PROJECT-004: Project deletion follows configured policy
  // ==========================================
  test('TM-PROJECT-004 (E2E): Project deletion unlinks tasks without deleting them', async ({
    page,
  }) => {
    await page.goto('/projects/proj-100');

    // Dialog confirm handler for window.confirm
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click delete project button in header
    const deleteBtn = page.locator('button[aria-label="Delete project"]');
    await deleteBtn.click();

    // Navigates back to /projects
    await page.waitForURL('**/projects');
    await expect(page.locator('text=Infrastructure Modernization')).not.toBeVisible();

    // Navigate to /tasks to verify tasks were preserved (ON DELETE SET NULL)
    await page.goto('/tasks');
    await expect(page.locator('text=Verify database foreign key cascades')).toBeVisible();
  });

  // ==========================================
  // TM-BOARD-001: User can create a board
  // ==========================================
  test('TM-BOARD-001 (E2E): User can create a board with default columns', async ({ page }) => {
    await page.goto('/boards');

    await expect(page.locator('main h1')).toContainText('Boards');
    await expect(page.locator('text=Core Sprint Board')).toBeVisible();

    // Open create board modal
    await page.click('button:has-text("Create Board")');
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    // Fill in board details
    await modal.locator('#board-name-input').fill('Release Readiness Board');
    await modal.locator('#board-description-input').fill('Tracking pre-launch gates');
    await modal.locator('button[type="submit"]:has-text("Create Board")').click();

    // Verify board card appears
    await expect(modal).not.toBeVisible();
    await expect(page.locator('text=Release Readiness Board')).toBeVisible();
  });

  // ==========================================
  // TM-BOARD-002: User can create custom columns
  // ==========================================
  test('TM-BOARD-002 (E2E): User can create custom columns on a board', async ({ page }) => {
    await page.goto('/boards/board-200');

    await expect(page.locator('main h1')).toContainText('Core Sprint Board');
    await expect(page.locator('h3:has-text("To Do")')).toBeVisible();
    await expect(page.locator('h3:has-text("Done")')).toBeVisible();

    // Click "Add Column" button
    await page.click('button:has-text("Add Column")');
    const colModal = page.locator('div[role="dialog"]');
    await expect(colModal).toBeVisible();

    // Fill in column name and status mapping
    await colModal.locator('#column-name-input').fill('QA Review');
    await colModal.locator('#column-status-mapping').selectOption('IN_PROGRESS');
    await colModal.locator('button[type="submit"]:has-text("Add Column")').click();

    // Verify new column appears on the Kanban board
    await expect(colModal).not.toBeVisible();
    await expect(page.locator('h3:has-text("QA Review")')).toBeVisible();
  });

  // ==========================================
  // TM-BOARD-003 & TM-BOARD-004: Tasks can be moved between columns
  // ==========================================
  test('TM-BOARD-003 & TM-BOARD-004 (E2E): Task movement updates column and status', async ({
    page,
  }) => {
    await page.goto('/boards/board-200');

    const todoColumn = page.locator('div[data-column-id="col-todo"]');
    const doneColumn = page.locator('div[data-column-id="col-done"]');

    // Verify task is initially in To Do column
    await expect(todoColumn.locator('text=Verify database foreign key cascades')).toBeVisible();

    // Use accessible "Move column" button to move task to Done
    const taskCard = todoColumn
      .locator('div:has-text("Verify database foreign key cascades")')
      .first();
    const moveBtn = taskCard.locator('button:has-text("Move column")');
    await moveBtn.click();

    const selectDropdown = taskCard.locator('select');
    await expect(selectDropdown).toBeVisible();
    await selectDropdown.selectOption('col-done');

    // Task now appears under Done column with updated completion status
    await expect(doneColumn.locator('text=Verify database foreign key cascades')).toBeVisible();
    await expect(todoColumn.locator('text=Verify database foreign key cascades')).not.toBeVisible();
  });

  // ==========================================
  // TM-BOARD-007: Empty boards render correctly
  // ==========================================
  test('TM-BOARD-007 (E2E): Empty board displays dedicated empty state and add column trigger', async ({
    page,
  }) => {
    // Add an empty board without columns
    mockBoards.push({
      id: 'board-empty',
      workspaceId: 'ws-default',
      name: 'Fresh Empty Board',
      description: 'Brand new board without columns',
      columns: [],
      taskCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await page.goto('/boards/board-empty');

    await expect(page.locator('main h1')).toContainText('Fresh Empty Board');
    await expect(page.getByRole('heading', { name: 'Empty Board', exact: true })).toBeVisible();
    await expect(page.locator('text=This board has no columns configured yet')).toBeVisible();
    await expect(page.locator('button:has-text("Add Column")')).toBeVisible();
  });

  // ==========================================
  // TM-BOARD-008: Large boards remain usable
  // ==========================================
  test('TM-BOARD-008 (E2E): Large board with multiple columns and 30+ tasks remains performant', async ({
    page,
  }) => {
    // Populate board with 30 tasks
    for (let i = 1; i <= 30; i++) {
      mockTasks.push({
        id: `task-bulk-${i}`,
        title: `Bulk Task #${i} - Scale Test`,
        status: i % 2 === 0 ? 'TODO' : 'IN_PROGRESS',
        priority: 'P2',
        boardId: 'board-200',
        boardColumnId: i % 2 === 0 ? 'col-todo' : 'col-inprogress',
        version: 1,
        labels: [],
        subtasks: [],
        subtaskCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await page.goto('/boards/board-200');

    await expect(page.locator('main h1')).toContainText('Core Sprint Board');
    await expect(page.locator('text=Bulk Task #1 - Scale Test')).toBeVisible();
    await expect(page.locator('text=Bulk Task #30 - Scale Test')).toBeVisible();

    // Verify columns remain interactive
    await expect(page.locator('h3:has-text("To Do")')).toBeVisible();
    await expect(page.locator('h3:has-text("In Progress")')).toBeVisible();
  });
});
