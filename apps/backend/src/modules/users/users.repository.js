import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean domain object
 */
export function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    profileImageReference: row.profile_image_reference,
    timezone: row.timezone,
    locale: row.locale,
    preferences:
      typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Find an active user by ID
 * @param {string} id - User UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findUserById(id, client = pool) {
  if (!id) throw new TypeError('User ID is required');

  const sql = `
    SELECT id, display_name, email, profile_image_reference, timezone, locale, preferences, created_at, updated_at, deleted_at
    FROM users
    WHERE id = $1 AND deleted_at IS NULL
  `;
  const result = await query(sql, [id], client);
  return mapUserRow(result.rows[0]);
}

/**
 * Find an active user by email (case-insensitive)
 * @param {string} email
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findUserByEmail(email, client = pool) {
  if (!email) throw new TypeError('Email is required');

  const sql = `
    SELECT id, display_name, email, profile_image_reference, timezone, locale, preferences, created_at, updated_at, deleted_at
    FROM users
    WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
  `;
  const result = await query(sql, [email], client);
  return mapUserRow(result.rows[0]);
}

/**
 * Create a new user with parameterized SQL
 * @param {object} userData
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function createUser(userData, client = pool) {
  if (!userData || typeof userData !== 'object') {
    throw new TypeError('userData must be an object');
  }
  const {
    displayName,
    email,
    profileImageReference = null,
    timezone = 'UTC',
    locale = 'en',
    preferences = {},
  } = userData;

  if (!displayName || !email) {
    throw new Error('displayName and email are required to create a user');
  }

  const sql = `
    INSERT INTO users (
      display_name,
      email,
      profile_image_reference,
      timezone,
      locale,
      preferences
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id, display_name, email, profile_image_reference, timezone, locale, preferences, created_at, updated_at, deleted_at
  `;

  const params = [
    displayName,
    email,
    profileImageReference,
    timezone,
    locale,
    JSON.stringify(preferences),
  ];

  const result = await query(sql, params, client);
  return mapUserRow(result.rows[0]);
}

/**
 * Update user profile and preferences
 * @param {string} id - User UUID
 * @param {object} updates - Fields to update
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function updateUser(id, updates, client = pool) {
  if (!id) throw new TypeError('User ID is required');
  if (!updates || typeof updates !== 'object') throw new TypeError('updates must be an object');

  const setClauses = [];
  const params = [id];
  let paramIndex = 2;

  if (updates.displayName !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    params.push(updates.displayName);
  }
  if (updates.profileImageReference !== undefined) {
    setClauses.push(`profile_image_reference = $${paramIndex++}`);
    params.push(updates.profileImageReference);
  }
  if (updates.timezone !== undefined) {
    setClauses.push(`timezone = $${paramIndex++}`);
    params.push(updates.timezone);
  }
  if (updates.locale !== undefined) {
    setClauses.push(`locale = $${paramIndex++}`);
    params.push(updates.locale);
  }
  if (updates.preferences !== undefined) {
    setClauses.push(`preferences = $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(updates.preferences));
  }

  if (setClauses.length === 0) {
    return findUserById(id, client);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE users
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, display_name, email, profile_image_reference, timezone, locale, preferences, created_at, updated_at, deleted_at
  `;

  const result = await query(sql, params, client);
  return mapUserRow(result.rows[0]);
}

/**
 * Soft delete user by setting deleted_at
 * @param {string} id - User UUID
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function softDeleteUser(id, client = pool) {
  if (!id) throw new TypeError('User ID is required');

  const sql = `
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, deleted_at
  `;
  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}
