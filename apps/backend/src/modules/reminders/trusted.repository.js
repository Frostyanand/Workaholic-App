import { query, pool } from '../../core/db.js';

export async function createTrustedRelationship(
  ownerUserId,
  trustedUserId,
  permissions = ['trusted.reminders.receive'],
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
    RETURNING *;
  `;
  const resRel = await query(sqlRel, [ownerUserId, trustedUserId], client);
  const relationship = resRel.rows[0];

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

export async function revokeTrustedRelationship(ownerUserId, trustedUserId, client = pool) {
  const sql = `
    UPDATE trusted_relationships
    SET status = 'REVOKED',
        revoked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE owner_user_id = $1 AND trusted_user_id = $2
    RETURNING *;
  `;
  const res = await query(sql, [ownerUserId, trustedUserId], client);
  return res.rows.length > 0;
}
