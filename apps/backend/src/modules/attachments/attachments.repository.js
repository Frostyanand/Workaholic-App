import { pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean attachment domain object
 */
export function mapAttachmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
    targetType: row.target_type,
    targetId: row.target_id,
    externalFileId: row.external_file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    sourceType: row.source_type,
    uploadStatus: row.upload_status,
    webUrl: row.web_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Maps raw SQL row to clean external_file domain object
 */
export function mapExternalFileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    externalFileId: row.external_file_id,
    externalAccountId: row.external_account_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    webUrl: row.web_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new attachment record
 *
 * @param {Object} data
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function createAttachment(data, client = pool) {
  const {
    workspaceId,
    ownerUserId,
    targetType,
    targetId,
    fileName,
    mimeType = 'application/octet-stream',
    sizeBytes = 0,
    sourceType = 'GOOGLE_DRIVE',
    externalFileId = null,
    uploadStatus = 'COMPLETED',
    webUrl = null,
  } = data;

  const sql = `
    INSERT INTO attachments (
      workspace_id,
      owner_user_id,
      target_type,
      target_id,
      file_name,
      mime_type,
      size_bytes,
      source_type,
      external_file_id,
      upload_status,
      web_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;

  const values = [
    workspaceId,
    ownerUserId,
    targetType,
    targetId,
    fileName,
    mimeType,
    sizeBytes,
    sourceType,
    externalFileId,
    uploadStatus,
    webUrl,
  ];

  const result = await client.query(sql, values);
  return mapAttachmentRow(result.rows[0]);
}

/**
 * Find attachment by ID with tenant workspace isolation
 *
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findAttachmentById(id, workspaceId, client = pool) {
  const sql = `
    SELECT * FROM attachments
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL;
  `;
  const result = await client.query(sql, [id, workspaceId]);
  return mapAttachmentRow(result.rows[0]);
}

/**
 * Find all active attachments for a target resource (e.g. TASK, PROJECT)
 *
 * @param {string} targetType
 * @param {string} targetId
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findAttachmentsByTarget(targetType, targetId, workspaceId, client = pool) {
  const sql = `
    SELECT * FROM attachments
    WHERE target_type = $1 AND target_id = $2 AND workspace_id = $3 AND deleted_at IS NULL
    ORDER BY created_at ASC;
  `;
  const result = await client.query(sql, [targetType, targetId, workspaceId]);
  return result.rows.map(mapAttachmentRow);
}

/**
 * Update an attachment record
 *
 * @param {string} id
 * @param {string} workspaceId
 * @param {Object} updates
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function updateAttachment(id, workspaceId, updates, client = pool) {
  const allowed = [
    'file_name',
    'mime_type',
    'size_bytes',
    'upload_status',
    'web_url',
    'external_file_id',
  ];
  const setClauses = [];
  const values = [id, workspaceId];
  let paramIdx = 3;

  const keyMap = {
    fileName: 'file_name',
    mimeType: 'mime_type',
    sizeBytes: 'size_bytes',
    uploadStatus: 'upload_status',
    webUrl: 'web_url',
    externalFileId: 'external_file_id',
  };

  for (const [key, val] of Object.entries(updates)) {
    const col = keyMap[key] || key;
    if (allowed.includes(col)) {
      setClauses.push(`${col} = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }
  }

  if (setClauses.length === 0) {
    return findAttachmentById(id, workspaceId, client);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE attachments
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(sql, values);
  return mapAttachmentRow(result.rows[0]);
}

/**
 * Soft deletes an attachment relationship from Workaholic
 * Does NOT delete external file (REQ-GDRIVE-004)
 *
 * @param {string} id
 * @param {string} workspaceId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function deleteAttachment(id, workspaceId, client = pool) {
  const sql = `
    UPDATE attachments
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;
  const result = await client.query(sql, [id, workspaceId]);
  return mapAttachmentRow(result.rows[0]);
}

/**
 * Upsert external_file metadata record
 *
 * @param {Object} fileData
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function upsertExternalFile(fileData, client = pool) {
  const {
    provider,
    externalFileId,
    externalAccountId,
    name,
    mimeType,
    sizeBytes = 0,
    webUrl = null,
  } = fileData;

  const sql = `
    INSERT INTO external_files (
      provider,
      external_file_id,
      external_account_id,
      name,
      mime_type,
      size_bytes,
      web_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (provider, external_account_id, external_file_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      web_url = EXCLUDED.web_url,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const values = [provider, externalFileId, externalAccountId, name, mimeType, sizeBytes, webUrl];
  const result = await client.query(sql, values);
  return mapExternalFileRow(result.rows[0]);
}

/**
 * Find external_file by provider and external file ID
 *
 * @param {string} provider
 * @param {string} externalFileId
 * @param {import('pg').PoolClient} [client=pool]
 */
export async function findExternalFile(provider, externalFileId, client = pool) {
  const sql = `
    SELECT * FROM external_files
    WHERE provider = $1 AND external_file_id = $2;
  `;
  const result = await client.query(sql, [provider, externalFileId]);
  return mapExternalFileRow(result.rows[0]);
}
