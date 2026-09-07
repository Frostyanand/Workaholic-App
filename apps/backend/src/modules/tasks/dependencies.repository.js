import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean task dependency domain object
 */
export function mapDependencyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    dependsOnTaskId: row.depends_on_task_id,
    dependencyType: row.dependency_type,
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...(row.target_title ? { dependsOnTaskTitle: row.target_title } : {}),
    ...(row.source_title ? { taskTitle: row.source_title } : {}),
  };
}

/**
 * Create a task dependency
 * @param {object} depData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createDependency(depData, client = pool) {
  if (!depData || typeof depData !== 'object') {
    throw new TypeError('depData must be an object');
  }
  const { taskId, dependsOnTaskId, dependencyType = 'BLOCKS', createdBy = null } = depData;

  if (!taskId || !dependsOnTaskId) {
    throw new Error('taskId and dependsOnTaskId are required');
  }

  const sql = `
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const result = await query(sql, [taskId, dependsOnTaskId, dependencyType, createdBy], client);
  return mapDependencyRow(result.rows[0]);
}

/**
 * Remove a dependency by ID and task ID
 * @param {string} id
 * @param {string} taskId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function removeDependency(id, taskId, client = pool) {
  if (!id || !taskId) {
    throw new TypeError('id and taskId are required');
  }

  const sql = `
    DELETE FROM task_dependencies
    WHERE id = $1 AND task_id = $2
    RETURNING *
  `;
  const result = await query(sql, [id, taskId], client);
  return result.rows.length > 0;
}

/**
 * Get all dependencies associated with a task (both prerequisites and dependents)
 * @param {string} taskId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getDependenciesForTask(taskId, client = pool) {
  if (!taskId) {
    throw new TypeError('taskId is required');
  }

  const sql = `
    SELECT
      td.*,
      t_target.title AS target_title,
      t_source.title AS source_title
    FROM task_dependencies td
    JOIN tasks t_target ON t_target.id = td.depends_on_task_id
    JOIN tasks t_source ON t_source.id = td.task_id
    WHERE (td.task_id = $1 OR td.depends_on_task_id = $1)
      AND t_target.deleted_at IS NULL
      AND t_source.deleted_at IS NULL
    ORDER BY td.created_at ASC
  `;
  const result = await query(sql, [taskId], client);
  return result.rows.map(mapDependencyRow);
}

/**
 * Retrieve all active dependencies in a workspace for cycle detection graph
 * @param {string} workspaceId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getAllDependenciesInWorkspace(workspaceId, client = pool) {
  if (!workspaceId) {
    throw new TypeError('workspaceId is required');
  }

  const sql = `
    SELECT
      td.id,
      td.task_id,
      td.depends_on_task_id,
      td.dependency_type
    FROM task_dependencies td
    JOIN tasks t1 ON t1.id = td.task_id
    JOIN tasks t2 ON t2.id = td.depends_on_task_id
    WHERE t1.workspace_id = $1
      AND t2.workspace_id = $1
      AND t1.deleted_at IS NULL
      AND t2.deleted_at IS NULL
  `;
  const result = await query(sql, [workspaceId], client);
  return result.rows.map(r => ({
    id: r.id,
    taskId: r.task_id,
    dependsOnTaskId: r.depends_on_task_id,
    dependencyType: r.dependency_type,
  }));
}
