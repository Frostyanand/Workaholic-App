import { NotFoundError, ValidationError } from '../../core/errors.js';
import * as projectsRepo from './projects.repository.js';
import { withTransaction } from '../../core/db.js';

export class ProjectsService {
  /**
   * Create a new project in a workspace
   * @param {string} workspaceId
   * @param {string} userId
   * @param {object} data
   */
  async createProject(workspaceId, userId, data) {
    if (!workspaceId) {
      throw new ValidationError('workspaceId is required');
    }

    if (data.startAt && data.dueAt) {
      const start = new Date(data.startAt).getTime();
      const due = new Date(data.dueAt).getTime();
      if (due < start) {
        throw new ValidationError('dueAt must be after or equal to startAt', {
          dueAt: 'dueAt cannot be earlier than startAt',
        });
      }
    }

    return withTransaction(async client => {
      const project = await projectsRepo.createProject(
        {
          ...data,
          workspaceId,
          ownerUserId: data.ownerUserId || userId,
        },
        client,
      );

      // Creator/owner is automatically added as OWNER in project_members
      if (userId) {
        await projectsRepo.addProjectMember(project.id, userId, 'OWNER', client);
      }

      return project;
    });
  }

  /**
   * Get single project by ID with members within workspace
   * @param {string} id
   * @param {string} workspaceId
   */
  async getProjectById(id, workspaceId) {
    const project = await projectsRepo.findProjectById(id, workspaceId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const members = await projectsRepo.listProjectMembers(id);
    return {
      ...project,
      members,
    };
  }

  /**
   * List projects in workspace with filtering and pagination
   * @param {string} workspaceId
   * @param {object} [query={}]
   */
  async listProjects(workspaceId, query = {}) {
    return projectsRepo.listProjects(workspaceId, query);
  }

  /**
   * Update an existing project
   * @param {string} id
   * @param {string} workspaceId
   * @param {object} updates
   */
  async updateProject(id, workspaceId, updates) {
    const existing = await projectsRepo.findProjectById(id, workspaceId);
    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    const startAt = updates.startAt !== undefined ? updates.startAt : existing.startAt;
    const dueAt = updates.dueAt !== undefined ? updates.dueAt : existing.dueAt;

    if (startAt && dueAt) {
      const start = new Date(startAt).getTime();
      const due = new Date(dueAt).getTime();
      if (due < start) {
        throw new ValidationError('dueAt must be after or equal to startAt', {
          dueAt: 'dueAt cannot be earlier than startAt',
        });
      }
    }

    return projectsRepo.updateProject(id, workspaceId, updates);
  }

  /**
   * Soft-delete a project
   * @param {string} id
   * @param {string} workspaceId
   */
  async deleteProject(id, workspaceId) {
    const existing = await projectsRepo.findProjectById(id, workspaceId);
    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    return projectsRepo.softDeleteProject(id, workspaceId);
  }

  /**
   * Restore a soft-deleted project
   * @param {string} id
   * @param {string} workspaceId
   */
  async restoreProject(id, workspaceId) {
    const existing = await projectsRepo.findProjectById(id, workspaceId, undefined, true);
    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    if (!existing.deletedAt) {
      return existing;
    }

    return projectsRepo.restoreProject(id, workspaceId);
  }

  /**
   * Add a member to a project
   * @param {string} projectId
   * @param {string} workspaceId
   * @param {object} memberData
   */
  async addMember(projectId, workspaceId, memberData) {
    const existing = await projectsRepo.findProjectById(projectId, workspaceId);
    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    return projectsRepo.addProjectMember(projectId, memberData.userId, memberData.role || 'MEMBER');
  }

  /**
   * Remove a member from a project
   * @param {string} projectId
   * @param {string} workspaceId
   * @param {string} userId
   */
  async removeMember(projectId, workspaceId, userId) {
    const existing = await projectsRepo.findProjectById(projectId, workspaceId);
    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    return projectsRepo.removeProjectMember(projectId, userId);
  }

  /**
   * List members of a project
   * @param {string} projectId
   * @param {string} workspaceId
   */
  async listMembers(projectId, workspaceId) {
    const existing = await projectsRepo.findProjectById(projectId, workspaceId);
    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    return projectsRepo.listProjectMembers(projectId);
  }
}

export const projectsService = new ProjectsService();
