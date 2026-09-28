import { pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean Note domain object.
 *
 * @param {Object} row
 * @param {Array<string>} [tags=[]]
 * @param {Array<Object>} [relationships=[]]
 * @returns {Object|null}
 */
export function mapNoteRow(row, tags = [], relationships = []) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    content: row.content,
    contentText: row.content_text,
    contentFormat: row.content_format,
    category: row.category,
    isPinned: Boolean(row.is_pinned),
    isFavorite: Boolean(row.is_favorite),
    isArchived: Boolean(row.is_archived),
    tags,
    relationships,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Maps raw SQL row to Tag domain object.
 */
export function mapTagRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    noteCount: row.note_count ? Number(row.note_count) : undefined,
  };
}

/**
 * Maps raw SQL row to NoteRelationship domain object.
 */
export function mapNoteRelationshipRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    noteId: row.note_id,
    targetType: row.target_type,
    targetId: row.target_id,
    relationshipType: row.relationship_type,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

/**
 * Creates a new note and links optional tags.
 *
 * @param {Object} noteData
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function createNote(noteData, client = pool) {
  const {
    workspaceId,
    ownerUserId,
    title = 'Untitled Note',
    content = [],
    contentText = '',
    contentFormat = 'STRUCTURED',
    category = null,
    isPinned = false,
    isFavorite = false,
    isArchived = false,
    tags = [],
  } = noteData;

  const sql = `
    INSERT INTO notes (
      workspace_id,
      owner_user_id,
      title,
      content,
      content_text,
      content_format,
      category,
      is_pinned,
      is_favorite,
      is_archived
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;

  const values = [
    workspaceId,
    ownerUserId,
    title,
    JSON.stringify(content),
    contentText,
    contentFormat,
    category,
    isPinned,
    isFavorite,
    isArchived,
  ];

  const res = await client.query(sql, values);
  const createdNote = res.rows[0];

  // Assign tags if provided
  let assignedTags = [];
  if (Array.isArray(tags) && tags.length > 0) {
    assignedTags = await syncNoteTags(createdNote.id, workspaceId, tags, client);
  }

  return mapNoteRow(createdNote, assignedTags);
}

/**
 * Retrieves a note by ID within a workspace.
 *
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findNoteById(id, workspaceId, client = pool) {
  const sql = `
    SELECT *
    FROM notes
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL;
  `;
  const res = await client.query(sql, [id, workspaceId]);
  if (res.rows.length === 0) {
    return null;
  }

  const noteRow = res.rows[0];

  // Load tags
  const tagsRes = await client.query(
    `SELECT t.name
     FROM tags t
     JOIN note_tags nt ON t.id = nt.tag_id
     WHERE nt.note_id = $1
     ORDER BY t.name ASC;`,
    [id],
  );
  const tagNames = tagsRes.rows.map(r => r.name);

  // Load relationships
  const relsRes = await client.query(
    `SELECT *
     FROM note_relationships
     WHERE note_id = $1 AND workspace_id = $2
     ORDER BY created_at ASC;`,
    [id, workspaceId],
  );
  const relationships = relsRes.rows.map(mapNoteRelationshipRow);

  return mapNoteRow(noteRow, tagNames, relationships);
}

/**
 * Queries notes in a workspace with filtering, search, and pagination.
 *
 * @param {string} workspaceId
 * @param {Object} [options={}]
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findNotesByWorkspace(workspaceId, options = {}, client = pool) {
  const {
    q,
    category,
    tag,
    isPinned,
    isFavorite,
    isArchived = false,
    limit = 50,
    offset = 0,
  } = options;

  const conditions = ['n.workspace_id = $1', 'n.deleted_at IS NULL'];
  const params = [workspaceId];
  let paramIdx = 2;

  // Filter archived
  if (typeof isArchived === 'boolean') {
    conditions.push(`n.is_archived = $${paramIdx++}`);
    params.push(isArchived);
  }

  // Filter pinned
  if (typeof isPinned === 'boolean') {
    conditions.push(`n.is_pinned = $${paramIdx++}`);
    params.push(isPinned);
  }

  // Filter favorite
  if (typeof isFavorite === 'boolean') {
    conditions.push(`n.is_favorite = $${paramIdx++}`);
    params.push(isFavorite);
  }

  // Filter category
  if (category) {
    conditions.push(`n.category = $${paramIdx++}`);
    params.push(category);
  }

  // Filter tag
  if (tag) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM note_tags nt_filter
        JOIN tags t_filter ON nt_filter.tag_id = t_filter.id
        WHERE nt_filter.note_id = n.id AND LOWER(t_filter.name) = LOWER($${paramIdx++})
      )
    `);
    params.push(tag);
  }

  // Full-text search or partial match
  if (q && q.trim()) {
    const cleanQ = q.trim();
    conditions.push(`
      (
        to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content_text, '')) @@ plainto_tsquery('english', $${paramIdx})
        OR n.title ILIKE $${paramIdx + 1}
        OR n.content_text ILIKE $${paramIdx + 1}
      )
    `);
    params.push(cleanQ, `%${cleanQ}%`);
    paramIdx += 2;
  }

  const whereClause = conditions.join(' AND ');

  // Count total query
  const countSql = `SELECT COUNT(*) as total FROM notes n WHERE ${whereClause};`;
  const countRes = await client.query(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  // Paginated query
  const selectSql = `
    SELECT
      n.*,
      COALESCE(
        (
          SELECT json_agg(t.name ORDER BY t.name)
          FROM note_tags nt
          JOIN tags t ON nt.tag_id = t.id
          WHERE nt.note_id = n.id
        ),
        '[]'::json
      ) as tag_names
    FROM notes n
    WHERE ${whereClause}
    ORDER BY n.is_pinned DESC, n.updated_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  params.push(limit, offset);
  const res = await client.query(selectSql, params);

  const notes = res.rows.map(row => {
    const tags = Array.isArray(row.tag_names) ? row.tag_names : [];
    return mapNoteRow(row, tags);
  });

  return { notes, total };
}

/**
 * Updates an existing note.
 *
 * @param {string} id
 * @param {string} workspaceId
 * @param {Object} noteData
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function updateNote(id, workspaceId, noteData, client = pool) {
  const updates = [];
  const params = [id, workspaceId];
  let paramIdx = 3;

  if (noteData.title !== undefined) {
    updates.push(`title = $${paramIdx++}`);
    params.push(noteData.title);
  }

  if (noteData.content !== undefined) {
    updates.push(`content = $${paramIdx++}`);
    params.push(JSON.stringify(noteData.content));
  }

  if (noteData.contentText !== undefined) {
    updates.push(`content_text = $${paramIdx++}`);
    params.push(noteData.contentText);
  }

  if (noteData.contentFormat !== undefined) {
    updates.push(`content_format = $${paramIdx++}`);
    params.push(noteData.contentFormat);
  }

  if (noteData.category !== undefined) {
    updates.push(`category = $${paramIdx++}`);
    params.push(noteData.category);
  }

  if (noteData.isPinned !== undefined) {
    updates.push(`is_pinned = $${paramIdx++}`);
    params.push(noteData.isPinned);
  }

  if (noteData.isFavorite !== undefined) {
    updates.push(`is_favorite = $${paramIdx++}`);
    params.push(noteData.isFavorite);
  }

  if (noteData.isArchived !== undefined) {
    updates.push(`is_archived = $${paramIdx++}`);
    params.push(noteData.isArchived);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const sql = `
    UPDATE notes
    SET ${updates.join(', ')}
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;

  const res = await client.query(sql, params);
  if (res.rows.length === 0) {
    return null;
  }

  const updatedRow = res.rows[0];

  // Sync tags if specified
  let tags = [];
  if (Array.isArray(noteData.tags)) {
    tags = await syncNoteTags(id, workspaceId, noteData.tags, client);
  } else {
    const existingTags = await client.query(
      `SELECT t.name FROM tags t JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = $1 ORDER BY t.name;`,
      [id],
    );
    tags = existingTags.rows.map(r => r.name);
  }

  return mapNoteRow(updatedRow, tags);
}

/**
 * Soft deletes a note.
 *
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function deleteNote(id, workspaceId, client = pool) {
  const sql = `
    UPDATE notes
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;
  const res = await client.query(sql, [id, workspaceId]);
  return mapNoteRow(res.rows[0]);
}

/**
 * Restores a soft-deleted note.
 *
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function restoreNote(id, workspaceId, client = pool) {
  const sql = `
    UPDATE notes
    SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NOT NULL
    RETURNING *;
  `;
  const res = await client.query(sql, [id, workspaceId]);
  return mapNoteRow(res.rows[0]);
}

/**
 * Synchronizes tags for a note (upserts tags and sets note_tags join rows).
 *
 * @param {string} noteId
 * @param {string} workspaceId
 * @param {Array<string>} tagNames
 * @param {import('pg').PoolClient} [client=pool]
 * @returns {Promise<Array<string>>}
 */
