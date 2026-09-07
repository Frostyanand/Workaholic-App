import { pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean project domain object
 */
export function mapProjectRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    status: row.status,
    ownerUserId: row.owner_user_id,
    startAt: row.start_at,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...(row.owner_display_name ? { ownerDisplayName: row.owner_display_name } : {}),
    ...(row.task_count !== undefined ? { taskCount: parseInt(row.task_count, 10) } : {}),
    ...(row.completed_task_count !== undefined
      ? { completedTaskCount: parseInt(row.completed_task_count, 10) }
      : {}),
  };
}

/**
 * Create a new project in a workspace
 * @param {object} projectData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createProject(projectData, client = pool) {
  if (!projectData || typeof projectData !== 'object') {
    throw new TypeError('projectData must be an object');
  }

  const {
    workspaceId,
    name,
    description = null,
    status = 'ACTIVE',
    ownerUserId = null,
    startAt = null,
    dueAt = null,
  } = projectData;

  const sql = `
    INSERT INTO projects (
      workspace_id,
      name,
      description,
      status,
      owner_user_id,
      start_at,
      due_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;

  const params = [workspaceId, name.trim(), description, status, ownerUserId, startAt, dueAt];

  const result = await client.query(sql, params);
  return mapProjectRow(result.rows[0]);
}

/**
 * Find project by ID within workspace context
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 * @param {boolean} [includeDeleted=false]
 */
export async function findProjectById(id, workspaceId, client = pool, includeDeleted = false) {
  const sql = `
    SELECT
      p.*,
      u.display_name AS owner_display_name,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS task_count,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status = 'COMPLETED') AS completed_task_count
    FROM projects p
    LEFT JOIN users u ON u.id = p.owner_user_id
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.id = $1
      AND p.workspace_id = $2
      ${includeDeleted ? '' : 'AND p.deleted_at IS NULL'}
    GROUP BY p.id, u.display_name;
  `;

  const result = await client.query(sql, [id, workspaceId]);
  return mapProjectRow(result.rows[0]);
}

/**
 * List projects within workspace context with filtering, searching, and pagination
 * @param {string} workspaceId
 * @param {object} [filters={}]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function listProjects(workspaceId, filters = {}, client = pool) {
  const {
    status,
    search,
    sort = 'created_at',
    order = 'desc',
    limit = 50,
    offset = 0,
    includeDeleted = false,
  } = filters;

  const conditions = ['p.workspace_id = $1'];
  const params = [workspaceId];
  let paramIdx = 2;

  if (!includeDeleted) {
    conditions.push('p.deleted_at IS NULL');
  }

  if (status) {
    conditions.push(`p.status = $${paramIdx}`);
    params.push(status);
    paramIdx += 1;
  }

  if (search && search.trim()) {
    conditions.push(`(p.name ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx})`);
    params.push(`%${search.trim()}%`);
    paramIdx += 1;
  }

  const allowedSorts = {
    created_at: 'p.created_at',
    createdAt: 'p.created_at',
    updated_at: 'p.updated_at',
    updatedAt: 'p.updated_at',
    name: 'p.name',
    due_at: 'p.due_at',
    dueAt: 'p.due_at',
  };

  const sortCol = allowedSorts[sort] || 'p.created_at';
  const sortDir = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const whereClause = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM projects p WHERE ${whereClause};`;
  const countResult = await client.query(countSql, params);
  const total = parseInt(countResult.rows[0].total, 10);

  const querySql = `
    SELECT
      p.*,
      u.display_name AS owner_display_name,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS task_count,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status = 'COMPLETED') AS completed_task_count
    FROM projects p
    LEFT JOIN users u ON u.id = p.owner_user_id
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE ${whereClause}
    GROUP BY p.id, u.display_name
    ORDER BY ${sortCol} ${sortDir}
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1};
  `;

  params.push(limit, offset);
  const result = await client.query(querySql, params);

  return {
    projects: result.rows.map(mapProjectRow),
    total,
  };
}

/**
 * Update project fields in a workspace
 * @param {string} id
 * @param {string} workspaceId
 * @param {object} updates
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateProject(id, workspaceId, updates, client = pool) {
  const setClauses = [];
  const params = [id, workspaceId];
  let paramIdx = 3;

  const allowedFields = {
    name: 'name',
    description: 'description',
    status: 'status',
    ownerUserId: 'owner_user_id',
    startAt: 'start_at',
    dueAt: 'due_at',
  };

  for (const [key, column] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push(key === 'name' ? updates[key].trim() : updates[key]);
      paramIdx += 1;
    }
  }

  if (setClauses.length === 0) {
    return findProjectById(id, workspaceId, client);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE projects
    SET ${setClauses.join(', ')}
    WHERE id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, params);
  return mapProjectRow(result.rows[0]);
}

/**
 * Soft-delete a project
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function softDeleteProject(id, workspaceId, client = pool) {
  const sql = `
    UPDATE projects
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, [id, workspaceId]);
  return mapProjectRow(result.rows[0]);
}

/**
 * Restore a soft-deleted project
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function restoreProject(id, workspaceId, client = pool) {
  const sql = `
    UPDATE projects
    SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND workspace_id = $2
      AND deleted_at IS NOT NULL
    RETURNING *;
  `;

  const result = await client.query(sql, [id, workspaceId]);
  return mapProjectRow(result.rows[0]);
}

/**
 * Add a member to a project
 * @param {string} projectId
 * @param {string} userId
 * @param {string} [role='MEMBER']
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function addProjectMember(projectId, userId, role = 'MEMBER', client = pool) {
  const sql = `
    INSERT INTO project_members (project_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET role = EXCLUDED.role
    RETURNING *;
  `;

  const result = await client.query(sql, [projectId, userId, role]);
  return result.rows[0];
}

/**
 * Remove a member from a project
 * @param {string} projectId
 * @param {string} userId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function removeProjectMember(projectId, userId, client = pool) {
  const sql = `
    DELETE FROM project_members
    WHERE project_id = $1 AND user_id = $2
    RETURNING *;
  `;

  const result = await client.query(sql, [projectId, userId]);
  return result.rows[0] || null;
}

/**
 * List members of a project
 * @param {string} projectId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function listProjectMembers(projectId, client = pool) {
  const sql = `
    SELECT
      pm.project_id AS "projectId",
      pm.user_id AS "userId",
      pm.role,
      pm.created_at AS "createdAt",
      u.email,
      u.display_name AS "displayName",
      u.profile_image_reference AS "avatarUrl"
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = $1
    ORDER BY pm.created_at ASC;
  `;

  const result = await client.query(sql, [projectId]);
  return result.rows;
}
