import * as notificationsRepo from './notifications.repository.js';
import * as remindersRepo from '../reminders/reminders.repository.js';
import * as devicesRepo from '../devices/devices.repository.js';
import * as usersRepo from '../users/users.repository.js';
import * as workspacesRepo from '../workspaces/workspaces.repository.js';
import * as trustedRepo from '../reminders/trusted.repository.js';
import { withTransaction } from '../../core/db.js';
import { getPushTransport } from './fcm.transport.js';
import { NotFoundError, ForbiddenError } from '../../core/errors.js';
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
  DELIVERY_STATUS,
  TRUSTED_PERMISSION,
} from '@workaholic/shared';

export function isWithinQuietHours(currentTime, quietHoursConfig) {
  if (!quietHoursConfig || !quietHoursConfig.enabled) return false;
  const { start, end } = quietHoursConfig;
  if (!start || !end) return false;

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  const now = new Date(currentTime);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Overnight quiet hours, e.g. 22:00 to 07:00
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export class NotificationsService {
  constructor(
    repository = notificationsRepo,
    remindersRepository = remindersRepo,
    devicesRepository = devicesRepo,
    usersRepository = usersRepo,
    workspacesRepository = workspacesRepo,
    trustedRepository = trustedRepo,
    pushTransportGetter = getPushTransport,
  ) {
    this.repo = repository;
    this.remindersRepo = remindersRepository;
    this.devicesRepo = devicesRepository;
    this.usersRepo = usersRepository;
    this.workspaceRepo = workspacesRepository;
    this.trustedRepo = trustedRepository;
    this.getTransport = pushTransportGetter;
  }

  async sendNotification(data, client = undefined) {
    return this.generateNotification(data, client);
  }

  async generateNotification(data, client = undefined) {
    const {
      recipientUserId,
      reminderRecipientId = null,
      notificationType = NOTIFICATION_TYPE.REMINDER,
      title,
      body,
      targetReference = {},
      priority = 'NORMAL',
    } = data;

    // Idempotency: prevent duplicate notification generation for the same reminder recipient
    if (reminderRecipientId) {
      const existing = await this.repo.findNotificationByReminderRecipientId(
        reminderRecipientId,
        client,
      );
      if (existing) {
        return existing;
      }
    }

    // Insert persistent notification record (authoritative In-App Notification Center)
    const notification = await this.repo.createNotification(
      {
        recipientUserId,
        reminderRecipientId,
        notificationType,
        title,
        body,
        targetReference,
      },
      client,
    );

    // 1. In-App delivery record (always immediately delivered into notification center)
    await this.repo.createDelivery(
      {
        notificationId: notification.id,
        deviceId: null,
        channel: NOTIFICATION_CHANNEL.IN_APP,
        status: DELIVERY_STATUS.DELIVERED,
        attemptedAt: new Date(),
        deliveredAt: new Date(),
      },
      client,
    );

    // If called outside an external transaction boundary, dispatch push immediately
    if (!client) {
      const user = await this.usersRepo.findUserById(recipientUserId);
      const userPreferences = user?.preferences?.notifications || {};
      const quietHours = userPreferences.quietHours;
      const isQuiet = isWithinQuietHours(new Date(), quietHours);

      const allowBypass = priority === 'CRITICAL' && quietHours?.allowCritical !== false;
      const shouldDispatchPush = !isQuiet || allowBypass;

      if (shouldDispatchPush) {
        await this.dispatchPushNotification(notification, recipientUserId, priority);
      }
    }

    return notification;
  }

  async dispatchPushNotification(notification, recipientUserId, priority) {
    const devices = await this.devicesRepo.findActivePushDevices(recipientUserId);
    if (!devices || devices.length === 0) return;

    const transport = this.getTransport();
    const tokens = devices.map(d => d.pushToken).filter(Boolean);
    if (tokens.length === 0) return;

    // Create pending delivery records for each device
    const deliveryRecords = [];
    for (const device of devices) {
      const delivery = await this.repo.createDelivery({
        notificationId: notification.id,
        deviceId: device.id,
        channel: NOTIFICATION_CHANNEL.PUSH,
        status: DELIVERY_STATUS.PENDING,
        attemptedAt: new Date(),
      });
      deliveryRecords.push({ delivery, device });
    }

    // Call Push Transport
    try {
      const results = await transport.sendMulticast(tokens, {
        notificationId: notification.id,
        title: notification.title,
        body: notification.body,
        data: {
          notificationId: notification.id,
          entityType: notification.targetReference?.entityType || '',
          entityId: notification.targetReference?.entityId || '',
        },
        priority,
      });

      // Update delivery records and handle token invalidation
      for (const res of results) {
        const item = deliveryRecords.find(d => d.device.pushToken === res.token);
        if (!item) continue;

        if (res.status === 'DELIVERED') {
          await this.repo.updateDelivery(item.delivery.id, {
            status: DELIVERY_STATUS.DELIVERED,
            delivered_at: new Date(),
          });
        } else if (res.status === 'PERMANENT_FAILURE') {
          await this.repo.updateDelivery(item.delivery.id, {
            status: DELIVERY_STATUS.FAILED,
            failure_reason: res.errorMessage || res.errorCode || 'Permanent push failure',
          });
          if (res.shouldInvalidateToken) {
            await this.devicesRepo.invalidatePushToken(res.token);
          }
        } else {
          // Temporary failure - bound retry attempts to maximum 3
          const currentAttempts = item.delivery.attemptCount || 1;
          if (currentAttempts >= 3) {
            await this.repo.updateDelivery(item.delivery.id, {
              status: DELIVERY_STATUS.FAILED,
              failure_reason: `Permanent failure: exceeded maximum retry attempts (${currentAttempts}). Last error: ${res.errorMessage || res.errorCode || 'Transient failure'}`,
              attempt_count: currentAttempts,
            });
          } else {
            await this.repo.updateDelivery(item.delivery.id, {
              status: DELIVERY_STATUS.RETRYING,
              failure_reason: res.errorMessage || res.errorCode || 'Transient failure',
              attempt_count: currentAttempts + 1,
            });
          }
        }
      }
    } catch (err) {
      for (const item of deliveryRecords) {
        const currentAttempts = item.delivery.attemptCount || 1;
        if (currentAttempts >= 3) {
          await this.repo.updateDelivery(item.delivery.id, {
            status: DELIVERY_STATUS.FAILED,
            failure_reason: `Permanent failure: exceeded maximum retry attempts (${currentAttempts}). Error: ${err.message}`,
            attempt_count: currentAttempts,
          });
        } else {
          await this.repo.updateDelivery(item.delivery.id, {
            status: DELIVERY_STATUS.RETRYING,
            failure_reason: err.message,
            attempt_count: currentAttempts + 1,
          });
        }
      }
    }
  }

  async listNotifications(filter, recipientUserId) {
    return this.repo.findNotifications({
      ...filter,
      recipientUserId,
    });
  }

  async markAsRead(id, recipientUserId) {
    const notification = await this.repo.findNotificationById(id);
    if (!notification) {
      throw new NotFoundError(`Notification ${id} not found`);
    }
    if (notification.recipientUserId !== recipientUserId) {
      throw new ForbiddenError('You do not have access to this notification');
    }
    return this.repo.markNotificationRead(id, recipientUserId);
  }

  async markAsDismissed(id, recipientUserId) {
    const notification = await this.repo.findNotificationById(id);
    if (!notification) {
      throw new NotFoundError(`Notification ${id} not found`);
    }
    if (notification.recipientUserId !== recipientUserId) {
      throw new ForbiddenError('You do not have access to this notification');
    }
    return this.repo.markNotificationDismissed(id, recipientUserId);
  }

  async markAllAsRead(recipientUserId) {
    return this.repo.markAllNotificationsRead(recipientUserId);
  }

  async getUnreadCount(recipientUserId) {
    return this.repo.getUnreadCount(recipientUserId);
  }

  async getPreferences(userId) {
    const user = await this.usersRepo.findUserById(userId);
    if (!user) throw new NotFoundError(`User ${userId} not found`);
    return (
      user.preferences?.notifications || {
        channels: { inApp: true, push: true, windowsDesktop: true, androidLocal: true },
        quietHours: { enabled: false, start: '22:00', end: '07:00', allowCritical: true },
      }
    );
  }

  async updatePreferences(userId, newPreferences) {
    const user = await this.usersRepo.findUserById(userId);
    if (!user) throw new NotFoundError(`User ${userId} not found`);

    const currentPreferences = user.preferences || {};
    const merged = {
      ...currentPreferences,
      notifications: {
        ...(currentPreferences.notifications || {}),
        ...newPreferences,
      },
    };

    await this.usersRepo.updateUser(userId, { preferences: merged });
    return merged.notifications;
  }

  // Periodic reminder processor: concurrent-safe, row-locking sweep
  async processDueReminders(currentTime = new Date()) {
    const notificationsToDispatch = [];

    await withTransaction(async txClient => {
      const dueItems = await this.remindersRepo.findDueReminderRecipients(
        currentTime,
        50,
        txClient,
      );

      for (const item of dueItems) {
        // Shared reminder revocation check (Audit H):
        // If recipient is not creator, re-verify active authorization
        if (item.user_id !== item.created_by) {
          const membership = await this.workspaceRepo.findMembership(
            item.workspace_id,
            item.user_id,
            txClient,
          );
          const isMember = membership && membership.status === 'ACTIVE';

          if (!isMember) {
            const hasPermission = await this.trustedRepo.hasTrustedPermission(
              item.user_id,
              item.created_by,
              TRUSTED_PERMISSION.RECEIVE_REMINDERS,
              txClient,
            );

            if (!hasPermission) {
              // Trust revoked: cancel recipient delivery to prevent data leakage
              await this.remindersRepo.cancelRecipient(item.id, txClient);
              continue;
            }
          }
        }

        let title = 'Reminder';
        let body = 'You have a scheduled reminder';

        if (item.task_title) {
          title = `Task Reminder: ${item.task_title}`;
          body = `Your task "${item.task_title}" is due soon.`;
        } else if (item.event_title) {
          title = `Event Reminder: ${item.event_title}`;
          body = `Upcoming calendar event: "${item.event_title}".`;
        }

        const notification = await this.generateNotification(
          {
            recipientUserId: item.user_id,
            reminderRecipientId: item.id,
            notificationType: NOTIFICATION_TYPE.REMINDER,
            title,
            body,
            priority: item.priority || 'NORMAL',
            targetReference: {
              entityType: item.task_id ? 'TASK' : item.event_id ? 'EVENT' : 'REMINDER',
              entityId: item.task_id || item.event_id || item.reminder_id,
              workspaceId: item.workspace_id,
            },
          },
          txClient,
        );

        // Recurring trigger advancement (Audit C)
        if (item.trigger_type === 'RECURRING_TIME' || item.trigger_type === 'RECURRING') {
          const nextTrigger = new Date(new Date(item.next_trigger_at).getTime() + 86400000);
          await this.remindersRepo.advanceRecipientRecurrence(item.id, nextTrigger, txClient);
        } else {
          await this.remindersRepo.markRecipientDelivered(item.id, txClient);
        }

        notificationsToDispatch.push({
          notification,
          recipientUserId: item.user_id,
          priority: item.priority || 'NORMAL',
        });
      }
    });

    // Outside transaction boundary: evaluate quiet hours and push delivery
    const processed = [];
    for (const item of notificationsToDispatch) {
      const user = await this.usersRepo.findUserById(item.recipientUserId);
      const userPreferences = user?.preferences?.notifications || {};
      const quietHours = userPreferences.quietHours;
      const isQuiet = isWithinQuietHours(new Date(), quietHours);

      const allowBypass = item.priority === 'CRITICAL' && quietHours?.allowCritical !== false;
      const shouldDispatchPush = !isQuiet || allowBypass;

      if (shouldDispatchPush) {
        await this.dispatchPushNotification(item.notification, item.recipientUserId, item.priority);
      }
      processed.push(item.notification);
    }

    return processed;
  }
}

export const notificationsService = new NotificationsService();
