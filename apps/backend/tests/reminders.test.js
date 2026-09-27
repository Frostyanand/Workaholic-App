import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as eventsRepo from '../src/modules/calendar/events.repository.js';
import * as calendarsRepo from '../src/modules/calendar/calendars.repository.js';
import { remindersService } from '../src/modules/reminders/reminders.service.js';
import { notificationsService } from '../src/modules/notifications/notifications.service.js';
import * as remindersRepo from '../src/modules/reminders/reminders.repository.js';

describe('Reminders Domain & Trigger Engine (Phase 11: NOTIF-T01..NOTIF-T07)', () => {
  let app;
  let user;
  let workspace;
  let sessionToken;
  let calendar;

  beforeAll(async () => {
    app = createApp({ logger: false });

    user = await createUser({
      displayName: 'Reminder Tester',
      email: `reminder_tester_${Date.now()}@example.com`,
    });

    const wsRes = await createWorkspaceWithMembership({
      name: 'Reminder Test Workspace',
      workspaceType: 'PERSONAL',
      ownerUserId: user.id,
    });
    workspace = wsRes.workspace;

    calendar = await calendarsRepo.createCalendar({
      workspaceId: workspace.id,
      name: 'Default Calendar',
      isDefault: true,
      createdBy: user.id,
    });

    const rawToken = `session_token_${Date.now()}`;
    await createSession({
      userId: user.id,
      sessionTokenHash: hashSessionToken(rawToken),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionToken = rawToken;
  });

  afterAll(async () => {
    await query('DELETE FROM reminders WHERE workspace_id = $1', [workspace.id]);
    await query('DELETE FROM tasks WHERE workspace_id = $1', [workspace.id]);
    await query('DELETE FROM events WHERE workspace_id = $1', [workspace.id]);
    await query('DELETE FROM calendars WHERE workspace_id = $1', [workspace.id]);
    await query('DELETE FROM workspaces WHERE id = $1', [workspace.id]);
    await query('DELETE FROM users WHERE id = $1', [user.id]);
  });

  // NOTIF-T01: Create absolute reminder
  it('NOTIF-T01: creates absolute-time reminder with timezone semantics', async () => {
    const triggerAt = new Date(Date.now() + 3600000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-workspace-id': workspace.id,
      },
      payload: {
        triggerType: 'ABSOLUTE_TIME',
        triggerAt,
        priority: 'HIGH',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBeDefined();
    expect(body.data.triggerType).toBe('ABSOLUTE_TIME');
    expect(new Date(body.data.triggerAt).toISOString()).toBe(new Date(triggerAt).toISOString());
    expect(body.data.recipients.length).toBe(1);
    expect(body.data.recipients[0].userId).toBe(user.id);
  });

  // NOTIF-T02: Create event-relative reminder
  it('NOTIF-T02: creates event-relative reminder calculated from event start time', async () => {
    const eventStart = new Date(Date.now() + 7200000); // 2 hours from now
    const event = await eventsRepo.createEvent({
      workspaceId: workspace.id,
      calendarId: calendar.id,
      title: 'Sprint Planning Meeting',
      startAt: eventStart.toISOString(),
      endAt: new Date(eventStart.getTime() + 3600000).toISOString(),
      createdBy: user.id,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-workspace-id': workspace.id,
      },
      payload: {
        eventId: event.id,
        triggerType: 'BEFORE_EVENT',
        relativeOffset: '15 minutes',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.eventId).toBe(event.id);
    expect(body.data.triggerType).toBe('BEFORE_EVENT');

    // Expected trigger: eventStart - 15 minutes
    const expectedTrigger = new Date(eventStart.getTime() - 15 * 60000);
    expect(new Date(body.data.triggerAt).toISOString()).toBe(expectedTrigger.toISOString());
  });

  // NOTIF-T03: Create deadline-relative reminder
  it('NOTIF-T03: creates deadline-relative reminder calculated from task due date', async () => {
    const taskDue = new Date(Date.now() + 86400000); // 1 day from now
    const task = await tasksRepo.createTask({
      workspaceId: workspace.id,
      title: 'Submit DBMS Assignment',
      dueAt: taskDue.toISOString(),
      createdBy: user.id,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-workspace-id': workspace.id,
      },
      payload: {
        taskId: task.id,
        triggerType: 'BEFORE_DEADLINE',
        relativeOffset: '1 hour',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.taskId).toBe(task.id);
    expect(body.data.triggerType).toBe('BEFORE_DEADLINE');

    // Expected trigger: taskDue - 1 hour
    const expectedTrigger = new Date(taskDue.getTime() - 60 * 60000);
    expect(new Date(body.data.triggerAt).toISOString()).toBe(expectedTrigger.toISOString());
  });

  // NOTIF-T04: Reschedule event and verify reminder moves
  it('NOTIF-T04: moves event-relative reminder when event is rescheduled', async () => {
    const originalStart = new Date(Date.now() + 10000000);
    const event = await eventsRepo.createEvent({
      workspaceId: workspace.id,
      calendarId: calendar.id,
      title: 'Architecture Review',
      startAt: originalStart.toISOString(),
      endAt: new Date(originalStart.getTime() + 3600000).toISOString(),
      createdBy: user.id,
    });

    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        eventId: event.id,
        triggerType: 'BEFORE_EVENT',
        relativeOffset: '30 minutes',
      },
      user,
    );

    const initialExpected = new Date(originalStart.getTime() - 30 * 60000);
    expect(new Date(reminder.triggerAt).toISOString()).toBe(initialExpected.toISOString());

    // Reschedule event by moving 2 hours later
    const newStart = new Date(originalStart.getTime() + 7200000);
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/calendar/events/${event.id}`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-workspace-id': workspace.id,
      },
      payload: {
        startAt: newStart.toISOString(),
        endAt: new Date(newStart.getTime() + 3600000).toISOString(),
      },
    });

    expect(updateRes.statusCode).toBe(200);

    // Verify reminder moved
    const updatedReminder = await remindersService.getReminder(reminder.id, workspace.id);
    const newExpected = new Date(newStart.getTime() - 30 * 60000);
    expect(new Date(updatedReminder.triggerAt).toISOString()).toBe(newExpected.toISOString());
  });

  // NOTIF-T05: Complete task and suppress obsolete reminder
  it('NOTIF-T05: suppresses pending deadline reminders when task is completed', async () => {
    const taskDue = new Date(Date.now() + 3600000);
    const task = await tasksRepo.createTask({
      workspaceId: workspace.id,
      title: 'Prepare Tax Documents',
      dueAt: taskDue.toISOString(),
      createdBy: user.id,
    });

    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        taskId: task.id,
        triggerType: 'BEFORE_DEADLINE',
        relativeOffset: '15 minutes',
      },
      user,
    );

    expect(reminder.status).toBe('PENDING');

    // Complete the task
    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/complete`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-workspace-id': workspace.id,
      },
    });

    expect(completeRes.statusCode).toBe(200);

    // Verify reminder is now CANCELLED
    const refreshedReminder = await remindersService.getReminder(reminder.id, workspace.id);
    expect(refreshedReminder.status).toBe('CANCELLED');
  });

  // NOTIF-T06: Snooze reminder without changing underlying task/event
  it('NOTIF-T06: snoozes reminder without modifying the underlying task due date', async () => {
    const originalDue = new Date(Date.now() + 7200000);
    const task = await tasksRepo.createTask({
      workspaceId: workspace.id,
      title: 'Important Deliverable',
      dueAt: originalDue.toISOString(),
      createdBy: user.id,
    });

    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        taskId: task.id,
        triggerType: 'BEFORE_DEADLINE',
        relativeOffset: '30 minutes',
      },
      user,
    );

    // Snooze 45 minutes
    const snoozeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminder.id}/snooze`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        durationMinutes: 45,
      },
    });

    expect(snoozeRes.statusCode).toBe(200);
    const snoozeBody = JSON.parse(snoozeRes.payload);
    expect(snoozeBody.data.recipientStatus).toBe('SNOOZED');
    expect(snoozeBody.data.snoozedUntil).toBeDefined();

    // Verify underlying task due date did NOT change
    const untouchedTask = await tasksRepo.findTaskById(task.id, workspace.id);
    expect(new Date(untouchedTask.dueAt).toISOString()).toBe(originalDue.toISOString());
  });

  // NOTIF-T07: Dismiss one recurring occurrence without disabling future occurrences
  it('NOTIF-T07: dismisses single occurrence of recurring reminder without deleting future recurrence', async () => {
    const initialTime = new Date(Date.now() + 3600000);
    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        triggerType: 'RECURRING_TIME',
        triggerAt: initialTime.toISOString(),
      },
      user,
    );

    const dismissRes = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminder.id}/dismiss`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        dismissAllOccurrences: false,
      },
    });

    expect(dismissRes.statusCode).toBe(200);
    const dismissBody = JSON.parse(dismissRes.payload);
    // Recipient state advanced to next occurrence (still PENDING next trigger)
    expect(dismissBody.data.recipientStatus).toBe('PENDING');
    expect(new Date(dismissBody.data.nextTriggerAt).getTime()).toBeGreaterThan(
      initialTime.getTime(),
    );

    // Dismissing with dismissAllOccurrences: true permanently dismisses the reminder
    const dismissAllRes = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminder.id}/dismiss`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        dismissAllOccurrences: true,
      },
    });
    expect(dismissAllRes.statusCode).toBe(200);
    expect(dismissAllRes.json().data.recipientStatus).toBe('DISMISSED');
  });

  it('NOTIF-T07: background sweep dispatches recurring occurrence and advances nextTriggerAt', async () => {
    const pastTrigger = new Date(Date.now() - 10000);
    const recurringReminder = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        triggerType: 'RECURRING_TIME',
        triggerAt: pastTrigger.toISOString(),
      },
      user,
    );

    // Run sweep
    const processed = await notificationsService.processDueReminders(new Date());
    const matched = processed.find(
      p => p.reminderRecipientId === recurringReminder.recipients[0].id,
    );
    expect(matched).toBeDefined();

    // Verify recipient status remains PENDING and nextTriggerAt was advanced +24h
    const recipientAfter = await remindersRepo.findRecipient(recurringReminder.id, user.id);
    expect(recipientAfter.recipientStatus).toBe('PENDING');
    expect(new Date(recipientAfter.nextTriggerAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('enforces tenant isolation: cannot fetch reminder from another workspace', async () => {
    const otherUser = await createUser({
      displayName: 'Other Workspace User',
      email: `other_ws_${Date.now()}@example.com`,
    });
    const otherWs = await createWorkspaceWithMembership({
      name: 'Other WS',
      ownerUserId: otherUser.id,
    });

    const otherReminder = await remindersService.createReminder(
      {
        workspaceId: otherWs.workspace.id,
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: new Date(Date.now() + 3600000).toISOString(),
      },
      otherUser,
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/reminders/${otherReminder.id}`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-workspace-id': workspace.id,
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
