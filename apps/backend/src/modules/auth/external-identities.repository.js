import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to external identity domain object
 */
export function mapExternalIdentityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerSubject: row.provider_subject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.user_email ? { userEmail: row.user_email } : {}),
    ...(row.user_display_name ? { userDisplayName: row.user_display_name } : {}),
    ...(row.user_deleted_at !== undefined ? { userDeletedAt: row.user_deleted_at } : {}),
  };
}

/**
 * Find external identity by provider and provider subject ID.
 * Resolves associated user record and soft-delete state.
 *
 * @param {string} provider - e.g. 'GOOGLE'
 * @param {string} providerSubject - Provider unique user ID (e.g. Google sub)
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findExternalIdentity(provider, providerSubject, client = pool) {
  if (!provider || !providerSubject) {
    throw new TypeError('provider and providerSubject are required');
  }

  const sql = `
    SELECT
      ei.id,
      ei.user_id,
      ei.provider,
      ei.provider_subject,
      ei.created_at,
      ei.updated_at,
      u.email AS user_email,
      u.display_name AS user_display_name,
      u.deleted_at AS user_deleted_at
    FROM external_identities ei
    JOIN users u ON u.id = ei.user_id
    WHERE ei.provider = $1
      AND ei.provider_subject = $2
  `;

  const result = await query(sql, [provider, providerSubject], client);
  return mapExternalIdentityRow(result.rows[0]);
}

/**
 * Find external identity for a specific user and provider.
 *
 * @param {string} userId - User UUID
 * @param {string} provider - e.g. 'GOOGLE'
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findExternalIdentityByUserId(userId, provider, client = pool) {
  if (!userId || !provider) {
    throw new TypeError('userId and provider are required');
  }

  const sql = `
    SELECT
      id,
      user_id,
      provider,
      provider_subject,
      created_at,
      updated_at
    FROM external_identities
    WHERE user_id = $1
      AND provider = $2
  `;

  const result = await query(sql, [userId, provider], client);
  return mapExternalIdentityRow(result.rows[0]);
}

/**
 * Link an external identity to an internal Workaholic user.
 *
 * @param {Object} data
 * @param {string} data.userId - Internal user UUID
 * @param {string} data.provider - Provider identifier ('GOOGLE')
 * @param {string} data.providerSubject - Provider subject ID (Google sub)
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createExternalIdentity(data, client = pool) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('data must be an object');
  }
  const { userId, provider, providerSubject } = data;

  if (!userId || !provider || !providerSubject) {
    throw new Error('userId, provider, and providerSubject are required');
  }

  const sql = `
    INSERT INTO external_identities (
      user_id,
      provider,
      provider_subject
    )
    VALUES ($1, $2, $3)
    RETURNING id, user_id, provider, provider_subject, created_at, updated_at
  `;

  const result = await query(sql, [userId, provider, providerSubject], client);
  return mapExternalIdentityRow(result.rows[0]);
}

/**
 * List all external identities for a user.
 *
 * @param {string} userId - User UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findExternalIdentitiesForUser(userId, client = pool) {
  if (!userId) throw new TypeError('userId is required');

  const sql = `
    SELECT
      id,
      user_id,
      provider,
      provider_subject,
      created_at,
      updated_at
    FROM external_identities
    WHERE user_id = $1
    ORDER BY created_at ASC
  `;

  const result = await query(sql, [userId], client);
  return result.rows.map(mapExternalIdentityRow);
}

/**
 * Delete an external identity link.
 *
 * @param {string} id - Identity record UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function deleteExternalIdentity(id, client = pool) {
  if (!id) throw new TypeError('Identity ID is required');

  const sql = `
    DELETE FROM external_identities
    WHERE id = $1
    RETURNING id
  `;

  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}
