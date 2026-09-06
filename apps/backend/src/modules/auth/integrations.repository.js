import { query, pool } from '../../core/db.js';

/**
 * Maps raw SQL row to clean integration domain object
 */
export function mapIntegrationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    status: row.status,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Maps raw SQL row to clean external account domain object
 */
export function mapExternalAccountRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    integrationId: row.integration_id,
    provider: row.provider,
    externalAccountId: row.external_account_id,
    displayName: row.display_name,
    scopes: row.scopes || [],
    encryptedCredentials: row.encrypted_credentials,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Find integration by user and provider.
 *
 * @param {string} userId
 * @param {string} provider - e.g. 'GOOGLE'
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findIntegration(userId, provider, client = pool) {
  if (!userId || !provider) {
    throw new TypeError('userId and provider are required');
  }

  const sql = `
    SELECT id, user_id, provider, status, connected_at, disconnected_at, created_at, updated_at
    FROM integrations
    WHERE user_id = $1 AND provider = $2
  `;

  const result = await query(sql, [userId, provider], client);
  return mapIntegrationRow(result.rows[0]);
}

/**
 * Upsert an integration record.
 *
 * @param {Object} data
 * @param {string} data.userId
 * @param {string} data.provider
 * @param {string} [data.status='CONNECTED']
 * @param {Date|string} [data.connectedAt]
 * @param {Date|string|null} [data.disconnectedAt]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function upsertIntegration(data, client = pool) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('data must be an object');
  }
  const {
    userId,
    provider,
    status = 'CONNECTED',
    connectedAt = new Date(),
    disconnectedAt = null,
  } = data;

  if (!userId || !provider) {
    throw new Error('userId and provider are required');
  }

  const sql = `
    INSERT INTO integrations (
      user_id,
      provider,
      status,
      connected_at,
      disconnected_at
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, provider) DO UPDATE
      SET status = EXCLUDED.status,
          connected_at = COALESCE(EXCLUDED.connected_at, integrations.connected_at),
          disconnected_at = EXCLUDED.disconnected_at,
          updated_at = CURRENT_TIMESTAMP
    RETURNING id, user_id, provider, status, connected_at, disconnected_at, created_at, updated_at
  `;

  const result = await query(sql, [userId, provider, status, connectedAt, disconnectedAt], client);
  return mapIntegrationRow(result.rows[0]);
}

/**
 * Find external account for an integration.
 *
 * @param {string} integrationId
 * @param {string} provider
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function findExternalAccount(integrationId, provider, client = pool) {
  if (!integrationId || !provider) {
    throw new TypeError('integrationId and provider are required');
  }

  const sql = `
    SELECT id, integration_id, provider, external_account_id, display_name, scopes, encrypted_credentials, created_at, updated_at
    FROM external_accounts
    WHERE integration_id = $1 AND provider = $2
  `;

  const result = await query(sql, [integrationId, provider], client);
  return mapExternalAccountRow(result.rows[0]);
}

/**
 * Upsert external account with encrypted credentials and scopes.
 *
 * @param {Object} data
 * @param {string} data.integrationId
 * @param {string} data.provider
 * @param {string} data.externalAccountId
 * @param {string} [data.displayName]
 * @param {Array<string>} [data.scopes]
 * @param {string} [data.encryptedCredentials]
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function upsertExternalAccount(data, client = pool) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('data must be an object');
  }
  const {
    integrationId,
    provider,
    externalAccountId,
    displayName = null,
    scopes = [],
    encryptedCredentials = null,
  } = data;

  if (!integrationId || !provider || !externalAccountId) {
    throw new Error('integrationId, provider, and externalAccountId are required');
  }

  const sql = `
    INSERT INTO external_accounts (
      integration_id,
      provider,
      external_account_id,
      display_name,
      scopes,
      encrypted_credentials
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (provider, external_account_id) DO UPDATE
      SET integration_id = EXCLUDED.integration_id,
          display_name = COALESCE(EXCLUDED.display_name, external_accounts.display_name),
          scopes = EXCLUDED.scopes,
          encrypted_credentials = COALESCE(EXCLUDED.encrypted_credentials, external_accounts.encrypted_credentials),
          updated_at = CURRENT_TIMESTAMP
    RETURNING id, integration_id, provider, external_account_id, display_name, scopes, encrypted_credentials, created_at, updated_at
  `;

  const result = await query(
    sql,
    [
      integrationId,
      provider,
      externalAccountId,
      displayName,
      JSON.stringify(scopes),
      encryptedCredentials ? JSON.stringify(encryptedCredentials) : null,
    ],
    client,
  );

  return mapExternalAccountRow(result.rows[0]);
}

/**
 * Delete integration and cascade to external accounts.
 *
 * @param {string} id
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool]
 */
export async function deleteIntegration(id, client = pool) {
  if (!id) throw new TypeError('Integration ID is required');

  const sql = `DELETE FROM integrations WHERE id = $1 RETURNING id`;
  const result = await query(sql, [id], client);
  return result.rows.length > 0;
}
