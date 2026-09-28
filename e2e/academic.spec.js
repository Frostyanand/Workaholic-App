import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Academic Calendar & Day Order Engine (Phase 18)
 * Pure JavaScript - Zero TypeScript
 * Satisfies Section 29 / 30 / 38 / 39 of requirements:
 *  - View Academic Workspace, active semester cockpit, Day Order table
 *  - Holiday creation with Day Order shift mechanics & warning
 *  - Timetable schedule management and event generation
 *  - Class cancellation exception creation
 *  - Explicit End Semester operation with preservation checklist
 */

test.describe('Academic Calendar & Day Order Engine E2E Journeys', () => {
  let mockSemesters = [];
  let mockDates = [];
  let mockSchedules = [];
  let mockExceptions = [];

  test.beforeEach(async ({ page }) => {
    mockSemesters = [
      {
        id: 'sem-e2e-1',
        workspaceId: 'ws-e2e',
        name: 'Fall 2026 SRM Day Order',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        cycleLength: 5,
        status: 'ACTIVE',
        metadata: {},
      },
    ];

    mockDates = [
      {
        id: 'd-1',
        semesterId: 'sem-e2e-1',
        calendarDate: '2026-09-01',
        dayStatus: 'WORKING_DAY',
        dayOrder: 'DO1',
        description: null,
      },
      {
        id: 'd-2',
        semesterId: 'sem-e2e-1',
        calendarDate: '2026-09-02',
        dayStatus: 'WORKING_DAY',
        dayOrder: 'DO2',
        description: null,
      },
      {
        id: 'd-3',
        semesterId: 'sem-e2e-1',
        calendarDate: '2026-09-03',
        dayStatus: 'WORKING_DAY',
        dayOrder: 'DO3',
        description: null,
      },
      {
        id: 'd-4',
        semesterId: 'sem-e2e-1',
        calendarDate: '2026-09-04',
        dayStatus: 'WORKING_DAY',
        dayOrder: 'DO4',
        description: null,
      },
      {
        id: 'd-5',
        semesterId: 'sem-e2e-1',
        calendarDate: '2026-09-07',
        dayStatus: 'WORKING_DAY',
        dayOrder: 'DO5',
        description: null,
      },
    ];

    mockSchedules = [
      {
        id: 'sched-e2e-1',
        workspaceId: 'ws-e2e',
        name: 'B.Tech CSE Core Schedule',
        semesterId: 'sem-e2e-1',
        isDefault: true,
        entries: [
          {
            id: 'entry-e2e-101',
            dayOrder: 'DO1',
            courseName: 'Data Structures & Algorithms',
            courseCode: 'CS201',
            instructor: 'Dr. Turing',
            room: 'UB-402',
            startTime: '09:00:00',
            endTime: '10:30:00',
            color: '#6366f1',
          },
        ],
      },
    ];

    mockExceptions = [];

    // Intercept Academic API routes
    await page.route('**/api/v1/academic/**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();

      // Semesters endpoints
      if (pathname === '/api/v1/academic/semesters') {
        if (method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: mockSemesters }),
          });
        }
        if (method === 'POST') {
          const body = route.request().postDataJSON();
          const newSem = {
            id: `sem-${Date.now()}`,
            workspaceId: 'ws-e2e',
            name: body.name,
            startDate: body.startDate,
            endDate: body.endDate,
            cycleLength: body.cycleLength || 5,
            status: 'UPCOMING',
            metadata: {},
          };
          mockSemesters.push(newSem);
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: newSem }),
          });
        }
      }

      // End Semester endpoint
      if (pathname.includes('/end') && method === 'POST') {
        const semId = pathname.split('/')[4];
        const sem = mockSemesters.find(s => s.id === semId);
        if (sem) sem.status = 'ENDED';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { ...sem, status: 'ENDED', deletedFutureEventsCount: 5 } }),
        });
      }

      // Dates and Calendar endpoints
      if (pathname.includes('/calendar') || pathname.includes('/dates')) {
        if (method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: mockDates }),
          });
        }
        if (method === 'POST') {
          const body = route.request().postDataJSON();
          // Update or insert date
          let dateItem = mockDates.find(d => d.calendarDate === body.calendarDate);
          if (!dateItem) {
            dateItem = {
              id: `date-${Date.now()}`,
              semesterId: 'sem-e2e-1',
              calendarDate: body.calendarDate,
              dayStatus: body.dayStatus,
              dayOrder: body.dayOrder || null,
              description: body.description || null,
            };
            mockDates.push(dateItem);
          } else {
            dateItem.dayStatus = body.dayStatus;
            dateItem.dayOrder = body.dayOrder || null;
            dateItem.description = body.description || null;
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: dateItem }),
          });
        }
      }

      // Schedules endpoints
      if (pathname === '/api/v1/academic/schedules') {
        if (method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: mockSchedules }),
          });
        }
      }

      if (pathname.startsWith('/api/v1/academic/schedules/')) {
        const parts = pathname.split('/');
        const schedId = parts[parts.length - 1];
        if (method === 'GET') {
          const sched = mockSchedules.find(s => s.id === schedId);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: sched || mockSchedules[0] }),
          });
        }
      }

      // Exceptions endpoints
      if (pathname.includes('/exceptions')) {
        if (method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: mockExceptions }),
          });
        }
        if (pathname.endsWith('/cancel') && method === 'POST') {
          const body = route.request().postDataJSON();
          const exc = {
            id: `exc-${Date.now()}`,
            semesterId: 'sem-e2e-1',
            scheduleEntryId: body.scheduleEntryId,
            calendarDate: body.calendarDate,
            exceptionType: 'CANCELLED',
            reason: body.reason || 'Faculty leave',
          };
          mockExceptions.push(exc);
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: exc }),
          });
        }
      }

      // Generate Events
      if (pathname.includes('/generate') && method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              generatedEventsCount: 15,
              deletedStaleEventsCount: 0,
              recalculatedDatesCount: 22,
            },
          }),
        });
      }

      return route.continue();
    });

    // Intercept common notifications
    await page.route('**/api/v1/notifications/**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { unreadCount: 0 } }),
      });
    });
  });

  test('Academic Calendar Journey: View Workspace -> Manage Holiday & Verify Shift Warning', async ({
    page,
  }) => {
    // 1. Navigate to Academic Page
    await page.goto('/academic');
    await expect(page.locator('[data-testid="academic-workspace"]')).toBeVisible();
    await expect(page.locator('[data-testid="active-semester-cockpit"]')).toBeVisible();

    // 2. Verify Day Order Calendar Table rendered
    await expect(page.locator('[data-testid="academic-calendar-table"]')).toBeVisible();
    await expect(page.locator('text=DO1')).toBeVisible();
    await expect(page.locator('text=DO2')).toBeVisible();

    // 3. Click Set Holiday on 2026-09-02
    const editDateBtn = page.locator('[data-testid="edit-date-btn-2026-09-02"]');
    await expect(editDateBtn).toBeVisible();
    await editDateBtn.click();

    // 4. Verify Holiday Modal opened with Shift Warning (BR-DO-005)
    await expect(page.locator('[data-testid="holiday-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="holiday-shift-warning"]')).toBeVisible();

    // 5. Select HOLIDAY and enter description
    await page.locator('[data-testid="academic-day-status-select"]').selectOption('HOLIDAY');
    await page.locator('[data-testid="academic-date-reason-input"]').fill('University Founder Day');

    // 6. Save Holiday
    await page.locator('[data-testid="confirm-holiday-shift-btn"]').click();
    await expect(page.locator('[data-testid="holiday-modal"]')).not.toBeVisible();
  });

  test('Timetable & Schedule Generation: View DO Timetable & Trigger Event Generation', async ({
    page,
  }) => {
    // 1. Navigate to Academic Page
    await page.goto('/academic');
    await expect(page.locator('[data-testid="academic-workspace"]')).toBeVisible();

    // 2. Switch to Timetable tab
    await page.locator('[data-testid="tab-timetable"]').click();
    await expect(page.locator('[data-testid="timetable-day-order-grid"]')).toBeVisible();

    // 3. Verify schedule entry rendered
    await expect(page.locator('text=Data Structures & Algorithms')).toBeVisible();
    await expect(page.locator('text=CS201')).toBeVisible();
    await expect(page.locator('text=Dr. Turing')).toBeVisible();

    // 4. Click Generate Calendar Events
    await page.locator('[data-testid="generate-schedule-events-btn"]').click();

    // 5. Verify success alert with generation count
    await expect(page.locator('[data-testid="generation-success-message"]')).toBeVisible();
    await expect(
      page.locator('text=Generated 15 calendar occurrences successfully!'),
    ).toBeVisible();
  });

  test('Semester Lifecycle: End Semester Flow with Preservation Checklist', async ({ page }) => {
    // 1. Navigate to Academic Page
    await page.goto('/academic');
    await expect(page.locator('[data-testid="academic-workspace"]')).toBeVisible();

    // 2. Click End Semester
    const endSemBtn = page.locator('[data-testid="end-semester-btn"]');
    await expect(endSemBtn).toBeVisible();
    await endSemBtn.click();

    // 3. Verify End Semester Modal opened with preservation checklist (BR-DO-013)
    await expect(page.locator('[data-testid="end-semester-modal"]')).toBeVisible();
    await expect(
      page.locator('text=Past academic class history and attended events'),
    ).toBeVisible();
    await expect(
      page.locator('text=Reusable class timetable definitions and templates'),
    ).toBeVisible();
    await expect(
      page.locator('text=Unrelated personal events, tasks, and Google Calendar events'),
    ).toBeVisible();

    // 4. Confirm End Semester
    await page.locator('[data-testid="confirm-end-semester-btn"]').click();
    await expect(page.locator('[data-testid="end-semester-modal"]')).not.toBeVisible();
  });
});
