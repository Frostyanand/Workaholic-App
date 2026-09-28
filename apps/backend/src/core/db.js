import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { config, sanitizeDatabaseUrl } from './config.js';

const { Pool, types } = pg;

// Parse PostgreSQL DATE (OID 1082) as plain 'YYYY-MM-DD' strings to prevent timezone shifts
types.setTypeParser(1082, str => str);

/**
 * Creates and configures a PostgreSQL connection pool with production-grade
 * defaults and idle error handling.
 * @param {import('pg').PoolConfig} customOptions
 * @returns {import('pg').Pool}
 */
export function createPool(customOptions = {}) {
  const poolConfig = {
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: config.dbIdleTimeout,
    connectionTimeoutMillis: config.dbConnectionTimeout,
    statement_timeout: config.dbStatementTimeout,
    application_name: 'workaholic-backend',
    ...customOptions,
  };

  const poolInstance = new Pool(poolConfig);

  // Handle unexpected errors on idle clients to prevent unhandled process crashes
  poolInstance.on('error', err => {
    const sanitizedMsg = err.message
      ? err.message.replace(/postgresql:\/\/[^@]+@/i, 'postgresql://****@')
      : 'Unknown error';
    if (config.env !== 'test') {
      console.error('Unexpected idle client error in PostgreSQL pool:', sanitizedMsg);
    }
  });

  return poolInstance;
}

// Default singleton pool instance
export const pool = createPool();

/**
 * Redacts passwords and connection strings from error messages
 * @param {Error} err
 * @returns {Error}
 */
function sanitizeError(err) {
  if (err && err.message) {
    err.message = err.message.replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://****@');
  }
  return err;
}

/**
 * Execute a parameterized query against PostgreSQL
 * @param {string} text - Parameterized SQL query string (e.g. 'SELECT * FROM users WHERE id = $1')
 * @param {Array<any>} params - Query parameters array
 * @param {import('pg').Pool | import('pg').PoolClient} [client=pool] - Optional custom pool or transaction client
 */
export async function query(text, params = [], client = pool) {
  if (typeof text !== 'string') {
    throw new TypeError('SQL query text must be a string');
  }
  if (!Array.isArray(params)) {
    throw new TypeError('SQL query parameters must be an array');
  }

  const start = Date.now();
  try {
    const res = await client.query(text, params);
    const _duration = Date.now() - start;
    return res;
  } catch (err) {
    throw sanitizeError(err);
  }
}

/**
 * Run a unit of work inside an explicit ACID transaction boundary.
 * Automatically handles client checkout, BEGIN, COMMIT, ROLLBACK on error,
 * and client release. Supports nested re-entrant clients and transaction options.
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} workFn
 * @param {import('pg').Pool | import('pg').PoolClient | Object} [poolOrClientOrOptions=pool]
 * @param {Object} [maybeOptions={}]
 * @param {'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'} [maybeOptions.isolationLevel]
 * @param {boolean} [maybeOptions.readOnly]
 */
export async function withTransaction(workFn, poolOrClientOrOptions = pool, maybeOptions = {}) {
  if (typeof workFn !== 'function') {
    throw new TypeError('withTransaction requires a function');
  }

  let targetPoolOrClient = pool;
  let options = {};

  const isPoolOrClient =
    poolOrClientOrOptions &&
    (typeof poolOrClientOrOptions.connect === 'function' ||
      typeof poolOrClientOrOptions.query === 'function');

  if (isPoolOrClient) {
    targetPoolOrClient = poolOrClientOrOptions;
    options = maybeOptions || {};
  } else if (typeof poolOrClientOrOptions === 'object' && poolOrClientOrOptions !== null) {
    targetPoolOrClient = pool;
    options = poolOrClientOrOptions;
  }

  // If already a checked-out client inside a transaction, run within that boundary
  const isAlreadyClient =
    typeof targetPoolOrClient.release === 'function' ||
    typeof targetPoolOrClient.connect !== 'function';

  if (isAlreadyClient && typeof targetPoolOrClient.query === 'function') {
    return workFn(targetPoolOrClient);
  }

  const client = await targetPoolOrClient.connect();
  try {
    let beginSql = 'BEGIN';
    if (options.isolationLevel) {
      const allowed = ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'];
      const upper = String(options.isolationLevel).toUpperCase();
      if (!allowed.includes(upper)) {
        throw new Error(`Invalid isolation level: ${options.isolationLevel}`);
      }
      beginSql += ` ISOLATION LEVEL ${upper}`;
    }
    if (options.readOnly) {
      beginSql += ' READ ONLY';
    }

    await client.query(beginSql);
    const result = await workFn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore secondary rollback failures if connection dropped
    }
    throw sanitizeError(error);
  } finally {
    client.release();
  }
}

/**
 * Run a unit of work inside a transaction SAVEPOINT.
 * Enables partial rollbacks of sub-operations without aborting the parent transaction.
 *
 * @param {import('pg').PoolClient} client - Active transaction client
 * @param {(client: import('pg').PoolClient) => Promise<any>} workFn
 * @param {string} [savepointName]
 */
export async function withSavepoint(client, workFn, savepointName = undefined) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('withSavepoint requires an active transaction client');
  }
  if (typeof workFn !== 'function') {
    throw new TypeError('withSavepoint requires a function');
  }

  const spName = savepointName || `sp_${randomUUID().replace(/-/g, '')}`;
  if (!/^[a-zA-Z0-9_]+$/.test(spName)) {
    throw new Error('Invalid savepoint name');
  }

  await client.query(`SAVEPOINT ${spName}`);
  try {
    const result = await workFn(client);
    await client.query(`RELEASE SAVEPOINT ${spName}`);
    return result;
  } catch (err) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
    } catch {
      // Ignore secondary rollback error
    }
    throw sanitizeError(err);
  }
}

/**
 * Inspect connection pool metrics for health checks and observability
 * @param {import('pg').Pool} [targetPool=pool]
 */
export function getPoolMetrics(targetPool = pool) {
  return {
    totalCount: targetPool.totalCount || 0,
    idleCount: targetPool.idleCount || 0,
    waitingCount: targetPool.waitingCount || 0,
  };
}

/**
 * Test database connectivity
 * @param {import('pg').Pool} [targetPool=pool]
 */
export async function testConnection(targetPool = pool) {
  try {
    const res = await targetPool.query('SELECT 1 as connected, NOW() as current_time');
    return res.rows[0];
  } catch (err) {
    throw sanitizeError(err);
  }
}

/**
 * Gracefully close the connection pool
 * @param {import('pg').Pool} [targetPool=pool]
 */
export async function closePool(targetPool = pool) {
  if (targetPool && !targetPool.ending && !targetPool.ended) {
    await targetPool.end();
  }
}

export { sanitizeDatabaseUrl };
