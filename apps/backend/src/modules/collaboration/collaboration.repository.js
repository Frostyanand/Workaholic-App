import { query, pool } from '../../core/db.js';

// ==========================================
// 1. Share Codes (Onboarding)
// ==========================================

export async function createShareCode(data, client = pool) {
  const { ownerUserId, codeHash, expiresAt, metadata = {} } = data;
  const sql = `
    INSERT INTO share_codes (owner_user_id, code_hash, expires_at, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING id, owner_user_id, code_hash, expires_at, used_at, revoked_at, metadata, created_at;
  `;
  const res = await query(
    sql,
    [ownerUserId, codeHash, expiresAt, JSON.stringify(metadata)],
    client,
  );
  const row = res.rows[0];
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export async function findShareCodeByHash(codeHash, client = pool) {
  const sql = `
    SELECT id, owner_user_id, code_hash, expires_at, used_at, revoked_at, metadata, created_at
    FROM share_codes
    WHERE code_hash = $1;
  `;
  const res = await query(sql, [codeHash], client);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export async function markShareCodeUsed(id, client = pool) {
  const sql = `
    UPDATE share_codes
    SET used_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
    RETURNING id, used_at;
  `;
  const res = await query(sql, [id], client);
  return res.rows.length > 0;
}

export async function revokeShareCode(id, ownerUserId, client = pool) {
  const sql = `
    UPDATE share_codes
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND owner_user_id = $2 AND revoked_at IS NULL
    RETURNING id, revoked_at;
  `;
  const res = await query(sql, [id, ownerUserId], client);
  return res.rows.length > 0;
}

export async function listShareCodesByOwner(ownerUserId, client = pool) {
  const sql = `
    SELECT id, owner_user_id, expires_at, used_at, revoked_at, metadata, created_at
    FROM share_codes
    WHERE owner_user_id = $1
    ORDER BY created_at DESC;
  `;
  const res = await query(sql, [ownerUserId], client);
  return res.rows.map(row => ({
    id: row.id,
    ownerUserId: row.owner_user_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    isExpired: new Date(row.expires_at) < new Date(),
    isActive: !row.used_at && !row.revoked_at && new Date(row.expires_at) > new Date(),
  }));
}

// ==========================================
// 2. Trusted Relationships & Permissions
// ==========================================

export async function createTrustedRelationship(
  ownerUserId,
  trustedUserId,
  permissions = [],
  client = pool,
) {
  if (ownerUserId === trustedUserId) {
    throw new Error('A user cannot create a trusted relationship with themselves');
  }

  const sqlRel = `
    INSERT INTO trusted_relationships (owner_user_id, trusted_user_id, status)
    VALUES ($1, $2, 'ACTIVE')
    ON CONFLICT (owner_user_id, trusted_user_id) DO UPDATE
      SET status = 'ACTIVE', revoked_at = NULL, updated_at = CURRENT_TIMESTAMP
    RETURNING id, owner_user_id, trusted_user_id, status, created_at, revoked_at, updated_at;
  `;
  const resRel = await query(sqlRel, [ownerUserId, trustedUserId], client);
  const relationship = resRel.rows[0];

  // Insert permissions
  for (const perm of permissions) {
    const sqlPerm = `
      INSERT INTO trusted_relationship_permissions (relationship_id, permission_id)
      VALUES ($1, $2)
      ON CONFLICT (relationship_id, permission_id) DO NOTHING;
    `;
    await query(sqlPerm, [relationship.id, perm], client);
  }

  return {
    id: relationship.id,
    ownerUserId: relationship.owner_user_id,
    trustedUserId: relationship.trusted_user_id,
    status: relationship.status,
    permissions,
    createdAt: relationship.created_at,
    revokedAt: relationship.revoked_at,
    updatedAt: relationship.updated_at,
  };
}

export async function findTrustedRelationship(ownerUserId, trustedUserId, client = pool) {
  const sql = `
    SELECT tr.*,
      COALESCE(array_agg(trp.permission_id) FILTER (WHERE trp.permission_id IS NOT NULL), '{}') AS permissions
    FROM trusted_relationships tr
    LEFT JOIN trusted_relationship_permissions trp ON tr.id = trp.relationship_id
    WHERE tr.owner_user_id = $1 AND tr.trusted_user_id = $2
    GROUP BY tr.id;
  `;
  const res = await query(sql, [ownerUserId, trustedUserId], client);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    trustedUserId: row.trusted_user_id,
    status: row.status,
    permissions: row.permissions,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at,
  };
}

export async function findTrustedRelationshipById(id, client = pool) {
  const sql = `
    SELECT tr.*,
      u_owner.display_name AS owner_name,
      u_owner.email AS owner_email,
      u_trusted.display_name AS trusted_name,
      u_trusted.email AS trusted_email,
      COALESCE(array_agg(trp.permission_id) FILTER (WHERE trp.permission_id IS NOT NULL), '{}') AS permissions
    FROM trusted_relationships tr
    JOIN users u_owner ON u_owner.id = tr.owner_user_id
    JOIN users u_trusted ON u_trusted.id = tr.trusted_user_id
    LEFT JOIN trusted_relationship_permissions trp ON tr.id = trp.relationship_id
    WHERE tr.id = $1
    GROUP BY tr.id, u_owner.id, u_trusted.id;
  `;
  const res = await query(sql, [id], client);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    trustedUserId: row.trusted_user_id,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    trustedName: row.trusted_name,
    trustedEmail: row.trusted_email,
    status: row.status,
    permissions: row.permissions,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at,
  };
}

