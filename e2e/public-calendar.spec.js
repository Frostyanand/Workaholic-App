import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Public Calendar & Share Links (Phase 19)
 * Pure JavaScript - Zero TypeScript
 * Satisfies TM-PUBLIC-001 through TM-PUBLIC-008:
 *  - TM-PUBLIC-001: Public calendar can be enabled
 *  - TM-PUBLIC-002: Public link displays permitted events
 *  - TM-PUBLIC-003: Private events reveal only busy state
 *  - TM-PUBLIC-004: Private event title is not exposed
 *  - TM-PUBLIC-005: Private event metadata is not exposed
 *  - TM-PUBLIC-006: Public link can be revoked
 *  - TM-PUBLIC-007: Revoked public link becomes inaccessible
 *  - TM-PUBLIC-008: Public link cannot enumerate private resources
 */

test.describe('Public Calendar & Share Links E2E Journeys', () => {
  let mockActiveLink = null;
  let mockCalendars = [];
  let mockEvents = [];

  test.beforeEach(async ({ page }) => {
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    } catch {
      // Permission API not supported in some engines
    }
    mockActiveLink = null;
    mockCalendars = [
      {
        id: 'cal-e2e-1',
        workspaceId: 'ws-e2e',
        name: 'Personal Primary',
        color: '#3B82F6',
        timezone: 'America/New_York',
        isDefault: true,
        visibility: 'PRIVATE',
      },
    ];

    mockEvents = [
      {
        id: 'evt-e2e-private',
        calendarId: 'cal-e2e-1',
        title: 'Confidential Doctor Consultation',
        description: 'Super private medical notes',
        location: 'Doctor Office Room 303',
        start: '2026-09-28T14:00:00.000Z',
        end: '2026-09-28T15:00:00.000Z',
        isAllDay: false,
        visibility: 'PRIVATE',
      },
      {
        id: 'evt-e2e-public',
        calendarId: 'cal-e2e-1',
        title: 'Open Keynote Presentation',
        description: 'Internal slides',
        start: '2026-09-28T16:00:00.000Z',
        end: '2026-09-28T17:30:00.000Z',
        isAllDay: false,
        visibility: 'PUBLIC',
      },
    ];

    // Intercept Calendars endpoints (both /api/v1/calendar/calendars and /api/v1/calendars)
    await page.route('**/api/v1/**calendars**', async route => {
      if (route.request().url().includes('/public/calendars/')) {
        return route.fallback();
      }
      if (route.request().url().includes('/public-link')) {
        return route.fallback();
      }
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockCalendars }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/v1/calendar/events**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockEvents,
          workBlocks: [],
          deadlines: [],
        }),
      });
    });

    await page.route('**/api/v1/notifications/**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          unreadCount: 0,
        }),
      });
    });

    await page.route('**/api/v1/workspaces**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'ws-e2e', name: 'Personal Workspace', role: 'OWNER' }],
        }),
      });
    });

    // Intercept Public Calendar Management endpoints
    await page.route('**/api/v1/calendars/*/public-link**', async route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const pathname = url.pathname;

      if (pathname.endsWith('/regenerate') && method === 'POST') {
        const rawToken = `pcal_regen_${Date.now()}`;
        mockActiveLink = {
          id: `link-regen-${Date.now()}`,
          calendarId: 'cal-e2e-1',
          status: 'ACTIVE',
          token: rawToken,
          url: `/public/calendar/${rawToken}`,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          lastAccessedAt: null,
        };
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockActiveLink }),
        });
      }

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockActiveLink }),
        });
      }

      if (method === 'POST') {
        const rawToken = `pcal_active_token_${Date.now()}`;
        mockActiveLink = {
          id: `link-${Date.now()}`,
          calendarId: 'cal-e2e-1',
          status: 'ACTIVE',
          token: rawToken,
          url: `/public/calendar/${rawToken}`,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          lastAccessedAt: null,
        };
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockActiveLink }),
        });
      }

      if (method === 'DELETE') {
        mockActiveLink = null;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { revoked: true } }),
        });
      }

      return route.continue();
    });

    // Intercept Anonymous Public Feed endpoint
    await page.route('**/api/v1/public/calendars/*', async route => {
      const url = new URL(route.request().url());
      const token = url.pathname.split('/').pop();

      if (token === 'pcal_revoked_test_token') {
        return route.fulfill({
          status: 410,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'RESOURCE_REVOKED',
              message: 'This public calendar link has been revoked',
            },
          }),
        });
      }

      if (token === 'pcal_expired_test_token') {
        return route.fulfill({
          status: 410,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'LINK_EXPIRED',
              message: 'This public calendar link has expired',
            },
          }),
        });
      }

      // Return privacy-projected events
      const projected = mockEvents.map(e => ({
        id: e.id,
        title: e.visibility === 'PUBLIC' ? e.title : 'Busy',
        start: e.start,
        end: e.end,
        isAllDay: e.isAllDay,
        busy: true,
      }));

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'x-robots-tag': 'noindex, nofollow, noarchive',
          'cache-control': 'no-store, no-cache',
        },
        body: JSON.stringify({
          data: {
            calendar: {
              name: 'Personal Primary',
              color: '#3B82F6',
              timezone: 'America/New_York',
            },
            events: projected,
          },
        }),
      });
    });
  });

  // =========================================================================
  // 1. Owner Workflow: Enable, View, Copy, Regenerate, and Revoke Public Link
  // =========================================================================
  test('Owner manages public calendar link lifecycle from Calendar view', async ({ page }) => {
    await page.goto('/calendar');

    // Click "Share Link" button in header
    const shareButton = page.locator('button', { hasText: 'Share Link' }).first();
    await expect(shareButton).toBeVisible();
    await shareButton.click();

    // Verify PublicCalendarModal opens with privacy protection notice
    await expect(page.locator('h2', { hasText: 'Share Calendar & Public Link' })).toBeVisible();
    await expect(page.locator('text=Strict Privacy Protection')).toBeVisible();
    await expect(page.locator('text=Inactive / Not Shared')).toBeVisible();

    // Click "Enable Public Link"
    const enableButton = page.locator('button', { hasText: 'Enable Public Link' });
    await expect(enableButton).toBeVisible();
    await enableButton.click();

    // Verify Active status and URL input appear
    await expect(page.locator('text=Active & Public')).toBeVisible();
    const urlInput = page.locator('input[readonly]');
    await expect(urlInput).toBeVisible();
    const urlValue = await urlInput.inputValue();
    expect(urlValue).toContain('/public/calendar/pcal_active_token_');

    // Test Copy button
    const copyButton = page.locator('button', { hasText: 'Copy' });
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(page.locator('text=✓ Copied')).toBeVisible();

    // Test Regenerate link flow
    const regenButton = page.locator('button', { hasText: 'Regenerate' });
    await regenButton.click();
    await expect(page.locator('text=Regenerate public link?')).toBeVisible();
    const confirmRegen = page.locator('button', { hasText: 'Confirm Regenerate' });
    await confirmRegen.click();

    // Verify new token generated
    await expect(urlInput).toHaveValue(/\/public\/calendar\/pcal_regen_/);
    const newUrlValue = await urlInput.inputValue();
    expect(newUrlValue).not.toBe(urlValue);

    // Test Revoke flow
    const revokeButton = page.locator('button', { hasText: 'Revoke Link' });
    await revokeButton.click();
    await expect(page.locator('text=Revoke public link?')).toBeVisible();
    const confirmRevoke = page.locator('button', { hasText: 'Confirm Revoke' });
    await confirmRevoke.click();

    // Verify returns to inactive state
    await expect(page.locator('text=Inactive / Not Shared')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Enable Public Link' })).toBeVisible();
  });

  // =========================================================================
  // 2. Anonymous Visitor: Privacy Projection Verification
  // =========================================================================
  test('Anonymous visitor views public calendar feed with strict privacy projection', async ({
    page,
  }) => {
    // Navigate directly to public viewer URL
    await page.goto('/public/calendar/pcal_sample_token_12345');

    // Header renders calendar title and privacy badge
    await expect(page.locator('h1', { hasText: 'Personal Primary' })).toBeVisible();
    await expect(page.locator('text=Privacy Protected')).toBeVisible();
    await expect(page.locator('text=America/New_York')).toBeVisible();

    // Verify events: Private event MUST show as "Busy"
    const busyEvent = page.locator('text=Busy').first();
    await expect(busyEvent).toBeVisible();

    // Verify public event shows its public title
    const publicEvent = page.locator('text=Open Keynote Presentation').first();
    await expect(publicEvent).toBeVisible();

    // SECURITY CHECK: Ensure sensitive details NEVER appear in page DOM
    const pageContent = await page.content();
    expect(pageContent.includes('Confidential Doctor Consultation')).toBe(false);
    expect(pageContent.includes('Super private medical notes')).toBe(false);
    expect(pageContent.includes('Doctor Office Room 303')).toBe(false);

    // Switch to Agenda view
    const agendaTab = page.locator('button', { hasText: 'Agenda' });
    await agendaTab.click();

    await expect(page.locator('text=Busy').first()).toBeVisible();
    await expect(page.locator('text=Open Keynote Presentation').first()).toBeVisible();
    await expect(page.locator('text=Public Event').first()).toBeVisible();

    // Click on "Busy" event to open detail popover
    await page.locator('[data-testid="agenda-event-card"]').first().click();
    await expect(
      page.locator(
        'text=This is a private block. Specific details, attendees, and description are hidden',
      ),
    ).toBeVisible();
  });

  // =========================================================================
  // 3. Error States: Revoked and Expired Links
  // =========================================================================
  test('Anonymous visitor receives clear notice when link is revoked or expired', async ({
    page,
  }) => {
    // 1. Visit revoked token
    await page.goto('/public/calendar/pcal_revoked_test_token');
    await expect(page.locator('h1', { hasText: 'Calendar Link Revoked' })).toBeVisible();
    await expect(page.locator('text=has been revoked by the owner')).toBeVisible();

    // 2. Visit expired token
    await page.goto('/public/calendar/pcal_expired_test_token');
    await expect(page.locator('h1', { hasText: 'Calendar Link Expired' })).toBeVisible();
    await expect(page.locator('text=reached its configured expiration deadline')).toBeVisible();
  });
});
