import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Workaholic Notifications & Reminders (Phase 11)
 * Pure JavaScript ES2023 - Zero TypeScript
 * Satisfies TEST-MATRIX:
 *  - TM-NOTIF-001 (E2E): TopBar Notification Bell & Unread Badge
 *  - TM-NOTIF-002 (E2E): Notification Center Opening & Rendering
 *  - TM-NOTIF-003 (E2E): Mark as Read & Badge Count Decrement
 *  - TM-NOTIF-004 (E2E): Dismiss Notification
 */

test.describe('Notification Center E2E Journeys', () => {
  let mockNotifications;

  test.beforeEach(async ({ page }) => {
    mockNotifications = [
      {
        id: 'notif-e2e-1',
        title: 'Task Due: Prepare Sprint Review',
        body: 'Sprint review slides are due in 30 minutes',
        notificationType: 'REMINDER',
        readAt: null,
        dismissedAt: null,
        createdAt: new Date().toISOString(),
        targetReference: { entityType: 'TASK', entityId: 'task-e2e-1' },
      },
      {
        id: 'notif-e2e-2',
        title: 'Calendar: Team Retrospective',
        body: 'Starting at 4:00 PM',
        notificationType: 'REMINDER',
        readAt: null,
        dismissedAt: null,
        createdAt: new Date().toISOString(),
        targetReference: { entityType: 'EVENT', entityId: 'evt-e2e-1' },
      },
    ];

    // Intercept notifications list
    await page.route('**/api/v1/notifications?**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockNotifications }),
      });
    });

    await page.route('**/api/v1/notifications', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockNotifications }),
      });
    });

    // Intercept unread count
    await page.route('**/api/v1/notifications/unread-count', async route => {
      const count = mockNotifications.filter(n => !n.readAt && !n.dismissedAt).length;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { count } }),
      });
    });

    // Intercept mark read
    await page.route('**/api/v1/notifications/*/read', async route => {
      const url = new URL(route.request().url());
      const notifId = url.pathname.split('/')[4];
      const found = mockNotifications.find(n => n.id === notifId);
      if (found) {
        found.readAt = new Date().toISOString();
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: found || {} }),
      });
    });

    // Intercept dismiss
    await page.route('**/api/v1/notifications/*/dismiss', async route => {
      const url = new URL(route.request().url());
      const notifId = url.pathname.split('/')[4];
      const found = mockNotifications.find(n => n.id === notifId);
      if (found) {
        found.dismissedAt = new Date().toISOString();
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: found || {} }),
      });
    });

    // Intercept default workspaces
    await page.route('**/api/v1/workspaces**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'ws-default',
              name: 'Personal Workspace',
              workspaceType: 'PERSONAL',
              ownerUserId: 'user-default',
            },
          ],
        }),
      });
    });

    // Intercept today data
    await page.route('**/api/v1/today**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            date: '2026-09-27',
            timezone: 'Asia/Kolkata',
            currentWork: null,
            nextWork: null,
            dueToday: [],
            overdue: [],
            important: [],
            unscheduled: [],
            calendarEvents: [],
            workBlocks: [],
            completedToday: [],
            counts: {
              dueToday: 0,
              overdue: 0,
              important: 0,
              unscheduled: 0,
              completedToday: 0,
              calendarEvents: 0,
              workBlocks: 0,
            },
          },
        }),
      });
    });

    // Navigate to root (Today page)
    await page.goto('/');
  });

  test('TM-NOTIF-001: TopBar displays notification bell with unread badge count', async ({
    page,
  }) => {
    const bellBtn = page.locator('button[aria-label="Notifications"]');
    await expect(bellBtn).toBeVisible();

    // Verify unread count badge renders '2'
    const badge = bellBtn.locator('span');
    await expect(badge).toHaveText('2');
  });

  test('TM-NOTIF-002: Clicking notification bell opens NotificationCenter dialog', async ({
    page,
  }) => {
    const bellBtn = page.locator('button[aria-label="Notifications"]');
    await bellBtn.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Notification Center"]');
    await expect(dialog).toBeVisible();

    // Verify notifications are listed
    await expect(dialog).toContainText('Task Due: Prepare Sprint Review');
    await expect(dialog).toContainText('Calendar: Team Retrospective');
  });

  test('TM-NOTIF-003: Marking a notification as read updates unread indicator', async ({
    page,
  }) => {
    const bellBtn = page.locator('button[aria-label="Notifications"]');
    await bellBtn.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Notification Center"]');
    await expect(dialog).toBeVisible();

    // Click Read button on first notification
    const readBtn = dialog.locator('button[title="Mark as read"]').first();
    await readBtn.click();

    // Bell badge should decrement to 1
    const badge = bellBtn.locator('span');
    await expect(badge).toHaveText('1');
  });

  test('TM-NOTIF-004: Dismissing notification removes it from list and decrements count', async ({
    page,
  }) => {
    const bellBtn = page.locator('button[aria-label="Notifications"]');
    await bellBtn.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Notification Center"]');
    await expect(dialog).toBeVisible();

    // Click Dismiss button on first notification
    const dismissBtn = dialog.locator('button[title="Dismiss"]').first();
    await dismissBtn.click();

    // Notification item should disappear
    await expect(dialog).not.toContainText('Task Due: Prepare Sprint Review');

    // Remaining notification should still be visible
    await expect(dialog).toContainText('Calendar: Team Retrospective');

    // Bell badge should decrement to 1
    const badge = bellBtn.locator('span');
    await expect(badge).toHaveText('1');
  });
});
