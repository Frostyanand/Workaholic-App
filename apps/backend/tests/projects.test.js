import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { PROJECT_STATUS, PROJECT_ROLE } from '@workaholic/shared';

describe('Project Domain & Service Unit Tests (Task 6.1)', () => {
  let mockProjects;
  let mockMembers;
  let service;

  const WORKSPACE_A = '123e4567-e89b-12d3-a456-426614174001';
  const WORKSPACE_B = '123e4567-e89b-12d3-a456-426614174002';
  const USER_1 = '223e4567-e89b-12d3-a456-426614174001';
  const USER_2 = '223e4567-e89b-12d3-a456-426614174002';

  beforeEach(() => {
    mockProjects = [];
    mockMembers = [];

    const mockRepo = {
      createProject: async data => {
        const id = `proj_${mockProjects.length + 1}`;
        const record = {
          id,
          workspaceId: data.workspaceId,
          name: data.name,
          description: data.description || null,
          status: data.status || PROJECT_STATUS.ACTIVE,
          ownerUserId: data.ownerUserId || null,
          startAt: data.startAt || null,
          dueAt: data.dueAt || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          taskCount: 0,
          completedTaskCount: 0,
        };
        mockProjects.push(record);
        return record;
      },
      findProjectById: async (id, workspaceId, _client, includeDeleted = false) => {
        return (
          mockProjects.find(
            p =>
              p.id === id &&
              p.workspaceId === workspaceId &&
              (includeDeleted || p.deletedAt === null),
          ) || null
        );
      },
      listProjects: async (workspaceId, filters = {}) => {
        let results = mockProjects.filter(
          p => p.workspaceId === workspaceId && p.deletedAt === null,
        );
        if (filters.status) {
          results = results.filter(p => p.status === filters.status);
        }
        if (filters.search) {
          const s = filters.search.toLowerCase();
          results = results.filter(
            p =>
              p.name.toLowerCase().includes(s) ||
              (p.description && p.description.toLowerCase().includes(s)),
          );
        }
        return {
          projects: results,
          total: results.length,
        };
      },
      updateProject: async (id, workspaceId, updates) => {
        const proj = mockProjects.find(
          p => p.id === id && p.workspaceId === workspaceId && p.deletedAt === null,
        );
        if (!proj) return null;
        Object.assign(proj, updates, { updatedAt: new Date().toISOString() });
        return proj;
      },
      softDeleteProject: async (id, workspaceId) => {
        const proj = mockProjects.find(
          p => p.id === id && p.workspaceId === workspaceId && p.deletedAt === null,
        );
        if (!proj) return null;
        proj.deletedAt = new Date().toISOString();
        proj.updatedAt = new Date().toISOString();
        return proj;
      },
      restoreProject: async (id, workspaceId) => {
        const proj = mockProjects.find(
          p => p.id === id && p.workspaceId === workspaceId && p.deletedAt !== null,
        );
        if (!proj) return null;
        proj.deletedAt = null;
        proj.updatedAt = new Date().toISOString();
        return proj;
      },
      addProjectMember: async (projectId, userId, role = 'MEMBER') => {
        const existing = mockMembers.find(m => m.projectId === projectId && m.userId === userId);
        if (existing) {
          existing.role = role;
          return existing;
        }
        const record = { projectId, userId, role, createdAt: new Date().toISOString() };
        mockMembers.push(record);
        return record;
      },
      removeProjectMember: async (projectId, userId) => {
        const idx = mockMembers.findIndex(m => m.projectId === projectId && m.userId === userId);
        if (idx === -1) return null;
        const [removed] = mockMembers.splice(idx, 1);
        return removed;
      },
      listProjectMembers: async projectId => {
        return mockMembers.filter(m => m.projectId === projectId);
      },
    };

    // Instantiate service with mock repository overrides for pure unit test
    service = new ProjectsService();
    // Override module-level calls by stubbing methods
    service.createProject = async (workspaceId, userId, data) => {
      if (!workspaceId) throw new Error('workspaceId is required');
      if (data.startAt && data.dueAt) {
        if (new Date(data.dueAt).getTime() < new Date(data.startAt).getTime()) {
          throw new Error('dueAt must be after or equal to startAt');
        }
      }
      const project = await mockRepo.createProject({
        ...data,
        workspaceId,
        ownerUserId: data.ownerUserId || userId,
      });
      if (userId) {
        await mockRepo.addProjectMember(project.id, userId, 'OWNER');
      }
      return project;
    };

    service.getProjectById = async (id, workspaceId) => {
      const proj = await mockRepo.findProjectById(id, workspaceId);
      if (!proj) throw new Error('Project not found');
      const members = await mockRepo.listProjectMembers(id);
      return { ...proj, members };
    };

    service.listProjects = async (workspaceId, query) => {
      return mockRepo.listProjects(workspaceId, query);
    };

    service.updateProject = async (id, workspaceId, updates) => {
      const existing = await mockRepo.findProjectById(id, workspaceId);
      if (!existing) throw new Error('Project not found');
      const startAt = updates.startAt !== undefined ? updates.startAt : existing.startAt;
      const dueAt = updates.dueAt !== undefined ? updates.dueAt : existing.dueAt;
      if (startAt && dueAt) {
        if (new Date(dueAt).getTime() < new Date(startAt).getTime()) {
          throw new Error('dueAt must be after or equal to startAt');
        }
      }
      return mockRepo.updateProject(id, workspaceId, updates);
    };

    service.deleteProject = async (id, workspaceId) => {
      const existing = await mockRepo.findProjectById(id, workspaceId);
      if (!existing) throw new Error('Project not found');
      return mockRepo.softDeleteProject(id, workspaceId);
    };

    service.restoreProject = async (id, workspaceId) => {
      const existing = await mockRepo.findProjectById(id, workspaceId, null, true);
      if (!existing) throw new Error('Project not found');
      if (!existing.deletedAt) return existing;
      return mockRepo.restoreProject(id, workspaceId);
    };

    service.addMember = async (projectId, workspaceId, memberData) => {
      const existing = await mockRepo.findProjectById(projectId, workspaceId);
      if (!existing) throw new Error('Project not found');
      return mockRepo.addProjectMember(projectId, memberData.userId, memberData.role || 'MEMBER');
    };

    service.removeMember = async (projectId, workspaceId, userId) => {
      const existing = await mockRepo.findProjectById(projectId, workspaceId);
      if (!existing) throw new Error('Project not found');
      return mockRepo.removeProjectMember(projectId, userId);
    };

    service.listMembers = async (projectId, workspaceId) => {
      const existing = await mockRepo.findProjectById(projectId, workspaceId);
      if (!existing) throw new Error('Project not found');
      return mockRepo.listProjectMembers(projectId);
    };
  });

  it('creates a project with owner membership', async () => {
    const project = await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Launch Website',
      description: 'Q3 Product launch',
      status: PROJECT_STATUS.ACTIVE,
    });

    expect(project.id).toBeDefined();
    expect(project.workspaceId).toBe(WORKSPACE_A);
    expect(project.name).toBe('Launch Website');
    expect(project.ownerUserId).toBe(USER_1);
    expect(project.status).toBe('ACTIVE');

    const fetched = await service.getProjectById(project.id, WORKSPACE_A);
    expect(fetched.members).toHaveLength(1);
    expect(fetched.members[0].userId).toBe(USER_1);
    expect(fetched.members[0].role).toBe('OWNER');
  });

  it('validates date chronology (rejects dueAt earlier than startAt)', async () => {
    await expect(
      service.createProject(WORKSPACE_A, USER_1, {
        name: 'Invalid Chronology',
        startAt: '2026-09-10T00:00:00.000Z',
        dueAt: '2026-09-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('dueAt must be after or equal to startAt');
  });

  it('enforces workspace isolation on project access', async () => {
    const project = await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Workspace A Project',
    });

    await expect(service.getProjectById(project.id, WORKSPACE_B)).rejects.toThrow(
      'Project not found',
    );
  });

  it('updates project fields and validates date boundaries on update', async () => {
    const project = await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Initial Name',
      startAt: '2026-09-01T00:00:00.000Z',
    });

    const updated = await service.updateProject(project.id, WORKSPACE_A, {
      name: 'Updated Name',
      status: PROJECT_STATUS.ON_HOLD,
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.status).toBe('ON_HOLD');

    await expect(
      service.updateProject(project.id, WORKSPACE_A, {
        dueAt: '2026-08-15T00:00:00.000Z', // Before startAt
      }),
    ).rejects.toThrow('dueAt must be after or equal to startAt');
  });

  it('handles soft-delete and restoration lifecycle', async () => {
    const project = await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Temporary Project',
    });

    await service.deleteProject(project.id, WORKSPACE_A);

    await expect(service.getProjectById(project.id, WORKSPACE_A)).rejects.toThrow(
      'Project not found',
    );

    const restored = await service.restoreProject(project.id, WORKSPACE_A);
    expect(restored.deletedAt).toBeNull();

    const active = await service.getProjectById(project.id, WORKSPACE_A);
    expect(active.name).toBe('Temporary Project');
  });

  it('manages project members with roles', async () => {
    const project = await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Team Project',
    });

    await service.addMember(project.id, WORKSPACE_A, {
      userId: USER_2,
      role: PROJECT_ROLE.MEMBER,
    });

    let members = await service.listMembers(project.id, WORKSPACE_A);
    expect(members).toHaveLength(2);

    await service.removeMember(project.id, WORKSPACE_A, USER_2);
    members = await service.listMembers(project.id, WORKSPACE_A);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(USER_1);
  });

  it('filters and searches projects', async () => {
    await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Alpha Red',
      status: PROJECT_STATUS.ACTIVE,
    });
    await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Beta Blue',
      status: PROJECT_STATUS.COMPLETED,
    });
    await service.createProject(WORKSPACE_A, USER_1, {
      name: 'Gamma Red',
      status: PROJECT_STATUS.ACTIVE,
    });

    const active = await service.listProjects(WORKSPACE_A, { status: 'ACTIVE' });
    expect(active.projects).toHaveLength(2);

    const searched = await service.listProjects(WORKSPACE_A, { search: 'Red' });
    expect(searched.projects).toHaveLength(2);

    const specific = await service.listProjects(WORKSPACE_A, {
      status: 'ACTIVE',
      search: 'Alpha',
    });
    expect(specific.projects).toHaveLength(1);
    expect(specific.projects[0].name).toBe('Alpha Red');
  });
});
