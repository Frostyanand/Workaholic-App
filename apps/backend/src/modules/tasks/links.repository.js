import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean task link domain object
 */
export function mapLinkRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    url: row.url,
    title: row.title,
    linkType: row.link_type,
    createdAt: row.created_at,
  };
}

/**
 * Create a link associated with a task
 * @param {object} linkData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createLink(linkData, client = pool) {
  if (!linkData || typeof linkData !== 'object') {
    throw new TypeError('linkData must be an object');
  }
  const { taskId, url, title = null, linkType = 'EXTERNAL' } = linkData;

  if (!taskId || !url) {
    throw new Error('taskId and url are required');
  }

  const sql = `
    INSERT INTO task_links (task_id, url, title, link_type)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const result = await query(sql, [taskId, url.trim(), title, linkType], client);
  return mapLinkRow(result.rows[0]);
}

/**
 * Remove a link by ID and task ID
 * @param {string} id
 * @param {string} taskId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function removeLink(id, taskId, client = pool) {
  if (!id || !taskId) {
    throw new TypeError('id and taskId are required');
  }

  const sql = `
    DELETE FROM task_links
    WHERE id = $1 AND task_id = $2
    RETURNING *
  `;
  const result = await query(sql, [id, taskId], client);
  return result.rows.length > 0;
}

/**
 * Get all links for a task
 * @param {string} taskId
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function getLinksForTask(taskId, client = pool) {
  if (!taskId) {
    throw new TypeError('taskId is required');
  }

  const sql = `
    SELECT *
    FROM task_links
    WHERE task_id = $1
    ORDER BY created_at ASC
  `;
  const result = await query(sql, [taskId], client);
  return result.rows.map(mapLinkRow);
}
