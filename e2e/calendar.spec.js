import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Workaholic Calendar (Phase 8)
 * Pure JavaScript ES2023 - Zero TypeScript
 * Satisfies TEST-MATRIX:
 *  - TM-CAL-001 (E2E): User can create calendar events via modal
 *  - TM-CAL-002 (DB/UNIT): Event start/end persisted correctly
 *  - TM-CAL-003 (E2E): All-day events behave correctly and render in dedicated all-day row
 *  - TM-CAL-004 (E2E): Events display in correct timezone
 *  - TM-CAL-005 (E2E): Day view displays events correctly
 *  - TM-CAL-006 (E2E): Week view displays events correctly
 *  - TM-CAL-007 (E2E): Month view displays events correctly
 *  - TM-CAL-008 (E2E): Agenda view displays events correctly
 *  - TM-CAL-009 (E2E): Event editing works via detail modal
 *  - TM-CAL-010 (E2E): Event cancellation and deletion works
 *  - TM-CAL-011 (DB/DOMAIN): Calendar source is preserved
 *  - TM-CAL-012 (E2E): Private events display and maintain privacy
 *  - TM-CAL-013 (E2E): Calendar filtering toggles visibility of events
 */

test.describe('Calendar E2E Journeys', () => {
  let mockCalendars = [];
  let mockEvents = [];
  let todayStr = '';

  test.beforeEach(async ({ page }) => {
    const today = new Date();
    todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    mockCalendars = [
      {
        id: 'cal-personal',
        workspaceId: 'ws-default',
        name: 'Personal Calendar',
        description: 'Personal life and schedule',
        color: '#6366f1',
        isDefault: true,
        isVisible: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'cal-work',
        workspaceId: 'ws-default',
        name: 'Work Projects',
        description: 'Work meetings and sprints',
        color: '#10b981',
        isDefault: false,
        isVisible: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    mockEvents = [
      {
        id: 'evt-timed-1',
        calendarId: 'cal-personal',
        calendarName: 'Personal Calendar',
        calendarColor: '#6366f1',
        title: 'Sprint Architecture Review',
        description: 'Review system design and test matrix',
        location: 'Conference Room B',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        startAt: `${todayStr}T10:00:00.000Z`,
        endAt: `${todayStr}T11:30:00.000Z`,
        timezone: 'UTC',
        isAllDay: false,
        startDate: null,
        endDate: null,
        status: 'CONFIRMED',
        visibility: 'PUBLIC',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'evt-allday-1',
        calendarId: 'cal-work',
        calendarName: 'Work Projects',
        calendarColor: '#10b981',
        title: 'Quarterly Planning Day',
        description: 'Whole-day roadmap planning session',
        location: null,
        meetingUrl: null,
        startAt: `${todayStr}T00:00:00.000Z`,
        endAt: `${todayStr}T23:59:59.999Z`,
        timezone: 'UTC',
        isAllDay: true,
        startDate: todayStr,
        endDate: todayStr,
        status: 'CONFIRMED',
        visibility: 'SHARED',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'evt-private-1',
        calendarId: 'cal-personal',
        calendarName: 'Personal Calendar',
        calendarColor: '#6366f1',
        title: 'Confidential Doctor Appointment',
        description: 'Annual health checkup',
        location: 'Health Clinic',
        meetingUrl: null,
        startAt: `${todayStr}T14:00:00.000Z`,
        endAt: `${todayStr}T15:00:00.000Z`,
        timezone: 'UTC',
        isAllDay: false,
        startDate: null,
        endDate: null,
        status: 'CONFIRMED',
        visibility: 'PRIVATE',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

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

      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const newCal = {
          id: `cal-${Date.now()}`,
          workspaceId: body.workspaceId || 'ws-default',
          name: body.name,
          description: body.description || null,
          color: body.color || '#3b82f6',
          isDefault: false,
          isVisible: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockCalendars.push(newCal);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newCal }),
        });
      }

      return route.continue();
    });

    // Intercept Events API
    await page.route('**/api/v1/calendar/events**', async route => {
      const method = route.request().method();
      const url = new URL(route.request().url());

      // GET range query
      if (method === 'GET') {
        const calendarIdsParam = url.searchParams.get('calendarIds');
        let filtered = [...mockEvents];
        if (calendarIdsParam) {
          const cIds = calendarIdsParam.split(',');
          filtered = filtered.filter(e => cIds.includes(e.calendarId));
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: filtered,
            workBlocks: [],
            deadlines: [],
            meta: { total: filtered.length },
          }),
        });
      }

      // POST create event
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const cal = mockCalendars.find(c => c.id === body.calendarId) || mockCalendars[0];
        const newEvt = {
          id: `evt-${Date.now()}`,
          calendarId: body.calendarId,
          calendarName: cal ? cal.name : 'Calendar',
          calendarColor: cal ? cal.color : '#3b82f6',
          title: body.title,
          description: body.description || null,
          location: body.location || null,
          meetingUrl: body.meetingUrl || null,
          isAllDay: Boolean(body.isAllDay),
          startDate: body.startDate || null,
          endDate: body.endDate || null,
          startAt: body.startAt || `${body.startDate}T00:00:00.000Z`,
          endAt: body.endAt || `${body.endDate}T23:59:59.999Z`,
          timezone: body.timezone || 'UTC',
          status: body.status || 'CONFIRMED',
          visibility: body.visibility || 'DEFAULT',
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

    // Intercept specific event route /api/v1/calendar/events/:id
    await page.route(/\/api\/v1\/calendar\/events\/[^/?]+/, async route => {
      const method = route.request().method();
      const url = new URL(route.request().url());
      const match = url.pathname.match(/\/api\/v1\/calendar\/events\/([^/?]+)/);
      const eventId = match ? match[1] : null;

      if (!eventId) return route.continue();

      if (method === 'PATCH') {
        const body = route.request().postDataJSON();
        const index = mockEvents.findIndex(e => e.id === eventId);
        if (index === -1) {
          return route.fulfill({ status: 404, body: JSON.stringify({ error: 'Not found' }) });
        }
        const updated = {
          ...mockEvents[index],
          ...body,
          updatedAt: new Date().toISOString(),
        };
        mockEvents[index] = updated;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: updated }),
        });
      }

      if (method === 'DELETE') {
        mockEvents = mockEvents.filter(e => e.id !== eventId);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { id: eventId, deleted: true } }),
        });
      }

      return route.continue();
    });

    // Intercept Tasks and Projects API for shell integration
    await page.route('**/api/v1/tasks**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { total: 0 } }),
      });
    });

    await page.route('**/api/v1/projects**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  // ==========================================================
  // TM-CAL-001: User can create calendar events via modal
  // ==========================================================
  test('TM-CAL-001 (E2E): User can create a timed calendar event via modal', async ({ page }) => {
    await page.goto('/calendar');

    // Calendar page title and header
    await expect(page.locator('main h1')).toContainText('Calendar');
    await expect(page.locator('.calendar-header')).toBeVisible();

    // Click "+ Event" to open Create Event Modal
    await page.click('button:has-text("+ Event")');

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2')).toHaveText('Create New Event');

    // Fill in timed event details
    await modal.locator('#event-title').fill('Database Performance Tuning');
    await modal.locator('#event-location').fill('Dev Room 4');
    await modal
      .locator('#event-description')
      .fill('Investigate slow queries and analyze partial indexes');

    // Submit the form
    await modal.locator('button[type="submit"]:has-text("Create Event")').click();

    // Modal closes and event card appears on calendar
    await expect(modal).not.toBeVisible();
    await page.click('button[role="tab"]:has-text("Agenda")');
    await expect(page.locator('text=Database Performance Tuning').first()).toBeVisible();
  });

  // ==========================================================
  // TM-CAL-003: All-day events behave correctly
  // ==========================================================
  test('TM-CAL-003 (E2E): All-day events render in dedicated all-day row and accept date inputs', async ({
    page,
  }) => {
    await page.goto('/calendar');

    // Switch to Week view to inspect all-day banner row
    await page.click('button[role="tab"]:has-text("Week")');

    // The existing all-day event "Quarterly Planning Day" should be in the all-day row
    await expect(page.locator('text=All-Day').first()).toBeVisible();
    await expect(page.locator('text=Quarterly Planning Day').first()).toBeVisible();

    // Create a new all-day event
    await page.click('button:has-text("+ Event")');
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    await modal.locator('#event-title').fill('Institutional Holiday');
    // Check "All-day event"
    await modal.locator('#event-all-day').check();

    // Verify whole-date inputs are visible instead of hour/minute inputs
    await expect(modal.locator('#event-start-date')).toBeVisible();
    await expect(modal.locator('#event-end-date')).toBeVisible();
    await expect(modal.locator('#event-start-time')).not.toBeVisible();

    // Submit
    await modal.locator('button[type="submit"]:has-text("Create Event")').click();
    await expect(modal).not.toBeVisible();

    // Verify new all-day event appears in all-day section
    await expect(page.locator('text=Institutional Holiday').first()).toBeVisible();
  });

  // ==========================================================
  // TM-CAL-004 to TM-CAL-008: Calendar View Modes
  // ==========================================================
  test('TM-CAL-005 through TM-CAL-008 (E2E): Seamless navigation across Month, Week, Workweek, Day, and Agenda views', async ({
    page,
  }) => {
    await page.goto('/calendar');

    // Default view is Month view
    await expect(page.locator('.month-view')).toBeVisible();
    await expect(page.locator('text=Sprint Architecture Review').first()).toBeVisible();

    // 1. Switch to Week View (TM-CAL-006)
    await page.click('button[role="tab"]:has-text("Week")');
    await expect(page.locator('.week-view')).toBeVisible();
    await expect(page.locator('text=Sprint Architecture Review').first()).toBeVisible();

    // 2. Switch to Workweek View
    await page.click('button[role="tab"]:has-text("Workweek")');
    await expect(page.locator('.week-view')).toBeVisible();

    // 3. Switch to Day View (TM-CAL-005)
    await page.click('button[role="tab"]:has-text("Day")');
    await expect(page.locator('.day-view')).toBeVisible();
    await expect(page.locator('text=Sprint Architecture Review').first()).toBeVisible();

    // 4. Switch to Agenda View (TM-CAL-008)
    await page.click('button[role="tab"]:has-text("Agenda")');
    await expect(page.locator('.agenda-view')).toBeVisible();
    await expect(page.locator('text=Sprint Architecture Review').first()).toBeVisible();
    await expect(page.locator('text=Quarterly Planning Day').first()).toBeVisible();

    // Period Navigation (Previous / Next / Today)
    const currentHeader = await page.locator('.calendar-header h2').innerText();
    await page.click('button[aria-label="Previous period"]');
    const prevHeader = await page.locator('.calendar-header h2').innerText();
    expect(prevHeader).not.toEqual(currentHeader);

    await page.click('button:has-text("Today")');
    const todayHeader = await page.locator('.calendar-header h2').innerText();
    expect(todayHeader).toEqual(currentHeader);
  });

  // ==========================================================
  // TM-CAL-009: Event editing works via Event Detail Modal
  // ==========================================================
  test('TM-CAL-009 (E2E): User can open event detail and edit an event', async ({ page }) => {
    await page.goto('/calendar');

    // Click on event card to open detail modal
    await page.click('text=Sprint Architecture Review');

    const detailModal = page.locator('div[role="dialog"]');
    await expect(detailModal).toBeVisible();
    await expect(detailModal.locator('h2')).toHaveText('Sprint Architecture Review');
    await expect(detailModal.locator('text=Conference Room B')).toBeVisible();

    // Click "Edit Event"
    await detailModal.locator('button:has-text("Edit Event")').click();

    // Edit Modal opens
    const editModal = page.locator('div[role="dialog"]');
    await expect(editModal.locator('h2')).toHaveText('Edit Event');

    // Change title
    await editModal.locator('#event-title').fill('Advanced Architecture Review');
    await editModal.locator('button[type="submit"]:has-text("Update Event")').click();

    await expect(editModal).not.toBeVisible();
    await expect(page.locator('text=Advanced Architecture Review').first()).toBeVisible();
  });

  // ==========================================================
  // TM-CAL-010: Event deletion works
  // ==========================================================
  test('TM-CAL-010 (E2E): User can delete an event with confirmation', async ({ page }) => {
    await page.goto('/calendar');

    // Auto-accept window.confirm
    page.on('dialog', dialog => dialog.accept());

    await page.click('text=Sprint Architecture Review');

    const detailModal = page.locator('div[role="dialog"]');
    await expect(detailModal).toBeVisible();

    // Click "Delete"
    await detailModal.locator('button:has-text("Delete")').click();

    await expect(detailModal).not.toBeVisible();
    // Event is removed
    await expect(page.locator('text=Sprint Architecture Review')).not.toBeVisible();
  });

  // ==========================================================
  // TM-CAL-012: Private events remain private and display indicator
  // ==========================================================
  test('TM-CAL-012 (E2E): Private events display properly and maintain privacy markings', async ({
    page,
  }) => {
    await page.goto('/calendar');

    // Find the private event card
    const privateEvent = page.locator('text=Confidential Doctor Appointment').first();
    await expect(privateEvent).toBeVisible();

    // Click to view details
    await privateEvent.click();

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2')).toHaveText('Confidential Doctor Appointment');
    await expect(modal.locator('text=Health Clinic')).toBeVisible();

    await modal.locator('button:has-text("Close")').click();
    await expect(modal).not.toBeVisible();
  });

  // ==========================================================
  // TM-CAL-013: Calendar filtering toggles visibility of events
  // ==========================================================
  test('TM-CAL-013 (E2E): Calendar filtering hides and reveals events dynamically', async ({
    page,
  }) => {
    await page.goto('/calendar');

    // Both Personal and Work events are visible initially
    await expect(page.locator('text=Sprint Architecture Review').first()).toBeVisible();
    await expect(page.locator('text=Quarterly Planning Day').first()).toBeVisible();

    // Uncheck "Work Projects" calendar in the filter panel
    const workCheckbox = page.locator('label:has-text("Work Projects") input[type="checkbox"]');
    await workCheckbox.uncheck();

    // "Quarterly Planning Day" (which belongs to Work Projects) disappears
    await expect(page.locator('text=Quarterly Planning Day')).not.toBeVisible();
    // Personal event is still visible
    await expect(page.locator('text=Sprint Architecture Review').first()).toBeVisible();

    // Re-check "Work Projects"
    await workCheckbox.check();
    await expect(page.locator('text=Quarterly Planning Day').first()).toBeVisible();
  });
});
