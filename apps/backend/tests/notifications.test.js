import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { notificationsService } from '../src/modules/notifications/notifications.service.js';
import { remindersService } from '../src/modules/reminders/reminders.service.js';
import * as notificationsRepo from '../src/modules/notifications/notifications.repository.js';
import * as devicesRepo from '../src/modules/devices/devices.repository.js';
import { setPushTransport, MockPushTransport } from '../src/modules/notifications/fcm.transport.js';
import { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL, DELIVERY_STATUS } from '@workaholic/shared';

describe('Notifications Domain & Delivery Engine (Phase 11: NOTIF-T08..T11, NOTIF-T15..T21)', () => {
  let app;
  let userA;
  let userB;
  let workspace;
  let sessionTokenA;
  let _sessionTokenB;
  let mockTransport;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // User A
    userA = await createUser({
      displayName: 'Notification User A',
      email: `notif_user_a_${Date.now()}@example.com`,
    });

    const wsRes = await createWorkspaceWithMembership({
      name: 'Notif Test Workspace',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspace = wsRes.workspace;

    const rawTokenA = `session_notif_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    // User B (for tenant / recipient isolation tests)
    userB = await createUser({
      displayName: 'Notification User B',
      email: `notif_user_b_${Date.now()}@example.com`,
    });

    const rawTokenB = `session_notif_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    _sessionTokenB = rawTokenB;
  });

  beforeEach(() => {
    mockTransport = new MockPushTransport();
    setPushTransport(mockTransport);
  });

  afterAll(async () => {
    await query(
      'DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE recipient_user_id IN ($1, $2))',
      [userA.id, userB.id],
    );
    await query('DELETE FROM notifications WHERE recipient_user_id IN ($1, $2)', [
      userA.id,
      userB.id,
    ]);
    await query('DELETE FROM reminder_recipients WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
    await query('DELETE FROM reminders WHERE workspace_id = $1', [workspace.id]);
    await query('DELETE FROM devices WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
    await query('DELETE FROM workspaces WHERE id = $1', [workspace.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
  });

  // NOTIF-T08 & NOTIF-T16: Notification generation and delivery records
  it('NOTIF-T08 & NOTIF-T16: generates in-app notification with delivery tracking', async () => {
    // Register a push device for User A
    const device = await devicesRepo.registerPushDevice({
      userId: userA.id,
      platform: 'WEB',
      pushToken: 'push_token_user_a_1',
      deviceName: 'Chrome Web',
    });

    const notif = await notificationsService.generateNotification({
      recipientUserId: userA.id,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'Task Due: Finish Report',
      body: 'Report deadline is approaching in 15 minutes',
      priority: 'NORMAL',
      targetReference: { entityType: 'TASK', entityId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
    });

    expect(notif.id).toBeDefined();
    expect(notif.recipientUserId).toBe(userA.id);
    expect(notif.title).toBe('Task Due: Finish Report');

    // Verify delivery records in database
    const deliveries = await notificationsRepo.findDeliveriesByNotificationId(notif.id);
    expect(deliveries.length).toBeGreaterThanOrEqual(2);

    const inAppDelivery = deliveries.find(d => d.channel === NOTIFICATION_CHANNEL.IN_APP);
    expect(inAppDelivery).toBeDefined();
    expect(inAppDelivery.status).toBe(DELIVERY_STATUS.DELIVERED);

    const pushDelivery = deliveries.find(d => d.channel === NOTIFICATION_CHANNEL.PUSH);
    expect(pushDelivery).toBeDefined();
    expect(pushDelivery.deviceId).toBe(device.id);
    expect(pushDelivery.status).toBe(DELIVERY_STATUS.DELIVERED);

    // Verify mock transport received payload
    expect(mockTransport.sentMessages).toHaveLength(1);
    expect(mockTransport.sentMessages[0].token).toBe('push_token_user_a_1');
  });

  // NOTIF-T09: State transitions, unread badge, and read-all
  it('NOTIF-T09: manages read, unread count, and dismissal state transitions', async () => {
    // Check initial unread count
    const initialCountRes = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(initialCountRes.statusCode).toBe(200);
    const countBefore = initialCountRes.json().data.count;

    // Create a new unread notification
    const n = await notificationsService.generateNotification({
      recipientUserId: userA.id,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'State Transition Test',
      body: 'Will mark read and dismissed',
    });

    const countAfterRes = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(countAfterRes.json().data.count).toBe(countBefore + 1);

    // Mark single notification read
    const readRes = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${n.id}/read`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().data.readAt).not.toBeNull();

    // Dismiss notification
    const dismissRes = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${n.id}/dismiss`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(dismissRes.statusCode).toBe(200);
    expect(dismissRes.json().data.dismissedAt).not.toBeNull();

    // Mark all read endpoint
    const markAllRes = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(markAllRes.statusCode).toBe(200);
  });

  // NOTIF-T10: Quiet hours suppression of non-critical push notifications
  it('NOTIF-T10: suppresses non-critical push notifications during active quiet hours', async () => {
    // Configure quiet hours covering all 24 hours (00:00 to 23:59)
    await notificationsService.updatePreferences(userA.id, {
      quietHours: {
        enabled: true,
        start: '00:00',
        end: '23:59',
        allowCritical: true,
      },
    });

    mockTransport.reset();

    const notif = await notificationsService.generateNotification({
      recipientUserId: userA.id,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'Quiet Notification',
      body: 'Should not ring during quiet hours',
      priority: 'NORMAL',
    });

    // In-app is still recorded
    expect(notif.id).toBeDefined();

    // Push transport was NOT called because quiet hours suppressed it
    expect(mockTransport.sentMessages).toHaveLength(0);
  });

  // NOTIF-T11: Critical notifications bypass quiet hours
  it('NOTIF-T11: critical notifications bypass quiet hours', async () => {
    // Quiet hours are still active (00:00 to 23:59 with allowCritical: true)
    mockTransport.reset();

    const notif = await notificationsService.generateNotification({
      recipientUserId: userA.id,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'CRITICAL Emergency Alert',
      body: 'Server down: immediate intervention required',
      priority: 'CRITICAL',
    });

    expect(notif.id).toBeDefined();

    // Push transport was called despite quiet hours
    expect(mockTransport.sentMessages).toHaveLength(1);
    expect(mockTransport.sentMessages[0].payload.priority).toBe('CRITICAL');
  });

  // NOTIF-T15: Duplicate prevention / idempotency
  it('NOTIF-T15: prevents duplicate notification generation for same reminder recipient', async () => {
    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: new Date(Date.now() + 600000).toISOString(),
        title: 'Idempotency Test Reminder',
      },
      userA,
    );

    const reminderRecipientId = reminder.recipients[0].id;

    const first = await notificationsService.generateNotification({
      recipientUserId: userA.id,
      reminderRecipientId,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'Unique Reminder',
      body: 'First invocation',
    });

    const second = await notificationsService.generateNotification({
      recipientUserId: userA.id,
      reminderRecipientId,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'Unique Reminder',
      body: 'Second duplicate invocation',
    });

    expect(first.id).toBe(second.id);
  });

  // NOTIF-T17 & NOTIF-T18: Bounded retry on transient failure & permanent failure handling
  it('NOTIF-T17 & NOTIF-T18: handles transient retries and permanent device token invalidation', async () => {
    // Register test devices for transient and permanent failure cases
    const deviceTemp = await devicesRepo.registerPushDevice({
      userId: userB.id,
      platform: 'ANDROID',
      pushToken: 'push_token_transient_error',
      deviceName: 'Pixel 8',
    });

    const deviceDead = await devicesRepo.registerPushDevice({
      userId: userB.id,
      platform: 'ANDROID',
      pushToken: 'push_token_permanent_error',
      deviceName: 'Old Phone',
    });

    mockTransport.setTokenBehavior('push_token_transient_error', {
      status: 'TEMPORARY_FAILURE',
      errorCode: 'messaging/server-unavailable',
      errorMessage: 'Backend timeout',
    });

    mockTransport.setTokenBehavior('push_token_permanent_error', {
      status: 'PERMANENT_FAILURE',
      errorCode: 'messaging/registration-token-not-registered',
      errorMessage: 'Token expired',
    });

    const notif = await notificationsService.generateNotification({
      recipientUserId: userB.id,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'Transport Failure Test',
      body: 'Testing retry & deactivation',
      priority: 'NORMAL',
    });

    const deliveries = await notificationsRepo.findDeliveriesByNotificationId(notif.id);

    const tempDelivery = deliveries.find(d => d.deviceId === deviceTemp.id);
    expect(tempDelivery).toBeDefined();
    expect(tempDelivery.status).toBe(DELIVERY_STATUS.RETRYING);
    expect(tempDelivery.failureReason).toContain('Backend timeout');

    const deadDelivery = deliveries.find(d => d.deviceId === deviceDead.id);
    expect(deadDelivery).toBeDefined();
    expect(deadDelivery.status).toBe(DELIVERY_STATUS.FAILED);
    expect(deadDelivery.failureReason).toContain('Token expired');

    // Check that dead device token was invalidated
    const refreshedDeadDevice = await devicesRepo.findDeviceById(deviceDead.id);
    expect(refreshedDeadDevice.pushToken).toBeNull();
  });

  // NOTIF-T20: Recipient isolation / Tenant security
  it('NOTIF-T20: enforces recipient isolation — user cannot read or dismiss another users notification', async () => {
    const notifB = await notificationsService.generateNotification({
      recipientUserId: userB.id,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'Private to User B',
      body: 'Classified data',
    });

    // User A attempts to mark User B's notification read
    const breachRead = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${notifB.id}/read`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(breachRead.statusCode).toBe(403);

    // User A attempts to dismiss User B's notification
    const breachDismiss = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${notifB.id}/dismiss`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(breachDismiss.statusCode).toBe(403);
  });

  // NOTIF-T21: Push token registration and preferences endpoints
  it('NOTIF-T21: device registration, update, deletion, and notification preferences API endpoints', async () => {
    // 1. Authoritative Device Registration: POST /devices
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/devices',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
      payload: {
        platform: 'WINDOWS',
        token: 'desktop_fcm_token_authoritative_1',
        deviceName: 'Workstation ThinkPad',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const createdDevice = regRes.json().data;
    expect(createdDevice.platform).toBe('WINDOWS');
    expect(createdDevice.deviceName).toBe('Workstation ThinkPad');

    // 2. Update Device: PATCH /devices/{id}
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${createdDevice.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
      payload: {
        deviceName: 'Workstation ThinkPad P1',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.deviceName).toBe('Workstation ThinkPad P1');

    // 3. List Devices: GET /devices
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/devices',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.some(d => d.id === createdDevice.id)).toBe(true);

    // 4. Delete Device: DELETE /devices/{id}
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/devices/${createdDevice.id}`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data.deleted).toBe(true);

    // 5. Authoritative Preferences PATCH: PATCH /notification-preferences
    const prefRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notification-preferences',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
      payload: {
        channels: {
          push: true,
          inApp: true,
          windowsDesktop: true,
        },
        quietHours: {
          enabled: true,
          start: '23:00',
          end: '06:00',
          allowCritical: true,
        },
      },
    });
    expect(prefRes.statusCode).toBe(200);
    expect(prefRes.json().data.quietHours.start).toBe('23:00');
    expect(prefRes.json().data.quietHours.enabled).toBe(true);

    // 6. Authoritative Preferences GET: GET /notification-preferences
    const getPrefRes = await app.inject({
      method: 'GET',
      url: '/api/v1/notification-preferences',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
    });
    expect(getPrefRes.statusCode).toBe(200);
    expect(getPrefRes.json().data.quietHours.start).toBe('23:00');
  });

  // NOTIF-T19 & NOTIF-T20: Bounded retries stop after max attempts
  it('NOTIF-T19 & NOTIF-T20: bounded retry stops retrying after maximum 3 attempts and marks FAILED', async () => {
    const retryDevice = await devicesRepo.registerPushDevice({
      userId: userA.id,
      platform: 'WEB',
      pushToken: 'push_token_bounded_retry',
      deviceName: 'Flaky Browser',
    });

    mockTransport.setTokenBehavior('push_token_bounded_retry', {
      status: 'TEMPORARY_FAILURE',
      errorCode: 'messaging/server-unavailable',
      errorMessage: 'Flaky network',
    });

    const notif = await notificationsRepo.createNotification({
      recipientUserId: userA.id,
      notificationType: NOTIFICATION_TYPE.REMINDER,
      title: 'Bounded Retry Test',
      body: 'Will test 3 attempts',
    });

    // Create delivery record that already had 3 attempts
    const existingDelivery = await notificationsRepo.createDelivery({
      notificationId: notif.id,
      deviceId: retryDevice.id,
      channel: NOTIFICATION_CHANNEL.PUSH,
      status: DELIVERY_STATUS.RETRYING,
      attemptedAt: new Date(),
    });
    await notificationsRepo.updateDelivery(existingDelivery.id, { attempt_count: 3 });

    // Dispatch again
    await notificationsService.dispatchPushNotification(notif, userA.id, 'NORMAL');

    const deliveries = await notificationsRepo.findDeliveriesByNotificationId(notif.id);
    const pushDel = deliveries.find(d => d.deviceId === retryDevice.id);
    expect(pushDel).toBeDefined();
    // Exceeded max attempts -> marked FAILED
    expect(pushDel.status).toBe(DELIVERY_STATUS.FAILED);
    expect(pushDel.failureReason).toContain('exceeded maximum retry attempts');
  });
});