export async function syncNoteTags(noteId, workspaceId, tagNames, client = pool) {
  // Deduplicate and normalize
  const uniqueNames = Array.from(
    new Set(tagNames.map(t => String(t || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  // 1. Remove existing note_tags
  await client.query(`DELETE FROM note_tags WHERE note_id = $1;`, [noteId]);

  if (uniqueNames.length === 0) {
    return [];
  }

  // 2. Ensure each tag exists in workspace
  const tagIds = [];
  for (const name of uniqueNames) {
    const upsertSql = `
      INSERT INTO tags (workspace_id, name)
      VALUES ($1, $2)
      ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `;
    const res = await client.query(upsertSql, [workspaceId, name]);
    tagIds.push(res.rows[0].id);
  }

  // 3. Link tags
  for (const tagId of tagIds) {
    await client.query(
      `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
      [noteId, tagId],
    );
  }

  return uniqueNames;
}

/**
 * Adds an explicit relationship between a Note and another domain object.
 *
 * @param {Object} data
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function addNoteRelationship(data, client = pool) {
  const {
    workspaceId,
    noteId,
    targetType,
    targetId,
    relationshipType = 'RELATES_TO',
    metadata = {},
  } = data;

  const sql = `
    INSERT INTO note_relationships (
      workspace_id,
      note_id,
      target_type,
      target_id,
      relationship_type,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (note_id, target_type, target_id)
    DO UPDATE SET
      relationship_type = EXCLUDED.relationship_type,
      metadata = EXCLUDED.metadata
    RETURNING *;
  `;

  const values = [
    workspaceId,
    noteId,
    targetType,
    targetId,
    relationshipType,
    JSON.stringify(metadata),
  ];

  const res = await client.query(sql, values);
  return mapNoteRelationshipRow(res.rows[0]);
}

/**
 * Removes a relationship between a Note and another domain object.
 * Does NOT delete the Note or the related object.
 *
 * @param {string} noteId
 * @param {string} relationshipId
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function removeNoteRelationship(noteId, relationshipId, workspaceId, client = pool) {
  const sql = `
    DELETE FROM note_relationships
    WHERE id = $1 AND note_id = $2 AND workspace_id = $3
    RETURNING *;
  `;
  const res = await client.query(sql, [relationshipId, noteId, workspaceId]);
  return mapNoteRelationshipRow(res.rows[0]);
}

/**
 * Retrieves all relationships for a specific Note.
 *
 * @param {string} noteId
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findNoteRelationships(noteId, workspaceId, client = pool) {
  const sql = `
    SELECT *
    FROM note_relationships
    WHERE note_id = $1 AND workspace_id = $2
    ORDER BY created_at ASC;
  `;
  const res = await client.query(sql, [noteId, workspaceId]);
  return res.rows.map(mapNoteRelationshipRow);
}

/**
 * Finds backlinks to a Note (i.e. other Notes that point to this Note).
 *
 * @param {string} noteId
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findNoteBacklinks(noteId, workspaceId, client = pool) {
  const sql = `
    SELECT
      n.id,
      n.workspace_id,
      n.owner_user_id,
      n.title,
      n.category,
      n.is_pinned,
      n.is_favorite,
      n.is_archived,
      n.created_at,
      n.updated_at,
      r.id AS relationship_id,
      r.relationship_type
    FROM notes n
    JOIN note_relationships r ON n.id = r.note_id
    WHERE r.target_type = 'NOTE'
      AND r.target_id = $1
      AND n.workspace_id = $2
      AND n.deleted_at IS NULL
    ORDER BY n.updated_at DESC;
  `;
  const res = await client.query(sql, [noteId, workspaceId]);
  return res.rows.map(row => ({
    noteId: row.id,
    title: row.title,
    category: row.category,
    relationshipId: row.relationship_id,
    relationshipType: row.relationship_type,
    updatedAt: row.updated_at,
  }));
}

/**
 * Finds all Notes related to a specific domain target (e.g. all notes linked to a specific Task).
 *
 * @param {string} targetType
 * @param {string} targetId
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findNotesRelatedToTarget(targetType, targetId, workspaceId, client = pool) {
  const sql = `
    SELECT
      n.id,
      n.title,
      n.category,
      n.updated_at,
      r.id AS relationship_id,
      r.relationship_type
    FROM notes n
    JOIN note_relationships r ON n.id = r.note_id
    WHERE r.target_type = $1
      AND r.target_id = $2
      AND n.workspace_id = $3
      AND n.deleted_at IS NULL
    ORDER BY n.updated_at DESC;
  `;
  const res = await client.query(sql, [targetType, targetId, workspaceId]);
  return res.rows.map(row => ({
    noteId: row.id,
    title: row.title,
    category: row.category,
    relationshipId: row.relationship_id,
    relationshipType: row.relationship_type,
    updatedAt: row.updated_at,
  }));
}

/**
 * Lists all tags used in a workspace.
 *
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findTagsByWorkspace(workspaceId, client = pool) {
  const sql = `
    SELECT
      t.id,
      t.workspace_id,
      t.name,
      t.color,
      t.created_at,
      COUNT(nt.note_id) AS note_count
    FROM tags t
    LEFT JOIN note_tags nt ON t.id = nt.tag_id
    WHERE t.workspace_id = $1
    GROUP BY t.id, t.workspace_id, t.name, t.color, t.created_at
    ORDER BY t.name ASC;
  `;
  const res = await client.query(sql, [workspaceId]);
  return res.rows.map(mapTagRow);
}

/**
 * Lists all distinct categories used in a workspace.
 *
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findCategoriesByWorkspace(workspaceId, client = pool) {
  const sql = `
    SELECT
      category,
      COUNT(*) AS note_count
    FROM notes
    WHERE workspace_id = $1
      AND deleted_at IS NULL
      AND category IS NOT NULL
      AND TRIM(category) != ''
    GROUP BY category
    ORDER BY category ASC;
  `;
  const res = await client.query(sql, [workspaceId]);
  return res.rows.map(r => ({
    category: r.category,
    noteCount: Number(r.note_count),
  }));
}
