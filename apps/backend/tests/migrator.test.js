import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  runMigrations,
  DEFAULT_MIGRATIONS_DIR,
  sanitizeDatabaseUrl,
} from '../src/core/migrator.js';

vi.mock('node-pg-migrate', () => ({
  runner: vi.fn(async options => {
    if (options.databaseUrl?.includes('invalid-credential-leak')) {
      throw new Error(
        `Failed to connect to postgresql://user:super_secret_password@localhost:5432/db: connection refused`,
      );
    }
    return [
      {
        path: path.join(options.dir, '1725628800000_initial_extensions.sql'),
        name: '1725628800000_initial_extensions',
        timestamp: 1725628800000,
      },
    ];
  }),
}));

describe('Migration System Infrastructure (Task 2.2)', () => {
  it('locates and resolves the authoritative migrations directory', () => {
    expect(fs.existsSync(DEFAULT_MIGRATIONS_DIR)).toBe(true);
    const files = fs.readdirSync(DEFAULT_MIGRATIONS_DIR);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some(f => f.includes('initial_extensions'))).toBe(true);
  });

  it('guarantees reversible migration structure with explicit Up and Down sections', () => {
    const files = fs.readdirSync(DEFAULT_MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(DEFAULT_MIGRATIONS_DIR, file), 'utf-8');
      expect(content).toContain('-- Up Migration');
      expect(content).toContain('-- Down Migration');
    }
  });

  it('configures runner with single-transaction and migration tracking table', async () => {
    const nodePgMigrate = await import('node-pg-migrate');
    const runnerMock = nodePgMigrate.runner;

    const result = await runMigrations({
      direction: 'up',
      dryRun: true,
    });

    expect(runnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'up',
        migrationsTable: 'pgmigrations',
        schema: 'public',
        singleTransaction: true,
        checkOrder: true,
        dryRun: true,
      }),
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it('supports rollback/down direction with default count of 1', async () => {
    const nodePgMigrate = await import('node-pg-migrate');
    const runnerMock = nodePgMigrate.runner;

    await runMigrations({
      direction: 'down',
    });

    expect(runnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'down',
        count: 1,
      }),
    );
  });

  it('sanitizes credentials from migration error messages', async () => {
    await expect(
      runMigrations({
        databaseUrl: 'postgresql://user:invalid-credential-leak@localhost:5432/db',
      }),
    ).rejects.toThrow(/postgresql:\/\/\*\*\*\*@localhost:5432\/db/);
  });

  it('sanitizes database URLs correctly in CLI logging', () => {
    const url = 'postgresql://workaholic:secret@db.prod.internal:5432/workaholic_db';
    expect(sanitizeDatabaseUrl(url)).toBe(
      'postgresql://workaholic:****@db.prod.internal:5432/workaholic_db',
    );
  });
});
