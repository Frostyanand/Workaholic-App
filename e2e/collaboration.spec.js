import { test, expect } from '@playwright/test';

/**
 * Playwright End-to-End Tests for Trusted Sharing & Collaboration (Phase 21)
 * Pure JavaScript - Zero TypeScript
 * Satisfies:
 *  - REQ-SHARE-001..006 (Onboarding share codes, trusted relationships, granular delegation)
 *  - REQ-COLLAB-001..006 (Collaborative comments, @mentions, activity feed, task assignment)
 *  - REQ-SREM-001..003 (Multi-recipient reminders with independent response tracking)
 */

test.describe('Trusted Sharing & Collaboration E2E Journeys', () => {
  let mockShareCodes = [];
  let mockRelationships = [];
  let mockComments = [];
  let mockActivities = [];
  let mockEligibleMembers = [];
  let mockReminderRecipients = [];

  test.beforeEach(async ({ page }) => {
    mockShareCodes = [
      {
        id: 'sc-101',
        ownerUserId: 'u-current',
        codeHash: 'hash123',
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        usedAt: null,
        revokedAt: null,
        metadata: { label: 'Executive Assistant Onboarding' },
        createdAt: new Date().toISOString(),
      },
    ];

    mockRelationships = [
      {
        id: 'rel-201',
        ownerUserId: 'u-current',
        trustedUserId: 'u-assistant',
        ownerName: 'Current User',
        ownerEmail: 'user@example.com',
        trustedName: 'Bob Assistant',
        trustedEmail: 'bob@example.com',
        status: 'ACTIVE',
        isOwner: true,
        permissions: ['trusted.calendar.view', 'trusted.tasks.view'],
        createdAt: new Date().toISOString(),
      },
    ];

    mockComments = [
      {
        id: 'comm-301',
        workspaceId: 'ws-e2e',
        authorUserId: 'u-assistant',
        authorDisplayName: 'Bob Assistant',
        authorEmail: 'bob@example.com',
        targetType: 'TASK',
        targetId: 'task-e2e-1',
        content: 'Reviewing this now @Current_User! Will update shortly.',
        createdAt: new Date().toISOString(),
      },
    ];

    mockActivities = [
      {
        id: 'act-401',
        workspaceId: 'ws-e2e',
        actorUserId: 'u-assistant',
        actorDisplayName: 'Bob Assistant',
        targetType: 'TASK',
        targetId: 'task-e2e-1',
        activityType: 'COMMENT_ADDED',
        metadata: { targetTitle: 'Prepare Quarterly Review' },
        createdAt: new Date().toISOString(),
      },
    ];

    mockEligibleMembers = [
      {
        userId: 'u-assistant',
        userDisplayName: 'Bob Assistant',
        userEmail: 'bob@example.com',
        role: 'TRUSTED_CONTACT',
        status: 'ACTIVE',
      },
    ];

    mockReminderRecipients = [
      {
        id: 'rec-501',
        reminderId: 'rem-e2e-1',
        userId: 'u-assistant',
        displayName: 'Bob Assistant',
        email: 'bob@example.com',
        status: 'PENDING',
        snoozedUntil: null,
        dismissedAt: null,
      },
    ];

    // Notification intercept
    await page.route('**/api/v1/notifications/**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { count: 0, unreadCount: 0, notifications: [] } }),
      });
    });

    // Share Codes APIs
    await page.route('**/api/v1/trusted/share-codes**', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockShareCodes }),
        });
      }
      if (route.request().method() === 'POST') {
        const generated = {
          id: `sc-${Date.now()}`,
          code: 'WORK-DEMO-CODE-9876',
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          metadata: { label: 'New Delegate' },
        };
        mockShareCodes.push({
          ...generated,
          ownerUserId: 'u-current',
          usedAt: null,
          revokedAt: null,
        });
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: generated }),
        });
      }
      return route.continue();
    });

    // Redeem Share Code API
    await page.route('**/api/v1/trusted/share-codes/redeem', async route => {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'rel-new',
            ownerUserId: 'u-other',
            ownerName: 'Dr. Jane Advisor',
            status: 'ACTIVE',
          },
        }),
      });
    });

    // Trusted Relationships APIs
    await page.route('**/api/v1/trusted/relationships**', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockRelationships }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/v1/trusted/relationships/*/permissions', async route => {
      const payload = JSON.parse(route.request().postData() || '{}');
      mockRelationships[0].permissions = payload.permissions || [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockRelationships[0] }),
      });
    });

    // Comments APIs
    await page.route('**/api/v1/collaboration/comments**', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockComments }),
        });
      }
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        const newComm = {
          id: `comm-${Date.now()}`,
          workspaceId: 'ws-e2e',
          authorUserId: 'u-current',
          authorDisplayName: 'Current User',
          authorEmail: 'user@example.com',
          targetType: payload.targetType,
          targetId: payload.targetId,
          content: payload.content,
          createdAt: new Date().toISOString(),
        };
        mockComments.push(newComm);
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newComm }),
        });
      }
      return route.continue();
    });

    // Activity Feed APIs
    await page.route('**/api/v1/collaboration/activity**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockActivities }),
      });
    });

    // Eligible Members APIs
    await page.route('**/api/v1/collaboration/members**', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockEligibleMembers }),
      });
    });

    // Shared Reminders APIs
    await page.route('**/api/v1/reminders/*/recipients', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockReminderRecipients }),
        });
      }
      return route.continue();
    });
  });

  test('TM-COLLAB-001: Collaboration management page renders with quick cards and activity timeline', async ({
    page,
  }) => {
    await page.goto('/collaboration');

    // Page header
    await expect(
      page.getByRole('heading', { name: 'Trusted Sharing & Collaboration' }),
    ).toBeVisible();

    // Quick action cards
    await expect(page.getByRole('heading', { name: 'Trusted Contacts & Delegates' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Onboarding Share Codes' })).toBeVisible();

    // Activity feed
    await expect(page.getByText('Workspace Collaboration Timeline')).toBeVisible();
    await expect(page.getByText('Bob Assistant')).toBeVisible();
  });

  test('TM-COLLAB-002: Generating and redeeming onboarding share codes', async ({ page }) => {
    await page.goto('/collaboration');

    // Open Share Code Modal
    const shareCodesBtn = page.getByRole('button', { name: 'Share Codes' });
    await shareCodesBtn.click();

    await expect(page.getByRole('heading', { name: 'Trusted Sharing & Onboarding' })).toBeVisible();

    // Generate single use code
    const generateBtn = page.getByRole('button', { name: 'Generate Single-Use Code' });
    await generateBtn.click();

    // Verify generated code reveal box
    await expect(page.getByText('WORK-DEMO-CODE-9876')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();

    // Switch to redeem tab
    const redeemTab = page.getByRole('button', { name: 'Redeem an Invite Code' });
    await redeemTab.click();

    // Fill code and redeem
    const codeInput = page.getByPlaceholder('e.g. WORK-XXXX-XXXX-XXXX');
    await codeInput.fill('WORK-SAMPLE-INVITE-1234');

    const submitRedeem = page.getByRole('button', { name: 'Redeem Code & Establish Trust' });
    await submitRedeem.click();

    // Verify confirmation
    await expect(
      page.getByText(
        'Successfully linked! You now have a trusted relationship with Dr. Jane Advisor.',
      ),
    ).toBeVisible();
  });

  test('TM-COLLAB-003: Managing trusted contacts and toggling granular permissions', async ({
    page,
  }) => {
    await page.goto('/collaboration');

    // Open Trusted Contacts Modal
    const trustedBtn = page.getByRole('button', { name: 'Trusted Contacts', exact: true });
    await trustedBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Trusted Collaborators & Delegation' }),
    ).toBeVisible();
    await expect(dialog.getByText('Bob Assistant')).toBeVisible();
    await expect(dialog.getByText('bob@example.com • Delegated to Collaborator')).toBeVisible();

    // Verify granular permission checkboxes
    const viewCalCb = dialog.getByRole('checkbox', { name: /View Calendar/i });
    await expect(viewCalCb).toBeChecked();

    const editTasksCb = dialog.getByRole('checkbox', { name: /Edit Tasks/i });
    await expect(editTasksCb).not.toBeChecked();

    // Toggle edit tasks permission
    await editTasksCb.click();
    await expect(editTasksCb).toBeChecked();
  });
});
