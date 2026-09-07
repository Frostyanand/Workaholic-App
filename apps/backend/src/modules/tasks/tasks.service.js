import * as tasksRepo from './tasks.repository.js';
import * as labelsRepo from './labels.repository.js';
import * as dependenciesRepo from './dependencies.repository.js';
import * as linksRepo from './links.repository.js';
import * as workBlocksRepo from './work-blocks.repository.js';
import { NotFoundError, ValidationError, ConflictError } from '../../core/errors.js';

/**
 * Normalizes priority value to authoritative P0-P4 format
 */
export function normalizePriority(priority) {
  if (!priority) return 'P3';
  const map = {
    CRITICAL: 'P0',
    URGENT: 'P1',
    HIGH: 'P2',
    MEDIUM: 'P3',
    LOW: 'P4',
    P0: 'P0',
    P1: 'P1',
    P2: 'P2',
    P3: 'P3',
    P4: 'P4',
  };
  return map[priority] || 'P3';
}

/**
 * Normalizes status value to authoritative database status format
 * Conforms to DOMAIN-MODEL.md and DATABASE-DESIGN.md
 * Guarantees that legacy/alias 'DONE' resolves to 'COMPLETED'
 */
export function normalizeStatus(status) {
  if (!status) return undefined;
  if (status === 'DONE') return 'COMPLETED';
  return status;
}

/**
 * Deterministically checks if a task is overdue without modifying its due date
 * Conforms to BR-TASK-007, BR-TASK-008
 */
export function isTaskOverdue(task, asOf = new Date()) {
  if (!task || !task.dueAt) return false;
  const status = normalizeStatus(task.status);
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    return false;
  }
  const dueDate = new Date(task.dueAt);
  if (isNaN(dueDate.getTime())) return false;
  return dueDate < asOf;
}

/**
 * Directed cycle detection using BFS reachability
 * Returns true if newSource is reachable from newTarget (which would create a cycle if newSource -> newTarget is added)
 */
export function wouldCreateDependencyCycle(existingEdges, newSource, newTarget) {
  if (newSource === newTarget) return true;

  const adj = new Map();
  for (const edge of existingEdges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source).push(edge.target);
  }

  const visited = new Set();
  const queue = [newTarget];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === newSource) {
      return true;
    }
    if (!visited.has(current)) {
      visited.add(current);
      const neighbors = adj.get(current) || [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          queue.push(next);
        }
      }
    }
  }

  return false;
}

/**
 * Task Service — Domain business rules, cycle prevention, and lifecycle operations.
 * Conforms to DOMAIN-MODEL.md Section 6, BUSINESS-RULES.md Section 4 & 5
 */
export class TasksService {
  constructor(
    repo = tasksRepo,
    labels = labelsRepo,
    dependencies = dependenciesRepo,
    links = linksRepo,
    workBlocks = workBlocksRepo,
  ) {
    this.repo = repo;
    this.labelsRepo = labels;
    this.dependenciesRepo = dependencies;
    this.linksRepo = links;
    this.workBlocksRepo = workBlocks;
  }

  /**
   * Create a task
   */
  async createTask(workspaceId, userId, taskData, client = undefined) {
    if (!workspaceId || !userId) {
      throw new TypeError('workspaceId and userId are required');
    }

    // Validate title
    if (!taskData.title || taskData.title.trim().length === 0) {
      throw new ValidationError('Task title is required');
    }

    // Validate parent task if provided
    let parentTaskId = taskData.parentTaskId || null;
    if (parentTaskId) {
      const parent = await this.repo.findTaskById(
        parentTaskId,
        workspaceId,
        { includeDeleted: false },
        client,
      );
      if (!parent) {
        throw new NotFoundError('Parent task not found in this workspace');
      }
    }

    const priority = normalizePriority(taskData.priority);
    const status = normalizeStatus(taskData.status);

    const task = await this.repo.createTask(
      {
        ...taskData,
        workspaceId,
        createdBy: userId,
        parentTaskId,
        priority,
        ...(status ? { status } : {}),
      },
      client,
    );

    return {
      ...task,
      isOverdue: isTaskOverdue(task),
      labels: [],
      subtasks: [],
    };
  }

