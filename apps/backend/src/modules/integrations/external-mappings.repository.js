import { query, pool } from '../../core/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    externalAccountId: row.external_account_id,
    externalContainerId: row.external_container_id,
    externalObjectType: row.external_object_type,
    externalObjectId: row.external_object_id,
    nativeObjectType: row.native_object_type,
    nativeObjectId: row.native_object_id,
    syncState: row.sync_state,
    externalEtag: row.external_etag,
    syncCursor: row.sync_cursor,
    lastExternalModifiedAt: row.last_external_modified_at,
    lastNativeModifiedAt: row.last_native_modified_at,
    lastSyncedAt: row.last_synced_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates or updates an external object mapping.
 * Conforms to docs/7.DATABASE-DESIGN.md Section 29.1 and docs/8.SYNC-SPECIFICATION.md Section 51.
 *
 * @param {Object} data
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function upsertMapping(data, client = pool) {
  const {
    userId,
    workspaceId,
    provider,
    externalAccountId,
    externalContainerId = null,
    externalObjectType,
    externalObjectId,
    nativeObjectType,
    nativeObjectId,
    syncState = 'SYNCED',
    externalEtag = null,
    syncCursor = null,
    lastExternalModifiedAt = null,
    lastNativeModifiedAt = null,
    lastSyncedAt = new Date(),
    metadata = {},
  } = data;

  const sql = `
    INSERT INTO external_object_mappings (
      user_id, workspace_id, provider, external_account_id, external_container_id,
      external_object_type, external_object_id, native_object_type, native_object_id,
      sync_state, external_etag, sync_cursor, last_external_modified_at,
      last_native_modified_at, last_synced_at, metadata, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13,
      $14, $15, $16, CURRENT_TIMESTAMP
    )
    ON CONFLICT (provider, external_account_id, external_object_type, external_object_id)
    DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      external_container_id = COALESCE(EXCLUDED.external_container_id, external_object_mappings.external_container_id),
      native_object_type = EXCLUDED.native_object_type,
      native_object_id = EXCLUDED.native_object_id,
      sync_state = EXCLUDED.sync_state,
      external_etag = COALESCE(EXCLUDED.external_etag, external_object_mappings.external_etag),
      sync_cursor = COALESCE(EXCLUDED.sync_cursor, external_object_mappings.sync_cursor),
      last_external_modified_at = COALESCE(EXCLUDED.last_external_modified_at, external_object_mappings.last_external_modified_at),
      last_native_modified_at = COALESCE(EXCLUDED.last_native_modified_at, external_object_mappings.last_native_modified_at),
      last_synced_at = EXCLUDED.last_synced_at,
      metadata = external_object_mappings.metadata || EXCLUDED.metadata,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const params = [
    userId,
    workspaceId,
    provider,
    externalAccountId,
    externalContainerId,
    externalObjectType,
    externalObjectId,
    nativeObjectType,
    nativeObjectId,
    syncState,
    externalEtag,
    syncCursor,
    lastExternalModifiedAt,
    lastNativeModifiedAt,
    lastSyncedAt,
    JSON.stringify(metadata),
  ];

  const result = await query(sql, params, client);
  return mapRow(result.rows[0]);
}

/**
 * Finds mapping by external object identity
 */
export async function findMappingByExternalId(
  provider,
  externalAccountId,
  externalObjectType,
  externalObjectId,
  client = pool,
) {
  const sql = `
    SELECT * FROM external_object_mappings
    WHERE provider = $1
      AND external_account_id = $2
      AND external_object_type = $3
      AND external_object_id = $4
    LIMIT 1;
  `;
  const result = await query(
    sql,
    [provider, externalAccountId, externalObjectType, externalObjectId],
    client,
  );
  return mapRow(result.rows[0]);
}

/**
 * Finds mapping by native object identity
 */
export async function findMappingByNativeId(
  provider,
  userId,
  nativeObjectType,
  nativeObjectId,
  client = pool,
) {
  const sql = `
    SELECT * FROM external_object_mappings
    WHERE provider = $1
      AND user_id = $2
      AND native_object_type = $3
      AND native_object_id = $4
    LIMIT 1;
  `;
  const result = await query(sql, [provider, userId, nativeObjectType, nativeObjectId], client);
  return mapRow(result.rows[0]);
}

/**
 * Finds mappings by container (e.g. all event mappings belonging to a Google Calendar ID)
 */
export async function findMappingsByContainer(provider, externalContainerId, client = pool) {
  const sql = `
    SELECT * FROM external_object_mappings
    WHERE provider = $1 AND external_container_id = $2;
  `;
  const result = await query(sql, [provider, externalContainerId], client);
  return result.rows.map(mapRow);
}

/**
 * Finds all mappings for a specific user and provider
 */
export async function findMappingsByUser(
  userId,
  provider = 'GOOGLE',
  objectType = null,
  client = pool,
) {
  let sql = `
    SELECT * FROM external_object_mappings
    WHERE user_id = $1 AND provider = $2
  `;
  const params = [userId, provider];

  if (objectType) {
    sql += ` AND native_object_type = $3`;
    params.push(objectType);
  }

  sql += ` ORDER BY created_at ASC;`;

  const result = await query(sql, params, client);
  return result.rows.map(mapRow);
}

/**
 * Updates mapping by ID
 */
export async function updateMapping(id, patch, client = pool) {
  const allowed = [
    'sync_state',
    'external_etag',
    'sync_cursor',
    'last_external_modified_at',
    'last_native_modified_at',
    'last_synced_at',
    'metadata',
  ];

  const sets = [];
  const params = [id];
  let paramIdx = 2;

  for (const [key, val] of Object.entries(patch)) {
    const colName = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    if (allowed.includes(colName)) {
      sets.push(`${colName} = $${paramIdx++}`);
      params.push(key === 'metadata' ? JSON.stringify(val) : val);
    }
  }

  if (sets.length === 0) return null;

  sets.push('updated_at = CURRENT_TIMESTAMP');
  const sql = `
    UPDATE external_object_mappings
    SET ${sets.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;

  const result = await query(sql, params, client);
  return mapRow(result.rows[0]);
}

/**
 * Deletes mapping by ID
 */
export async function deleteMapping(id, client = pool) {
  const sql = `DELETE FROM external_object_mappings WHERE id = $1 RETURNING id;`;
  const result = await query(sql, [id], client);
  return result.rowCount > 0;
}

/**
 * Deletes all mappings for a user and provider (e.g. during integration disconnect)
 */
export async function deleteMappingsByUserAndProvider(userId, provider = 'GOOGLE', client = pool) {
  const sql = `DELETE FROM external_object_mappings WHERE user_id = $1 AND provider = $2;`;
  const result = await query(sql, [userId, provider], client);
  return result.rowCount;
}
