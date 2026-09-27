import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query } from '../src/core/db.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { remindersService } from '../src/modules/reminders/reminders.service.js';
import * as remindersRepo from '../src/modules/reminders/reminders.repository.js';
import { runReminderSweep } from '../src/modules/notifications/reminder-dispatcher.js';
import { setPushTransport, MockPushTransport } from '../src/modules/notifications/fcm.transport.js';

describe('Reminder Dispatcher & Background Sweep (Phase 11: NOTIF-T22, NOTIF-T25)', () => {
  let user;
  let workspace;
  let mockTransport;

  beforeAll(async () => {
    user = await createUser({
      displayName: 'Dispatcher Test User',
      email: `dispatcher_user_${Date.now()}@example.com`,
    });

    const wsRes = await createWorkspaceWithMembership({
      name: 'Dispatcher Workspace',
      workspaceType: 'PERSONAL',
      ownerUserId: user.id,
    });
    workspace = wsRes.workspace;
  });

  beforeEach(() => {
    mockTransport = new MockPushTransport();
    setPushTransport(mockTransport);
  });

  afterAll(async () => {
    await query(
      'DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE recipient_user_id = $1)',
      [user.id],
    );
    await query('DELETE FROM notifications WHERE recipient_user_id = $1', [user.id]);
    await query('DELETE FROM reminder_recipients WHERE user_id = $1', [user.id]);
    await query('DELETE FROM reminders WHERE workspace_id = $1', [workspace.id]);
    await query('DELETE FROM workspaces WHERE id = $1', [workspace.id]);
    await query('DELETE FROM users WHERE id = $1', [user.id]);
  });

  it('sweeps due reminders, generates notifications, and updates recipient status to SENT', async () => {
    // 1. Create a reminder that is due in the past (e.g. 5 minutes ago)
    const dueTime = new Date(Date.now() - 300000).toISOString();
    const reminderDue = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: dueTime,
        title: 'Past Due Task Reminder',
      },
      user,
    );

    // 2. Create a reminder that is due in the future (e.g. 1 hour later)
    const futureTime = new Date(Date.now() + 3600000).toISOString();
    const reminderFuture = await remindersService.createReminder(
      {
        workspaceId: workspace.id,
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: futureTime,
        title: 'Future Task Reminder',
      },
      user,
    );

    // 3. Run sweep with current time
    const processed = await runReminderSweep(new Date());

    // Expect the past due reminder to be processed
    expect(processed.length).toBeGreaterThanOrEqual(1);
    const processedReminder = processed.find(
      p => p.reminderRecipientId === reminderDue.recipients[0].id,
    );
    expect(processedReminder).toBeDefined();
    expect(processedReminder.recipientUserId).toBe(user.id);
    expect(processedReminder.title).toBe('Reminder');

    // 4. Verify recipient status in database transitioned to SENT
    const recDue = await remindersRepo.findRecipient(reminderDue.id, user.id);
    expect(recDue.recipientStatus).toBe('SENT');

    // 5. Verify future reminder was NOT processed and remains PENDING
    const recFuture = await remindersRepo.findRecipient(reminderFuture.id, user.id);
    expect(recFuture.recipientStatus).toBe('PENDING');

    // 6. Running sweep again immediately processes 0 additional items (idempotency)
    const secondSweep = await runReminderSweep(new Date());
    const repeatProcessing = secondSweep.find(
      p => p.reminderRecipientId === reminderDue.recipients[0].id,
    );
    expect(repeatProcessing).toBeUndefined();
  });
});
