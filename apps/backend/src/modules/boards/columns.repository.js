import { pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean board column domain object
 */
export function mapColumnRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    position: row.position,
    statusMapping: row.status_mapping,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.task_count !== undefined ? { taskCount: parseInt(row.task_count, 10) } : {}),
  };
}

/**
 * Create a new column on a board
 * @param {object} columnData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createColumn(columnData, client = pool) {
  const { boardId, name, statusMapping = null } = columnData;
  let { position } = columnData;

  if (position === undefined || position === null) {
    const posRes = await client.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM board_columns WHERE board_id = $1',
      [boardId],
    );
    position = parseInt(posRes.rows[0].next_pos, 10);
  }

  const sql = `
    INSERT INTO board_columns (
      board_id,
      name,
      position,
      status_mapping
    ) VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;

  const result = await client.query(sql, [boardId, name.trim(), position, statusMapping]);

  return mapColumnRow(result.rows[0]);
}

/**
 * Find column by ID
 * @param {string} id
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findColumnById(id, client = pool) {
  const sql = `
    SELECT
      bc.*,
      b.workspace_id
    FROM board_columns bc
    JOIN boards b ON b.id = bc.board_id
    WHERE bc.id = $1;
  `;

  const result = await client.query(sql, [id]);
  return mapColumnRow(result.rows[0]);
}

/**
 * List columns for a board with task counts ordered by position
 * @param {string} boardId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function listColumnsByBoard(boardId, client = pool) {
  const sql = `
    SELECT
      bc.*,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS task_count
    FROM board_columns bc
    LEFT JOIN tasks t ON t.board_column_id = bc.id
    WHERE bc.board_id = $1
    GROUP BY bc.id
    ORDER BY bc.position ASC;
  `;

  const result = await client.query(sql, [boardId]);
  return result.rows.map(mapColumnRow);
}

/**
 * Update column
 * @param {string} id
 * @param {object} updates
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateColumn(id, updates, client = pool) {
  const setClauses = [];
  const params = [id];
  let paramIdx = 2;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIdx}`);
    params.push(updates.name.trim());
    paramIdx += 1;
  }

  if (updates.statusMapping !== undefined) {
    setClauses.push(`status_mapping = $${paramIdx}`);
    params.push(updates.statusMapping);
    paramIdx += 1;
  }

  if (setClauses.length === 0) {
    return findColumnById(id, client);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE board_columns
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;

  const result = await client.query(sql, params);
  return mapColumnRow(result.rows[0]);
}

/**
 * Delete a column
 * @param {string} id
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function deleteColumn(id, client = pool) {
  const sql = `
    DELETE FROM board_columns
    WHERE id = $1
    RETURNING *;
  `;

  const result = await client.query(sql, [id]);
  return mapColumnRow(result.rows[0]);
}

/**
 * Reorder columns on a board safely within transaction
 * @param {string} boardId
 * @param {string[]} columnIds
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function reorderColumns(boardId, columnIds, client = pool) {
  // Step 1: Temporarily offset positions by +10000 to avoid unique constraint collision
  await client.query('UPDATE board_columns SET position = position + 10000 WHERE board_id = $1', [
    boardId,
  ]);

  // Step 2: Assign contiguous positions 0, 1, 2, ...
  for (let pos = 0; pos < columnIds.length; pos += 1) {
    const colId = columnIds[pos];
    await client.query(
      `UPDATE board_columns
       SET position = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND board_id = $3`,
      [pos, colId, boardId],
    );
  }

  return listColumnsByBoard(boardId, client);
}
