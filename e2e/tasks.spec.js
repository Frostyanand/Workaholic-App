import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Workaholic Task Management (Phase 5)
 * Pure JavaScript - Zero TypeScript
 * Satisfies TEST-MATRIX:
 *  - TM-TASK-001 (E2E): User can create a task
 *  - TM-TASK-002 (E2E): User can edit a task
 *  - TM-TASK-003 (E2E): User can complete a task
 *  - TM-TASK-007 (E2E): Labels can be assigned to tasks
 *  - TM-TASK-008 (E2E): Subtasks can be created
 *  - TM-TASK-011 (E2E): Completed tasks are handled correctly in Today view
 *  - TM-TASK-014 (E2E): Task deletion follows configured deletion policy
 */

test.describe('Task Management E2E Journeys', () => {
  let mockTasks = [];
  let mockLabels = [];

  test.beforeEach(async ({ page }) => {
    mockLabels = [
      { id: 'lbl-1', name: 'Documentation', color: '#6366F1' },
      { id: 'lbl-2', name: 'Database', color: '#10B981' },
    ];

    // Initialize deterministic mock tasks state
    mockTasks = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Authoritative Architecture Review',
        description: 'Verify system architecture matches specifications',
        status: 'TODO',
        priority: 'P1',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        version: 1,
        labels: [],
        subtasks: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            title: 'Audit database constraints',
            status: 'TODO',
            priority: 'P2',
          },
        ],
        subtaskCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Intercept Today endpoint for TM-TASK-011
    await page.route('**/api/v1/today**', async route => {
      const active = mockTasks.filter(t => t.status !== 'COMPLETED');
      const completed = mockTasks.filter(t => t.status === 'COMPLETED');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            date: new Date().toISOString().split('T')[0],
            timezone: 'UTC',
            currentWork: null,
            nextWork: null,
            dueToday: active,
            overdue: [],
            important: active,
            unscheduled: active,
            calendarEvents: [],
            workBlocks: [],
            completedToday: completed,
            counts: {
              dueToday: active.length,
              overdue: 0,
              important: active.length,
              unscheduled: active.length,
              completedToday: completed.length,
              calendarEvents: 0,
              workBlocks: 0,
            },
          },
        }),
      });
    });

    await page.route('**/api/v1/calendar/**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    // Intercept backend API calls with stateful mock handlers
    await page.route('**/api/v1/tasks/**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      // Workspace Label collection
      if (pathname === '/api/v1/tasks/labels') {
        if (method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: mockLabels }),
          });
        }
        if (method === 'POST') {
          const body = route.request().postDataJSON();
          const newLabel = {
            id: `lbl-${Date.now()}`,
            name: body.name,
            color: body.color || '#4F46E5',
          };
          mockLabels.push(newLabel);
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: newLabel }),
          });
        }
      }

      // Assign label to task
      if (pathname.endsWith('/labels') && method === 'POST') {
        const parts = pathname.split('/');
        const taskId = parts[4];
        const body = route.request().postDataJSON();
        const task = mockTasks.find(t => t.id === taskId);
        const label = mockLabels.find(l => l.id === body.labelId) || {
          id: body.labelId,
          name: 'Urgent Review',
          color: '#4F46E5',
        };
        if (task) {
          task.labels = task.labels || [];
          if (!task.labels.some(l => l.id === label.id)) {
            task.labels.push(label);
          }
        }
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: { taskId, labelId: body.labelId } }),
        });
      }

      // Remove label from task
      if (pathname.includes('/labels/') && method === 'DELETE') {
        const parts = pathname.split('/');
        const taskId = parts[4];
        const labelId = parts[6];
        const task = mockTasks.find(t => t.id === taskId);
        if (task && task.labels) {
          task.labels = task.labels.filter(l => l.id !== labelId);
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { success: true } }),
        });
      }

      // Complete Task
      if (pathname.endsWith('/complete') && method === 'POST') {
        const id = pathname.split('/')[4];
        const task = mockTasks.find(t => t.id === id);
        if (task) {
          task.status = 'COMPLETED';
          task.version += 1;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: task }),
          });
        }
        return route.fulfill({
          status: 404,
          body: JSON.stringify({ error: { message: 'Not found' } }),
        });
      }

      // Reopen Task
      if (pathname.endsWith('/reopen') && method === 'POST') {
        const id = pathname.split('/')[4];
        const task = mockTasks.find(t => t.id === id);
        if (task) {
          task.status = 'TODO';
          task.version += 1;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: task }),
          });
        }
        return route.fulfill({
          status: 404,
          body: JSON.stringify({ error: { message: 'Not found' } }),
        });
      }

      // Subtasks creation
      if (pathname.endsWith('/subtasks') && method === 'POST') {
        const id = pathname.split('/')[4];
        const task = mockTasks.find(t => t.id === id);
        const body = route.request().postDataJSON();
        const newSub = {
          id: `sub-${Date.now()}`,
          title: body.title,
          status: 'TODO',
          priority: body.priority || 'P3',
        };
        if (task) {
          task.subtasks = task.subtasks || [];
          task.subtasks.push(newSub);
          task.subtaskCount = task.subtasks.length;
        }
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newSub }),
        });
      }

      // Subtask complete/reopen
      if (pathname.includes('/subtasks/') && method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { status: 'COMPLETED' } }),
        });
      }

      // Single Task GET
      if (method === 'GET') {
        const id = pathname.split('/')[4];
        const task = mockTasks.find(t => t.id === id);
        if (task) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: task }),
          });
        }
        return route.fulfill({
          status: 404,
          body: JSON.stringify({ error: { message: 'Not found' } }),
        });
      }

      // Single Task PATCH
      if (method === 'PATCH') {
        const id = pathname.split('/')[4];
        const task = mockTasks.find(t => t.id === id);
        if (task) {
          const body = route.request().postDataJSON();
          Object.assign(task, body);
          task.version += 1;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: task }),
          });
        }
        return route.fulfill({
          status: 404,
          body: JSON.stringify({ error: { message: 'Not found' } }),
        });
      }

      // Single Task DELETE
      if (method === 'DELETE') {
        const id = pathname.split('/')[4];
        mockTasks = mockTasks.filter(t => t.id !== id);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { id, deleted: true } }),
        });
      }

      return route.continue();
    });

    // Intercept /api/v1/tasks list & create
    await page.route('**/api/v1/tasks', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockTasks }),
        });
      }

      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const newTask = {
          id: `task-${Date.now()}`,
          title: body.title,
          description: body.description || '',
          priority: body.priority || 'P3',
          status: 'TODO',
          dueAt: body.dueAt || null,
          version: 1,
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

  test('TM-TASK-001 (E2E): User can create a new task through UI modal', async ({ page }) => {
    await page.goto('/tasks');

    // Verify initial task is rendered
    await expect(page.locator('text=Authoritative Architecture Review')).toBeVisible();

    // Open Create Task modal
    await page.getByRole('button', { name: /New Task/i }).click();

    // Verify modal dialog appears
    const dialog = page.getByRole('dialog', { name: /Create New Task/i });
    await expect(dialog).toBeVisible();

    // Fill form fields
    await page.locator('#task-title-input').fill('Deploy PostgreSQL 16 Cluster');
    await page.locator('#task-priority-select').selectOption('P0');
    await page
      .locator('#task-description-input')
      .fill('Set up production-grade PostgreSQL with ACID transactional guarantees.');

    // Submit form
    await page.getByRole('button', { name: /Create Task/i }).click();

    // Verify modal closed
    await expect(dialog).not.toBeVisible();

    // Verify new task appears in list
    await expect(page.locator('text=Deploy PostgreSQL 16 Cluster')).toBeVisible();
    await expect(
      page.getByRole('main', { name: 'Task List' }).getByText('P0 Critical'),
    ).toBeVisible();
  });

  test('TM-TASK-002 (E2E): User can edit task details in drawer', async ({ page }) => {
    await page.goto('/tasks');

    // Click edit button on the task
    const editBtn = page.getByRole('button', { name: /Edit Authoritative Architecture Review/i });
    await editBtn.click();

    // Verify detail drawer opens
    const drawer = page.getByRole('dialog', { name: /Task Details/i });
    await expect(drawer).toBeVisible();

    // Edit title and priority
    const titleInput = drawer.locator('input[type="text"]').first();
    await titleInput.fill('Authoritative Architecture Review (Finalized)');

    const prioritySelect = drawer.locator('select').nth(1); // Priority select
    await prioritySelect.selectOption('P2');

    // Save changes
    await page.getByRole('button', { name: /Save Changes/i }).click();

    // Verify updated title and priority badge
    await expect(page.locator('text=Authoritative Architecture Review (Finalized)')).toBeVisible();
    await expect(page.getByRole('main', { name: 'Task List' }).getByText('P2 High')).toBeVisible();
  });

  test('TM-TASK-003 (E2E): User can complete and reopen a task', async ({ page }) => {
    await page.goto('/tasks');

    const taskTitle = page.locator('text=Authoritative Architecture Review');
    await expect(taskTitle).toBeVisible();

    // Find the toggle button
    const toggleBtn = page.getByRole('checkbox', {
      name: /Complete Authoritative Architecture Review/i,
    });
    await expect(toggleBtn).toHaveAttribute('aria-checked', 'false');

    // Complete task
    await toggleBtn.click();

    // Verify task is completed with line-through styling and aria-checked="true"
    const completedToggle = page.getByRole('checkbox', {
      name: /Mark Authoritative Architecture Review as incomplete/i,
    });
    await expect(completedToggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.task-item-title')).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );

    // Reopen task
    await completedToggle.click();

    // Verify task is reopened
    await expect(
      page.getByRole('checkbox', { name: /Complete Authoritative Architecture Review/i }),
    ).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.task-item-title')).toHaveCSS('text-decoration-line', 'none');
  });

  test('TM-TASK-007 (E2E): Labels can be assigned to tasks and reflect in UI', async ({ page }) => {
    await page.goto('/tasks');

    // Verify task is rendered
    await expect(page.locator('text=Authoritative Architecture Review')).toBeVisible();

    // Open detail drawer
    await page.getByRole('button', { name: /Edit Authoritative Architecture Review/i }).click();
    const drawer = page.getByRole('dialog', { name: /Task Details/i });
    await expect(drawer).toBeVisible();

    // In Labels section, enter new label name
    const labelInput = drawer.getByPlaceholder('Add label name...');
    await labelInput.fill('Urgent Review');
    await drawer.getByRole('button', { name: 'Assign' }).click();

    // Verify label badge appears in the detail drawer
    await expect(drawer.locator('text=Urgent Review')).toBeVisible();

    // Verify label badge appears on task item card in the main list
    await expect(
      page.getByRole('main', { name: 'Task List' }).locator('text=Urgent Review'),
    ).toBeVisible();
  });

  test('TM-TASK-008 (E2E): Subtasks can be created in task detail drawer', async ({ page }) => {
    await page.goto('/tasks');

    // Open detail drawer
    await page.getByRole('button', { name: /Edit Authoritative Architecture Review/i }).click();
    const drawer = page.getByRole('dialog', { name: /Task Details/i });
    await expect(drawer).toBeVisible();

    // Verify existing subtask
    await expect(page.locator('text=Audit database constraints')).toBeVisible();

    // Add new subtask
    const subtaskInput = page.getByPlaceholder('Add a subtask...');
    await subtaskInput.fill('Write comprehensive Vitest assertions');
    await page.getByRole('button', { name: 'Add' }).click();

    // Verify new subtask rendered
    await expect(page.locator('text=Write comprehensive Vitest assertions')).toBeVisible();
  });

  test('TM-TASK-011 (E2E): Completed tasks are handled correctly in Today view', async ({
    page,
  }) => {
    await page.goto('/');

    // Verify Today page loads tasks
    await expect(page.getByRole('heading', { name: 'Today / Command Center' })).toBeVisible();
    const dueTodaySection = page.locator('[data-testid="due-today-section"]');
    await expect(dueTodaySection.locator('text=Authoritative Architecture Review')).toBeVisible();

    // Complete task on Today view
    const todayToggle = dueTodaySection.getByRole('checkbox', {
      name: /Complete Authoritative Architecture Review/i,
    });
    await todayToggle.click();

    // Verify task moves to "Completed Today" section
    await expect(page.locator('text=Completed Today (1)')).toBeVisible();

    // Open Completed Today section
    await page.locator('#completed-today-heading').click();

    const reopenToggle = page.getByRole('checkbox', {
      name: /Reopen Authoritative Architecture Review/i,
    });
    await expect(reopenToggle).toBeVisible();

    // Reopen task
    await reopenToggle.click();

    // Verify task returns to active list in Due Today
    await expect(
      dueTodaySection.getByRole('checkbox', { name: /Complete Authoritative Architecture Review/i }),
    ).toBeVisible();
  });

  test('TM-TASK-014 (E2E): Task deletion removes task from list', async ({ page }) => {
    await page.goto('/tasks');

    await expect(page.locator('text=Authoritative Architecture Review')).toBeVisible();

    // Listen for dialog confirm
    page.on('dialog', dialog => dialog.accept());

    // Click delete button
    const deleteBtn = page.getByRole('button', {
      name: /Delete Authoritative Architecture Review/i,
    });
    await deleteBtn.click();

    // Verify task removed from list and empty state shown
    await expect(page.locator('text=Authoritative Architecture Review')).not.toBeVisible();
    await expect(page.locator('text=No tasks found')).toBeVisible();
  });
});
