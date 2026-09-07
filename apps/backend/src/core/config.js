import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load .env from project root or local directory
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

/**
 * Redacts passwords or sensitive credentials from database connection URIs.
 * @param {string} url
 * @returns {string}
 */
export function sanitizeDatabaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return 'postgresql://[redacted]';
  }
}

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://workaholic:workaholic_dev_secret@localhost:5432/workaholic_dev',
  dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
  dbIdleTimeout: Number(process.env.DB_IDLE_TIMEOUT || 30000),
  dbConnectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT || 5000),
  dbStatementTimeout: Number(process.env.DB_STATEMENT_TIMEOUT || 30000),
  cronSecret: process.env.CRON_SECRET || 'dev_cron_secret',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'workaholic-dev',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  firebaseAuthEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || '',
});
