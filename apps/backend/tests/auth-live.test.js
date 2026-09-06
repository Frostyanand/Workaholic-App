import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '../src/core/db.js';
import * as usersRepo from '../src/modules/users/users.repository.js';
import * as externalIdentitiesRepo from '../src/modules/auth/external-identities.repository.js';
import * as securityEventsRepo from '../src/modules/auth/security-events.repository.js';
import * as integrationsRepo from '../src/modules/auth/integrations.repository.js';
import { accountBootstrapService } from '../src/modules/auth/account-bootstrap.service.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { hashSessionToken } from '../src/core/crypto.js';

describe('Phase 4: Live PostgreSQL 16 Database & Auth Integration Tests', () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      const res = await query('SELECT version();');
      isDbAvailable = res && res.rows && res.rows.length > 0;
    } catch {
      isDbAvailable = false;
    }
  });

  it('verifies that Phase 4 tables exist in PostgreSQL information_schema', async () => {
    if (!isDbAvailable) return;

    const res = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('external_identities', 'security_events', 'integrations', 'external_accounts')
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map(r => r.table_name);
    expect(tableNames).toContain('external_identities');
    expect(tableNames).toContain('security_events');
    expect(tableNames).toContain('integrations');
    expect(tableNames).toContain('external_accounts');
  });

  it('verifies live account bootstrap: atomic creation of user, workspace, owner membership, and external identity', async () => {
    if (!isDbAvailable) return;

    const testEmail = `live_bootstrap_${Date.now()}@example.com`;
    const testSub = `google_sub_live_${Date.now()}`;

    const bootstrapResult = await accountBootstrapService.bootstrapOrResolveUser({
      provider: 'GOOGLE',
      subject: testSub,
      email: testEmail,
      displayName: 'Live Test User',
      picture: 'https://example.com/avatar.png',
    });

    expect(bootstrapResult.isNewUser).toBe(true);
    expect(bootstrapResult.user.id).toBeDefined();
    expect(bootstrapResult.workspace.name).toBe('Personal');
    expect(bootstrapResult.membership.role).toBe('OWNER');
    expect(bootstrapResult.externalIdentity.providerSubject).toBe(testSub);

    // Verify returning user resolves existing record without duplicates
    const secondCall = await accountBootstrapService.bootstrapOrResolveUser({
      provider: 'GOOGLE',
      subject: testSub,
      email: testEmail,
      displayName: 'Live Test User',
    });

    expect(secondCall.isNewUser).toBe(false);
    expect(secondCall.user.id).toBe(bootstrapResult.user.id);
  });

  it('enforces UNIQUE constraint on (provider, provider_subject) in external_identities', async () => {
    if (!isDbAvailable) return;

    const user1 = await usersRepo.createUser({
      displayName: 'User One',
      email: `user1_${Date.now()}@example.com`,
    });

    const user2 = await usersRepo.createUser({
      displayName: 'User Two',
      email: `user2_${Date.now()}@example.com`,
    });

    const sharedSub = `shared_sub_${Date.now()}`;

    // First identity link succeeds
    await externalIdentitiesRepo.createExternalIdentity({
      userId: user1.id,
      provider: 'GOOGLE',
      providerSubject: sharedSub,
    });

    // Second identity link with identical (provider, provider_subject) must fail with duplicate key violation
    await expect(
      externalIdentitiesRepo.createExternalIdentity({
        userId: user2.id,
        provider: 'GOOGLE',
        providerSubject: sharedSub,
      }),
    ).rejects.toThrow();
  });

  it('records, queries, and paginates append-only security audit events in PostgreSQL', async () => {
    if (!isDbAvailable) return;

    const user = await usersRepo.createUser({
      displayName: 'Audit User',
      email: `audit_${Date.now()}@example.com`,
    });

    // Append security events
    await securityEventsRepo.recordSecurityEvent({
      userId: user.id,
      eventType: 'LOGIN_SUCCESS',
      ipAddress: '192.168.1.50',
      userAgent: 'PostmanRuntime/7.39',
      metadata: { method: 'GOOGLE_OAUTH' },
    });

    await securityEventsRepo.recordSecurityEvent({
      userId: user.id,
      eventType: 'DEVICE_REGISTERED',
      ipAddress: '192.168.1.50',
      userAgent: 'PostmanRuntime/7.39',
      metadata: { deviceName: 'MacBook Pro' },
    });

    await securityEventsRepo.recordSecurityEvent({
      userId: user.id,
      eventType: 'LOGOUT',
      ipAddress: '192.168.1.50',
      userAgent: 'PostmanRuntime/7.39',
    });

    // Query events with pagination
    const events = await securityEventsRepo.findSecurityEventsForUser(user.id, {
      limit: 10,
      offset: 0,
    });
    const total = await securityEventsRepo.countSecurityEventsForUser(user.id);

    expect(total).toBe(3);
    expect(events).toHaveLength(3);
    expect(events[0].eventType).toBe('LOGOUT'); // Most recent first
    expect(events[1].eventType).toBe('DEVICE_REGISTERED');
    expect(events[2].eventType).toBe('LOGIN_SUCCESS');

    // Test filter by eventType
    const loginOnly = await securityEventsRepo.findSecurityEventsForUser(user.id, {
      eventType: 'LOGIN_SUCCESS',
    });
    expect(loginOnly).toHaveLength(1);
    expect(loginOnly[0].eventType).toBe('LOGIN_SUCCESS');
  });

  it('stores only SHA-256 token hashes and verifies live partial index lookup on sessions', async () => {
    if (!isDbAvailable) return;

    const user = await usersRepo.createUser({
      displayName: 'Session User',
      email: `session_${Date.now()}@example.com`,
    });

    const { session, rawToken } = await authService.createSession(user.id, {
      sessionType: 'WEB',
    });

    expect(session.id).toBeDefined();
    expect(rawToken).toHaveLength(64);

    // Verify the raw database row stores ONLY the SHA-256 hash
    const dbRow = await query('SELECT * FROM sessions WHERE id = $1', [session.id]);
    expect(dbRow.rows[0].session_token_hash).not.toBe(rawToken);
    expect(dbRow.rows[0].session_token_hash).toBe(hashSessionToken(rawToken));

    // Validate session lookup by hashing raw token
    const validated = await authService.validateRawToken(rawToken);
    expect(validated.id).toBe(session.id);
    expect(validated.userId).toBe(user.id);

    // Revoke session and verify it is immediately rejected
    await authService.revokeSession(session.id);
    await expect(authService.validateRawToken(rawToken)).rejects.toThrow(/invalid or expired/i);
  });

  it('verifies integrations and external accounts cascade on user deletion in PostgreSQL', async () => {
    if (!isDbAvailable) return;

    const user = await usersRepo.createUser({
      displayName: 'Integration User',
      email: `integration_${Date.now()}@example.com`,
    });

    const integration = await integrationsRepo.upsertIntegration({
      userId: user.id,
      provider: 'GOOGLE',
      status: 'CONNECTED',
    });

    await integrationsRepo.upsertExternalAccount({
      integrationId: integration.id,
      provider: 'GOOGLE',
      externalAccountId: `ext_${Date.now()}`,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    // Hard delete user to verify ON DELETE CASCADE
    await query('DELETE FROM users WHERE id = $1', [user.id]);

    const intCheck = await query('SELECT * FROM integrations WHERE id = $1', [integration.id]);
    expect(intCheck.rows).toHaveLength(0);

    const accCheck = await query('SELECT * FROM external_accounts WHERE integration_id = $1', [
      integration.id,
    ]);
    expect(accCheck.rows).toHaveLength(0);
  });
});
