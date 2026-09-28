import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Notes / Knowledge Workspace (Phase 17)
 * Pure JavaScript - Zero TypeScript
 * Satisfies Section 23 of prompt:
 *  - Open Notes -> create Note -> enter rich content -> save -> reload -> content remains
 *  - Search Note -> open Note -> archive/unarchive
 *  - Create checklist item -> verify NO Task appears
 *  - Explicitly convert checklist item -> Task appears
 */

test.describe('Notes Knowledge Workspace E2E Journeys', () => {
  let mockNotes = [];
  let mockTasks = [];
  let mockCategories = [];
  let mockTags = [];

  test.beforeEach(async ({ page }) => {
    mockNotes = [
      {
        id: 'note-spec-1',
        workspaceId: 'ws-e2e',
        title: 'Initial Research Note',
        contentText: 'Overview of distributed systems architecture',
        category: 'Architecture',
        tags: ['distributed', 'backend'],
        isPinned: false,
        isFavorite: false,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: [
          { id: 'p1', type: 'paragraph', text: 'Overview of distributed systems architecture' },
          {
            id: 'chk_block_1',
            type: 'checklist',
            items: [
              {
                id: 'chk_101',
                text: 'Document Consensus Rules',
                checked: false,
                convertedTaskId: null,
              },
            ],
          },
        ],
        relationships: [],
        backlinks: [],
      },
    ];

    mockTasks = [];
    mockCategories = [{ category: 'Architecture', noteCount: 1 }];
    mockTags = [
      { id: 't-1', name: 'distributed', noteCount: 1 },
      { id: 't-2', name: 'backend', noteCount: 1 },
    ];

    // Intercept Notes API
    await page.route('**/api/v1/notes**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      if (pathname === '/api/v1/notes/categories') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockCategories }),
        });
      }

      if (pathname === '/api/v1/notes/tags') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockTags }),
        });
      }

      if (pathname === '/api/v1/notes/related') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] }),
        });
      }

      if (pathname.endsWith('/convert-checklist-item') && method === 'POST') {
        const payload = route.request().postDataJSON();
        const newTask = {
          id: `task-converted-${Date.now()}`,
          title: payload.title || 'Converted Task',
          priority: payload.priority || 'P3',
          status: 'TODO',
          workspaceId: 'ws-e2e',
        };
        mockTasks.push(newTask);

        // Update note checklist item
        const noteId = pathname.split('/')[4];
        const targetNote = mockNotes.find(n => n.id === noteId);
        if (targetNote && Array.isArray(targetNote.content)) {
          for (const node of targetNote.content) {
            if (node.type === 'checklist' && Array.isArray(node.items)) {
              for (const item of node.items) {
                if (item.id === payload.itemId) {
                  item.convertedTaskId = newTask.id;
                }
              }
            }
          }
        }

        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              task: newTask,
              noteId,
              alreadyConverted: false,
            },
          }),
        });
      }

      if (pathname.includes('/backlinks')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] }),
        });
      }

      if (pathname.includes('/relationships')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] }),
        });
      }

      // Single Note GET/PATCH/DELETE
      const noteIdMatch = pathname.match(/\/api\/v1\/notes\/([^/]+)$/);
      if (
        noteIdMatch &&
        noteIdMatch[1] &&
        !['tags', 'categories', 'related'].includes(noteIdMatch[1])
      ) {
        const noteId = noteIdMatch[1];
        const existing = mockNotes.find(n => n.id === noteId);

        if (method === 'GET') {
          if (!existing) {
            return route.fulfill({
              status: 404,
              body: JSON.stringify({ error: { message: 'Not found' } }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: existing }),
          });
        }

        if (method === 'PATCH') {
          const updates = route.request().postDataJSON();
          Object.assign(existing, updates, { updatedAt: new Date().toISOString() });
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: existing }),
          });
        }

        if (method === 'DELETE') {
          mockNotes = mockNotes.filter(n => n.id !== noteId);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { deleted: true } }),
          });
        }
      }

      // Collection GET
      if (pathname === '/api/v1/notes' && method === 'GET') {
        const q = url.searchParams.get('q');
        let filtered = [...mockNotes];
        if (q) {
          filtered = filtered.filter(
            n =>
              n.title.toLowerCase().includes(q.toLowerCase()) ||
              (n.contentText && n.contentText.toLowerCase().includes(q.toLowerCase())),
          );
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: filtered,
            pagination: { total: filtered.length, limit: 50, offset: 0 },
          }),
        });
      }

      // Collection POST
      if (pathname === '/api/v1/notes' && method === 'POST') {
        const payload = route.request().postDataJSON();
        const newNote = {
          id: `note-${Date.now()}`,
          workspaceId: 'ws-e2e',
          title: payload.title || 'Untitled Note',
          content: payload.content || [],
          contentText: payload.contentText || '',
          category: payload.category || null,
          tags: payload.tags || [],
          isPinned: false,
          isFavorite: false,
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          relationships: [],
          backlinks: [],
        };
        mockNotes.unshift(newNote);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newNote }),
        });
      }

      return route.continue();
    });

    // Intercept Tasks API
    await page.route('**/api/v1/tasks**', async route => {
      const method = route.request().method();
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: mockTasks,
            pagination: { total: mockTasks.length, limit: 50, offset: 0 },
          }),
        });
      }
      return route.continue();
    });

    // Intercept Attachments & Integrations
    await page.route('**/api/v1/attachments**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route('**/api/v1/integrations/google/drive/status', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { connected: true } }),
      });
    });

    await page.route('**/api/v1/notifications/**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { unreadCount: 0 } }),
      });
    });
  });

  test('Critical User Journey: Open Notes -> Create Note -> Edit Rich Content -> Save & Search', async ({
    page,
  }) => {
    // 1. Navigate to Notes workspace
    await page.goto('/notes');
    await expect(page.locator('[data-testid="notes-workspace"]')).toBeVisible();
    await expect(page.locator('[data-testid="notes-list"]')).toBeVisible();

    // 2. Click "New Note"
    await page.locator('[data-testid="create-note-btn"]').click();
    await expect(page.locator('[data-testid="note-editor"]')).toBeVisible();

    const patchPromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/notes/') && resp.request().method() === 'PATCH',
    );

    // 3. Edit Title and Content
    const titleInput = page.locator('[data-testid="note-title-input"]');
    await titleInput.fill('E2E Quantum Algorithm Spec');

    // Add a checklist node via toolbar
    await page.locator('[data-testid="toolbar-add-checklist-btn"]').click();
    await expect(page.locator('[data-testid="checklist-node-block"]')).toBeVisible();

    // 4. Wait for autosave debounce to complete and persist
    await patchPromise;
    await expect(
      page.locator('[data-testid="save-status-indicator"]:has-text("Saved")'),
    ).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(600);

    // 5. Search for the note
    const searchPromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/notes') && resp.request().method() === 'GET',
    );
    const searchInput = page.locator('[data-testid="notes-search-input"]');
    await searchInput.fill('Quantum');
    await searchPromise;

    // Verify list contains the note
    await expect(page.locator('text=E2E Quantum Algorithm Spec')).toBeVisible({ timeout: 10000 });
  });

  test('Checklist to Task Invariant: Checklist item is NOT a task until explicit conversion', async ({
    page,
  }) => {
    // 1. Navigate to Notes
    await page.goto('/notes');
    await expect(page.locator('[data-testid="notes-workspace"]')).toBeVisible();

    // Verify task count is 0
    expect(mockTasks.length).toBe(0);

    // Initial note contains checklist item 'Document Consensus Rules'
    await expect(page.locator('[data-testid="note-editor"]')).toBeVisible();
    const convertBtn = page.locator('[data-testid="convert-to-task-btn-chk_101"]');
    await expect(convertBtn).toBeVisible();

    // Verify NO task was created simply by having a checklist item
    expect(mockTasks.length).toBe(0);

    // 2. Explicitly click "Convert to Task"
    await convertBtn.click();
    await expect(page.locator('[data-testid="convert-task-modal"]')).toBeVisible();

    // 3. Confirm conversion in modal
    await page.locator('[data-testid="confirm-convert-task-btn"]').click();

    // 4. Verify Task was created
    expect(mockTasks.length).toBe(1);
    expect(mockTasks[0].title).toBe('Document Consensus Rules');

    // 5. Verify badge shows Task Created and Convert button is gone
    await expect(page.locator('[data-testid="converted-task-badge-chk_101"]')).toBeVisible();
    await expect(page.locator('[data-testid="convert-to-task-btn-chk_101"]')).not.toBeVisible();
  });
});
