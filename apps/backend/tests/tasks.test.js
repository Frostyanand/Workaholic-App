import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import {
  TasksService,
  isTaskOverdue,
  normalizePriority,
  wouldCreateDependencyCycle,
} from '../src/modules/tasks/tasks.service.js';
import { DEPENDENCY_TYPE } from '@workaholic/shared';

describe('Task Management Domain & Service (Phase 5)', () => {
  let mockTasks;
  let mockLabels;
  let mockTaskLabels;
  let mockDependencies;
  let mockLinks;
  let mockWorkBlocks;
  let service;

  const WORKSPACE_A = '123e4567-e89b-12d3-a456-426614174001';
  const WORKSPACE_B = '123e4567-e89b-12d3-a456-426614174002';
  const USER_1 = '223e4567-e89b-12d3-a456-426614174001';

  beforeEach(() => {
    mockTasks = [];
    mockLabels = [];
    mockTaskLabels = [];
    mockDependencies = [];
    mockLinks = [];
    mockWorkBlocks = [];

    const mockRepo = {
      createTask: async data => {
        const id = `task_${mockTasks.length + 1}`;
        const record = {
          id,
          workspaceId: data.workspaceId,
          projectId: data.projectId || null,
          boardId: data.boardId || null,
          boardColumnId: data.boardColumnId || null,
          parentTaskId: data.parentTaskId || null,
          title: data.title,
          description: data.description || null,
          status: data.status || 'TODO',
          priority: data.priority || 'P3',
          startAt: data.startAt || null,
          dueAt: data.dueAt || null,
          estimatedDuration: data.estimatedDuration || null,
          completedAt: data.completedAt || null,
          createdBy: data.createdBy,
          assignedTo: data.assignedTo || null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        mockTasks.push(record);
        return record;
      },
      findTaskById: async (id, workspaceId, options = { includeDeleted: false }) => {
        return (
          mockTasks.find(
            t =>
              t.id === id &&
              t.workspaceId === workspaceId &&
              (options.includeDeleted || t.deletedAt === null),
          ) || null
        );
      },
      listTasks: async (workspaceId, filters = {}, pagination = { limit: 20, offset: 0 }) => {
        let list = mockTasks.filter(
          t => t.workspaceId === workspaceId && (filters.includeDeleted || t.deletedAt === null),
        );
        if (filters.status) list = list.filter(t => t.status === filters.status);
        if (filters.priority) list = list.filter(t => t.priority === filters.priority);
        if (filters.overdue === true) {
          list = list.filter(t => isTaskOverdue(t));
        }
        if (filters.search) {
          list = list.filter(
            t =>
              t.title.toLowerCase().includes(filters.search.toLowerCase()) ||
              (t.description && t.description.toLowerCase().includes(filters.search.toLowerCase())),
          );
        }
        const total = list.length;
        const offset = pagination.offset || 0;
        const limit = pagination.limit || 20;
        return {
          tasks: list.slice(offset, offset + limit),
          total,
          limit,
          offset,
        };
      },
      updateTask: async (id, workspaceId, updateData, expectedVersion = null) => {
        const task = mockTasks.find(
          t => t.id === id && t.workspaceId === workspaceId && t.deletedAt === null,
        );
        if (!task) return null;
        if (expectedVersion !== null && task.version !== expectedVersion) {
          return null; // Concurrency conflict
        }
        Object.assign(task, updateData, {
          version: task.version + 1,
          updatedAt: new Date().toISOString(),
        });
        return task;
      },
      softDeleteTask: async (id, workspaceId) => {
        const task = mockTasks.find(
          t => t.id === id && t.workspaceId === workspaceId && t.deletedAt === null,
        );
        if (!task) return null;
        task.deletedAt = new Date().toISOString();
        task.version += 1;
        return task;
      },
      restoreTask: async (id, workspaceId) => {
        const task = mockTasks.find(
          t => t.id === id && t.workspaceId === workspaceId && t.deletedAt !== null,
        );
        if (!task) return null;
        task.deletedAt = null;
        task.version += 1;
        return task;
      },
      findSubtasks: async (parentTaskId, workspaceId) => {
        return mockTasks.filter(
          t =>
            t.parentTaskId === parentTaskId &&
            t.workspaceId === workspaceId &&
            t.deletedAt === null,
        );
      },
      getTaskAncestors: async (taskId, workspaceId) => {
        const ancestors = [];
        let curr = mockTasks.find(t => t.id === taskId && t.workspaceId === workspaceId);
        while (curr && curr.parentTaskId) {
          ancestors.push(curr.parentTaskId);
          curr = mockTasks.find(t => t.id === curr.parentTaskId && t.workspaceId === workspaceId);
        }
        return ancestors;
      },
    };

    const mockLabelsRepo = {
      createLabel: async data => {
        const record = {
          id: `lbl_${mockLabels.length + 1}`,
          workspaceId: data.workspaceId,
          name: data.name,
          color: data.color || '#4F46E5',
          description: data.description || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        mockLabels.push(record);
        return record;
      },
      findLabelById: async (id, workspaceId) => {
        return (
          mockLabels.find(
            l => l.id === id && l.workspaceId === workspaceId && l.deletedAt === null,
          ) || null
        );
      },
      findLabelByName: async (name, workspaceId) => {
        return (
          mockLabels.find(
            l =>
              l.name.toLowerCase() === name.toLowerCase() &&
              l.workspaceId === workspaceId &&
              l.deletedAt === null,
          ) || null
        );
      },
      listLabels: async workspaceId => {
        return mockLabels.filter(l => l.workspaceId === workspaceId && l.deletedAt === null);
      },
      deleteLabel: async (id, workspaceId) => {
        const l = mockLabels.find(lbl => lbl.id === id && lbl.workspaceId === workspaceId);
        if (l) l.deletedAt = new Date().toISOString();
        return l;
      },
      attachLabelToTask: async (taskId, labelId) => {
        if (!mockTaskLabels.some(tl => tl.taskId === taskId && tl.labelId === labelId)) {
          mockTaskLabels.push({ taskId, labelId });
        }
        return true;
      },
      detachLabelFromTask: async (taskId, labelId) => {
        const idx = mockTaskLabels.findIndex(tl => tl.taskId === taskId && tl.labelId === labelId);
        if (idx !== -1) {
          mockTaskLabels.splice(idx, 1);
          return true;
        }
        return false;
      },
      getLabelsForTask: async taskId => {
        const labelIds = mockTaskLabels.filter(tl => tl.taskId === taskId).map(tl => tl.labelId);
        return mockLabels.filter(l => labelIds.includes(l.id) && l.deletedAt === null);
      },
    };

    const mockDepsRepo = {
      createDependency: async data => {
        const record = {
          id: `dep_${mockDependencies.length + 1}`,
          taskId: data.taskId,
          dependsOnTaskId: data.dependsOnTaskId,
          dependencyType: data.dependencyType || 'BLOCKS',
          createdBy: data.createdBy,
          createdAt: new Date().toISOString(),
        };
        mockDependencies.push(record);
        return record;
      },
      removeDependency: async (id, taskId) => {
        const idx = mockDependencies.findIndex(d => d.id === id && d.taskId === taskId);
        if (idx !== -1) {
          mockDependencies.splice(idx, 1);
          return true;
        }
        return false;
      },
      getDependenciesForTask: async taskId => {
        return mockDependencies.filter(d => d.taskId === taskId || d.dependsOnTaskId === taskId);
      },
      getAllDependenciesInWorkspace: async () => {
        return mockDependencies.map(d => ({
          id: d.id,
          taskId: d.taskId,
          dependsOnTaskId: d.dependsOnTaskId,
          dependencyType: d.dependencyType,
        }));
      },
    };

    const mockLinksRepo = {
      createLink: async data => {
        const record = {
          id: `lnk_${mockLinks.length + 1}`,
          taskId: data.taskId,
          url: data.url,
          title: data.title || null,
          linkType: data.linkType || 'EXTERNAL',
          createdAt: new Date().toISOString(),
        };
        mockLinks.push(record);
        return record;
      },
      removeLink: async (id, taskId) => {
        const idx = mockLinks.findIndex(l => l.id === id && l.taskId === taskId);
        if (idx !== -1) {
          mockLinks.splice(idx, 1);
          return true;
        }
        return false;
      },
      getLinksForTask: async taskId => mockLinks.filter(l => l.taskId === taskId),
    };

    const mockBlocksRepo = {
      createWorkBlock: async data => {
        const record = {
          id: `blk_${mockWorkBlocks.length + 1}`,
          taskId: data.taskId,
          calendarId: data.calendarId || null,
          startAt: data.startAt,
          endAt: data.endAt,
          timezone: data.timezone || 'UTC',
          status: 'SCHEDULED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockWorkBlocks.push(record);
        return record;
      },
      removeWorkBlock: async (id, taskId) => {
        const idx = mockWorkBlocks.findIndex(b => b.id === id && b.taskId === taskId);
        if (idx !== -1) {
          mockWorkBlocks.splice(idx, 1);
          return true;
        }
        return false;
      },
      getWorkBlocksForTask: async taskId => mockWorkBlocks.filter(b => b.taskId === taskId),
    };

    service = new TasksService(
      mockRepo,
      mockLabelsRepo,
      mockDepsRepo,
      mockLinksRepo,
      mockBlocksRepo,
    );
  });

  describe('Core Task Rules & Lifecycle (TM-TASK-001 to TM-TASK-006)', () => {
    it('creates an independent task without project or board (Inbox state)', async () => {
      const task = await service.createTask(WORKSPACE_A, USER_1, {
        title: 'Draft architecture overview',
        priority: 'P1',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Draft architecture overview');
      expect(task.status).toBe('TODO');
      expect(task.priority).toBe('P1');
      expect(task.projectId).toBeNull();
      expect(task.boardId).toBeNull();
      expect(task.version).toBe(1);
    });

    it('rejects an empty task title', async () => {
      await expect(service.createTask(WORKSPACE_A, USER_1, { title: '   ' })).rejects.toThrow(
        'Task title is required',
      );
    });

    it('normalizes legacy priority names to P0-P4 model', () => {
      expect(normalizePriority('CRITICAL')).toBe('P0');
      expect(normalizePriority('URGENT')).toBe('P1');
      expect(normalizePriority('HIGH')).toBe('P2');
      expect(normalizePriority('MEDIUM')).toBe('P3');
      expect(normalizePriority('LOW')).toBe('P4');
      expect(normalizePriority('P0')).toBe('P0');
      expect(normalizePriority('P4')).toBe('P4');
    });

    it('explicitly completes a task and preserves historical due date (TM-TASK-003, BR-TASK-008)', async () => {
      const dueAt = '2026-09-15T10:00:00.000Z';
      const created = await service.createTask(WORKSPACE_A, USER_1, {
        title: 'Submit report',
        dueAt,
      });

      const completed = await service.completeTask(created.id, WORKSPACE_A, USER_1);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).toBeDefined();
      expect(completed.dueAt).toBe(dueAt); // Due date NOT wiped or modified
      expect(completed.isOverdue).toBe(false);
      expect(completed.version).toBe(2);
    });

    it('reopens a completed task without modifying due date (BR-TASK-009)', async () => {
      const dueAt = '2026-09-15T10:00:00.000Z';
      const created = await service.createTask(WORKSPACE_A, USER_1, {
        title: 'Review PR',
        dueAt,
      });
      await service.completeTask(created.id, WORKSPACE_A, USER_1);

      const reopened = await service.reopenTask(created.id, WORKSPACE_A, USER_1);
      expect(reopened.status).toBe('TODO');
      expect(reopened.completedAt).toBeNull();
      expect(reopened.dueAt).toBe(dueAt);
      expect(reopened.version).toBe(3);
    });

    it('normalizes legacy status DONE to COMPLETED and guarantees not overdue', async () => {
      const pastDue = '2020-01-01T00:00:00.000Z';
      const task = await service.createTask(WORKSPACE_A, USER_1, {
        title: 'Legacy completed task',
        status: 'DONE',
        dueAt: pastDue,
      });

      expect(task.status).toBe('COMPLETED');
      expect(task.isOverdue).toBe(false);

      const updated = await service.updateTask(task.id, WORKSPACE_A, {
        status: 'DONE',
      });
      expect(updated.status).toBe('COMPLETED');
      expect(updated.isOverdue).toBe(false);
    });
  });

  describe('Hierarchy & Subtasks (TM-TASK-008, TM-TASK-009, BR-TASK-004 to BR-TASK-006)', () => {
    it('creates subtasks linked to parent task', async () => {
      const parent = await service.createTask(WORKSPACE_A, USER_1, {
        title: 'Parent Task',
      });

      const subtask = await service.createSubtask(parent.id, WORKSPACE_A, USER_1, {
        title: 'Subtask A',
        priority: 'P2',
      });

      expect(subtask.parentTaskId).toBe(parent.id);

      const fullParent = await service.getTaskById(parent.id, WORKSPACE_A);
      expect(fullParent.subtasks).toHaveLength(1);
      expect(fullParent.subtasks[0].id).toBe(subtask.id);
    });

    it('completing subtasks does not auto-complete parent task (BR-TASK-005)', async () => {
      const parent = await service.createTask(WORKSPACE_A, USER_1, { title: 'Parent' });
      const child = await service.createSubtask(parent.id, WORKSPACE_A, USER_1, { title: 'Child' });

      await service.completeTask(child.id, WORKSPACE_A, USER_1);

      const parentCheck = await service.getTaskById(parent.id, WORKSPACE_A);
      expect(parentCheck.status).toBe('TODO'); // Parent remains independently incomplete
    });

    it('prohibits direct self-parenting cycle (BR-TASK-004)', async () => {
      const task = await service.createTask(WORKSPACE_A, USER_1, { title: 'Self Parent' });

      await expect(
        service.updateTask(task.id, WORKSPACE_A, { parentTaskId: task.id }),
      ).rejects.toThrow('A task cannot be its own parent');
    });

    it('prohibits multi-node circular task hierarchy (BR-TASK-004)', async () => {
      // Task A -> Task B -> Task C
      const taskA = await service.createTask(WORKSPACE_A, USER_1, { title: 'A' });
      const taskB = await service.createSubtask(taskA.id, WORKSPACE_A, USER_1, { title: 'B' });
      const taskC = await service.createSubtask(taskB.id, WORKSPACE_A, USER_1, { title: 'C' });

      // Attempting to make Task C the parent of Task A (A -> B -> C -> A) must be rejected
      await expect(
        service.updateTask(taskA.id, WORKSPACE_A, { parentTaskId: taskC.id }),
      ).rejects.toThrow('Circular task hierarchy detected');
    });

    it('soft-deleting parent does not destroy descendant subtasks (BR-TASK-006)', async () => {
      const parent = await service.createTask(WORKSPACE_A, USER_1, { title: 'Parent' });
      const child = await service.createSubtask(parent.id, WORKSPACE_A, USER_1, { title: 'Child' });

      await service.deleteTask(parent.id, WORKSPACE_A);

      // Child task must remain active and accessible
      const childCheck = await service.getTaskById(child.id, WORKSPACE_A);
      expect(childCheck.id).toBe(child.id);
      expect(childCheck.deletedAt).toBeNull();
    });
  });

  describe('Overdue Calculation (TM-TASK-012, TM-TASK-013, BR-TASK-007)', () => {
    it('marks an incomplete task with past due date as overdue', () => {
      const pastTask = {
        status: 'TODO',
        dueAt: '2020-01-01T00:00:00.000Z',
      };
      expect(isTaskOverdue(pastTask)).toBe(true);
    });

    it('does not mark completed task as overdue even if due date is in the past', () => {
      const completedTask = {
        status: 'COMPLETED',
        dueAt: '2020-01-01T00:00:00.000Z',
      };
      expect(isTaskOverdue(completedTask)).toBe(false);
    });

    it('does not mark a task without a due date as overdue', () => {
      const noDueDateTask = {
        status: 'TODO',
        dueAt: null,
      };
      expect(isTaskOverdue(noDueDateTask)).toBe(false);
    });

    it('does not mark future due tasks as overdue (TM-TASK-013)', () => {
      const futureTask = {
        status: 'TODO',
        dueAt: '2099-12-31T23:59:59.000Z',
      };
      expect(isTaskOverdue(futureTask)).toBe(false);
    });
  });

  describe('Dependencies & Cycle Prevention (TM-TASK-010, BR-DEP-001 to BR-DEP-004)', () => {
    it('creates dependency relationships between tasks', async () => {
      const taskA = await service.createTask(WORKSPACE_A, USER_1, { title: 'Task A' });
      const taskB = await service.createTask(WORKSPACE_A, USER_1, { title: 'Task B' });

      const dep = await service.addDependency(taskA.id, WORKSPACE_A, USER_1, {
        dependsOnTaskId: taskB.id,
        dependencyType: DEPENDENCY_TYPE.BLOCKS,
      });

      expect(dep.id).toBeDefined();
      expect(dep.taskId).toBe(taskA.id);
      expect(dep.dependsOnTaskId).toBe(taskB.id);
    });

    it('rejects self dependency', async () => {
      const taskA = await service.createTask(WORKSPACE_A, USER_1, { title: 'Task A' });

      await expect(
        service.addDependency(taskA.id, WORKSPACE_A, USER_1, {
          dependsOnTaskId: taskA.id,
          dependencyType: DEPENDENCY_TYPE.BLOCKS,
        }),
      ).rejects.toThrow('A task cannot depend on itself');
    });

    it('rejects cross-workspace dependency attempts', async () => {
      const taskA = await service.createTask(WORKSPACE_A, USER_1, { title: 'Task A in WS A' });
      const taskB = await service.createTask(WORKSPACE_B, USER_1, { title: 'Task B in WS B' });

      await expect(
        service.addDependency(taskA.id, WORKSPACE_A, USER_1, {
          dependsOnTaskId: taskB.id,
          dependencyType: DEPENDENCY_TYPE.BLOCKS,
        }),
      ).rejects.toThrow('Dependent task not found in this workspace');
    });

    it('detects and rejects circular dependency chains (A blocks B, B blocks C, C blocks A)', async () => {
      const taskA = await service.createTask(WORKSPACE_A, USER_1, { title: 'Task A' });
      const taskB = await service.createTask(WORKSPACE_A, USER_1, { title: 'Task B' });
      const taskC = await service.createTask(WORKSPACE_A, USER_1, { title: 'Task C' });

      // A blocks B
      await service.addDependency(taskA.id, WORKSPACE_A, USER_1, {
        dependsOnTaskId: taskB.id,
        dependencyType: DEPENDENCY_TYPE.BLOCKS,
      });

      // B blocks C
      await service.addDependency(taskB.id, WORKSPACE_A, USER_1, {
        dependsOnTaskId: taskC.id,
        dependencyType: DEPENDENCY_TYPE.BLOCKS,
      });

      // C blocks A -> MUST be rejected as circular dependency
      await expect(
        service.addDependency(taskC.id, WORKSPACE_A, USER_1, {
          dependsOnTaskId: taskA.id,
          dependencyType: DEPENDENCY_TYPE.BLOCKS,
        }),
      ).rejects.toThrow('Circular dependency chain detected');
    });

    it('cycle algorithm correctly identifies potential cycles', () => {
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
      ];
      // Adding C -> A would close the loop
      expect(wouldCreateDependencyCycle(edges, 'C', 'A')).toBe(true);
      // Adding A -> D is safe
      expect(wouldCreateDependencyCycle(edges, 'A', 'D')).toBe(false);
    });
  });

  describe('Optimistic Concurrency Control (Task 5.19)', () => {
    it('rejects update if client supplies stale version', async () => {
      const task = await service.createTask(WORKSPACE_A, USER_1, { title: 'Original' });
      expect(task.version).toBe(1);

      // Client A updates with version 1 -> success, becomes version 2
      await service.updateTask(task.id, WORKSPACE_A, { title: 'Updated by A' }, 1);

      // Client B attempts update with stale version 1 -> conflict
      await expect(
        service.updateTask(task.id, WORKSPACE_A, { title: 'Updated by B' }, 1),
      ).rejects.toThrow('Task has been modified concurrently');
    });
  });

  describe('Soft Delete & Recovery (TM-TASK-014, TM-TASK-015)', () => {
    it('soft deleted task disappears from normal retrieval', async () => {
      const task = await service.createTask(WORKSPACE_A, USER_1, { title: 'To Delete' });
      await service.deleteTask(task.id, WORKSPACE_A);

      await expect(service.getTaskById(task.id, WORKSPACE_A)).rejects.toThrow('Task not found');

      const list = await service.listTasks(WORKSPACE_A);
      expect(list.tasks.some(t => t.id === task.id)).toBe(false);
    });

    it('restores soft deleted task cleanly', async () => {
      const task = await service.createTask(WORKSPACE_A, USER_1, { title: 'To Restore' });
      await service.deleteTask(task.id, WORKSPACE_A);

      const restored = await service.restoreTask(task.id, WORKSPACE_A);
      expect(restored.deletedAt).toBeNull();

      const retrieved = await service.getTaskById(task.id, WORKSPACE_A);
      expect(retrieved.id).toBe(task.id);
    });
  });
});

describe('Task Management HTTP API Integration (Task 5.17, 5.18)', () => {
  let app;
  const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174001';
  const USER_ID = '223e4567-e89b-12d3-a456-426614174001';

  let authenticatedUser = { id: USER_ID };

  beforeEach(() => {
    authenticatedUser = { id: USER_ID };
    app = createApp({ logger: false });

    // Mock memberships hook for authorization
    app.addHook('preHandler', async req => {
      if (authenticatedUser) {
        req.user = authenticatedUser;
      }
    });
  });

  it('enforces authentication on task routes (401 when unauthenticated)', async () => {
    authenticatedUser = null;

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: { 'x-workspace-id': WORKSPACE_ID },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('validates task creation payload structure', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { 'x-workspace-id': WORKSPACE_ID },
      payload: {
        title: '', // Invalid empty title
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
