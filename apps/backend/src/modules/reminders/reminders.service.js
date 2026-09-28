import * as remindersRepo from './reminders.repository.js';
import * as trustedRepo from './trusted.repository.js';
import * as tasksRepo from '../tasks/tasks.repository.js';
import * as eventsRepo from '../calendar/events.repository.js';
import * as workspaceRepo from '../workspaces/workspaces.repository.js';
import { enqueueJob } from '../../core/jobs.repository.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../core/errors.js';
import { REMINDER_TRIGGER_TYPE, REMINDER_STATUS, TRUSTED_PERMISSION } from '@workaholic/shared';

export function parseOffsetToMs(offset) {
  if (!offset) return 0;
  if (typeof offset === 'number') return offset;
  if (typeof offset === 'object') {
    let ms = 0;
    if (offset.days) ms += offset.days * 86400000;
    if (offset.hours) ms += offset.hours * 3600000;
    if (offset.minutes) ms += offset.minutes * 60000;
    if (offset.seconds) ms += offset.seconds * 1000;
    if (offset.milliseconds) ms += offset.milliseconds;
    return ms;
  }
  const str = String(offset).trim().toLowerCase();
  const match = str.match(/^(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = match[2] || 'm';
    if (unit.startsWith('d')) return val * 86400000;
    if (unit.startsWith('h')) return val * 3600000;
    return val * 60000;
  }
  return 0;
}

export function computeRelativeTriggerAt(anchorDate, offset) {
  const date = new Date(anchorDate);
  if (isNaN(date.getTime())) return null;
  const ms = parseOffsetToMs(offset);
  return new Date(date.getTime() - ms);
}

export class RemindersService {
  constructor(
    repository = remindersRepo,
    trustedRepository = trustedRepo,
    tasksRepository = tasksRepo,
    eventsRepository = eventsRepo,
    workspaceRepository = workspaceRepo,
  ) {
    this.repo = repository;
    this.trustedRepo = trustedRepository;
    this.tasksRepo = tasksRepository;
    this.eventsRepo = eventsRepository;
    this.workspaceRepo = workspaceRepository;
  }

  async createReminder(reminderData, requestingUser) {
    const {
      workspaceId,
      taskId = null,
      eventId = null,
      bookingId = null,
      triggerType,
      triggerAt: rawTriggerAt = null,
      relativeOffset = null,
      priority = 'NORMAL',
      recipientUserIds = [],
    } = reminderData;

    let computedTriggerAt = rawTriggerAt ? new Date(rawTriggerAt) : null;

    // Validate and evaluate relative triggers against source domain entities
    if (
      triggerType === REMINDER_TRIGGER_TYPE.BEFORE_DEADLINE ||
      triggerType === 'RELATIVE_TASK_DUE'
    ) {
      if (!taskId) {
        throw new ValidationError('taskId is required for BEFORE_DEADLINE reminder');
      }
      const task = await this.tasksRepo.findTaskById(taskId, workspaceId);
      if (!task) {
        throw new NotFoundError(`Task ${taskId} not found`);
      }
      if (!task.dueAt) {
        throw new ValidationError(
          'Task must have a dueAt to schedule a deadline-relative reminder',
        );
      }
      computedTriggerAt = computeRelativeTriggerAt(task.dueAt, relativeOffset);
    } else if (
      triggerType === REMINDER_TRIGGER_TYPE.BEFORE_EVENT ||
      triggerType === 'RELATIVE_EVENT_START'
    ) {
      if (!eventId) {
        throw new ValidationError('eventId is required for BEFORE_EVENT reminder');
      }
      const event = await this.eventsRepo.findEventById(eventId, workspaceId);
      if (!event) {
        throw new NotFoundError(`Event ${eventId} not found`);
      }
      computedTriggerAt = computeRelativeTriggerAt(event.startAt, relativeOffset);
    }

    if (!computedTriggerAt) {
      throw new ValidationError('Could not calculate reminder trigger time');
    }

    // Insert master reminder record
    const reminder = await this.repo.createReminder({
      workspaceId,
      taskId,
      eventId,
      bookingId,
      triggerType,
      triggerAt: computedTriggerAt,
      relativeOffset,
      priority,
      status: REMINDER_STATUS.PENDING,
      createdBy: requestingUser.id,
    });

    // Add creator as primary recipient
    const allRecipients = new Set([requestingUser.id]);

    // Validate additional shared recipients
    for (const recipientId of recipientUserIds) {
      if (recipientId === requestingUser.id) continue;

      // Check 1: Is recipient in the same workspace?
      const membership = await this.workspaceRepo.findMembership(workspaceId, recipientId);
      if (membership && membership.status === 'ACTIVE') {
        allRecipients.add(recipientId);
        continue;
      }

      // Check 2: Cross-workspace recipient requires trusted relationship with permission
      const hasPermission = await this.trustedRepo.hasTrustedPermission(
        recipientId,
        requestingUser.id,
        TRUSTED_PERMISSION.RECEIVE_REMINDERS,
      );

      if (hasPermission) {
        allRecipients.add(recipientId);
      } else {
        throw new ForbiddenError(
          `User ${recipientId} is not a member of this workspace and has not granted permission to receive reminders`,
        );
      }
    }

    // Create recipient records
    const createdRecipients = [];
    for (const userId of allRecipients) {
      const recipient = await this.repo.createReminderRecipient(
        reminder.id,
        userId,
        computedTriggerAt,
      );
      createdRecipients.push(recipient);
    }

    reminder.recipients = createdRecipients;

    // Enqueue transactional dispatch job
    try {
      await enqueueJob({
        jobType: 'REMINDER_DISPATCH',
        payload: { reminderId: reminder.id },
        runAt: computedTriggerAt,
      });
    } catch {
      // Background job enqueue failure is non-fatal if table/queue is available via scheduler
    }

    return reminder;
  }

  async getReminder(id, workspaceId) {
    const reminder = await this.repo.findReminderById(id, workspaceId);
    if (!reminder) {
      throw new NotFoundError(`Reminder ${id} not found`);
    }
    return reminder;
  }

  async listReminders(filter) {
    return this.repo.findReminders(filter);
  }

  async updateReminder(id, updates, workspaceId) {
    const existing = await this.getReminder(id, workspaceId);
    let newTriggerAt = updates.triggerAt ? new Date(updates.triggerAt) : existing.triggerAt;

    if (updates.relativeOffset && existing.taskId) {
      const task = await this.tasksRepo.findTaskById(existing.taskId, workspaceId);
      if (task?.dueAt) {
        newTriggerAt = computeRelativeTriggerAt(task.dueAt, updates.relativeOffset);
      }
    } else if (updates.relativeOffset && existing.eventId) {
      const event = await this.eventsRepo.findEventById(existing.eventId, workspaceId);
      if (event?.startAt) {
        newTriggerAt = computeRelativeTriggerAt(event.startAt, updates.relativeOffset);
      }
    }

    const updated = await this.repo.updateReminder(id, {
      ...updates,
      triggerAt: newTriggerAt,
    });

    return updated;
  }

  async deleteReminder(id, workspaceId) {
    await this.getReminder(id, workspaceId);
    return this.repo.deleteReminder(id, workspaceId);
  }

  async snoozeReminder(id, userId, { durationMinutes, snoozeUntil }) {
    const recipient = await this.repo.findRecipient(id, userId);
    if (!recipient) {
      throw new NotFoundError(
        `No reminder recipient record found for user ${userId} on reminder ${id}`,
      );
    }

    let calculatedSnoozeUntil = null;
    if (snoozeUntil) {
      calculatedSnoozeUntil = new Date(snoozeUntil);
    } else if (durationMinutes) {
      calculatedSnoozeUntil = new Date(Date.now() + durationMinutes * 60000);
    }

    if (!calculatedSnoozeUntil || isNaN(calculatedSnoozeUntil.getTime())) {
      throw new ValidationError('Invalid snooze duration or timestamp');
    }

    // Snoozing updates only this recipient's scheduling state
    const updatedRecipient = await this.repo.snoozeRecipient(id, userId, calculatedSnoozeUntil);

    // Enqueue dispatch for the snoozed occurrence
    try {
      await enqueueJob({
        jobType: 'REMINDER_DISPATCH',
        payload: { reminderId: id, recipientUserId: userId },
        runAt: calculatedSnoozeUntil,
      });
    } catch {
      // Ignore queue error in test/uninitialized states
    }

    return updatedRecipient;
  }

  async dismissReminder(id, userId, { dismissAllOccurrences = false } = {}) {
    const recipient = await this.repo.findRecipient(id, userId);
    if (!recipient) {
      throw new NotFoundError(
        `No reminder recipient record found for user ${userId} on reminder ${id}`,
      );
    }

    const reminder = await this.repo.findReminderById(id);

    // If recurring and not dismissing all occurrences, calculate next recurrence trigger
    if (
      reminder &&
      reminder.triggerType === REMINDER_TRIGGER_TYPE.RECURRING_TIME &&
      !dismissAllOccurrences
    ) {
      // Advance next trigger by 1 day or recurrence interval
      const nextTrigger = new Date(new Date(recipient.nextTriggerAt).getTime() + 86400000);
      return this.repo.createReminderRecipient(id, userId, nextTrigger);
    }

    return this.repo.dismissRecipient(id, userId);
  }

  async addRecipient(id, newRecipientUserId, requestingUser, workspaceId) {
    const reminder = await this.getReminder(id, workspaceId);

    // Creator check
    if (reminder.createdBy !== requestingUser.id) {
      const membership = await this.workspaceRepo.findMembership(workspaceId, requestingUser.id);
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        throw new ForbiddenError(
          'Only the reminder creator or workspace admins can add recipients',
        );
      }
    }

    // Verify recipient permissions
    const membership = await this.workspaceRepo.findMembership(workspaceId, newRecipientUserId);
    if (!membership || membership.status !== 'ACTIVE') {
      const hasPermission =
        (await this.trustedRepo.hasTrustedPermission(
          requestingUser.id,
          newRecipientUserId,
          TRUSTED_PERMISSION.RECEIVE_REMINDERS,
        )) ||
        (await this.trustedRepo.hasTrustedPermission(
          newRecipientUserId,
          requestingUser.id,
          TRUSTED_PERMISSION.RECEIVE_REMINDERS,
        ));

      if (!hasPermission) {
        throw new ForbiddenError(
          'Recipient has not granted or received permission to receive shared reminders',
        );
      }
    }

    return this.repo.createReminderRecipient(id, newRecipientUserId, reminder.triggerAt);
  }

  async removeRecipient(id, targetUserId, requestingUser, workspaceId) {
    const reminder = await this.getReminder(id, workspaceId);
    if (reminder.createdBy !== requestingUser.id && targetUserId !== requestingUser.id) {
      throw new ForbiddenError(
        'Cannot remove other recipients unless you are the reminder creator',
      );
    }
    return this.repo.removeRecipient(id, targetUserId);
  }

  async listRecipients(id, requestingUser, workspaceId) {
    await this.getReminder(id, workspaceId);
    return this.repo.findRecipientsByReminderId(id);
  }

  // Hook for task completion
  async onTaskCompleted(taskId) {
    return this.repo.suppressRemindersForTask(taskId);
  }

  // Hook for task reschedule
  async onTaskRescheduled(taskId, newDueAt) {
    if (!newDueAt) return;
    const reminders = await this.repo.findReminders({ taskId });
    for (const r of reminders) {
      if (
        r.triggerType === REMINDER_TRIGGER_TYPE.BEFORE_DEADLINE ||
        r.triggerType === 'RELATIVE_TASK_DUE'
      ) {
        const newTrigger = computeRelativeTriggerAt(newDueAt, r.relativeOffset);
        if (newTrigger) {
          await this.repo.updateReminder(r.id, { triggerAt: newTrigger });
          for (const recipient of r.recipients || []) {
            if (recipient.recipientStatus === 'PENDING') {
              await this.repo.createReminderRecipient(r.id, recipient.userId, newTrigger);
            }
          }
        }
      }
    }
  }

  // Hook for event reschedule
  async onEventRescheduled(eventId, newStartAt) {
    if (!newStartAt) return;
    const reminders = await this.repo.findReminders({ eventId });
    for (const r of reminders) {
      if (
        r.triggerType === REMINDER_TRIGGER_TYPE.BEFORE_EVENT ||
        r.triggerType === 'RELATIVE_EVENT_START'
      ) {
        const newTrigger = computeRelativeTriggerAt(newStartAt, r.relativeOffset);
        if (newTrigger) {
          await this.repo.updateReminder(r.id, { triggerAt: newTrigger });
          for (const recipient of r.recipients || []) {
            if (recipient.recipientStatus === 'PENDING') {
              await this.repo.createReminderRecipient(r.id, recipient.userId, newTrigger);
            }
          }
        }
      }
    }
  }

  // Hook for event cancellation
  async onEventCancelled(eventId) {
    return this.repo.suppressRemindersForEvent(eventId);
  }
}

export const remindersService = new RemindersService();
