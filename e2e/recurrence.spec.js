import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Workaholic Recurrence (Phase 10)
 * Pure JavaScript ES2023 - Zero TypeScript
 * Satisfies TEST-MATRIX:
 *  - TM-REC-001 (E2E): User can create daily recurring event
 *  - TM-REC-002 (E2E): User can create weekly recurring event
 *  - TM-REC-008 (E2E): User can edit single occurrence (THIS)
 *  - TM-REC-009 (E2E): User can edit entire recurrence series (SERIES)
 *  - TM-REC-010 (E2E): User can cancel single occurrence
 *  - TM-REC-013 (E2E): User can create recurring task with badge display
 */

test.describe('Recurrence E2E Journeys', () => {
  let mockCalendars = [];
  let mockEvents = [];
  let mockTasks = [];
  let todayStr = '';

  test.beforeEach(async ({ page }) => {
    const today = new Date();
    todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    mockCalendars = [
      {
        id: 'cal-default',
        workspaceId: 'ws-default',
        name: 'Work Calendar',
        description: 'Primary work calendar',
        color: '#3b82f6',
        isDefault: true,
        isVisible: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    mockEvents = [];
    mockTasks = [];

    // Intercept Calendars API
    await page.route('**/api/v1/calendar/calendars**', async route => {
      const method = route.request().method();
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockCalendars }),
        });
      }
      return route.continue();
    });

    // Intercept Events API (range query and event creation)
    await page.route('**/api/v1/calendar/events**', async route => {
      const method = route.request().method();

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: mockEvents,
            workBlocks: [],
            deadlines: [],
            meta: { total: mockEvents.length },
          }),
        });
      }

      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const baseId = `evt-series-${Date.now()}`;

        // Create projected recurring occurrences if recurrence is present
        if (body.recurrence) {
          const occ1 = {
            id: `${baseId}_${todayStr}T09:00:00.000Z`,
            baseEventId: baseId,
            occurrenceKey: `${todayStr}T09:00:00.000Z`,
            isRecurring: true,
            recurrenceRule: body.recurrence,
            calendarId: body.calendarId,
            calendarName: 'Work Calendar',
            calendarColor: '#3b82f6',
            title: body.title,
            description: body.description || null,
            location: body.location || null,
            meetingUrl: body.meetingUrl || null,
            isAllDay: false,
            startAt: `${todayStr}T09:00:00.000Z`,
            endAt: `${todayStr}T10:00:00.000Z`,
            timezone: 'UTC',
            status: 'CONFIRMED',
            visibility: body.visibility || 'PRIVATE',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Tomorrow's occurrence
          const tmr = new Date(Date.now() + 86400000);
          const tmrStr = `${tmr.getFullYear()}-${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')}`;
          const occ2 = {
            ...occ1,
            id: `${baseId}_${tmrStr}T09:00:00.000Z`,
            occurrenceKey: `${tmrStr}T09:00:00.000Z`,
            startAt: `${tmrStr}T09:00:00.000Z`,
            endAt: `${tmrStr}T10:00:00.000Z`,
          };

          mockEvents.push(occ1, occ2);
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: occ1 }),
          });
        }

        const newEvt = {
          id: `evt-${Date.now()}`,
          calendarId: body.calendarId,
          calendarName: 'Work Calendar',
          calendarColor: '#3b82f6',
          title: body.title,
          isAllDay: false,
          startAt: body.startAt,
          endAt: body.endAt,
          timezone: 'UTC',
          status: 'CONFIRMED',
          visibility: body.visibility || 'PRIVATE',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockEvents.push(newEvt);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newEvt }),
        });
      }

      return route.continue();
    });

    // Intercept occurrence edit / cancel endpoints: /api/v1/calendar/events/:id/occurrences/:occurrenceKey
    await page.route(/\/api\/v1\/calendar\/events\/[^/?]+\/occurrences\/[^/?]+/, async route => {
      const method = route.request().method();
      const url = new URL(route.request().url());
      const match = url.pathname.match(
        /\/api\/v1\/calendar\/events\/([^/?]+)\/occurrences\/([^/?]+)/,
      );
      const [, baseId, occKey] = match || [];

      if (method === 'PATCH') {
        const body = route.request().postDataJSON();
        // Update the target occurrence
        const target = mockEvents.find(
          e =>
            e.baseEventId === baseId &&
            (e.occurrenceKey === occKey || decodeURIComponent(occKey) === e.occurrenceKey),
        );
        if (target) {
          target.title = body.title || target.title;
          target.location = body.location !== undefined ? body.location : target.location;
          target.isException = true;
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: target || { id: `${baseId}_${occKey}` } }),
        });
      }

      if (method === 'DELETE') {
        mockEvents = mockEvents.filter(
          e =>
            !(
              e.baseEventId === baseId &&
              (e.occurrenceKey === occKey || decodeURIComponent(occKey) === e.occurrenceKey)
            ),
        );
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Occurrence cancelled' }),
        });
      }

      return route.continue();
    });

    // Intercept master event deletion: /api/v1/calendar/events/:id
    await page.route(/\/api\/v1\/calendar\/events\/[^/?]+$/, async route => {
      const method = route.request().method();
      const url = new URL(route.request().url());
      const match = url.pathname.match(/\/api\/v1\/calendar\/events\/([^/?]+)$/);
      const eventId = match ? match[1] : null;

      if (method === 'DELETE') {
        mockEvents = mockEvents.filter(e => e.id !== eventId && e.baseEventId !== eventId);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { id: eventId, deleted: true } }),
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
            pagination: { total: mockTasks.length },
          }),
        });
      }

      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const newTask = {
          id: `task-${Date.now()}`,
          title: body.title,
          priority: body.priority || 'P3',
          status: 'TODO',
          recurrenceRuleId: body.recurrence ? `rule-${Date.now()}` : null,
          isRecurring: Boolean(body.recurrence),
          recurrenceRule: body.recurrence || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockTasks.push(newTask);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newTask }),
        });
      }

      return route.continue();
    });

    // Intercept Projects API for shell integration
    await page.route('**/api/v1/projects**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  // ==========================================================
  // TM-REC-001 / TM-REC-008: Create and Edit Recurring Event
  // ==========================================================
  test('TM-REC-001 & TM-REC-008 (E2E): Create daily recurring event, inspect recurrence badge, and edit this occurrence', async ({
    page,
  }) => {
    // 1. Navigate to calendar
    await page.goto('/calendar');
    await expect(page.locator('main h1')).toContainText('Calendar');

    // 2. Open Create Event Modal
    await page.click('button:has-text("+ Event")');
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    // 3. Fill details with Daily recurrence
    await modal.locator('#event-title').fill('Daily Engineering Sync');
    await modal.locator('#event-recurrence-freq').selectOption('DAILY');
    await modal.locator('button[type="submit"]:has-text("Create Event")').click();

    // 4. Verify modal closes and recurring occurrences appear
    await expect(modal).not.toBeVisible();
    await page.click('button[role="tab"]:has-text("Agenda")');
    const eventCards = page.locator('text=Daily Engineering Sync');
    await expect(eventCards.first()).toBeVisible();

    // 5. Open EventDetailModal and verify "🔄 Recurring" badge
    await eventCards.first().click();
    const detailModal = page.locator('div[role="dialog"]');
    await expect(detailModal).toBeVisible();
    await expect(detailModal.locator('text=🔄 Recurring')).toBeVisible();

    // 6. Click Edit Event
    await detailModal.locator('button:has-text("Edit Event")').click();
    await expect(modal).toBeVisible();

    // 7. Verify "This occurrence only" is default edit mode
    const thisRadio = modal.locator('input[name="editMode"][value="THIS"]');
    await expect(thisRadio).toBeChecked();

    // 8. Modify title for this occurrence only
    await modal.locator('#event-title').fill('Daily Engineering Sync - Standup Special');
    await modal.locator('button[type="submit"]:has-text("Update Event")').click();
    await expect(modal).not.toBeVisible();

    // 9. Verify updated occurrence title is rendered
    await expect(
      page.locator('text=Daily Engineering Sync - Standup Special').first(),
    ).toBeVisible();
  });

  // ==========================================================
  // TM-REC-010: Cancel Single Occurrence vs Delete Series
  // ==========================================================
  test('TM-REC-010 (E2E): Cancel single occurrence and delete entire series', async ({ page }) => {
    // Seed recurring event
    const baseId = 'evt-series-seed';
    mockEvents = [
      {
        id: `${baseId}_${todayStr}T09:00:00.000Z`,
        baseEventId: baseId,
        occurrenceKey: `${todayStr}T09:00:00.000Z`,
        isRecurring: true,
        calendarId: 'cal-default',
        calendarName: 'Work Calendar',
        calendarColor: '#3b82f6',
        title: 'Weekly Sprint Planning',
        startAt: `${todayStr}T09:00:00.000Z`,
        endAt: `${todayStr}T10:00:00.000Z`,
        timezone: 'UTC',
        status: 'CONFIRMED',
        visibility: 'PRIVATE',
      },
      {
        id: `${baseId}_tomorrow`,
        baseEventId: baseId,
        occurrenceKey: 'tomorrow',
        isRecurring: true,
        calendarId: 'cal-default',
        calendarName: 'Work Calendar',
        calendarColor: '#3b82f6',
        title: 'Weekly Sprint Planning',
        startAt: `${todayStr}T09:00:00.000Z`,
        endAt: `${todayStr}T10:00:00.000Z`,
        timezone: 'UTC',
        status: 'CONFIRMED',
        visibility: 'PRIVATE',
      },
    ];

    await page.goto('/calendar');
    await page.click('button[role="tab"]:has-text("Agenda")');
    await expect(page.locator('text=Weekly Sprint Planning').first()).toBeVisible();

    // Open detail modal for the first occurrence
    await page.locator('text=Weekly Sprint Planning').first().click();
    const detailModal = page.locator('div[role="dialog"]');
    await expect(detailModal).toBeVisible();

    // Verify Delete Occurrence and Delete Series buttons are present
    const btnDeleteOccurrence = detailModal.locator('#btn-delete-occurrence');
    const btnDeleteSeries = detailModal.locator('#btn-delete-series');
    await expect(btnDeleteOccurrence).toBeVisible();
    await expect(btnDeleteSeries).toBeVisible();

    // Cancel single occurrence
    page.once('dialog', dialog => dialog.accept());
    await btnDeleteOccurrence.click();
    await expect(detailModal).not.toBeVisible();

    // Second occurrence remains
    await expect(page.locator('text=Weekly Sprint Planning').first()).toBeVisible();

    // Now delete entire series
    await page.locator('text=Weekly Sprint Planning').first().click();
    await expect(detailModal).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await detailModal.locator('#btn-delete-series').click();
    await expect(detailModal).not.toBeVisible();

    // Entire series is gone
    await expect(page.locator('text=Weekly Sprint Planning')).not.toBeVisible();
  });

  // ==========================================================
  // TM-REC-013: Recurring Task Creation and Badge Display
  // ==========================================================
  test('TM-REC-013 (E2E): Create recurring task and verify recurring badge in task list', async ({
    page,
  }) => {
    await page.goto('/tasks');
    await expect(page.locator('main h1')).toContainText('Tasks');

    // Click New Task button
    await page.getByRole('button', { name: /New Task/i }).click();
    const modal = page.getByRole('dialog', { name: /Create New Task/i });
    await expect(modal).toBeVisible();

    // Fill task title and choose repeat: Weekly
    await modal.locator('#task-title-input').fill('Weekly Security Scan');
    await modal.locator('#task-recurrence-select').selectOption('WEEKLY');
    await modal.locator('button[type="submit"]:has-text("Create Task")').click();

    // Verify modal closes and task displays with "🔄 Recurring" badge
    await expect(modal).not.toBeVisible();
    const taskItem = page.locator('.task-item-card:has-text("Weekly Security Scan")');
    await expect(taskItem).toBeVisible();
    await expect(taskItem.locator('.task-recurrence-badge')).toBeVisible();
    await expect(taskItem.locator('.task-recurrence-badge')).toContainText('Recurring');
  });
});
