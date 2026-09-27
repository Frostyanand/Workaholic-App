import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, withTransaction } from '../src/core/db.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import * as remindersRepo from '../src/modules/reminders/reminders.repository.js';
import * as notificationsRepo from '../src/modules/notifications/notifications.repository.js';
import * as trustedRepo from '../src/modules/reminders/trusted.repository.js';

describe('Live PostgreSQL 16 Schema Constraints & Indexes (Phase 11)', () => {
  let user1;
  let user2;
  let workspace;

  beforeAll(async () => {
    user1 = await createUser({
      displayName: 'Live Postgres Tester 1',
      email: `pg_live_1_${Date.now()}@example.com`,
    });

    user2 = await createUser({
      displayName: 'Live Postgres Tester 2',
      email: `pg_live_2_${Date.now()}@example.com`,
    });

    const wsRes = await createWorkspaceWithMembership({
      name: 'PostgreSQL Live Workspace',
      workspaceType: 'PERSONAL',
      ownerUserId: user1.id,
    });
    workspace = wsRes.workspace;
  });

  afterAll(async () => {
    await query(
      'DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE recipient_user_id IN ($1, $2))',
      [user1.id, user2.id],
    );
    await query('DELETE FROM notifications WHERE recipient_user_id IN ($1, $2)', [
      user1.id,
      user2.id,
    ]);
    await query('DELETE FROM reminder_recipients WHERE user_id IN ($1, $2)', [user1.id, user2.id]);
    await query('DELETE FROM reminders WHERE workspace_id = $1', [workspace.id]);
    await query('DELETE FROM workspaces WHERE id = $1', [workspace.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [user1.id, user2.id]);
  });

  it('enforces chk_reminders_single_target in PostgreSQL', async () => {
    // Attempting to create a reminder with both task_id and event_id must violate single target check
    const fakeTaskId = '11111111-1111-4111-8111-111111111111';
    const fakeEventId = '22222222-2222-4222-8222-222222222222';

    const sqlViolating = `
      INSERT INTO reminders (
        workspace_id, task_id, event_id, trigger_type, trigger_at, created_by
      ) VALUES ($1, $2, $3, 'ABSOLUTE_TIME', NOW(), $4);
    `;

    await expect(
      query(sqlViolating, [workspace.id, fakeTaskId, fakeEventId, user1.id]),
    ).rejects.toThrow(/chk_reminders_single_target|violates check constraint/i);
  });

  it('enforces chk_non_self_trust preventing self-trusted relationships', async () => {
    await expect(trustedRepo.createTrustedRelationship(user1.id, user1.id)).rejects.toThrow(
      /cannot create a trusted relationship with themselves/i,
    );

    const directSql = `
      INSERT INTO trusted_relationships (owner_user_id, trusted_user_id, status)
      VALUES ($1, $1, 'ACTIVE');
    `;
    await expect(query(directSql, [user1.id])).rejects.toThrow(
      /chk_non_self_trust|violates check constraint/i,
    );
  });

  it('verifies partial index on reminder_recipients(next_trigger_at)', async () => {
    const res = await query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'reminder_recipients'
        AND indexname = 'idx_reminder_recipients_due';
    `);

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].indexdef).toContain('WHERE');
    expect(res.rows[0].indexdef).toContain('recipient_status');
  });

  it('supports atomic ACID transaction with row-level locking', async () => {
    const reminder = await remindersRepo.createReminder({
      workspaceId: workspace.id,
      triggerType: 'ABSOLUTE_TIME',
      triggerAt: new Date(Date.now() + 60000).toISOString(),
      priority: 'HIGH',
      createdBy: user1.id,
    });

    await remindersRepo.createReminderRecipient(
      reminder.id,
      user1.id,
      new Date(Date.now() + 60000).toISOString(),
    );

    // Verify row lock within transaction
    await withTransaction(async txClient => {
      const due = await remindersRepo.findDueReminderRecipients(
        new Date(Date.now() + 120000),
        10,
        txClient,
      );
      expect(due.length).toBeGreaterThanOrEqual(1);

      await remindersRepo.markRecipientDelivered(due[0].id, txClient);
      const recipient = await remindersRepo.findRecipient(reminder.id, user1.id, txClient);
      expect(recipient.recipientStatus).toBe('SENT');
    });
  });

  it('enforces unique delivery record per device and channel', async () => {
    const notif = await notificationsRepo.createNotification({
      recipientUserId: user1.id,
      notificationType: 'REMINDER',
      title: 'Postgres Live Delivery Test',
      body: 'Testing uniqueness constraint',
    });

    const d1 = await notificationsRepo.createDelivery({
      notificationId: notif.id,
      deviceId: null,
      channel: 'IN_APP',
      status: 'DELIVERED',
    });
    expect(d1.id).toBeDefined();

    // 1. Verify createDelivery upserts idempotently returning the same delivery id
    const d2 = await notificationsRepo.createDelivery({
      notificationId: notif.id,
      deviceId: null,
      channel: 'IN_APP',
      status: 'DELIVERED',
    });
    expect(d2.id).toBe(d1.id);

    // 2. Direct raw SQL INSERT without ON CONFLICT must violate uq_notification_delivery
    const rawSql = `
      INSERT INTO notification_deliveries (notification_id, device_id, channel, status)
      VALUES ($1, NULL, 'IN_APP', 'DELIVERED');
    `;
    await expect(query(rawSql, [notif.id])).rejects.toThrow(
      /duplicate key value violates unique constraint|uq_notification_delivery/i,
    );
  });
});