  /**
   * Retrieve task by ID with authorization and full composite relationships
   */
  async getTaskById(taskId, workspaceId, options = { includeDeleted: false }, client = undefined) {
    const task = await this.repo.findTaskById(taskId, workspaceId, options, client);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Fetch related metadata
    const [labels, subtasks, dependencies, links, workBlocks] = await Promise.all([
      this.labelsRepo.getLabelsForTask(taskId, client),
      this.repo.findSubtasks(taskId, workspaceId, client),
      this.dependenciesRepo.getDependenciesForTask(taskId, client),
      this.linksRepo.getLinksForTask(taskId, client),
      this.workBlocksRepo.getWorkBlocksForTask(taskId, client),
    ]);

    return {
      ...task,
      isOverdue: isTaskOverdue(task),
      labels,
      subtasks: subtasks.map(s => ({ ...s, isOverdue: isTaskOverdue(s) })),
      dependencies,
      links,
      workBlocks,
    };
  }

  /**
   * List tasks with filters and pagination
   */
  async listTasks(workspaceId, filters = {}, pagination = {}, client = undefined) {
    const result = await this.repo.listTasks(workspaceId, filters, pagination, client);
    return {
      ...result,
      tasks: result.tasks.map(task => ({
        ...task,
        isOverdue: isTaskOverdue(task),
      })),
    };
  }

  /**
   * Update task fields with optimistic concurrency and cycle prevention
   */
  async updateTask(taskId, workspaceId, updateData, expectedVersion = null, client = undefined) {
    const current = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!current) {
      throw new NotFoundError('Task not found');
    }

    // Optimistic concurrency check
    const versionToCheck =
      expectedVersion !== null && expectedVersion !== undefined
        ? expectedVersion
        : updateData.version;

    if (
      versionToCheck !== null &&
      versionToCheck !== undefined &&
      current.version !== versionToCheck
    ) {
      throw new ConflictError('Task has been modified concurrently. Please reload.');
    }

    // Validate hierarchy changes if parentTaskId changed
    if ('parentTaskId' in updateData && updateData.parentTaskId !== current.parentTaskId) {
      const newParentId = updateData.parentTaskId;
      if (newParentId !== null) {
        if (newParentId === taskId) {
          throw new ValidationError('A task cannot be its own parent');
        }

        const parent = await this.repo.findTaskById(
          newParentId,
          workspaceId,
          { includeDeleted: false },
          client,
        );
        if (!parent) {
          throw new NotFoundError('Parent task not found in this workspace');
        }

        // Cycle check: Ensure target parent is not a descendant of this task
        const ancestors = await this.repo.getTaskAncestors(newParentId, workspaceId, client);
        if (ancestors.includes(taskId)) {
          throw new ValidationError(
            'Circular task hierarchy detected: a task cannot become a child of its descendant',
          );
        }
      }
    }

    const payload = { ...updateData };
    if (payload.priority) {
      payload.priority = normalizePriority(payload.priority);
    }
    if (payload.status) {
      payload.status = normalizeStatus(payload.status);
    }
    delete payload.version;

    const updated = await this.repo.updateTask(
      taskId,
      workspaceId,
      payload,
      versionToCheck,
      client,
    );
    if (!updated) {
      throw new ConflictError('Task was modified concurrently. Please reload.');
    }

