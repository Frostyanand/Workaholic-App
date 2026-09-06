import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Execute a parameterized query against the PostgreSQL pool
 */
export async function query(text, params = []) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const _duration = Date.now() - start;
  if (config.env === 'development') {
    // Query duration tracked for telemetry
  }
  return res;
}

/**
 * Run a unit of work inside an explicit ACID transaction
 */
export async function withTransaction(workFn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await workFn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connectivity
 */
export async function testConnection() {
  const res = await pool.query('SELECT 1 as connected, NOW() as current_time');
  return res.rows[0];
}

/**
 * Gracefully close the connection pool
 */
export async function closePool() {
  await pool.end();
}
