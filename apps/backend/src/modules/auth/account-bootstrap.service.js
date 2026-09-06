import * as usersRepo from '../users/users.repository.js';
import * as workspacesRepo from '../workspaces/workspaces.repository.js';
import * as externalIdentitiesRepo from './external-identities.repository.js';
import { withTransaction } from '../../core/db.js';
import { AuthenticationFailedError } from '../../core/errors.js';

/**
 * Account Bootstrap Service conforming to docs/IMPLEMENTATION-PLAN.md Task 4.6.
 * Atomically provisions a user profile, default personal workspace, and OWNER membership
 * upon initial verified authentication.
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
   * @param {string} identity.provider - 'GOOGLE'
   * @param {string} identity.subject - Google unique subject ID
   * @param {string} identity.email - Verified email
   * @param {string} identity.displayName - Display name
   * @param {string|null} [identity.picture] - Avatar URL
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   * @returns {Promise<{ user: Object, isNewUser: boolean, workspace?: Object }>}
   */
  async bootstrapOrResolveUser(identity, client = undefined) {
    if (!identity || !identity.provider || !identity.subject || !identity.email) {
      throw new TypeError('identity with provider, subject, and email is required');
    }

    // 1. Look up by external identity mapping
    const existingIdentity = await this.externalIdentitiesRepo.findExternalIdentity(
      identity.provider,
      identity.subject,
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

    // 2. Check if a user with this email already exists
    const existingUserByEmail = await this.usersRepo.findUserByEmail(identity.email, client);

    if (existingUserByEmail) {
      // Link external identity to existing active user
      await this.externalIdentitiesRepo.createExternalIdentity(
        {
          userId: existingUserByEmail.id,
          provider: identity.provider,
          providerSubject: identity.subject,
        },
        client,
      );

      return {
        user: existingUserByEmail,
        isNewUser: false,
      };
    }

    // 3. Brand new user: Execute atomic account bootstrap inside transaction
    return this.withTransaction(async txClient => {
      // 3a. Provision User Profile
      const user = await this.usersRepo.createUser(
        {
          displayName: identity.displayName || identity.email.split('@')[0],
          email: identity.email,
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

      // 3c. Link external identity
      const externalIdentity = await this.externalIdentitiesRepo.createExternalIdentity(
        {
          userId: user.id,
          provider: identity.provider,
          providerSubject: identity.subject,
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
  }
}

export const accountBootstrapService = new AccountBootstrapService();