    return {
      ...updated,
      isOverdue: isTaskOverdue(updated),
    };
  }

  /**
   * Explicitly complete a task.
   * Conforms to BR-TASK-005, BR-TASK-008:
   * Parent completion is independent; due date is preserved.
   */
  async completeTask(taskId, workspaceId, userId, expectedVersion = null, client = undefined) {
    const current = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!current) {
      throw new NotFoundError('Task not found');
    }

    const versionToCheck =
      expectedVersion !== null && expectedVersion !== undefined ? expectedVersion : current.version;

    const updated = await this.repo.updateTask(
      taskId,
      workspaceId,
      {
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      },
      versionToCheck,
      client,
    );

    if (!updated) {
      throw new ConflictError('Task was modified concurrently. Please reload.');
    }

    return {
      ...updated,
      isOverdue: false,
    };
  }

  /**
   * Reopen a completed task.
   * Conforms to BR-TASK-009:
   * Restores incomplete state without changing unrelated properties.
   */
  async reopenTask(taskId, workspaceId, userId, expectedVersion = null, client = undefined) {
    const current = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!current) {
      throw new NotFoundError('Task not found');
    }

    const versionToCheck =
      expectedVersion !== null && expectedVersion !== undefined ? expectedVersion : current.version;

    const updated = await this.repo.updateTask(
      taskId,
      workspaceId,
      {
        status: 'TODO',
        completedAt: null,
      },
      versionToCheck,
      client,
    );

    if (!updated) {
      throw new ConflictError('Task was modified concurrently. Please reload.');
    }

    return {
      ...updated,
      isOverdue: isTaskOverdue(updated),
    };
  }

  /**
   * Soft delete a task.
   * Conforms to BR-TASK-006:
   * Does not destroy descendants.
   */
  async deleteTask(taskId, workspaceId, client = undefined) {
    const current = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!current) {
      throw new NotFoundError('Task not found');
    }

    const deleted = await this.repo.softDeleteTask(taskId, workspaceId, client);
    return {
      ...deleted,
      isOverdue: false,
    };
  }

  /**
   * Restore a soft-deleted task.
   */
  async restoreTask(taskId, workspaceId, client = undefined) {
    const current = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: true },
      client,
    );
    if (!current || !current.deletedAt) {
      throw new NotFoundError('Deleted task not found');
    }

    const restored = await this.repo.restoreTask(taskId, workspaceId, client);
    return {
      ...restored,
      isOverdue: isTaskOverdue(restored),
    };
  }

  /**
   * Create a subtask
   */
  async createSubtask(parentTaskId, workspaceId, userId, subtaskData, client = undefined) {
    const parent = await this.repo.findTaskById(
      parentTaskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!parent) {
      throw new NotFoundError('Parent task not found');
    }

    return this.createTask(
      workspaceId,
      userId,
      {
        ...subtaskData,
        parentTaskId,
      },
      client,
    );
  }

  /**
   * Add a logical dependency between tasks with cycle detection.
   * Conforms to BR-DEP-001, BR-DEP-002, BR-DEP-003, BR-DEP-004.
   */
  async addDependency(taskId, workspaceId, userId, dependencyData, client = undefined) {
    const { dependsOnTaskId, dependencyType = 'BLOCKS' } = dependencyData;

    if (taskId === dependsOnTaskId) {
      throw new ValidationError('A task cannot depend on itself');
    }

    // Verify both tasks exist in the same workspace
    const [sourceTask, targetTask] = await Promise.all([
      this.repo.findTaskById(taskId, workspaceId, { includeDeleted: false }, client),
      this.repo.findTaskById(dependsOnTaskId, workspaceId, { includeDeleted: false }, client),
    ]);

    if (!sourceTask) {
      throw new NotFoundError('Source task not found in this workspace');
    }
    if (!targetTask) {
      throw new NotFoundError('Dependent task not found in this workspace');
    }

    // Check for circular dependency chain
    if (['BLOCKS', 'DEPENDS_ON', 'BLOCKED_BY'].includes(dependencyType)) {
      // Normalize directed edge (Prerequisite -> Dependent)
      // BLOCKS: sourceTask BLOCKS targetTask => sourceTask -> targetTask
      // DEPENDS_ON: sourceTask DEPENDS_ON targetTask => targetTask -> sourceTask
      // BLOCKED_BY: sourceTask BLOCKED_BY targetTask => targetTask -> sourceTask
      let newSource = taskId;
      let newTarget = dependsOnTaskId;
      if (dependencyType === 'DEPENDS_ON' || dependencyType === 'BLOCKED_BY') {
        newSource = dependsOnTaskId;
        newTarget = taskId;
      }

      const existingDeps = await this.dependenciesRepo.getAllDependenciesInWorkspace(
        workspaceId,
        client,
      );
      const directedEdges = [];

      for (const dep of existingDeps) {
        if (dep.dependencyType === 'BLOCKS') {
          directedEdges.push({ source: dep.taskId, target: dep.dependsOnTaskId });
        } else if (dep.dependencyType === 'DEPENDS_ON' || dep.dependencyType === 'BLOCKED_BY') {
          directedEdges.push({ source: dep.dependsOnTaskId, target: dep.taskId });
        }
      }

      const hasCycle = wouldCreateDependencyCycle(directedEdges, newSource, newTarget);
      if (hasCycle) {
        throw new ValidationError(
          'Circular dependency chain detected: this dependency would create a prohibited cycle',
        );
      }
    }

    try {
      return await this.dependenciesRepo.createDependency(
        {
          taskId,
          dependsOnTaskId,
          dependencyType,
          createdBy: userId,
        },
        client,
      );
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictError('This dependency relationship already exists');
      }
      throw err;
    }
  }

  /**
   * Remove a dependency
   */
  async removeDependency(taskId, workspaceId, dependencyId, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const removed = await this.dependenciesRepo.removeDependency(dependencyId, taskId, client);
    if (!removed) {
      throw new NotFoundError('Dependency not found');
    }
    return { success: true };
  }

  /**
   * Add a label to a task
   */
  async addLabelToTask(taskId, workspaceId, labelId, client = undefined) {
    const [task, label] = await Promise.all([
      this.repo.findTaskById(taskId, workspaceId, { includeDeleted: false }, client),
      this.labelsRepo.findLabelById(labelId, workspaceId, client),
    ]);

    if (!task) throw new NotFoundError('Task not found');
    if (!label) throw new NotFoundError('Label not found in this workspace');

    await this.labelsRepo.attachLabelToTask(taskId, labelId, client);
    return { success: true, label };
  }

  /**
   * Remove a label from a task
   */
  async removeLabelFromTask(taskId, workspaceId, labelId, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) throw new NotFoundError('Task not found');

    const removed = await this.labelsRepo.detachLabelFromTask(taskId, labelId, client);
    return { success: removed };
  }

  /**
   * Add a link to a task
   */
  async addLinkToTask(taskId, workspaceId, linkData, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) throw new NotFoundError('Task not found');

    return this.linksRepo.createLink({ ...linkData, taskId }, client);
  }

  /**
   * Remove a link from a task
   */
  async removeLinkFromTask(taskId, workspaceId, linkId, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) throw new NotFoundError('Task not found');

    const removed = await this.linksRepo.removeLink(linkId, taskId, client);
    if (!removed) throw new NotFoundError('Link not found');
    return { success: true };
  }

  /**
   * Create a scheduled work block
   */
  async createWorkBlock(taskId, workspaceId, blockData, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) throw new NotFoundError('Task not found');

    if (new Date(blockData.endAt) <= new Date(blockData.startAt)) {
      throw new ValidationError('Work block endAt must be after startAt');
    }

    return this.workBlocksRepo.createWorkBlock({ ...blockData, taskId }, client);
  }

  /**
   * Remove a scheduled work block
   */
  async removeWorkBlock(taskId, workspaceId, blockId, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) throw new NotFoundError('Task not found');

    const removed = await this.workBlocksRepo.removeWorkBlock(blockId, taskId, client);
    if (!removed) throw new NotFoundError('Work block not found');
    return { success: true };
  }

  /**
   * Label management in workspace
   */
  async createLabel(workspaceId, labelData, client = undefined) {
    const existing = await this.labelsRepo.findLabelByName(labelData.name, workspaceId, client);
    if (existing) {
      throw new ConflictError('A label with this name already exists in this workspace');
    }
    return this.labelsRepo.createLabel({ ...labelData, workspaceId }, client);
  }

  async listLabels(workspaceId, client = undefined) {
    return this.labelsRepo.listLabels(workspaceId, client);
  }

  async deleteLabel(labelId, workspaceId, client = undefined) {
    const label = await this.labelsRepo.findLabelById(labelId, workspaceId, client);
    if (!label) throw new NotFoundError('Label not found');
    return this.labelsRepo.deleteLabel(labelId, workspaceId, client);
  }
}

export const tasksService = new TasksService();
