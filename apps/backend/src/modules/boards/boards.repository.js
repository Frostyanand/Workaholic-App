import { pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean board domain object
 */
export function mapBoardRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...(row.project_name ? { projectName: row.project_name } : {}),
    ...(row.creator_display_name ? { creatorDisplayName: row.creator_display_name } : {}),
    ...(row.task_count !== undefined ? { taskCount: parseInt(row.task_count, 10) } : {}),
    ...(row.column_count !== undefined ? { columnCount: parseInt(row.column_count, 10) } : {}),
  };
}

/**
 * Create a new board
 * @param {object} boardData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createBoard(boardData, client = pool) {
  const { workspaceId, projectId = null, name, description = null, createdBy } = boardData;

  const sql = `
    INSERT INTO boards (
      workspace_id,
      project_id,
      name,
      description,
      created_by
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const result = await client.query(sql, [
    workspaceId,
    projectId,
    name.trim(),
    description,
    createdBy,
  ]);

  return mapBoardRow(result.rows[0]);
}

/**
 * Find board by ID within workspace context
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 * @param {boolean} [includeDeleted=false]
 */
export async function findBoardById(id, workspaceId, client = pool, includeDeleted = false) {
  const sql = `
    SELECT
      b.*,
      p.name AS project_name,
      u.display_name AS creator_display_name,
      COUNT(DISTINCT t.id) FILTER (WHERE t.deleted_at IS NULL) AS task_count,
      COUNT(DISTINCT bc.id) AS column_count
    FROM boards b
    LEFT JOIN projects p ON p.id = b.project_id
    LEFT JOIN users u ON u.id = b.created_by
    LEFT JOIN tasks t ON t.board_id = b.id
    LEFT JOIN board_columns bc ON bc.board_id = b.id
    WHERE b.id = $1
      AND b.workspace_id = $2
      ${includeDeleted ? '' : 'AND b.deleted_at IS NULL'}
    GROUP BY b.id, p.name, u.display_name;
  `;

  const result = await client.query(sql, [id, workspaceId]);
  return mapBoardRow(result.rows[0]);
}

/**
 * List boards within workspace context
 * @param {string} workspaceId
 * @param {object} [filters={}]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function listBoards(workspaceId, filters = {}, client = pool) {
  const {
    projectId,
    search,
    sort = 'created_at',
    order = 'desc',
    limit = 50,
    offset = 0,
    includeDeleted = false,
  } = filters;

  const conditions = ['b.workspace_id = $1'];
  const params = [workspaceId];
  let paramIdx = 2;

  if (!includeDeleted) {
    conditions.push('b.deleted_at IS NULL');
  }

  if (projectId) {
    conditions.push(`b.project_id = $${paramIdx}`);
    params.push(projectId);
    paramIdx += 1;
  }

  if (search && search.trim()) {
    conditions.push(`(b.name ILIKE $${paramIdx} OR b.description ILIKE $${paramIdx})`);
    params.push(`%${search.trim()}%`);
    paramIdx += 1;
  }

  const allowedSorts = {
    created_at: 'b.created_at',
    createdAt: 'b.created_at',
    updated_at: 'b.updated_at',
    updatedAt: 'b.updated_at',
    name: 'b.name',
  };

  const sortCol = allowedSorts[sort] || 'b.created_at';
  const sortDir = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const whereClause = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM boards b WHERE ${whereClause};`;
  const countResult = await client.query(countSql, params);
  const total = parseInt(countResult.rows[0].total, 10);

  const querySql = `
    SELECT
      b.*,
      p.name AS project_name,
      u.display_name AS creator_display_name,
      COUNT(DISTINCT t.id) FILTER (WHERE t.deleted_at IS NULL) AS task_count,
      COUNT(DISTINCT bc.id) AS column_count
    FROM boards b
    LEFT JOIN projects p ON p.id = b.project_id
    LEFT JOIN users u ON u.id = b.created_by
    LEFT JOIN tasks t ON t.board_id = b.id
    LEFT JOIN board_columns bc ON bc.board_id = b.id
    WHERE ${whereClause}
    GROUP BY b.id, p.name, u.display_name
    ORDER BY ${sortCol} ${sortDir}
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1};
  `;

  params.push(limit, offset);
  const result = await client.query(querySql, params);

  return {
    boards: result.rows.map(mapBoardRow),
    total,
  };
}

/**
 * Update board fields
 * @param {string} id
 * @param {string} workspaceId
 * @param {object} updates
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateBoard(id, workspaceId, updates, client = pool) {
  const setClauses = [];
  const params = [id, workspaceId];
  let paramIdx = 3;

  const allowedFields = {
    name: 'name',
    description: 'description',
    projectId: 'project_id',
  };

  for (const [key, column] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push(key === 'name' ? updates[key].trim() : updates[key]);
      paramIdx += 1;
    }
  }

  if (setClauses.length === 0) {
    return findBoardById(id, workspaceId, client);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE boards
    SET ${setClauses.join(', ')}
    WHERE id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, params);
  return mapBoardRow(result.rows[0]);
}

/**
 * Soft-delete a board
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function softDeleteBoard(id, workspaceId, client = pool) {
  const sql = `
    UPDATE boards
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, [id, workspaceId]);
  return mapBoardRow(result.rows[0]);
}

/**
 * Restore a soft-deleted board
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function restoreBoard(id, workspaceId, client = pool) {
  const sql = `
    UPDATE boards
    SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND workspace_id = $2
      AND deleted_at IS NOT NULL
    RETURNING *;
  `;

  const result = await client.query(sql, [id, workspaceId]);
  return mapBoardRow(result.rows[0]);
}
