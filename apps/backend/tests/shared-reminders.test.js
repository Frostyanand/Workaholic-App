import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { remindersService } from '../src/modules/reminders/reminders.service.js';
import { notificationsService } from '../src/modules/notifications/notifications.service.js';
import * as remindersRepo from '../src/modules/reminders/reminders.repository.js';
import * as notificationsRepo from '../src/modules/notifications/notifications.repository.js';
import * as trustedRepo from '../src/modules/reminders/trusted.repository.js';
import { TRUSTED_PERMISSION } from '@workaholic/shared';

describe('Shared Reminders & Trusted Delivery (Phase 11: NOTIF-T12..NOTIF-T14)', () => {
  let app;
  let userA; // Creator in Workspace A
  let userB; // External User in Workspace B
  let workspaceA;
  let workspaceB;
  let sessionTokenA;
  let sessionTokenB;

  beforeAll(async () => {
    app = createApp({ logger: false });

    userA = await createUser({
      displayName: 'Shared User A',
      email: `shared_user_a_${Date.now()}@example.com`,
    });

    const wsARes = await createWorkspaceWithMembership({
      name: 'Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsARes.workspace;

    const rawTokenA = `shared_sess_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(rawTokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenA = rawTokenA;

    userB = await createUser({
      displayName: 'Shared User B',
      email: `shared_user_b_${Date.now()}@example.com`,
    });

    const wsBRes = await createWorkspaceWithMembership({
      name: 'Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsBRes.workspace;

    const rawTokenB = `shared_sess_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(rawTokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    sessionTokenB = rawTokenB;
  });

  afterAll(async () => {
    await query(
      'DELETE FROM trusted_relationship_permissions WHERE relationship_id IN (SELECT id FROM trusted_relationships WHERE owner_user_id IN ($1, $2))',
      [userA.id, userB.id],
    );
    await query(
      'DELETE FROM trusted_relationships WHERE owner_user_id IN ($1, $2) OR trusted_user_id IN ($1, $2)',
      [userA.id, userB.id],
    );
    await query('DELETE FROM reminder_recipients WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
    await query('DELETE FROM reminders WHERE workspace_id IN ($1, $2)', [
      workspaceA.id,
      workspaceB.id,
    ]);
    await query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA.id, workspaceB.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id]);
  });

  // NOTIF-T12: Cross-workspace recipient authorization
  it('NOTIF-T12: prevents adding cross-workspace recipient without active trust relationship', async () => {
    // User A creates a reminder and attempts to add User B (no trust granted yet)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: new Date(Date.now() + 3600000).toISOString(),
        title: 'Unauthorized Cross-Workspace Reminder',
        recipientUserIds: [userB.id],
      },
    });

    expect(createRes.statusCode).toBe(403);
    expect(createRes.json().error.message).toContain('not granted permission');
  });

  it('NOTIF-T12: allows adding cross-workspace recipient once trusted permission is granted', async () => {
    // User B grants 'trusted.reminders.receive' to User A
    await trustedRepo.createTrustedRelationship(userB.id, userA.id, [
      TRUSTED_PERMISSION.RECEIVE_REMINDERS,
    ]);

    // Now User A creates reminder targeting User B
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: new Date(Date.now() + 3600000).toISOString(),
        title: 'Authorized Cross-Workspace Reminder',
        recipientUserIds: [userB.id],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const reminder = createRes.json().data;
    expect(reminder.recipients).toHaveLength(2); // Creator A + Recipient B

    const recipientB = reminder.recipients.find(r => r.userId === userB.id);
    expect(recipientB).toBeDefined();
    expect(recipientB.recipientStatus).toBe('PENDING');
  });

  // NOTIF-T13: Recipient isolation for snooze/dismissal
  it('NOTIF-T13: recipient-specific snooze does not affect other recipients', async () => {
    // Create shared reminder with A and B
    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspaceA.id,
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: new Date(Date.now() + 3600000).toISOString(),
        title: 'Team Meeting Reminder',
        recipientUserIds: [userB.id],
      },
      userA,
    );

    // User A snoozes their reminder for 15 minutes
    const snoozeResA = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminder.id}/snooze`,
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
      },
      payload: {
        durationMinutes: 15,
      },
    });

    expect(snoozeResA.statusCode).toBe(200);
    expect(snoozeResA.json().data.recipientStatus).toBe('SNOOZED');

    // Verify User B's recipient state remains PENDING
    const recB = await remindersRepo.findRecipient(reminder.id, userB.id);
    expect(recB.recipientStatus).toBe('PENDING');
    expect(recB.snoozedUntil).toBeNull();
  });

  it('NOTIF-T13: recipient-specific dismissal does not dismiss for other recipients', async () => {
    // Create shared reminder
    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspaceA.id,
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: new Date(Date.now() + 3600000).toISOString(),
        title: 'Lunch Reminder',
        recipientUserIds: [userB.id],
      },
      userA,
    );

    // User B dismisses the reminder
    const dismissResB = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminder.id}/dismiss`,
      headers: {
        authorization: `Bearer ${sessionTokenB}`,
      },
      payload: {},
    });

    expect(dismissResB.statusCode).toBe(200);
    expect(dismissResB.json().data.recipientStatus).toBe('DISMISSED');

    // Verify User A's recipient state is still PENDING
    const recA = await remindersRepo.findRecipient(reminder.id, userA.id);
    expect(recA.recipientStatus).toBe('PENDING');
    expect(recA.dismissedAt).toBeNull();
  });

  // NOTIF-T14: Revocation prevents future protected delivery
  it('NOTIF-T14: revoking trusted relationship prevents future reminder sharing', async () => {
    // User B revokes trust with User A
    await trustedRepo.revokeTrustedRelationship(userB.id, userA.id);

    // Now User A tries to create another reminder with User B
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/reminders',
      headers: {
        authorization: `Bearer ${sessionTokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: new Date(Date.now() + 3600000).toISOString(),
        title: 'Revoked Trust Reminder',
        recipientUserIds: [userB.id],
      },
    });

    expect(createRes.statusCode).toBe(403);
    expect(createRes.json().error.message).toContain('not granted permission');
  });

  it('NOTIF-T14: revoking trusted relationship prevents future scheduled delivery of pre-existing shared reminder', async () => {
    // 1. Re-grant trust
    await trustedRepo.createTrustedRelationship(userB.id, userA.id, [
      TRUSTED_PERMISSION.RECEIVE_REMINDERS,
    ]);

    // 2. Create shared reminder due in the past (immediately eligible for sweep)
    const dueTime = new Date(Date.now() - 5000);
    const reminder = await remindersService.createReminder(
      {
        workspaceId: workspaceA.id,
        triggerType: 'ABSOLUTE_TIME',
        triggerAt: dueTime.toISOString(),
        title: 'Confidential Strategy Meeting',
        recipientUserIds: [userB.id],
      },
      userA,
    );

    // Verify User B is an active pending recipient
    const recipientBefore = await remindersRepo.findRecipient(reminder.id, userB.id);
    expect(recipientBefore.recipientStatus).toBe('PENDING');

    // 3. User B revokes trust with User A BEFORE dispatcher sweep
    await trustedRepo.revokeTrustedRelationship(userB.id, userA.id);

    // 4. Background reminder sweep processes due reminders
    await notificationsService.processDueReminders(new Date());

    // 5. Verify User B recipient status was transitioned to CANCELLED and NO notification was delivered to User B
    const recipientAfter = await remindersRepo.findRecipient(reminder.id, userB.id);
    expect(recipientAfter.recipientStatus).toBe('CANCELLED');

    const notifsB = await notificationsRepo.findNotifications({ recipientUserId: userB.id });
    const recB = reminder.recipients.find(r => r.userId === userB.id);
    const leakedNotif = notifsB.find(n => n.reminderRecipientId === recB.id);
    expect(leakedNotif).toBeUndefined();

    // 6. Verify User A (the owner) still received their reminder safely
    const notifsA = await notificationsRepo.findNotifications({ recipientUserId: userA.id });
    const recA = reminder.recipients.find(r => r.userId === userA.id);
    const ownerNotif = notifsA.find(n => n.reminderRecipientId === recA.id);
    expect(ownerNotif).toBeDefined();
  });
});
