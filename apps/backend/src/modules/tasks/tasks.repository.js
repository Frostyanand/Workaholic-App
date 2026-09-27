import { query, pool } from '../../core/db.js';
import { mapRecurrenceRuleRow } from '../recurrence/recurrence.repository.js';

/**
 * Maps raw SQL row to clean task domain object
 */
export function mapTaskRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    boardId: row.board_id,
    boardColumnId: row.board_column_id,
    parentTaskId: row.parent_task_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    startAt: row.start_at,
    dueAt: row.due_at,
    estimatedDuration: row.estimated_duration,
    completedAt: row.completed_at,
    recurrenceRuleId: row.recurrence_rule_id,
    createdBy: row.created_by,
    assignedTo: row.assigned_to,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...(row.creator_display_name ? { creatorDisplayName: row.creator_display_name } : {}),
    ...(row.assignee_display_name ? { assigneeDisplayName: row.assignee_display_name } : {}),
    ...(row.subtask_count !== undefined ? { subtaskCount: parseInt(row.subtask_count, 10) } : {}),
    ...(row.recurrence_rule_raw
      ? { recurrenceRule: mapRecurrenceRuleRow(row.recurrence_rule_raw) }
      : {}),
  };
}

/**
 * Create a new task in a workspace
 * @param {object} taskData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createTask(taskData, client = pool) {
  if (!taskData || typeof taskData !== 'object') {
    throw new TypeError('taskData must be an object');
  }
  const {
    workspaceId,
    projectId = null,
    boardId = null,
    boardColumnId = null,
    parentTaskId = null,
    title,
    description = null,
    status = 'TODO',
    priority = 'P3',
    startAt = null,
    dueAt = null,
    estimatedDuration = null,
    createdBy,
    assignedTo = null,
    recurrenceRuleId = null,
  } = taskData;

  if (!workspaceId || !title || !createdBy) {
    throw new Error('workspaceId, title, and createdBy are required to create a task');
  }

  const sql = `
    INSERT INTO tasks (
      workspace_id, project_id, board_id, board_column_id, parent_task_id,
      title, description, status, priority, start_at, due_at,
      estimated_duration, created_by, assigned_to, recurrence_rule_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `;
  const params = [
    workspaceId,
    projectId,
    boardId,
    boardColumnId,
    parentTaskId,
    title.trim(),
    description,
    status,
    priority,
    startAt,
    dueAt,
    estimatedDuration,
    createdBy,
    assignedTo,
    recurrenceRuleId,
  ];

  const result = await query(sql, params, client);
  return mapTaskRow(result.rows[0]);
}

/**
 * Find active or deleted task by ID and workspace ID
 * @param {string} id - Task UUID
 * @param {string} workspaceId - Workspace UUID
 * @param {object} [options={ includeDeleted: false }]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findTaskById(
  id,
  workspaceId,
  options = { includeDeleted: false },
  client = pool,
) {
  if (!id || !workspaceId) {
    throw new TypeError('Task ID and Workspace ID are required');
  }

  let sql = `
    SELECT
      t.*,
      to_jsonb(rr.*) AS recurrence_rule_raw,
      u_creator.display_name AS creator_display_name,
      u_assignee.display_name AS assignee_display_name,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
    FROM tasks t
    LEFT JOIN recurrence_rules rr ON t.recurrence_rule_id = rr.id
    LEFT JOIN users u_creator ON u_creator.id = t.created_by
    LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
    WHERE t.id = $1 AND t.workspace_id = $2
  `;
  const params = [id, workspaceId];

  if (!options.includeDeleted) {
    sql += ' AND t.deleted_at IS NULL';
  }

  const result = await query(sql, params, client);
  return mapTaskRow(result.rows[0]);
}

/**
 * List tasks with robust filtering, search, pagination, and sorting
 * @param {string} workspaceId - Workspace UUID
 * @param {object} [filters={}]
 * @param {object} [pagination={ limit: 20, offset: 0 }]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function listTasks(
  workspaceId,
  filters = {},
  pagination = { limit: 20, offset: 0 },
  client = pool,
) {
  if (!workspaceId) {
    throw new TypeError('Workspace ID is required');
  }

  const conditions = ['t.workspace_id = $1'];
  const params = [workspaceId];
  let paramIndex = 2;

  if (filters.includeDeleted !== true) {
    conditions.push('t.deleted_at IS NULL');
  } else if (filters.onlyDeleted === true) {
    conditions.push('t.deleted_at IS NOT NULL');
  }

  if (filters.status) {
    conditions.push(`t.status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters.priority) {
    conditions.push(`t.priority = $${paramIndex++}`);
    params.push(filters.priority);
  }

  if (filters.parentTaskId !== undefined) {
    if (filters.parentTaskId === null) {
      conditions.push('t.parent_task_id IS NULL');
    } else {
      conditions.push(`t.parent_task_id = $${paramIndex++}`);
      params.push(filters.parentTaskId);
    }
  }

  if (filters.assignedTo) {
    conditions.push(`t.assigned_to = $${paramIndex++}`);
    params.push(filters.assignedTo);
  }

  if (filters.projectId) {
    conditions.push(`t.project_id = $${paramIndex++}`);
    params.push(filters.projectId);
  }

  if (filters.boardId) {
    conditions.push(`t.board_id = $${paramIndex++}`);
    params.push(filters.boardId);
  }

  if (filters.boardColumnId) {
    conditions.push(`t.board_column_id = $${paramIndex++}`);
    params.push(filters.boardColumnId);
  }

  if (filters.overdue === true) {
    conditions.push(
      `t.status NOT IN ('COMPLETED', 'CANCELLED') AND t.due_at IS NOT NULL AND t.due_at < NOW()`,
    );
  }

  if (filters.labelId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = $${paramIndex++})`,
    );
    params.push(filters.labelId);
  }

  if (filters.search && filters.search.trim().length > 0) {
    const searchPattern = `%${filters.search.trim()}%`;
    conditions.push(
      `(t.title ILIKE $${paramIndex} OR (t.description IS NOT NULL AND t.description ILIKE $${paramIndex}))`,
    );
    params.push(searchPattern);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Safe sorting mapping
  const sortMap = {
    due_at: 't.due_at',
    dueAt: 't.due_at',
    priority: 't.priority',
    created_at: 't.created_at',
    createdAt: 't.created_at',
    title: 't.title',
    updated_at: 't.updated_at',
    updatedAt: 't.updated_at',
  };
  const sortCol = sortMap[filters.sort] || 't.created_at';
  const sortOrder = String(filters.order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Count query
  const countSql = `SELECT COUNT(*) AS total FROM tasks t WHERE ${whereClause}`;
  const countResult = await query(countSql, params, client);
  const total = parseInt(countResult.rows[0].total, 10);

  // Data query
  const limit = Math.min(Math.max(1, pagination.limit || 20), 100);
  const offset = Math.max(0, pagination.offset || 0);

  const dataSql = `
    SELECT
      t.*,
      u_creator.display_name AS creator_display_name,
      u_assignee.display_name AS assignee_display_name,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
    FROM tasks t
    LEFT JOIN users u_creator ON u_creator.id = t.created_by
    LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
    WHERE ${whereClause}
    ORDER BY ${sortCol} ${sortOrder} NULLS LAST, t.id ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  params.push(limit, offset);

  const dataResult = await query(dataSql, params, client);
  return {
    tasks: dataResult.rows.map(mapTaskRow),
    total,
    limit,
    offset,
  };
}

/**
 * Update task with optimistic concurrency protection
 * @param {string} id - Task UUID
 * @param {string} workspaceId - Workspace UUID
 * @param {object} updateData - Fields to update
 * @param {number|null} [expectedVersion=null] - Concurrency version
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateTask(
  id,
  workspaceId,
  updateData,
  expectedVersion = null,
  client = pool,
) {
  if (!id || !workspaceId) {
    throw new TypeError('Task ID and Workspace ID are required');
  }

  const setClauses = [];
  const params = [id, workspaceId];
  let paramIndex = 3;

  const allowedFields = {
    title: 'title',
    description: 'description',
    status: 'status',
    priority: 'priority',
    startAt: 'start_at',
    dueAt: 'due_at',
    estimatedDuration: 'estimated_duration',
    completedAt: 'completed_at',
    assignedTo: 'assigned_to',
    parentTaskId: 'parent_task_id',
    projectId: 'project_id',
    boardId: 'board_id',
    boardColumnId: 'board_column_id',
    recurrenceRuleId: 'recurrence_rule_id',
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (key in updateData) {
      let val = updateData[key];
      if (key === 'title' && typeof val === 'string') {
        val = val.trim();
      }
      setClauses.push(`${col} = $${paramIndex++}`);
      params.push(val);
    }
  }

  if (setClauses.length === 0) {
    return findTaskById(id, workspaceId, { includeDeleted: false }, client);
  }

  // Version bump & updated_at
  setClauses.push('version = version + 1');
  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  let sql = `
    UPDATE tasks
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
  `;

  if (expectedVersion !== null && expectedVersion !== undefined) {
    sql += ` AND version = $${paramIndex++}`;
    params.push(expectedVersion);
  }

  sql += ' RETURNING *';

  const result = await query(sql, params, client);
  if (result.rows.length === 0) {
    return null;
  }
  return mapTaskRow(result.rows[0]);
}

/**
 * Soft delete a task
 * @param {string} id - Task UUID
 * @param {string} workspaceId - Workspace UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function softDeleteTask(id, workspaceId, client = pool) {
  if (!id || !workspaceId) {
    throw new TypeError('Task ID and Workspace ID are required');
  }

  const sql = `
    UPDATE tasks
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *
  `;
  const result = await query(sql, [id, workspaceId], client);
  return mapTaskRow(result.rows[0]);
}

/**
 * Restore a soft-deleted task
 * @param {string} id - Task UUID
 * @param {string} workspaceId - Workspace UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function restoreTask(id, workspaceId, client = pool) {
  if (!id || !workspaceId) {
    throw new TypeError('Task ID and Workspace ID are required');
  }

  const sql = `
    UPDATE tasks
    SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NOT NULL
    RETURNING *
  `;
  const result = await query(sql, [id, workspaceId], client);
  return mapTaskRow(result.rows[0]);
}

/**
 * Find subtasks for a given parent task
 * @param {string} parentTaskId - Parent task UUID
 * @param {string} workspaceId - Workspace UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findSubtasks(parentTaskId, workspaceId, client = pool) {
  if (!parentTaskId || !workspaceId) {
    throw new TypeError('Parent Task ID and Workspace ID are required');
  }

  const sql = `
    SELECT
      t.*,
      u_creator.display_name AS creator_display_name,
      u_assignee.display_name AS assignee_display_name,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.deleted_at IS NULL) AS subtask_count
    FROM tasks t
    LEFT JOIN users u_creator ON u_creator.id = t.created_by
    LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to
    WHERE t.parent_task_id = $1 AND t.workspace_id = $2 AND t.deleted_at IS NULL
    ORDER BY t.created_at ASC
  `;
  const result = await query(sql, [parentTaskId, workspaceId], client);
  return result.rows.map(mapTaskRow);
}

/**
 * Get all ancestor IDs of a task using recursive traversal
 * @param {string} taskId - Task UUID
 * @param {string} workspaceId - Workspace UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getTaskAncestors(taskId, workspaceId, client = pool) {
  if (!taskId || !workspaceId) {
    throw new TypeError('Task ID and Workspace ID are required');
  }

  const sql = `
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_task_id, 1 AS depth
      FROM tasks
      WHERE id = $1 AND workspace_id = $2
      UNION ALL
      SELECT t.id, t.parent_task_id, a.depth + 1
      FROM tasks t
      JOIN ancestors a ON t.id = a.parent_task_id
      WHERE a.depth < 50
    )
    SELECT id FROM ancestors WHERE id != $1
  `;
  const result = await query(sql, [taskId, workspaceId], client);
  return result.rows.map(r => r.id);
}
