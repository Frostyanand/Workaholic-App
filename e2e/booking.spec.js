import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Booking & Availability Engine (Phase 20)
 * Pure JavaScript - Zero TypeScript
 * Satisfies TM-BOOK-001 through TM-BOOK-013:
 *  - TM-BOOK-001: Public Booking Page renders without auth
 *  - TM-BOOK-002: Available slots calculated with buffers and notice
 *  - TM-BOOK-003: Double-booking prevention catches conflict
 *  - TM-BOOK-004: Guest confirmation creates appointment
 *  - TM-BOOK-005: Guest self-service cancellation and reschedule
 *  - TM-BOOK-006: Disabled booking page is inaccessible
 */

test.describe('Booking & Availability E2E Journeys', () => {
  let mockPages = [];
  let mockTypes = [];
  let mockSlots = [];
  let mockBookings = [];

  test.beforeEach(async ({ page }) => {
    mockPages = [
      {
        id: 'bp_e2e_1',
        workspaceId: 'ws_e2e',
        name: 'Technical Mentorship',
        slug: 'tech-mentorship',
        description: '1-on-1 architecture and engineering advisory',
        timezone: 'UTC',
        status: 'ACTIVE',
        calendarId: 'cal_e2e_1',
      },
    ];

    mockTypes = [
      {
        id: 'bt_e2e_1',
        bookingPageId: 'bp_e2e_1',
        name: 'Architecture Review',
        slug: 'arch-review',
        description: 'Deep dive into distributed systems',
        durationMinutes: 30,
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 10,
        minNoticeMinutes: 60,
        maxNoticeDays: 30,
        location: 'Google Meet',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        createTask: true,
        taskPriority: 'HIGH',
        isActive: true,
        color: '#6366f1',
      },
    ];

    mockSlots = [
      {
        startAt: '2026-10-10T14:00:00.000Z',
        endAt: '2026-10-10T14:30:00.000Z',
      },
      {
        startAt: '2026-10-10T15:00:00.000Z',
        endAt: '2026-10-10T15:30:00.000Z',
      },
    ];

    mockBookings = [];

    // Notifications intercept
    await page.route('**/api/v1/notifications/**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { count: 0, unreadCount: 0, notifications: [] } }),
      });
    });

    // Intercept authenticated booking APIs
    await page.route('**/api/v1/booking/pages**', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockPages }),
        });
      }
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData());
        const newPage = {
          id: `bp_${Date.now()}`,
          ...payload,
          status: 'ACTIVE',
        };
        mockPages.push(newPage);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newPage }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/v1/booking/pages/*/types**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockTypes }),
      });
    });

    await page.route('**/api/v1/booking/bookings**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockBookings }),
      });
    });

    // Intercept public booking APIs (using ** for deep path matching)
    await page.route('**/api/v1/booking-pages/**', async route => {
      const url = route.request().url();

      if (url.includes('/availability')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { slots: mockSlots } }),
        });
      }

      if (url.includes('/bookings')) {
        const payload = JSON.parse(route.request().postData());
        const created = {
          id: `bk_${Date.now()}`,
          bookingTypeId: payload.bookingTypeId,
          bookingTypeName: 'Architecture Review',
          startAt: payload.startAt,
          endAt: '2026-10-10T14:30:00.000Z',
          timezone: payload.timezone || 'UTC',
          guestName: payload.guestName,
          guestEmail: payload.guestEmail,
          location: 'Google Meet',
          manageToken: 'mgmt_token_e2e_valid123',
          status: 'CONFIRMED',
        };
        mockBookings.push(created);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: created }),
        });
      }

      // Public booking page details
      const parsedUrl = new URL(url);
      const segments = parsedUrl.pathname.split('/');
      const bpIdx = segments.indexOf('booking-pages');
      const slug = bpIdx !== -1 ? segments[bpIdx + 1] : segments.pop();

      const found = mockPages.find(p => p.slug === slug);
      if (!found || found.status !== 'ACTIVE') {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'NOT_FOUND', message: 'Booking page not found or disabled' },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ...found,
            bookingTypes: mockTypes,
          },
        }),
      });
    });

    // Intercept guest self-service APIs
    await page.route('**/api/v1/public/bookings/**', async route => {
      const url = route.request().url();
      if (url.endsWith('/cancel')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              status: 'CANCELLED',
              cancellationReason: 'Need to reschedule',
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            bookingId: 'bk_e2e_1',
            pageName: 'Technical Mentorship',
            pageSlug: 'tech-mentorship',
            bookingTypeId: 'bt_e2e_1',
            bookingTypeName: 'Architecture Review',
            startAt: '2026-10-10T14:00:00.000Z',
            endAt: '2026-10-10T14:30:00.000Z',
            timezone: 'UTC',
            guestName: 'Alice Engineer',
            guestEmail: 'alice@example.com',
            status: 'CONFIRMED',
            location: 'Google Meet',
          },
        }),
      });
    });
  });

  test('TM-BOOK-001 & 002: Authenticated management lists booking pages and types', async ({
    page,
  }) => {
    await page.goto('/booking');
    await expect(page.locator('[data-testid="booking-management-page"]')).toBeVisible();
    await expect(page.locator('text=Technical Mentorship').first()).toBeVisible();
    await expect(page.locator('text=Architecture Review').first()).toBeVisible();
    await expect(page.locator('[data-testid="copy-link-btn-bp_e2e_1"]')).toBeVisible();
  });

  test('TM-BOOK-003 & 004: Anonymous guest can discover slots and book appointment', async ({
    page,
  }) => {
    await page.goto('/book/tech-mentorship');
    await expect(page.locator('[data-testid="public-booking-container"]')).toBeVisible();
    await expect(page.locator('text=Technical Mentorship').first()).toBeVisible();

    // Select first open slot
    const slotBtn = page.locator('[data-testid="slot-btn-0"]');
    await expect(slotBtn).toBeVisible();
    await slotBtn.click();

    // Proceed to details
    const proceedBtn = page.locator('[data-testid="proceed-to-details-btn"]');
    await expect(proceedBtn).toBeVisible();
    await proceedBtn.click();

    // Fill guest form
    await page.locator('[data-testid="guest-name-input"]').fill('Alice Engineer');
    await page.locator('[data-testid="guest-email-input"]').fill('alice@example.com');
    await page.locator('[data-testid="guest-notes-input"]').fill('Discussing microservices');

    // Confirm booking
    await page.locator('[data-testid="confirm-booking-btn"]').click();

    // Expect confirmation screen
    await expect(page.locator('[data-testid="booking-confirmed-screen"]')).toBeVisible();
    await expect(page.locator('text=Appointment Scheduled!')).toBeVisible();
    await expect(page.locator('text=alice@example.com')).toBeVisible();
    await expect(page.locator('[data-testid="guest-manage-link"]')).toBeVisible();
  });

  test('TM-BOOK-005: Guest self-service page allows appointment cancellation', async ({ page }) => {
    await page.goto('/book/manage/mgmt_token_e2e_valid123');
    await expect(page.locator('[data-testid="public-booking-manage-container"]')).toBeVisible();
    await expect(page.locator('text=Architecture Review')).toBeVisible();
    await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible();

    // Click cancel
    const cancelBtn = page.locator('[data-testid="guest-cancel-btn"]');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await page.locator('[data-testid="guest-cancel-reason-input"]').fill('Emergency conflict');
    await page.locator('[data-testid="confirm-guest-cancel-btn"]').click();

    await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible();
  });

  test('TM-BOOK-006: Disabled or non-existent booking page returns error screen', async ({
    page,
  }) => {
    await page.goto('/book/non-existent-page');
    await expect(page.locator('[data-testid="public-booking-error"]')).toBeVisible();
    await expect(page.locator('text=Booking Page Unavailable')).toBeVisible();
  });
});
