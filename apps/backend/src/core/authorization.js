import { WORKSPACE_ROLE, MEMBERSHIP_STATUS } from '@workaholic/shared';
import { AuthenticationRequiredError, ForbiddenError, NotFoundError } from './errors.js';
import * as workspacesRepo from '../modules/workspaces/workspaces.repository.js';

/**
 * Role hierarchy rank mapping (higher number = greater privilege).
 * Conforms to docs/11.PERMISSIONS-MODEL.md Section 10-14.
 */
export const ROLE_HIERARCHY = Object.freeze({
  [WORKSPACE_ROLE.OWNER]: 40,
  [WORKSPACE_ROLE.ADMIN]: 30,
  [WORKSPACE_ROLE.MEMBER]: 20,
  [WORKSPACE_ROLE.VIEWER]: 10,
});

/**
 * Check whether a user's role meets or exceeds a required minimum role.
 * @param {string} userRole
 * @param {string} minimumRole
 * @returns {boolean}
 */
export function hasMinimumRole(userRole, minimumRole) {
  const userRank = ROLE_HIERARCHY[userRole] ?? 0;
  const minRank = ROLE_HIERARCHY[minimumRole] ?? 0;
  return userRank >= minRank;
}

/**
 * Assert whether a requester has authority to change another member's role.
 * Conforms to docs/11.PERMISSIONS-MODEL.md Section 67 & Acceptance Tests PERM-T19/PERM-T20.
 *
 * @param {string} requesterRole
 * @param {string} targetCurrentRole
 * @param {string} newRole
 * @throws {ForbiddenError} if unauthorized
 */
export function assertCanManageRole(requesterRole, targetCurrentRole, newRole) {
  const requesterRank = ROLE_HIERARCHY[requesterRole] ?? 0;
  const targetRank = ROLE_HIERARCHY[targetCurrentRole] ?? 0;
  const newRank = ROLE_HIERARCHY[newRole] ?? 0;

  // Only OWNER (40) and ADMIN (30) can manage roles
  if (requesterRank < ROLE_HIERARCHY[WORKSPACE_ROLE.ADMIN]) {
    throw new ForbiddenError('Only workspace owners and administrators can manage roles');
  }

  // Cannot modify someone with equal or greater role rank (e.g. ADMIN modifying ADMIN or OWNER)
  if (requesterRank <= targetRank && requesterRole !== WORKSPACE_ROLE.OWNER) {
    throw new ForbiddenError('Cannot modify members with equal or higher role');
  }

  // Cannot grant a role equal to or greater than own role
  if (requesterRank <= newRank && requesterRole !== WORKSPACE_ROLE.OWNER) {
    throw new ForbiddenError('Cannot grant a role equal to or higher than your own');
  }

  // Cannot alter OWNER role without explicit ownership transfer
  if (targetCurrentRole === WORKSPACE_ROLE.OWNER) {
    throw new ForbiddenError('Workspace owner role cannot be altered');
  }
}

/**
 * Assert that an accessed resource belongs strictly to the authenticated workspace.
 * IDOR & Cross-workspace isolation guard (docs/11.PERMISSIONS-MODEL.md Section 52-53).
 *
 * @param {Object} resource
 * @param {string} resource.workspaceId
 * @param {string} workspaceId
 * @throws {NotFoundError} if resource does not match workspace
 */
export function assertResourceTenantIsolation(resource, workspaceId) {
  if (!resource || resource.workspaceId !== workspaceId) {
    throw new NotFoundError('Resource not found in active workspace');
  }
}

/**
 * Factory creating a Fastify preHandler hook that enforces server-side workspace authorization.
 * Conforms to docs/11.PERMISSIONS-MODEL.md Section 50-54 & docs/15.API-SPECIFICATION.md Section 5.
 *
 * @param {Object} [options]
 * @param {string[]} [options.allowedRoles] - Specific roles allowed (e.g. ['OWNER', 'ADMIN'])
 * @param {string} [options.minimumRole] - Minimum hierarchical role required (e.g. 'ADMIN')
 * @param {Function} [options.getWorkspaceId] - Custom extractor function: (req) => string
 * @param {Object} [options.repository] - Custom workspaces repository for testing/mocking
 * @returns {Function} Fastify preHandler hook
 */
export function requireWorkspaceAccess(options = {}) {
  const { allowedRoles, minimumRole, getWorkspaceId, repository = workspacesRepo } = options;

  return async function workspaceAccessHook(request, _reply) {
    if (!request.user) {
      throw new AuthenticationRequiredError('Authentication required');
    }

    // Respect workspace context if already established by upstream hook
    if (request.workspace?.id && !getWorkspaceId) {
      return;
    }

    let workspaceId;
    if (typeof getWorkspaceId === 'function') {
      workspaceId = await getWorkspaceId(request);
    } else {
      workspaceId =
        request.headers?.['x-workspace-id'] ||
        request.query?.workspaceId ||
        request.params?.workspaceId ||
        request.body?.workspaceId;

      // Only treat params.id as workspaceId if the route explicitly targets workspaces
      if (
        !workspaceId &&
        request.params?.id &&
        (request.routeOptions?.url?.includes('/workspaces/') ||
          request.routeOptions?.url?.startsWith('/workspaces/'))
      ) {
        workspaceId = request.params.id;
      }
    }

    // Fallback: If no workspace explicitly provided, find user's default active workspace
    if (!workspaceId && request.user?.id) {
      const userWorkspaces = await repository.findWorkspacesForUser(request.user.id);
      if (userWorkspaces && userWorkspaces.length > 0) {
        workspaceId = userWorkspaces[0].id;
      }
    }

    if (!workspaceId) {
      throw new NotFoundError('Workspace not specified');
    }

    // Server-side lookup of active memberships (zero client trust)
    const memberships = await repository.findWorkspaceMemberships(workspaceId);
    const userMembership = memberships.find(
      m => m.userId === request.user.id && m.status === MEMBERSHIP_STATUS.ACTIVE,
    );

    // Non-members or inactive/suspended memberships are rejected with NOT_FOUND
    // to avoid disclosing existence of unauthorized workspaces (API-SPECIFICATION.md Sec 17)
    if (!userMembership) {
      throw new NotFoundError('Workspace not found');
    }

    // Role check: specific allowed roles list
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(userMembership.role)) {
        throw new ForbiddenError('Insufficient permissions for this workspace action');
      }
    }

    // Role check: minimum hierarchical rank
    if (minimumRole) {
      if (!hasMinimumRole(userMembership.role, minimumRole)) {
        throw new ForbiddenError(`Action requires minimum role of ${minimumRole}`);
      }
    }

    // Attach verified server-side workspace context to request
    request.workspace = {
      id: workspaceId,
      role: userMembership.role,
      status: userMembership.status,
      joinedAt: userMembership.joinedAt,
    };
  };
}
