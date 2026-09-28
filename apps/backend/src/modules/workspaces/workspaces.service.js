import * as workspacesRepo from './workspaces.repository.js';
import { findUserByEmail } from '../users/users.repository.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../core/errors.js';
import { WORKSPACE_ROLE, MEMBERSHIP_STATUS } from '@workaholic/shared';

/**
 * Workspaces Service — domain logic and access control for Workspaces.
 * Conforms to docs/6.SYSTEM-ARCHITECTURE.md Section 16 & docs/11.PERMISSIONS-MODEL.md
 */
export class WorkspacesService {
  constructor(repository = workspacesRepo) {
    this.repo = repository;
  }

  /**
   * List all workspaces where the user has an active membership.
   */
  async getUserWorkspaces(userId, client = undefined) {
    return this.repo.findWorkspacesForUser(userId, client);
  }

  /**
   * Retrieve workspace by ID, strictly enforcing workspace tenant membership.
   * Returns NotFoundError for non-members to avoid leaking private resource existence.
   */
  async getWorkspaceById(workspaceId, userId, client = undefined) {
    const workspace = await this.repo.findWorkspaceById(workspaceId, client);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Verify requester active membership
    const memberships = await this.repo.findWorkspaceMemberships(workspaceId, client);
    const userMembership = memberships.find(
      m => m.userId === userId && m.status === MEMBERSHIP_STATUS.ACTIVE,
    );

    if (!userMembership) {
      // Invariant: Do not disclose existence of unauthorized workspace
      throw new NotFoundError('Workspace not found');
    }

    return {
      ...workspace,
      membership: {
        role: userMembership.role,
        status: userMembership.status,
        joinedAt: userMembership.joinedAt,
      },
    };
  }

  /**
   * Create workspace and establish owner membership atomically.
   */
  async createWorkspace(userId, workspaceData, client = undefined) {
    return this.repo.createWorkspaceWithMembership(
      {
        name: workspaceData.name,
        workspaceType: workspaceData.workspaceType || 'PERSONAL',
        ownerUserId: userId,
      },
      client,
    );
  }

  /**
   * List all active members of a workspace. Requester must be an active member.
   */
  async getWorkspaceMembers(workspaceId, requesterUserId, client = undefined) {
    await this.getWorkspaceById(workspaceId, requesterUserId, client);
    return this.repo.findWorkspaceMemberships(workspaceId, client);
  }

  /**
   * Add a member to a workspace. Requester must be OWNER or ADMIN.
   * Supports adding by userId or email.
   */
  async addMember(workspaceId, requesterUserId, memberData, client = undefined) {
    const workspace = await this.getWorkspaceById(workspaceId, requesterUserId, client);
    const requesterRole = workspace.membership.role;

    if (requesterRole !== WORKSPACE_ROLE.OWNER && requesterRole !== WORKSPACE_ROLE.ADMIN) {
      throw new ForbiddenError('Only workspace owners and administrators can add members');
    }

    // Admins cannot create owners
    if (requesterRole === WORKSPACE_ROLE.ADMIN && memberData.role === WORKSPACE_ROLE.OWNER) {
      throw new ForbiddenError('Administrators cannot grant owner role');
    }

    let targetUserId = memberData.userId;
    if (!targetUserId && memberData.email) {
      const user = await findUserByEmail(memberData.email, client);
      if (!user) {
        throw new NotFoundError(`No user found with email ${memberData.email}`);
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      throw new NotFoundError('User ID or email is required to add a member');
    }

    try {
      return await this.repo.addWorkspaceMembership(
        workspaceId,
        targetUserId,
        memberData.role || WORKSPACE_ROLE.MEMBER,
        memberData.status || MEMBERSHIP_STATUS.ACTIVE,
        client,
      );
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictError('User is already a member of this workspace');
      }
      throw err;
    }
  }

  /**
   * Update a member's role. Enforces role transition security.
   */
  async updateMemberRole(workspaceId, requesterUserId, targetUserId, newRole, client = undefined) {
    const workspace = await this.getWorkspaceById(workspaceId, requesterUserId, client);
    const requesterRole = workspace.membership.role;

    if (requesterRole !== WORKSPACE_ROLE.OWNER && requesterRole !== WORKSPACE_ROLE.ADMIN) {
      throw new ForbiddenError('Only workspace owners and administrators can modify roles');
    }

    const members = await this.repo.findWorkspaceMemberships(workspaceId, client);
    const targetMember = members.find(m => m.userId === targetUserId);

    if (!targetMember) {
      throw new NotFoundError('Member not found in workspace');
    }

    // Prevent changing the workspace owner's role without transfer
    if (targetMember.role === WORKSPACE_ROLE.OWNER && targetUserId === workspace.ownerUserId) {
      throw new ForbiddenError('Workspace owner role cannot be modified');
    }

    // Admins cannot modify owners or promote to owner
    if (requesterRole === WORKSPACE_ROLE.ADMIN) {
      if (
        targetMember.role === WORKSPACE_ROLE.OWNER ||
        targetMember.role === WORKSPACE_ROLE.ADMIN
      ) {
        throw new ForbiddenError('Administrators cannot modify roles of owners or administrators');
      }
      if (newRole === WORKSPACE_ROLE.OWNER) {
        throw new ForbiddenError('Administrators cannot grant owner role');
      }
    }

    return this.repo.updateMembershipRole(workspaceId, targetUserId, newRole, client);
  }

  /**
   * Remove member from workspace (or member leaves workspace)
   */
  async removeMember(workspaceId, requesterUserId, targetUserId, client = undefined) {
    const workspace = await this.getWorkspaceById(workspaceId, requesterUserId, client);
    const requesterRole = workspace.membership.role;
    const isSelf = requesterUserId === targetUserId;

    if (
      !isSelf &&
      requesterRole !== WORKSPACE_ROLE.OWNER &&
      requesterRole !== WORKSPACE_ROLE.ADMIN
    ) {
      throw new ForbiddenError('Only workspace owners and administrators can remove members');
    }

    const members = await this.repo.findWorkspaceMemberships(workspaceId, client);
    const targetMember = members.find(m => m.userId === targetUserId);

    if (!targetMember) {
      throw new NotFoundError('Member not found in workspace');
    }

    if (targetMember.role === WORKSPACE_ROLE.OWNER && targetUserId === workspace.ownerUserId) {
      throw new ForbiddenError('Workspace owner cannot be removed from workspace');
    }

    if (
      !isSelf &&
      requesterRole === WORKSPACE_ROLE.ADMIN &&
      (targetMember.role === WORKSPACE_ROLE.OWNER || targetMember.role === WORKSPACE_ROLE.ADMIN)
    ) {
      throw new ForbiddenError('Administrators cannot remove owners or other administrators');
    }

    return this.repo.removeWorkspaceMembership(workspaceId, targetUserId, client);
  }
}

export const workspacesService = new WorkspacesService();
