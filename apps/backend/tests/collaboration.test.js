import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import {
  createWorkspaceWithMembership,
  addWorkspaceMembership,
} from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import { createTask } from '../src/modules/tasks/tasks.repository.js';
import { createReminder } from '../src/modules/reminders/reminders.repository.js';
import { TRUSTED_PERMISSION } from '@workaholic/shared';

describe('Phase 21: Trusted Sharing & Collaboration Integration Tests', () => {
  let app;
  let userA; // Owner
  let userB; // Trusted user & Collaborator
  let userC; // Second collaborator
  let userD; // Outsider / attacker
  let workspaceA;
  let tokenA;
  let tokenB;
  let tokenC;
  let tokenD;
  let taskA;
  let reminderA;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create Users
    userA = await createUser({
      displayName: 'Alice Owner',
      email: `alice_collab_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    userB = await createUser({
      displayName: 'Bob Trusted',
      email: `bob_collab_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    userC = await createUser({
      displayName: 'Charlie Member',
      email: `charlie_collab_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    userD = await createUser({
      displayName: 'David Outsider',
      email: `david_collab_${Date.now()}@example.com`,
      timezone: 'UTC',
    });

    // 2. Create Workspace for Alice
    const ws = await createWorkspaceWithMembership({
      name: 'Alice Main Workspace',
      workspaceType: 'TEAM',
      ownerUserId: userA.id,
    });
    workspaceA = ws.workspace;

    // Add Charlie as MEMBER in workspaceA
    await addWorkspaceMembership({
      workspaceId: workspaceA.id,
      userId: userC.id,
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    // 3. Create Sessions
    tokenA = `tok_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenB = `tok_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenC = `tok_c_${Date.now()}`;
    await createSession({
      userId: userC.id,
      sessionTokenHash: hashSessionToken(tokenC),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenD = `tok_d_${Date.now()}`;
    await createSession({
      userId: userD.id,
      sessionTokenHash: hashSessionToken(tokenD),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // 4. Create Task in workspaceA
    taskA = await createTask({
      workspaceId: workspaceA.id,
      createdBy: userA.id,
      title: 'Collaborative Launch Plan',
      description: 'Review the architecture and finalize the timeline',
      priority: 'P1',
      status: 'TODO',
    });

    // 5. Create Reminder in workspaceA
    reminderA = await createReminder({
      workspaceId: workspaceA.id,
      createdBy: userA.id,
      title: 'Quarterly Team Sync Reminder',
      triggerType: 'ABSOLUTE_TIME',
      triggerAt: new Date(Date.now() + 86400000).toISOString(),
      priority: 'HIGH',
    });
  });

  afterAll(async () => {
    try {
      await query('DELETE FROM comments WHERE workspace_id = $1;', [workspaceA.id]);
      await query('DELETE FROM activity_entries WHERE workspace_id = $1;', [workspaceA.id]);
      await query('DELETE FROM reminder_recipients WHERE reminder_id = $1;', [reminderA.id]);
      await query('DELETE FROM reminders WHERE workspace_id = $1;', [workspaceA.id]);
      await query('DELETE FROM tasks WHERE workspace_id = $1;', [workspaceA.id]);
      await query('DELETE FROM share_codes WHERE owner_user_id IN ($1, $2, $3, $4);', [
        userA.id,
        userB.id,
        userC.id,
        userD.id,
      ]);
      await query('DELETE FROM trusted_relationships WHERE owner_user_id IN ($1, $2, $3, $4);', [
        userA.id,
        userB.id,
        userC.id,
        userD.id,
      ]);
      await query('DELETE FROM workspace_memberships WHERE workspace_id = $1;', [workspaceA.id]);
      await query('DELETE FROM workspaces WHERE id = $1;', [workspaceA.id]);
      await query('DELETE FROM users WHERE id IN ($1, $2, $3, $4);', [
        userA.id,
        userB.id,
        userC.id,
        userD.id,
      ]);
    } catch {
      // Non-fatal cleanup
    }
  });

  // =========================================================
  // 1. Share Code Onboarding & Redemption
  // =========================================================

  let activeShareCode;
  let activeRelationship;

  it('REQ-SHARE-001 / REQ-SHARE-002: Owner can generate a secure temporary share code with expiration and default permissions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes',
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: {
        expiresInMinutes: 30,
        defaultPermissions: [
          TRUSTED_PERMISSION.VIEW_CALENDAR,
          TRUSTED_PERMISSION.RECEIVE_REMINDERS,
          TRUSTED_PERMISSION.VIEW_TASKS,
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload).data;
    expect(body.id).toBeDefined();
    expect(body.code).toMatch(/^WORK-[A-F0-9]{8}$/);
    expect(body.ownerUserId).toBe(userA.id);
    expect(body.defaultPermissions).toContain(TRUSTED_PERMISSION.RECEIVE_REMINDERS);
    activeShareCode = body;

    // Verify plaintext code is NOT stored in DB (code_hash is stored instead)
    const dbRow = await query('SELECT * FROM share_codes WHERE id = $1;', [body.id]);
    expect(dbRow.rows.length).toBe(1);
    expect(dbRow.rows[0].code_hash).toBeDefined();
    expect(dbRow.rows[0].code_hash).not.toBe(body.code);
  });

  it('REQ-SHARE-005: Owner can view their generated share codes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trusted/share-codes',
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload).data;
    expect(body.length).toBeGreaterThanOrEqual(1);
    const found = body.find(c => c.id === activeShareCode.id);
    expect(found).toBeDefined();
    expect(found.isActive).toBe(true);
  });

  it('SECURITY / BR-SHARE-001: User cannot redeem their own share code (Self-trust rejection)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes/redeem',
      headers: {
        authorization: `Bearer ${tokenA}`, // Alice tries to redeem her own code
      },
      payload: {
        code: activeShareCode.code,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.message).toContain('cannot redeem their own share code');
  });

  it('REQ-SHARE-003 / REQ-SHARE-006: Target user successfully redeems share code to establish authenticated relationship', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes/redeem',
      headers: {
        authorization: `Bearer ${tokenB}`, // Bob redeems
      },
      payload: {
        code: activeShareCode.code,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload).data;
    expect(body.id).toBeDefined();
    expect(body.ownerUserId).toBe(userA.id);
    expect(body.trustedUserId).toBe(userB.id);
    expect(body.status).toBe('ACTIVE');
    expect(body.permissions).toContain(TRUSTED_PERMISSION.VIEW_CALENDAR);
    expect(body.permissions).toContain(TRUSTED_PERMISSION.RECEIVE_REMINDERS);
    activeRelationship = body;

    // Verify share code is now marked used in DB
    const codeDb = await query('SELECT * FROM share_codes WHERE id = $1;', [activeShareCode.id]);
    expect(codeDb.rows[0].used_at).not.toBeNull();
  });

  it('SECURITY / REQ-SHARE-002: Share code cannot be reused/replayed after redemption (Single-use guarantee)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes/redeem',
      headers: {
        authorization: `Bearer ${tokenC}`, // Charlie tries to reuse the same code
      },
      payload: {
        code: activeShareCode.code,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toContain('already been redeemed');
  });

  it('SECURITY: Revoked share code cannot be redeemed', async () => {
    // 1. Create a code
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { expiresInMinutes: 30 },
    });
    const codeToRevoke = JSON.parse(resCreate.payload).data;

    // 2. Revoke it
    const resRevoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/trusted/share-codes/${codeToRevoke.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resRevoke.statusCode).toBe(200);

    // 3. Try to redeem
    const resRedeem = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes/redeem',
      headers: { authorization: `Bearer ${tokenC}` },
      payload: { code: codeToRevoke.code },
    });
    expect(resRedeem.statusCode).toBe(400);
    expect(JSON.parse(resRedeem.payload).error.message).toContain('revoked');
  });

  // =========================================================
  // 2. Granular Permissions & Relationship Management
  // =========================================================

  it('REQ-SHARE-004 / REQ-SHARE-005: Both participants can list their trusted relationships', async () => {
    // Alice's view (Owner)
    const resAlice = await app.inject({
      method: 'GET',
      url: '/api/v1/trusted/relationships',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resAlice.statusCode).toBe(200);
    const aliceList = JSON.parse(resAlice.payload).data;
    expect(aliceList.some(r => r.id === activeRelationship.id && r.isOwner)).toBe(true);

    // Bob's view (Trusted contact)
    const resBob = await app.inject({
      method: 'GET',
      url: '/api/v1/trusted/relationships',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resBob.statusCode).toBe(200);
    const bobList = JSON.parse(resBob.payload).data;
    expect(bobList.some(r => r.id === activeRelationship.id && !r.isOwner)).toBe(true);
  });

  it('SECURITY: Unrelated user cannot view a third-party trusted relationship', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trusted/relationships/${activeRelationship.id}`,
      headers: { authorization: `Bearer ${tokenD}` }, // Outsider David
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload).error.code).toBe('FORBIDDEN');
  });

  it('REQ-SHARE-004: Owner can update granular permissions, but trusted user cannot', async () => {
    // 1. Bob (trusted user) attempts to escalate his own permissions -> Rejected
    const resBob = await app.inject({
      method: 'PATCH',
      url: `/api/v1/trusted/relationships/${activeRelationship.id}/permissions`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        permissions: [
          TRUSTED_PERMISSION.VIEW_CALENDAR,
          TRUSTED_PERMISSION.RECEIVE_REMINDERS,
          TRUSTED_PERMISSION.EDIT_TASKS,
        ],
      },
    });
    expect(resBob.statusCode).toBe(403);

    // 2. Alice (owner) updates permissions to add EDIT_TASKS
    const resAlice = await app.inject({
      method: 'PATCH',
      url: `/api/v1/trusted/relationships/${activeRelationship.id}/permissions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        permissions: [
          TRUSTED_PERMISSION.VIEW_CALENDAR,
          TRUSTED_PERMISSION.RECEIVE_REMINDERS,
          TRUSTED_PERMISSION.VIEW_TASKS,
          TRUSTED_PERMISSION.EDIT_TASKS,
        ],
      },
    });
    expect(resAlice.statusCode).toBe(200);
    const bodyAlice = JSON.parse(resAlice.payload).data;
    expect(bodyAlice.permissions).toContain(TRUSTED_PERMISSION.EDIT_TASKS);
  });

  it('REQ-SHARE-005 / BR-SHARE-005: Owner can revoke relationship and access is immediately revoked', async () => {
    // Create a temporary relationship to revoke
    const codeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { expiresInMinutes: 30 },
    });
    const c = JSON.parse(codeRes.payload).data;

    const redeemRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes/redeem',
      headers: { authorization: `Bearer ${tokenC}` },
      payload: { code: c.code },
    });
    const relToRevoke = JSON.parse(redeemRes.payload).data;

    // Revoke relationship
    const resRevoke = await app.inject({
      method: 'POST',
      url: `/api/v1/trusted/relationships/${relToRevoke.id}/revoke`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resRevoke.statusCode).toBe(200);
    const bodyRevoke = JSON.parse(resRevoke.payload).data;
    expect(bodyRevoke.status).toBe('REVOKED');

    // Subsequent permission update on revoked relationship fails
    const resUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/trusted/relationships/${relToRevoke.id}/permissions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { permissions: [TRUSTED_PERMISSION.VIEW_TASKS] },
    });
    expect(resUpdate.statusCode).toBe(409);
  });

  // =========================================================
  // 3. Collaboration: Task Assignment
  // =========================================================

  it('REQ-COLLAB-002 / BR-COLLAB-002: Task can be assigned to an authorized workspace member or trusted contact', async () => {
    // Assign to Charlie (active workspace member)
    const resAssign = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskA.id}`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        assignedTo: userC.id,
      },
    });

    expect(resAssign.statusCode).toBe(200);
    const body = JSON.parse(resAssign.payload).data;
    expect(body.assignedTo).toBe(userC.id);

    // Verify task assignment activity was recorded
    const actRes = await query(
      `SELECT * FROM activity_entries WHERE target_id = $1 AND activity_type = 'TASK_ASSIGNED';`,
      [taskA.id],
    );
    expect(actRes.rows.length).toBeGreaterThanOrEqual(1);

    // Verify notification was sent to Charlie
    const notifRes = await query(
      `SELECT * FROM notifications WHERE recipient_user_id = $1 AND notification_type = 'TASK_ASSIGNED';`,
      [userC.id],
    );
    expect(notifRes.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('SECURITY / BR-COLLAB-002: Task cannot be assigned to an unauthorized user outside workspace or trusted context', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskA.id}`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        assignedTo: userD.id, // David is an outsider with NO membership and NO trust
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.message).toContain('unauthorized user outside the workspace');
  });

  // =========================================================
  // 4. Collaboration: Comments, Mentions & Activity Feed
  // =========================================================

  let createdComment;

  it('REQ-COLLAB-003 / REQ-COLLAB-005: Workspace member can post comments with mentions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collaboration/comments',
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: {
        workspaceId: workspaceA.id,
        targetType: 'TASK',
        targetId: taskA.id,
        content: 'Hey @charlie, please review the budget section by tomorrow morning!',
        mentionedUserIds: [userC.id],
      },
    });

    expect(res.statusCode).toBe(201);
    createdComment = JSON.parse(res.payload).data;
    expect(createdComment.id).toBeDefined();
    expect(createdComment.content).toContain('@charlie');
    expect(createdComment.mentions.length).toBe(1);
    expect(createdComment.mentions[0].id).toBe(userC.id);

    // Verify mention record in DB
    const mentionDb = await query('SELECT * FROM mentions WHERE comment_id = $1;', [
      createdComment.id,
    ]);
    expect(mentionDb.rows.length).toBe(1);
    expect(mentionDb.rows[0].mentioned_user_id).toBe(userC.id);

    // Verify notification was created for mentioned user Charlie
    const notifDb = await query(
      `SELECT * FROM notifications WHERE recipient_user_id = $1 AND title LIKE '%mentioned%';`,
      [userC.id],
    );
    expect(notifDb.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('REQ-COLLAB-003: Authorized members can list comments on a task', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/collaboration/comments?workspaceId=${workspaceA.id}&targetType=TASK&targetId=${taskA.id}`,
      headers: {
        authorization: `Bearer ${tokenC}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload).data;
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].id).toBe(createdComment.id);
    expect(body[0].authorName).toBe(userA.displayName);
  });

  it('SECURITY / BR-COLLAB-003: Outsider cannot view or post comments on another workspace task', async () => {
    const resGet = await app.inject({
      method: 'GET',
      url: `/api/v1/collaboration/comments?workspaceId=${workspaceA.id}&targetType=TASK&targetId=${taskA.id}`,
      headers: { authorization: `Bearer ${tokenD}` },
    });
    expect(resGet.statusCode).toBe(403);

    const resPost = await app.inject({
      method: 'POST',
      url: '/api/v1/collaboration/comments',
      headers: { authorization: `Bearer ${tokenD}` },
      payload: {
        workspaceId: workspaceA.id,
        targetType: 'TASK',
        targetId: taskA.id,
        content: 'Malicious unauthorized comment injection',
      },
    });
    expect(resPost.statusCode).toBe(403);
  });

  it('REQ-COLLAB-004: Workspace activity feed records collaborative actions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/collaboration/activity?workspaceId=${workspaceA.id}&limit=20`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    const activities = JSON.parse(res.payload).data;
    expect(activities.length).toBeGreaterThanOrEqual(2);

    const types = activities.map(a => a.activityType);
    expect(types).toContain('COMMENT_CREATED');
    expect(types).toContain('TASK_ASSIGNED');
  });

  it('REQ-COLLAB-003: Author can soft delete their comment', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/collaboration/comments/${createdComment.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);

    // Verify comment is marked deleted in DB and does not appear in normal list
    const resList = await app.inject({
      method: 'GET',
      url: `/api/v1/collaboration/comments?workspaceId=${workspaceA.id}&targetType=TASK&targetId=${taskA.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const comments = JSON.parse(resList.payload).data;
    expect(comments.some(c => c.id === createdComment.id)).toBe(false);
  });

  // =========================================================
  // 5. Shared Reminders: Explicit Recipients & Independent State
  // =========================================================

  it('REQ-SREM-001 / BR-SHARE-007: Owner can share reminder with an explicit trusted recipient', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminderA.id}/recipients`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        recipientUserId: userB.id, // Bob has active trusted relationship with Alice
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload).data;
    expect(body.reminder_id || body.reminderId).toBe(reminderA.id);
    expect(body.user_id || body.userId).toBe(userB.id);

    // Verify row in reminder_recipients
    const dbRows = await query('SELECT * FROM reminder_recipients WHERE reminder_id = $1;', [
      reminderA.id,
    ]);
    expect(dbRows.rows.length).toBeGreaterThanOrEqual(1);
    const bobRecipient = dbRows.rows.find(r => r.user_id === userB.id);
    expect(bobRecipient).toBeDefined();
    expect(bobRecipient.recipient_status).toBe('PENDING');
  });

  it('REQ-SREM-001: Sharing with an unauthorized outsider fails', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminderA.id}/recipients`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspaceA.id,
      },
      payload: {
        recipientUserId: userD.id, // David has no relationship and no workspace access
      },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload).error.code).toBe('FORBIDDEN');
  });

  it('REQ-SREM-002 / REQ-SREM-003: Recipient can independently snooze reminder without altering owner or other recipients', async () => {
    // 1. Bob snoozes his recipient notification
    const resSnooze = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminderA.id}/snooze`,
      headers: {
        authorization: `Bearer ${tokenB}`, // Bob
      },
      payload: {
        snoozeMinutes: 45,
      },
    });

    expect(resSnooze.statusCode).toBe(200);

    // 2. Verify Bob's recipient row is SNOOZED
    const bobCheck = await query(
      'SELECT * FROM reminder_recipients WHERE reminder_id = $1 AND user_id = $2;',
      [reminderA.id, userB.id],
    );
    expect(bobCheck.rows[0].recipient_status).toBe('SNOOZED');
    expect(bobCheck.rows[0].snoozed_until).not.toBeNull();

    // 3. CRITICAL: Verify Alice's underlying reminder in `reminders` table remains untouched
    const reminderDb = await query('SELECT * FROM reminders WHERE id = $1;', [reminderA.id]);
    expect(reminderDb.rows[0].status).toBe(reminderA.status);
    expect(new Date(reminderDb.rows[0].trigger_at).toISOString()).toBe(
      new Date(reminderA.triggerAt).toISOString(),
    );
  });

  it('REQ-SREM-002 / REQ-SREM-003: Recipient can independently dismiss reminder without altering owner', async () => {
    // 1. Bob dismisses his recipient notification
    const resDismiss = await app.inject({
      method: 'POST',
      url: `/api/v1/reminders/${reminderA.id}/dismiss`,
      headers: {
        authorization: `Bearer ${tokenB}`,
      },
    });

    expect(resDismiss.statusCode).toBe(200);

    // 2. Verify Bob's row is DISMISSED
    const bobCheck = await query(
      'SELECT * FROM reminder_recipients WHERE reminder_id = $1 AND user_id = $2;',
      [reminderA.id, userB.id],
    );
    expect(bobCheck.rows[0].recipient_status).toBe('DISMISSED');
    expect(bobCheck.rows[0].dismissed_at).not.toBeNull();

    // 3. Verify owner reminder is STILL untouched
    const reminderDb2 = await query('SELECT * FROM reminders WHERE id = $1;', [reminderA.id]);
    expect(reminderDb2.rows[0].status).toBe(reminderA.status);
  });

  // =========================================================
  // 6. Concurrency: Simultaneous Redemptions
  // =========================================================

  it('CONCURRENCY: Simultaneous redemption of the same share code permits exactly one winner', async () => {
    // 1. Create a fresh single-use code
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { expiresInMinutes: 15 },
    });
    const concurrentCode = JSON.parse(resCreate.payload).data;

    // 2. Fire simultaneous redemptions from Bob and Charlie
    const req1 = app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes/redeem',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { code: concurrentCode.code },
    });

    const req2 = app.inject({
      method: 'POST',
      url: '/api/v1/trusted/share-codes/redeem',
      headers: { authorization: `Bearer ${tokenC}` },
      payload: { code: concurrentCode.code },
    });

    const [r1, r2] = await Promise.all([req1, req2]);
    const statuses = [r1.statusCode, r2.statusCode].sort();

    // Exactly one SUCCESS (201) and exactly one CONFLICT (409)
    expect(statuses).toEqual([201, 409]);
  });
});
