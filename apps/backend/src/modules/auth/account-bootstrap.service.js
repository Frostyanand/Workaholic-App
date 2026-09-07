import * as usersRepo from '../users/users.repository.js';
import * as workspacesRepo from '../workspaces/workspaces.repository.js';
import * as externalIdentitiesRepo from './external-identities.repository.js';
import { withTransaction, pool } from '../../core/db.js';
import { AuthenticationFailedError } from '../../core/errors.js';

/**
 * Account Bootstrap Service conforming to docs/IMPLEMENTATION-PLAN.md Task 4.6,
 * docs/6.SYSTEM-ARCHITECTURE.md Section 13 & 14, and docs/2.requirements.md Requirement 22.
 *
 * Atomically provisions a user profile, default personal workspace, and OWNER membership
 * upon initial verified authentication.
 *
 * INVARIANTS:
 * 1. Authoritative identity key is the verified external subject (Firebase UID).
 * 2. Bootstrap is transactional, idempotent, and concurrency-safe against simultaneous first-login races.
 * 3. Never produces duplicate users, workspaces, memberships, or external identities.
 */
export class AccountBootstrapService {
  constructor(
    users = usersRepo,
    workspaces = workspacesRepo,
    externalIdentities = externalIdentitiesRepo,
    txHelper = withTransaction,
  ) {
    this.usersRepo = users;
    this.workspacesRepo = workspaces;
    this.externalIdentitiesRepo = externalIdentities;
    this.withTransaction = txHelper;
  }

  /**
   * Resolves an existing authenticated user or atomically bootstraps a new user account.
   *
   * @param {Object} identity - Verified external identity
   * @param {string} identity.provider - 'FIREBASE'
   * @param {string} identity.subject - Unique external user identifier (Firebase UID)
   * @param {string|null} [identity.email] - User email
   * @param {string} [identity.displayName] - Display name
   * @param {string|null} [identity.picture] - Avatar URL
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   * @returns {Promise<{ user: Object, isNewUser: boolean, workspace?: Object }>}
   */
  async bootstrapOrResolveUser(identity, client = undefined) {
    if (!identity || !identity.provider || !identity.subject) {
      throw new TypeError('identity with provider and subject is required');
    }

    const provider = String(identity.provider).trim().toUpperCase();
    const subject = String(identity.subject).trim();
    const email = identity.email ? String(identity.email).trim().toLowerCase() : null;

    // 1. Look up by external identity mapping (Authoritative Key: provider + subject)
    const existingIdentity = await this.externalIdentitiesRepo.findExternalIdentity(
      provider,
      subject,
      client,
    );

    if (existingIdentity) {
      if (existingIdentity.userDeletedAt) {
        throw new AuthenticationFailedError('User account has been deactivated');
      }
      const user = await this.usersRepo.findUserById(existingIdentity.userId, client);
      if (!user || user.deletedAt) {
        throw new AuthenticationFailedError('User account not found or deactivated');
      }
      return {
        user,
        isNewUser: false,
      };
    }

    // 2. Check if a user with this email already exists (e.g. invited user or existing account)
    if (email) {
      const existingUserByEmail = await this.usersRepo.findUserByEmail(email, client);

      if (existingUserByEmail) {
        if (existingUserByEmail.deletedAt) {
          throw new AuthenticationFailedError('User account has been deactivated');
        }

        try {
          // Link external identity to existing active user
          await this.externalIdentitiesRepo.createExternalIdentity(
            {
              userId: existingUserByEmail.id,
              provider,
              providerSubject: subject,
            },
            client,
          );
        } catch (err) {
          // If concurrent request linked it simultaneously, re-verify
          const concurrentIdentity = await this.externalIdentitiesRepo.findExternalIdentity(
            provider,
            subject,
            client,
          );
          if (concurrentIdentity) {
            return {
              user: existingUserByEmail,
              isNewUser: false,
            };
          }
          throw err;
        }

        return {
          user: existingUserByEmail,
          isNewUser: false,
        };
      }
    }

    // 3. Brand new user: Execute atomic account bootstrap inside transaction
    try {
      return await this.withTransaction(async txClient => {
        // 3a. Provision User Profile
        const user = await this.usersRepo.createUser(
          {
            displayName: identity.displayName || (email ? email.split('@')[0] : 'Workaholic User'),
            email: email || `${subject}@placeholder.workaholic.internal`,
            profileImageReference: identity.picture || null,
            timezone: 'UTC',
            locale: 'en',
            preferences: {},
          },
          txClient,
        );

        // 3b. Provision Initial Personal Workspace with OWNER membership
        const { workspace, membership } = await this.workspacesRepo.createWorkspaceWithMembership(
          {
            name: 'Personal',
            workspaceType: 'PERSONAL',
            ownerUserId: user.id,
          },
          txClient,
        );

        // 3c. Link external identity (enforces UNIQUE(provider, provider_subject))
        const externalIdentity = await this.externalIdentitiesRepo.createExternalIdentity(
          {
            userId: user.id,
            provider,
            providerSubject: subject,
          },
          txClient,
        );

        return {
          user,
          workspace,
          membership,
          externalIdentity,
          isNewUser: true,
        };
      }, client);
    } catch (err) {
      // 4. Concurrency Guard: If a concurrent request created this user simultaneously,
      // the transaction will have safely rolled back. Re-query the established identity.
      if (
        err?.code === '23505' ||
        err?.message?.includes('duplicate key') ||
        err?.message?.includes('uq_external_identities')
      ) {
        const resolvedIdentity = await this.externalIdentitiesRepo.findExternalIdentity(
          provider,
          subject,
          client || pool,
        );
        if (resolvedIdentity) {
          const user = await this.usersRepo.findUserById(resolvedIdentity.userId, client || pool);
          if (user && !user.deletedAt) {
            return {
              user,
              isNewUser: false,
            };
          }
        }
      }
      throw err;
    }
  }
}

export const accountBootstrapService = new AccountBootstrapService();
