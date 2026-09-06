import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config, sanitizeDatabaseUrl } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/**
 * Programmatic PostgreSQL migration runner conforming to docs/IMPLEMENTATION-PLAN.md Task 2.2.
 * Uses node-pg-migrate with strict single-transaction safety, deterministic ordering,
 * and credential sanitization.
 *
 * @param {Object} options
 * @param {'up' | 'down'} [options.direction='up']
 * @param {number} [options.count]
 * @param {string} [options.databaseUrl=config.databaseUrl]
 * @param {string} [options.migrationsDir=DEFAULT_MIGRATIONS_DIR]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.verbose=false]
 * @param {Object} [options.logger]
 * @returns {Promise<Array<Object>>} Executed migrations list
 */
export async function runMigrations(options = {}) {
  const direction = options.direction || 'up';
  const databaseUrl = options.databaseUrl || config.databaseUrl;
  const dir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const count = options.count !== undefined ? options.count : direction === 'down' ? 1 : Infinity;
  const dryRun = options.dryRun || false;

  const defaultLogger = {
    info: msg => {
      if (options.verbose) {
        console.log(`[migration:info] ${msg}`);
      }
    },
    warn: msg => console.warn(`[migration:warn] ${msg}`),
    error: msg => console.error(`[migration:error] ${msg}`),
  };

  const logger = options.logger || defaultLogger;

  try {
    const executedMigrations = await runner({
      databaseUrl,
      dir,
      direction,
      count,
      migrationsTable: 'pgmigrations',
      schema: 'public',
      singleTransaction: true,
      checkOrder: true,
      dryRun,
      logger,
      verbose: options.verbose || false,
    });

    return executedMigrations;
  } catch (err) {
    if (err && err.message) {
      err.message = err.message.replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://****@');
    }
    throw err;
  }
}

/**
 * Check migration status without executing any modifications
 * @param {Object} [options]
 */
export async function getMigrationStatus(options = {}) {
  const databaseUrl = options.databaseUrl || config.databaseUrl;
  const dir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;

  const pending = await runMigrations({
    direction: 'up',
    databaseUrl,
    migrationsDir: dir,
    dryRun: true,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  return {
    pending: pending.map(m => m.name),
    pendingCount: pending.length,
  };
}

export { sanitizeDatabaseUrl };
