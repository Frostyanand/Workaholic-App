import { query, withTransaction, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean workspace domain object
 */
export function mapWorkspaceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    workspaceType: row.workspace_type,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...(row.member_role ? { memberRole: row.member_role } : {}),
    ...(row.member_status ? { memberStatus: row.member_status } : {}),
  };
}

/**
 * Maps raw SQL row to clean membership domain object
 */
export function mapMembershipRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.display_name ? { userDisplayName: row.display_name } : {}),
    ...(row.email ? { userEmail: row.email } : {}),
  };
}

/**
 * Find active workspace by ID
 * @param {string} id - Workspace UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findWorkspaceById(id, client = pool) {
  if (!id) throw new TypeError('Workspace ID is required');

  const sql = `
    SELECT id, name, workspace_type, owner_user_id, created_at, updated_at, deleted_at
    FROM workspaces
    WHERE id = $1 AND deleted_at IS NULL
  `;
  const result = await query(sql, [id], client);
  return mapWorkspaceRow(result.rows[0]);
}

/**
 * Find all active workspaces a user has an active membership in (tenant isolation)
 * @param {string} userId - User UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findWorkspacesForUser(userId, client = pool) {
  if (!userId) throw new TypeError('User ID is required');

  const sql = `
    SELECT
      w.id,
      w.name,
      w.workspace_type,
      w.owner_user_id,
      w.created_at,
      w.updated_at,
      w.deleted_at,
      wm.role AS member_role,
      wm.status AS member_status
    FROM workspaces w
    JOIN workspace_memberships wm ON wm.workspace_id = w.id
    WHERE wm.user_id = $1
      AND wm.status = 'ACTIVE'
      AND w.deleted_at IS NULL
    ORDER BY w.created_at ASC
  `;
  const result = await query(sql, [userId], client);
  return result.rows.map(mapWorkspaceRow);
}

/**
 * Create a workspace and owner membership atomically inside a transaction
 * @param {object} workspaceData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createWorkspaceWithMembership(workspaceData, client = pool) {
  if (!workspaceData || typeof workspaceData !== 'object') {
    throw new TypeError('workspaceData must be an object');
  }
  const { name, workspaceType = 'PERSONAL', ownerUserId } = workspaceData;

  if (!name || !ownerUserId) {
    throw new Error('name and ownerUserId are required to create a workspace');
  }

  return withTransaction(async txClient => {
    // 1. Insert workspace
    const insertWorkspaceSql = `
      INSERT INTO workspaces (name, workspace_type, owner_user_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, workspace_type, owner_user_id, created_at, updated_at, deleted_at
    `;
    const wsResult = await query(insertWorkspaceSql, [name, workspaceType, ownerUserId], txClient);
    const workspace = wsResult.rows[0];

    // 2. Insert owner membership
    const insertMembershipSql = `
      INSERT INTO workspace_memberships (workspace_id, user_id, role, status, joined_at)
      VALUES ($1, $2, 'OWNER', 'ACTIVE', CURRENT_TIMESTAMP)
      RETURNING id, workspace_id, user_id, role, status, joined_at, created_at, updated_at
    `;
    const memResult = await query(insertMembershipSql, [workspace.id, ownerUserId], txClient);
    const membership = memResult.rows[0];

    return {
      workspace: mapWorkspaceRow(workspace),
      membership: mapMembershipRow(membership),
    };
  }, client);
}

/**
 * Find memberships for a workspace
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findWorkspaceMemberships(workspaceId, client = pool) {
  if (!workspaceId) throw new TypeError('Workspace ID is required');

  const sql = `
    SELECT
      wm.id,
      wm.workspace_id,
      wm.user_id,
      wm.role,
      wm.status,
      wm.joined_at,
      wm.created_at,
      wm.updated_at,
      u.display_name,
      u.email
    FROM workspace_memberships wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = $1
      AND u.deleted_at IS NULL
    ORDER BY wm.created_at ASC
  `;
  const result = await query(sql, [workspaceId], client);
  return result.rows.map(mapMembershipRow);
}

/**
 * Add a member to a workspace
 * @param {object} membershipData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function addWorkspaceMembership(membershipData, client = pool) {
  if (!membershipData || typeof membershipData !== 'object') {
    throw new TypeError('membershipData must be an object');
  }
  const { workspaceId, userId, role = 'MEMBER', status = 'ACTIVE' } = membershipData;

  if (!workspaceId || !userId) {
    throw new Error('workspaceId and userId are required');
  }

  const joinedAt = status === 'ACTIVE' ? new Date() : null;

  const sql = `
    INSERT INTO workspace_memberships (
      workspace_id,
      user_id,
      role,
      status,
      joined_at
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, workspace_id, user_id, role, status, joined_at, created_at, updated_at
  `;
  const result = await query(sql, [workspaceId, userId, role, status, joinedAt], client);
  return mapMembershipRow(result.rows[0]);
}

/**
 * Update member role in workspace
 * @param {string} workspaceId
 * @param {string} userId
 * @param {string} role
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateMembershipRole(workspaceId, userId, role, client = pool) {
  if (!workspaceId || !userId || !role) {
    throw new Error('workspaceId, userId, and role are required');
  }

  const sql = `
    UPDATE workspace_memberships
    SET role = $3, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = $1 AND user_id = $2
    RETURNING id, workspace_id, user_id, role, status, joined_at, created_at, updated_at
  `;
  const result = await query(sql, [workspaceId, userId, role], client);
  return mapMembershipRow(result.rows[0]);
}

/**
 * Soft delete a workspace
 * @param {string} id - Workspace UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function softDeleteWorkspace(id, client = pool) {
  if (!id) throw new TypeError('Workspace ID is required');

  const sql = `
    UPDATE workspaces
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, deleted_at
  `;
  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}
