import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Google Workspace Onboarding Flow
 * Pure JavaScript - Zero TypeScript
 */

test.describe('Google Workspace Onboarding Journeys', () => {
  let googleIntegrationState = {
    connected: false,
    status: 'DISCONNECTED',
    scopes: [],
    services: {
      calendar: false,
      tasks: false,
      drive: false,
    },
  };

  test.beforeEach(async ({ page }) => {
    googleIntegrationState = {
      connected: false,
      status: 'DISCONNECTED',
      scopes: [],
      services: {
        calendar: false,
        tasks: false,
        drive: false,
      },
    };

    // Mock session check
    await page.route('**/api/v1/auth/session', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              token: 'mock_session_token_onboarding_e2e',
              user: {
                id: 'usr-onboarding-e2e',
                displayName: 'Alex Chen',
                email: 'alex@example.com',
              },
              session: {
                id: 'sess-onboarding-e2e',
                sessionType: 'WEB',
              },
              isNewUser: false,
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            authenticated: true,
            user: {
              id: 'usr-onboarding-e2e',
              displayName: 'Alex Chen',
              email: 'alex@example.com',
            },
          },
        }),
      });
    });

    // Mock Google status check
    await page.route('**/api/v1/auth/google/status', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: googleIntegrationState }),
      });
    });

    // Mock Google OAuth initiate
    await page.route('**/api/v1/auth/google/authorize**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
            state: 'mock_state_onboarding_123',
            service: 'WORKSPACE',
            scopes: [
              'https://www.googleapis.com/auth/calendar.events',
              'https://www.googleapis.com/auth/calendar.readonly',
              'https://www.googleapis.com/auth/tasks',
              'https://www.googleapis.com/auth/drive.file',
            ],
          },
        }),
      });
    });

    // Mock Today dashboard APIs
    await page.route('**/api/v1/workspaces/*/today**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            dueToday: [],
            overdue: [],
            important: [],
            unscheduled: [],
            completedToday: [],
            calendarEvents: [],
            workBlocks: [],
            timezone: 'UTC',
          },
        }),
      });
    });

    await page.route('**/api/v1/workspaces/*/calendars**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
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

  test('User logs in -> lands on Onboarding -> Skips -> Enters Dashboard with status indicator', async ({
    page,
  }) => {
    // 1. Visit Login Page
    await page.goto('/login');
    await expect(page.locator('[data-testid="firebase-google-signin-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="demo-login-btn"]')).toBeVisible();

    // 2. Perform Login via Demo Shortcut (same flow as Google Login)
    await page.locator('[data-testid="demo-login-btn"]').click();

    // 3. User is directed to /onboarding because Google is not yet connected
    await expect(page).toHaveURL(/.*\/onboarding/);
    await expect(page.locator('[data-testid="onboarding-title"]')).toContainText(
      'Connect your Google Workspace',
    );

    // Verify all 3 service cards are visible
    await expect(page.locator('[data-testid="service-card-calendar"]')).toBeVisible();
    await expect(page.locator('[data-testid="service-card-tasks"]')).toBeVisible();
    await expect(page.locator('[data-testid="service-card-drive"]')).toBeVisible();

    // 4. Click "Skip for now"
    await page.locator('[data-testid="skip-onboarding-btn"]').click();

    // 5. Lands in Dashboard normally
    await expect(page).toHaveURL('http://localhost:5173/');
    await expect(page.locator('[data-testid="google-workspace-status-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="status-indicator-calendar"]')).toContainText(
      'Calendar: Not Connected',
    );
  });

  test('User with existing Google integrations skips onboarding directly to Dashboard', async ({
    page,
  }) => {
    // Set state to already connected
    googleIntegrationState = {
      connected: true,
      status: 'CONNECTED',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      services: {
        calendar: true,
        tasks: false,
        drive: false,
      },
    };

    // 1. Visit Login Page and log in
    await page.goto('/login');
    await page.locator('[data-testid="demo-login-btn"]').click();

    // 2. User should skip /onboarding and immediately land on Dashboard
    await expect(page).toHaveURL('http://localhost:5173/');
    await expect(page.locator('[data-testid="google-workspace-status-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="status-indicator-calendar"]')).toContainText(
      'Calendar: Connected',
    );
  });
});
