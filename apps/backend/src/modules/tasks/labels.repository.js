import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean label domain object
 */
export function mapLabelRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Create a new label in a workspace
 * @param {object} labelData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createLabel(labelData, client = pool) {
  if (!labelData || typeof labelData !== 'object') {
    throw new TypeError('labelData must be an object');
  }
  const { workspaceId, name, color = '#4F46E5', description = null } = labelData;

  if (!workspaceId || !name) {
    throw new Error('workspaceId and name are required to create a label');
  }

  const sql = `
    INSERT INTO labels (workspace_id, name, color, description)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const result = await query(sql, [workspaceId, name.trim(), color, description], client);
  return mapLabelRow(result.rows[0]);
}

/**
 * Find label by ID and workspace ID
 * @param {string} id - Label UUID
 * @param {string} workspaceId - Workspace UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findLabelById(id, workspaceId, client = pool) {
  if (!id || !workspaceId) {
    throw new TypeError('Label ID and Workspace ID are required');
  }

  const sql = `
    SELECT *
    FROM labels
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
  `;
  const result = await query(sql, [id, workspaceId], client);
  return mapLabelRow(result.rows[0]);
}

/**
 * Find active label by name in workspace
 * @param {string} name
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findLabelByName(name, workspaceId, client = pool) {
  if (!name || !workspaceId) {
    throw new TypeError('Name and Workspace ID are required');
  }

  const sql = `
    SELECT *
    FROM labels
    WHERE LOWER(name) = LOWER($1) AND workspace_id = $2 AND deleted_at IS NULL
  `;
  const result = await query(sql, [name.trim(), workspaceId], client);
  return mapLabelRow(result.rows[0]);
}

/**
 * List all active labels in a workspace
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function listLabels(workspaceId, client = pool) {
  if (!workspaceId) {
    throw new TypeError('Workspace ID is required');
  }

  const sql = `
    SELECT *
    FROM labels
    WHERE workspace_id = $1 AND deleted_at IS NULL
    ORDER BY name ASC
  `;
  const result = await query(sql, [workspaceId], client);
  return result.rows.map(mapLabelRow);
}

/**
 * Update a label
 * @param {string} id
 * @param {string} workspaceId
 * @param {object} updateData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateLabel(id, workspaceId, updateData, client = pool) {
  if (!id || !workspaceId) {
    throw new TypeError('Label ID and Workspace ID are required');
  }

  const setClauses = [];
  const params = [id, workspaceId];
  let paramIndex = 3;

  if (updateData.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updateData.name.trim());
  }
  if (updateData.color !== undefined) {
    setClauses.push(`color = $${paramIndex++}`);
    params.push(updateData.color);
  }
  if (updateData.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(updateData.description);
  }

  if (setClauses.length === 0) {
    return findLabelById(id, workspaceId, client);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE labels
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *
  `;
  const result = await query(sql, params, client);
  return mapLabelRow(result.rows[0]);
}

/**
 * Soft delete a label
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function deleteLabel(id, workspaceId, client = pool) {
  if (!id || !workspaceId) {
    throw new TypeError('Label ID and Workspace ID are required');
  }

  const sql = `
    UPDATE labels
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *
  `;
  const result = await query(sql, [id, workspaceId], client);
  return mapLabelRow(result.rows[0]);
}

/**
 * Attach a label to a task
 * @param {string} taskId
 * @param {string} labelId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function attachLabelToTask(taskId, labelId, client = pool) {
  if (!taskId || !labelId) {
    throw new TypeError('taskId and labelId are required');
  }

  const sql = `
    INSERT INTO task_labels (task_id, label_id)
    VALUES ($1, $2)
    ON CONFLICT (task_id, label_id) DO NOTHING
    RETURNING *
  `;
  const result = await query(sql, [taskId, labelId], client);
  return result.rows[0] || null;
}

/**
 * Detach a label from a task
 * @param {string} taskId
 * @param {string} labelId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function detachLabelFromTask(taskId, labelId, client = pool) {
  if (!taskId || !labelId) {
    throw new TypeError('taskId and labelId are required');
  }

  const sql = `
    DELETE FROM task_labels
    WHERE task_id = $1 AND label_id = $2
    RETURNING *
  `;
  const result = await query(sql, [taskId, labelId], client);
  return result.rows.length > 0;
}

/**
 * Get all labels attached to a task
 * @param {string} taskId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getLabelsForTask(taskId, client = pool) {
  if (!taskId) {
    throw new TypeError('taskId is required');
  }

  const sql = `
    SELECT l.*
    FROM labels l
    JOIN task_labels tl ON tl.label_id = l.id
    WHERE tl.task_id = $1 AND l.deleted_at IS NULL
    ORDER BY l.name ASC
  `;
  const result = await query(sql, [taskId], client);
  return result.rows.map(mapLabelRow);
}
