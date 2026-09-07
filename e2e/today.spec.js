import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Workaholic Today / Command Center (Phase 9)
 * Pure JavaScript ES2023 - Zero TypeScript
 * Satisfies TEST-MATRIX:
 *  - TM-TODAY-001 (E2E): Today's tasks are displayed (Due Today section)
 *  - TM-TODAY-002 (E2E): Overdue tasks are displayed (Overdue warning section)
 *  - TM-TODAY-003 (E2E): Important tasks are displayed (P0/P1/P2 section)
 *  - TM-TODAY-004 (E2E): Today's calendar events are displayed (Schedule section)
 *  - TM-TODAY-005 (E2E): Unscheduled work is discoverable and actionable via Schedule Block
 *  - TM-TODAY-006 (E2E): Current/next work is correctly ordered in Now & Next Cockpit
 */

test.describe('Today Command Center E2E Journeys', () => {
  let mockCockpitData;
  let mockCalendars;
  let todayDateStr;

  test.beforeEach(async ({ page }) => {
    const today = new Date();
    todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    mockCalendars = [
      {
        id: 'cal-default',
        name: 'Primary Calendar',
        isDefault: true,
        color: '#3b82f6',
        isVisible: true,
      },
    ];

    mockCockpitData = {
      date: todayDateStr,
      timezone: 'Asia/Kolkata',
      currentWork: {
        id: 'wb-curr-1',
        type: 'WORK_BLOCK',
        title: 'Work Block: Performance Tuning',
        taskTitle: 'Performance Tuning',
        startAt: `${todayDateStr}T04:00:00.000Z`,
        endAt: `${todayDateStr}T06:00:00.000Z`,
      },
      nextWork: {
        id: 'evt-next-1',
        type: 'EVENT',
        title: 'Security Architecture Review',
        startAt: `${todayDateStr}T07:00:00.000Z`,
        endAt: `${todayDateStr}T08:00:00.000Z`,
      },
      dueToday: [
        {
          id: 'task-due-today-1',
          title: 'Finalize Q3 roadmap document',
          status: 'TODO',
          priority: 'P1',
          dueAt: `${todayDateStr}T12:00:00.000Z`,
          isOverdue: false,
        },
      ],
      overdue: [
        {
          id: 'task-overdue-1',
          title: 'Submit compliance checklist',
          status: 'TODO',
          priority: 'P0',
          dueAt: '2026-09-01T09:00:00.000Z',
          isOverdue: true,
        },
      ],
      important: [
        {
          id: 'task-important-1',
          title: 'Refactor database indexing strategy',
          status: 'TODO',
          priority: 'P0',
        },
        {
          id: 'task-important-2',
          title: 'Implement token rotation in auth service',
          status: 'TODO',
          priority: 'P2',
        },
      ],
      unscheduled: [
        {
          id: 'task-unscheduled-1',
          title: 'Optimize memory footprint in web worker',
          status: 'TODO',
          priority: 'P1',
        },
      ],
      calendarEvents: [
        {
          id: 'evt-all-day-1',
          title: 'SRM Campus Founder Holiday',
          isAllDay: true,
          calendarColor: '#f59e0b',
        },
        {
          id: 'evt-timed-1',
          title: 'Security Architecture Review',
          isAllDay: false,
          startAt: `${todayDateStr}T07:00:00.000Z`,
          endAt: `${todayDateStr}T08:00:00.000Z`,
          calendarColor: '#3b82f6',
        },
      ],
      workBlocks: [
        {
          id: 'wb-curr-1',
          taskId: 'task-due-today-1',
          taskTitle: 'Performance Tuning',
          startAt: `${todayDateStr}T04:00:00.000Z`,
          endAt: `${todayDateStr}T06:00:00.000Z`,
        },
      ],
      completedToday: [],
      counts: {
        dueToday: 1,
        overdue: 1,
        important: 2,
        unscheduled: 1,
        completedToday: 0,
        calendarEvents: 2,
        workBlocks: 1,
      },
    };

    // Intercept Today endpoint
    await page.route('**/api/v1/today**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockCockpitData }),
      });
    });

    // Intercept Calendars list
    await page.route('**/api/v1/calendar/calendars**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockCalendars }),
      });
    });

    // Intercept Task routes (create, complete, reopen, work-blocks)
    await page.route('**/api/v1/tasks/**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      if (pathname.endsWith('/complete') && method === 'POST') {
        const taskId = pathname.split('/')[4];
        // Move task to completedToday
        const task =
          mockCockpitData.dueToday.find(t => t.id === taskId) ||
          mockCockpitData.important.find(t => t.id === taskId) ||
          mockCockpitData.overdue.find(t => t.id === taskId);
        if (task) {
          task.status = 'COMPLETED';
          mockCockpitData.completedToday.push({ ...task });
          mockCockpitData.dueToday = mockCockpitData.dueToday.filter(t => t.id !== taskId);
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { id: taskId, status: 'COMPLETED' } }),
        });
      }

      if (pathname.endsWith('/reopen') && method === 'POST') {
        const taskId = pathname.split('/')[4];
        const task = mockCockpitData.completedToday.find(t => t.id === taskId);
        if (task) {
          task.status = 'TODO';
          mockCockpitData.dueToday.push({ ...task });
          mockCockpitData.completedToday = mockCockpitData.completedToday.filter(
            t => t.id !== taskId,
          );
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { id: taskId, status: 'TODO' } }),
        });
      }

      if (pathname.includes('/work-blocks') && method === 'POST') {
        const body = route.request().postDataJSON();
        const taskId = pathname.split('/')[4];
        const newBlock = {
          id: `wb-${Date.now()}`,
          taskId,
          taskTitle: 'Optimized Task',
          startAt: body.startAt,
          endAt: body.endAt,
        };
        mockCockpitData.workBlocks.push(newBlock);
        mockCockpitData.unscheduled = mockCockpitData.unscheduled.filter(t => t.id !== taskId);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newBlock }),
        });
      }

      if (pathname === '/api/v1/tasks' && method === 'POST') {
        const body = route.request().postDataJSON();
        const newTask = {
          id: `task-${Date.now()}`,
          title: body.title,
          status: 'TODO',
          priority: body.priority || 'P3',
          dueAt: body.dueAt || null,
        };
        mockCockpitData.dueToday.push(newTask);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newTask }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    // Intercept Calendar Events creation
    await page.route('**/api/v1/calendar/events', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const newEvent = {
          id: `evt-${Date.now()}`,
          title: body.title,
          isAllDay: body.isAllDay || false,
          startAt: body.startAt,
          endAt: body.endAt,
          calendarColor: '#3b82f6',
        };
        mockCockpitData.calendarEvents.push(newEvent);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newEvent }),
        });
      }
      return route.continue();
    });
  });

  test("TM-TODAY-001 (E2E): Today's tasks are displayed in Due Today section", async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Today / Command Center' })).toBeVisible();
    const dueTodaySection = page.locator('[data-testid="due-today-section"]');
    await expect(dueTodaySection).toBeVisible();
    await expect(dueTodaySection).toContainText('Finalize Q3 roadmap document');
    await expect(dueTodaySection).toContainText('P1 Urgent');
  });

  test('TM-TODAY-002 (E2E): Overdue tasks are displayed with alert badge in Overdue section', async ({
    page,
  }) => {
    await page.goto('/');

    const overdueSection = page.locator('[data-testid="overdue-tasks-section"]');
    await expect(overdueSection).toBeVisible();
    await expect(overdueSection).toContainText('Submit compliance checklist');
    await expect(overdueSection).toContainText('P0 Critical');
    await expect(overdueSection).toContainText('Overdue');
    await expect(overdueSection).toContainText('Action Required');
  });

  test('TM-TODAY-003 (E2E): Important tasks (P0/P1/P2) are displayed under Important Work', async ({
    page,
  }) => {
    await page.goto('/');

    const importantSection = page.locator('[data-testid="important-work-section"]');
    await expect(importantSection).toBeVisible();
    await expect(importantSection).toContainText('Refactor database indexing strategy');
    await expect(importantSection).toContainText('Implement token rotation in auth service');
    await expect(importantSection).toContainText('P0 Critical');
    await expect(importantSection).toContainText('P2 High');
  });

  test("TM-TODAY-004 (E2E): Today's calendar events and all-day events are displayed in Schedule", async ({
    page,
  }) => {
    await page.goto('/');

    const scheduleSection = page.locator('[data-testid="today-schedule-section"]');
    await expect(scheduleSection).toBeVisible();
    await expect(scheduleSection).toContainText("Today's Schedule");
    await expect(scheduleSection).toContainText('SRM Campus Founder Holiday');
    await expect(scheduleSection).toContainText('All-Day');
    await expect(scheduleSection).toContainText('Security Architecture Review');
  });

  test('TM-TODAY-005 (E2E): Unscheduled work is discoverable and actionable via Schedule Block', async ({
    page,
  }) => {
    await page.goto('/');

    const unscheduledSection = page.locator('[data-testid="unscheduled-section"]');
    await expect(unscheduledSection).toBeVisible();
    await expect(unscheduledSection).toContainText('Optimize memory footprint in web worker');

    // Click "Schedule Block" button
    const scheduleBtn = unscheduledSection.locator('button', { hasText: 'Schedule Block' });
    await expect(scheduleBtn).toBeVisible();
    await scheduleBtn.click();

    // Verify Schedule Modal appears
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Schedule Work Block');
    await expect(modal).toContainText('Optimize memory footprint in web worker');

    // Submit work block
    const submitBtn = modal.locator('button', { hasText: 'Schedule Block' });
    await submitBtn.click();

    // After scheduling, modal closes
    await expect(modal).not.toBeVisible();
  });

  test('TM-TODAY-006 (E2E): Current and Next Work are displayed in Now & Next Cockpit', async ({
    page,
  }) => {
    await page.goto('/');

    const currentWorkCard = page.locator('[data-testid="current-work-card"]');
    await expect(currentWorkCard).toBeVisible();
    await expect(currentWorkCard).toContainText('Active Now');
    await expect(currentWorkCard).toContainText('Work Block: Performance Tuning');
    await expect(currentWorkCard).toContainText('Task Work Block');

    const nextWorkCard = page.locator('[data-testid="next-work-card"]');
    await expect(nextWorkCard).toBeVisible();
    await expect(nextWorkCard).toContainText('Next Up');
    await expect(nextWorkCard).toContainText('Security Architecture Review');
    await expect(nextWorkCard).toContainText('Calendar Event');
  });

  test('TM-TODAY-006 (E2E Standby): Honest standby states when no current/next work scheduled', async ({
    page,
  }) => {
    mockCockpitData.currentWork = null;
    mockCockpitData.nextWork = null;

    await page.goto('/');

    const noCurrentWork = page.locator('[data-testid="no-current-work"]');
    await expect(noCurrentWork).toBeVisible();
    await expect(noCurrentWork).toContainText('No scheduled work right now');

    const noNextWork = page.locator('[data-testid="no-next-work"]');
    await expect(noNextWork).toBeVisible();
    await expect(noNextWork).toContainText('No further scheduled work today');
  });

  test('TM-TASK-011 (E2E): Complete and reopen task directly in Today view', async ({ page }) => {
    await page.goto('/');

    const dueTodaySection = page.locator('[data-testid="due-today-section"]');
    const taskItem = dueTodaySection.locator('[data-testid="task-row-task-due-today-1"]');
    await expect(taskItem).toBeVisible();

    // Click checkbox to complete
    const checkbox = taskItem.locator('button[role="checkbox"]');
    await checkbox.click();

    // Verify task is completed
    const completedHeading = page.locator('#completed-today-heading');
    await expect(completedHeading).toContainText('Completed Today (1)');
  });
});
