import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

describe('Task 2.3 & 2.4 — Core Relational Schema & Invariants', () => {
  const migrationFile = path.join(migrationsDir, '1725628801000_create_core_tables.sql');

  it('migration file exists and contains Up and Down sections', () => {
    expect(fs.existsSync(migrationFile)).toBe(true);
    const content = fs.readFileSync(migrationFile, 'utf8');
    expect(content).toContain('-- Up Migration');
    expect(content).toContain('-- Down Migration');
  });

  describe('Table Definitions & UUID Primary Keys (Task 2.3)', () => {
    const content = fs.readFileSync(migrationFile, 'utf8');
    const [upMigration] = content.split('-- Down Migration');

    it('creates all 5 required core tables with UUID primary keys', () => {
      const requiredTables = [
        'users',
        'workspaces',
        'workspace_memberships',
        'devices',
        'sessions',
      ];

      for (const table of requiredTables) {
        expect(upMigration).toMatch(
          new RegExp(
            `CREATE TABLE IF NOT EXISTS ${table}\\s*\\([\\s\\S]*?id UUID PRIMARY KEY`,
            'i',
          ),
        );
      }
    });

    it('includes standard timestamps on all core tables', () => {
      const tables = ['users', 'workspaces', 'workspace_memberships', 'devices', 'sessions'];
      for (const table of tables) {
        const tableMatch = upMigration.match(
          new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\);`, 'i'),
        );
        expect(tableMatch, `Table ${table} should exist`).not.toBeNull();
        const tableBody = tableMatch[1];
        expect(tableBody).toContain('created_at TIMESTAMPTZ');
      }
    });

    it('includes soft-delete columns on recoverable entities (users, workspaces)', () => {
      const recoverable = ['users', 'workspaces'];
      for (const table of recoverable) {
        const tableMatch = upMigration.match(
          new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\);`, 'i'),
        );
        expect(tableMatch[1]).toContain('deleted_at TIMESTAMPTZ NULL');
      }
    });
  });

  describe('Foreign Keys & Referential Actions (Task 2.4)', () => {
    const content = fs.readFileSync(migrationFile, 'utf8');
    const [upMigration] = content.split('-- Down Migration');

    it('enforces RESTRICT on workspace owner deletion to preserve workspace integrity', () => {
      expect(upMigration).toMatch(
        /owner_user_id UUID NOT NULL REFERENCES users\s*\(id\)\s*ON DELETE RESTRICT/i,
      );
    });

    it('enforces CASCADE on workspace_memberships when workspace or user is deleted', () => {
      expect(upMigration).toMatch(
        /workspace_id UUID NOT NULL REFERENCES workspaces\s*\(id\)\s*ON DELETE CASCADE/i,
      );
      expect(upMigration).toMatch(
        /user_id UUID NOT NULL REFERENCES users\s*\(id\)\s*ON DELETE CASCADE/i,
      );
    });

    it('enforces CASCADE on devices when user is deleted', () => {
      expect(upMigration).toMatch(
        /CREATE TABLE IF NOT EXISTS devices[\s\S]*?user_id UUID NOT NULL REFERENCES users\s*\(id\)\s*ON DELETE CASCADE/i,
      );
    });

    it('enforces CASCADE on sessions when user is deleted and SET NULL when device is deleted', () => {
      expect(upMigration).toMatch(
        /CREATE TABLE IF NOT EXISTS sessions[\s\S]*?user_id UUID NOT NULL REFERENCES users\s*\(id\)\s*ON DELETE CASCADE/i,
      );
      expect(upMigration).toMatch(
        /device_id UUID NULL REFERENCES devices\s*\(id\)\s*ON DELETE SET NULL/i,
      );
    });
  });

  describe('Uniqueness Constraints & Indexes (Task 2.4)', () => {
    const content = fs.readFileSync(migrationFile, 'utf8');
    const [upMigration] = content.split('-- Down Migration');

    it('enforces unique active email for users with lowercase normalization', () => {
      expect(upMigration).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users\s*\(LOWER\(email\)\)\s*WHERE deleted_at IS NULL/i,
      );
    });

    it('enforces composite unique constraint on workspace_memberships (workspace_id, user_id)', () => {
      expect(upMigration).toMatch(
        /CONSTRAINT uq_workspace_memberships_workspace_user UNIQUE\s*\(workspace_id,\s*user_id\)/i,
      );
    });

    it('enforces unique constraint on session_token_hash', () => {
      expect(upMigration).toMatch(
        /CONSTRAINT uq_sessions_token_hash UNIQUE\s*\(session_token_hash\)/i,
      );
    });

    it('defines performance indexes for workspace owner and user memberships', () => {
      expect(upMigration).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user_id ON workspaces/i,
      );
      expect(upMigration).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_id ON workspace_memberships/i,
      );
      expect(upMigration).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_sessions_active_lookup ON sessions/i,
      );
    });
  });

  describe('Domain Check Constraints (Task 2.4)', () => {
    const content = fs.readFileSync(migrationFile, 'utf8');
    const [upMigration] = content.split('-- Down Migration');

    it('validates workspace_type check constraint (PERSONAL, TEAM)', () => {
      expect(upMigration).toMatch(
        /CONSTRAINT chk_workspaces_workspace_type CHECK\s*\(workspace_type IN \('PERSONAL', 'TEAM'\)\)/i,
      );
    });

    it('validates membership role check constraint (OWNER, ADMIN, MEMBER, VIEWER)', () => {
      expect(upMigration).toMatch(
        /CONSTRAINT chk_workspace_memberships_role CHECK\s*\(role IN \('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'\)\)/i,
      );
    });

    it('validates membership status check constraint (INVITED, ACTIVE, SUSPENDED, REMOVED)', () => {
      expect(upMigration).toMatch(
        /CONSTRAINT chk_workspace_memberships_status CHECK\s*\(status IN \('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'\)\)/i,
      );
    });

    it('validates device platform and trust_state check constraints', () => {
      expect(upMigration).toMatch(
        /CONSTRAINT chk_devices_platform CHECK\s*\(platform IN \('WEB', 'WINDOWS', 'ANDROID'\)\)/i,
      );
      expect(upMigration).toMatch(
        /CONSTRAINT chk_devices_trust_state CHECK\s*\(trust_state IN \('TRUSTED', 'UNTRUSTED', 'REVOKED'\)\)/i,
      );
    });

    it('validates session session_type check constraint', () => {
      expect(upMigration).toMatch(
        /CONSTRAINT chk_sessions_session_type CHECK\s*\(session_type IN \('WEB', 'DESKTOP', 'MOBILE', 'API'\)\)/i,
      );
    });
  });

  describe('Down Migration & Reversibility (Task 2.4)', () => {
    const content = fs.readFileSync(migrationFile, 'utf8');
    const [, downMigration] = content.split('-- Down Migration');

    it('drops tables in strict dependency order with CASCADE', () => {
      expect(downMigration).toBeDefined();
      const dropSessions = downMigration.indexOf('DROP TABLE IF EXISTS sessions');
      const dropDevices = downMigration.indexOf('DROP TABLE IF EXISTS devices');
      const dropMemberships = downMigration.indexOf('DROP TABLE IF EXISTS workspace_memberships');
      const dropWorkspaces = downMigration.indexOf('DROP TABLE IF EXISTS workspaces');
      const dropUsers = downMigration.indexOf('DROP TABLE IF EXISTS users');

      // Check all drops exist
      expect(dropSessions).toBeGreaterThan(-1);
      expect(dropDevices).toBeGreaterThan(-1);
      expect(dropMemberships).toBeGreaterThan(-1);
      expect(dropWorkspaces).toBeGreaterThan(-1);
      expect(dropUsers).toBeGreaterThan(-1);

      // Verify reverse dependency order
      expect(dropSessions).toBeLessThan(dropDevices);
      expect(dropDevices).toBeLessThan(dropMemberships);
      expect(dropMemberships).toBeLessThan(dropWorkspaces);
      expect(dropWorkspaces).toBeLessThan(dropUsers);
    });
  });
});