export async function listTrustedRelationshipsForUser(userId, client = pool) {
  const sql = `
    SELECT tr.*,
      u_owner.display_name AS owner_name,
      u_owner.email AS owner_email,
      u_trusted.display_name AS trusted_name,
      u_trusted.email AS trusted_email,
      COALESCE(array_agg(trp.permission_id) FILTER (WHERE trp.permission_id IS NOT NULL), '{}') AS permissions
    FROM trusted_relationships tr
    JOIN users u_owner ON u_owner.id = tr.owner_user_id
    JOIN users u_trusted ON u_trusted.id = tr.trusted_user_id
    LEFT JOIN trusted_relationship_permissions trp ON tr.id = trp.relationship_id
    WHERE tr.owner_user_id = $1 OR tr.trusted_user_id = $1
    GROUP BY tr.id, u_owner.id, u_trusted.id
    ORDER BY tr.created_at DESC;
  `;
  const res = await query(sql, [userId], client);
  return res.rows.map(row => ({
    id: row.id,
    ownerUserId: row.owner_user_id,
    trustedUserId: row.trusted_user_id,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    trustedName: row.trusted_name,
    trustedEmail: row.trusted_email,
    isOwner: row.owner_user_id === userId,
    status: row.status,
    permissions: row.permissions,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateTrustedPermissions(relationshipId, permissions = [], client = pool) {
  // Clear existing and re-insert
  await query(
    'DELETE FROM trusted_relationship_permissions WHERE relationship_id = $1',
    [relationshipId],
    client,
  );
  for (const perm of permissions) {
    const sql = `
      INSERT INTO trusted_relationship_permissions (relationship_id, permission_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING;
    `;
    await query(sql, [relationshipId, perm], client);
  }
  await query(
    'UPDATE trusted_relationships SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [relationshipId],
    client,
  );
  return permissions;
}

export async function revokeTrustedRelationship(relationshipId, userId, client = pool) {
  const sql = `
    UPDATE trusted_relationships
    SET status = 'REVOKED',
        revoked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND (owner_user_id = $2 OR trusted_user_id = $2) AND status <> 'REVOKED'
    RETURNING id, owner_user_id, trusted_user_id, status, revoked_at;
  `;
  const res = await query(sql, [relationshipId, userId], client);
  return res.rows[0] || null;
}

export async function hasTrustedPermission(
  ownerUserId,
  trustedUserId,
  permissionId,
  client = pool,
) {
  const sql = `
    SELECT 1 FROM trusted_relationships tr
    JOIN trusted_relationship_permissions trp ON tr.id = trp.relationship_id
    WHERE tr.owner_user_id = $1
      AND tr.trusted_user_id = $2
      AND tr.status = 'ACTIVE'
      AND trp.permission_id = $3
    LIMIT 1;
  `;
  const res = await query(sql, [ownerUserId, trustedUserId, permissionId], client);
  return res.rows.length > 0;
}

// ==========================================
// 3. Comments
// ==========================================

export async function createComment(data, client = pool) {
  const { workspaceId, authorUserId, targetType, targetId, content } = data;
  const sql = `
    INSERT INTO comments (workspace_id, author_user_id, target_type, target_id, content)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, workspace_id, author_user_id, target_type, target_id, content, created_at, updated_at, deleted_at;
  `;
  const res = await query(sql, [workspaceId, authorUserId, targetType, targetId, content], client);
  const row = res.rows[0];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    authorUserId: row.author_user_id,
    targetType: row.target_type,
    targetId: row.target_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function findCommentsByTarget(workspaceId, targetType, targetId, client = pool) {
  const sql = `
    SELECT c.*,
      u.display_name AS author_name,
      u.email AS author_email,
      COALESCE(
        json_agg(
          json_build_object('id', m.mentioned_user_id, 'displayName', mu.display_name, 'email', mu.email)
        ) FILTER (WHERE m.id IS NOT NULL),
        '[]'
      ) AS mentions
    FROM comments c
    JOIN users u ON u.id = c.author_user_id
    LEFT JOIN mentions m ON m.comment_id = c.id
    LEFT JOIN users mu ON mu.id = m.mentioned_user_id
    WHERE c.workspace_id = $1
      AND c.target_type = $2
      AND c.target_id = $3
      AND c.deleted_at IS NULL
    GROUP BY c.id, u.id
    ORDER BY c.created_at ASC;
  `;
  const res = await query(sql, [workspaceId, targetType, targetId], client);
  return res.rows.map(row => ({
    id: row.id,
    workspaceId: row.workspace_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    targetType: row.target_type,
    targetId: row.target_id,
    content: row.content,
    mentions: row.mentions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function findCommentById(id, client = pool) {
  const sql = `
    SELECT c.*, u.display_name AS author_name, u.email AS author_email
    FROM comments c
    JOIN users u ON u.id = c.author_user_id
    WHERE c.id = $1;
  `;
  const res = await query(sql, [id], client);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    targetType: row.target_type,
    targetId: row.target_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function deleteComment(id, client = pool) {
  const sql = `
    UPDATE comments
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, deleted_at;
  `;
  const res = await query(sql, [id], client);
  return res.rows.length > 0;
}

// ==========================================
// 4. Mentions
// ==========================================

export async function createMentions(commentId, mentionedUserIds = [], client = pool) {
  if (!mentionedUserIds || mentionedUserIds.length === 0) return [];
  const results = [];
  for (const userId of mentionedUserIds) {
    const sql = `
      INSERT INTO mentions (comment_id, mentioned_user_id)
      VALUES ($1, $2)
      ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING
      RETURNING id, comment_id, mentioned_user_id, created_at;
    `;
    const res = await query(sql, [commentId, userId], client);
    if (res.rows[0]) results.push(res.rows[0]);
  }
  return results;
}

// ==========================================
// 5. Activity Entries
// ==========================================

export async function createActivityEntry(data, client = pool) {
  const { workspaceId, actorUserId, targetType, targetId, activityType, metadata = {} } = data;
  const sql = `
    INSERT INTO activity_entries (workspace_id, actor_user_id, target_type, target_id, activity_type, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, workspace_id, actor_user_id, target_type, target_id, activity_type, metadata, created_at;
  `;
  const res = await query(
    sql,
    [workspaceId, actorUserId, targetType, targetId, activityType, JSON.stringify(metadata)],
    client,
  );
  return res.rows[0];
}

export async function listActivityEntries(params, client = pool) {
  const { workspaceId, targetType, targetId, limit = 20 } = params;
  const conditions = ['ae.workspace_id = $1'];
  const values = [workspaceId];
  let idx = 2;

  if (targetType) {
    conditions.push(`ae.target_type = $${idx++}`);
    values.push(targetType);
  }
  if (targetId) {
    conditions.push(`ae.target_id = $${idx++}`);
    values.push(targetId);
  }

  values.push(limit);
  const sql = `
    SELECT ae.*,
      u.display_name AS actor_name,
      u.email AS actor_email
    FROM activity_entries ae
    JOIN users u ON u.id = ae.actor_user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ae.created_at DESC
    LIMIT $${idx};
  `;
  const res = await query(sql, values, client);
  return res.rows.map(row => ({
    id: row.id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    targetType: row.target_type,
    targetId: row.target_id,
    activityType: row.activity_type,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

// ==========================================
// 6. Reminder Recipients (Shared Reminders)
// ==========================================

export async function createReminderRecipient(reminderId, userId, triggerAt, client = pool) {
  const sql = `
    INSERT INTO reminder_recipients (reminder_id, user_id, recipient_status, next_trigger_at)
    VALUES ($1, $2, 'PENDING', $3)
    ON CONFLICT (reminder_id, user_id) DO UPDATE
      SET recipient_status = 'PENDING',
          next_trigger_at = EXCLUDED.next_trigger_at,
          dismissed_at = NULL,
          snoozed_until = NULL,
          updated_at = CURRENT_TIMESTAMP
    RETURNING id, reminder_id, user_id, recipient_status, next_trigger_at, dismissed_at, snoozed_until, created_at, updated_at;
  `;
  const res = await query(sql, [reminderId, userId, triggerAt], client);
  return res.rows[0];
}

export async function listReminderRecipients(reminderId, client = pool) {
  const sql = `
    SELECT rr.*,
      u.display_name AS user_name,
      u.email AS user_email
    FROM reminder_recipients rr
    JOIN users u ON u.id = rr.user_id
    WHERE rr.reminder_id = $1
    ORDER BY rr.created_at ASC;
  `;
  const res = await query(sql, [reminderId], client);
  return res.rows.map(r => ({
    id: r.id,
    reminderId: r.reminder_id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    recipientStatus: r.recipient_status,
    nextTriggerAt: r.next_trigger_at,
    dismissedAt: r.dismissed_at,
    snoozedUntil: r.snoozed_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function findReminderRecipient(reminderId, userId, client = pool) {
  const sql = `
    SELECT * FROM reminder_recipients
    WHERE reminder_id = $1 AND user_id = $2;
  `;
  const res = await query(sql, [reminderId, userId], client);
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    reminderId: r.reminder_id,
    userId: r.user_id,
    recipientStatus: r.recipient_status,
    nextTriggerAt: r.next_trigger_at,
    dismissedAt: r.dismissed_at,
    snoozedUntil: r.snoozed_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function snoozeRecipient(reminderId, userId, snoozedUntil, client = pool) {
  const sql = `
    UPDATE reminder_recipients
    SET recipient_status = 'SNOOZED',
        snoozed_until = $3,
        next_trigger_at = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE reminder_id = $1 AND user_id = $2
    RETURNING id, reminder_id, user_id, recipient_status, next_trigger_at, snoozed_until, updated_at;
  `;
  const res = await query(sql, [reminderId, userId, snoozedUntil], client);
  return res.rows[0] || null;
}

export async function dismissRecipient(reminderId, userId, client = pool) {
  const sql = `
    UPDATE reminder_recipients
    SET recipient_status = 'DISMISSED',
        dismissed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE reminder_id = $1 AND user_id = $2
    RETURNING id, reminder_id, user_id, recipient_status, dismissed_at, updated_at;
  `;
  const res = await query(sql, [reminderId, userId], client);
  return res.rows[0] || null;
}
