import * as tasksRepo from './tasks.repository.js';
import * as labelsRepo from './labels.repository.js';
import * as dependenciesRepo from './dependencies.repository.js';
import * as linksRepo from './links.repository.js';
import * as workBlocksRepo from './work-blocks.repository.js';
import * as projectsRepo from '../projects/projects.repository.js';
import * as boardsRepo from '../boards/boards.repository.js';
import * as columnsRepo from '../boards/columns.repository.js';
import * as recurrenceRepo from '../recurrence/recurrence.repository.js';
import * as taskOccurrencesRepo from './task_occurrences.repository.js';
import { expandOccurrences } from '../recurrence/recurrence.engine.js';
import { remindersService } from '../reminders/reminders.service.js';
import * as workspacesRepo from '../workspaces/workspaces.repository.js';
import * as collabRepo from '../collaboration/collaboration.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { NOTIFICATION_TYPE, ACTIVITY_TYPE, TRUSTED_PERMISSION } from '@workaholic/shared';
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
 * Validates that a task assignee is an authorized workspace participant or trusted contact
 * Conforms to BR-COLLAB-002, REQ-COLLAB-002
 */
export async function validateAssigneeEligibility(assignedTo, workspaceId, client) {
  if (!assignedTo) return true;
  // 1. Check workspace membership
  const membership = await workspacesRepo.findMembership(workspaceId, assignedTo, client);
  if (membership && membership.status === 'ACTIVE') {
    return true;
  }
  // 2. Check trusted relationship with workspace owner
  const workspace = await workspacesRepo.findWorkspaceById(workspaceId, client);
  if (workspace) {
    const hasTrust =
      (await collabRepo.hasTrustedPermission(
        workspace.ownerUserId,
        assignedTo,
        TRUSTED_PERMISSION.VIEW_TASKS,
        client,
      )) ||
      (await collabRepo.hasTrustedPermission(
        workspace.ownerUserId,
        assignedTo,
        TRUSTED_PERMISSION.EDIT_TASKS,
        client,
      ));
    if (hasTrust) return true;
  }
  throw new ValidationError(
    'A task cannot be assigned to an unauthorized user outside the workspace or trusted context',
  );
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
    projects = projectsRepo,
    boards = boardsRepo,
    columns = columnsRepo,
    taskOccurrences = taskOccurrencesRepo,
    recurrence = recurrenceRepo,
  ) {
    this.repo = repo;
    this.labelsRepo = labels;
    this.dependenciesRepo = dependencies;
    this.linksRepo = links;
    this.workBlocksRepo = workBlocks;
    this.projectsRepo = projects;
    this.boardsRepo = boards;
    this.columnsRepo = columns;
    this.taskOccurrencesRepo = taskOccurrences;
    this.recurrenceRepo = recurrence;
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

    // Validate project if provided (BR-PROJECT-001, TM-PROJECT-002)
    if (taskData.projectId && this.projectsRepo?.findProjectById) {
      const project = await this.projectsRepo.findProjectById(
        taskData.projectId,
        workspaceId,
        client,
      );
      if (!project) {
        throw new NotFoundError('Project not found in this workspace');
      }
    }

    // Validate board if provided (BR-BOARD-002)
    if (taskData.boardId && this.boardsRepo?.findBoardById) {
      const board = await this.boardsRepo.findBoardById(taskData.boardId, workspaceId, client);
      if (!board) {
        throw new NotFoundError('Board not found in this workspace');
      }
    }

    // Validate board column if provided (BR-BOARD-001, BR-BOARD-002)
    let derivedStatus = taskData.status;
    if (taskData.boardColumnId && this.columnsRepo?.findColumnById) {
      const column = await this.columnsRepo.findColumnById(taskData.boardColumnId, client);
      if (!column || column.workspaceId !== workspaceId) {
        throw new NotFoundError('Board column not found in this workspace');
      }
      if (taskData.boardId && column.boardId !== taskData.boardId) {
        throw new ValidationError('Board column does not belong to the specified board');
      }
      // If task status not explicitly provided, map to column's status_mapping
      if (!derivedStatus && column.statusMapping) {
        derivedStatus = column.statusMapping;
      }
    }

    const priority = normalizePriority(taskData.priority);
    const status = normalizeStatus(derivedStatus);

    let recurrenceRuleId = taskData.recurrenceRuleId || null;
    if (taskData.recurrence) {
      const rule = await recurrenceRepo.createRecurrenceRule(
        {
          ...taskData.recurrence,
          workspaceId,
          startAt: taskData.dueAt || taskData.startAt || new Date().toISOString(),
          timezone: taskData.recurrence.timezone || 'UTC',
        },
        client,
      );
      recurrenceRuleId = rule.id;
    }

    if (taskData.assignedTo) {
      await validateAssigneeEligibility(taskData.assignedTo, workspaceId, client);
    }

    const task = await this.repo.createTask(
      {
        ...taskData,
        workspaceId,
        createdBy: userId,
        parentTaskId,
        priority,
        recurrenceRuleId,
        ...(status ? { status } : {}),
      },
      client,
    );

    if (task.assignedTo) {
      try {
        await collabRepo.createActivityEntry(
          {
            workspaceId,
            actorUserId: userId,
            targetType: 'TASK',
            targetId: task.id,
            activityType: ACTIVITY_TYPE.TASK_ASSIGNED,
            metadata: { assignedTo: task.assignedTo, taskTitle: task.title },
          },
          client,
        );
        if (task.assignedTo !== userId) {
          await notificationsService.sendNotification(
            {
              recipientUserId: task.assignedTo,
              notificationType: NOTIFICATION_TYPE.TASK_ASSIGNED,
              title: 'Task Assigned to You',
              body: `You were assigned to "${task.title}".`,
              targetReference: { taskId: task.id, workspaceId },
            },
            client,
          );
        }
      } catch {
        // Non-blocking
      }
    }

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

    // Validate project if updated (BR-PROJECT-001, TM-PROJECT-002)
    if (updateData.projectId && this.projectsRepo?.findProjectById) {
      const project = await this.projectsRepo.findProjectById(
        updateData.projectId,
        workspaceId,
        client,
      );
      if (!project) {
        throw new NotFoundError('Project not found in this workspace');
      }
    }

    // Validate board if updated (BR-BOARD-002)
    if (updateData.boardId && this.boardsRepo?.findBoardById) {
      const board = await this.boardsRepo.findBoardById(updateData.boardId, workspaceId, client);
      if (!board) {
        throw new NotFoundError('Board not found in this workspace');
      }
    }

    // Validate board column if updated (BR-BOARD-001, BR-BOARD-002)
    if (updateData.boardColumnId && this.columnsRepo?.findColumnById) {
      const column = await this.columnsRepo.findColumnById(updateData.boardColumnId, client);
      if (!column || column.workspaceId !== workspaceId) {
        throw new NotFoundError('Board column not found in this workspace');
      }
      const boardIdToCheck = updateData.boardId || current.boardId;
      if (boardIdToCheck && column.boardId !== boardIdToCheck) {
        throw new ValidationError('Board column does not belong to the specified board');
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

    if (updateData.recurrence) {
      if (current.recurrenceRuleId) {
        await recurrenceRepo.updateRecurrenceRule(
          current.recurrenceRuleId,
          updateData.recurrence,
          client,
        );
      } else {
        const rule = await recurrenceRepo.createRecurrenceRule(
          {
            ...updateData.recurrence,
            workspaceId,
            startAt: payload.dueAt || current.dueAt || new Date().toISOString(),
            timezone: updateData.recurrence.timezone || 'UTC',
          },
          client,
        );
        payload.recurrenceRuleId = rule.id;
      }
    }

    if ('assignedTo' in updateData && updateData.assignedTo) {
      await validateAssigneeEligibility(updateData.assignedTo, workspaceId, client);
    }

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

    if (
      'assignedTo' in updateData &&
      updateData.assignedTo &&
      updateData.assignedTo !== current.assignedTo
    ) {
      try {
        await collabRepo.createActivityEntry(
          {
            workspaceId,
            actorUserId: updated.createdBy || current.createdBy,
            targetType: 'TASK',
            targetId: taskId,
            activityType: ACTIVITY_TYPE.TASK_ASSIGNED,
            metadata: { assignedTo: updateData.assignedTo, taskTitle: updated.title },
          },
          client,
        );
        await notificationsService.sendNotification(
          {
            recipientUserId: updateData.assignedTo,
            notificationType: NOTIFICATION_TYPE.TASK_ASSIGNED,
            title: 'Task Assigned to You',
            body: `You were assigned to "${updated.title}".`,
            targetReference: { taskId, workspaceId },
          },
          client,
        );
      } catch (err) {
        console.error('Task assignment notification error:', err);
      }
    }

    if (payload.status === 'COMPLETED' || payload.status === 'CANCELLED') {
      try {
        await remindersService.onTaskCompleted(taskId);
      } catch {
        // reminders notification hook error should not block task update
      }
    }
    if (payload.dueAt !== undefined && payload.dueAt !== current.dueAt) {
      try {
        await remindersService.onTaskRescheduled(taskId, payload.dueAt);
      } catch {
        // reminders notification hook error should not block task update
      }
    }

    return {
      ...updated,
      isOverdue: isTaskOverdue(updated),
    };
  }

  /**
   * Move task between board columns (BR-BOARD-003, TM-BOARD-003, TM-BOARD-004)
   * Automatically updates task status if column has status_mapping configured
   */
  async moveTaskToColumn(
    taskId,
    workspaceId,
    columnId,
    statusOverride = undefined,
    client = undefined,
  ) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const column = await this.columnsRepo.findColumnById(columnId, client);
    if (!column || column.workspaceId !== workspaceId) {
      throw new NotFoundError('Board column not found in this workspace');
    }

    let newStatus = task.status;
    if (statusOverride) {
      newStatus = normalizeStatus(statusOverride);
    } else if (column.statusMapping) {
      newStatus = column.statusMapping;
    }

    let completedAt = task.completedAt;
    if (newStatus === 'COMPLETED' && task.status !== 'COMPLETED') {
      completedAt = new Date().toISOString();
    } else if (newStatus !== 'COMPLETED' && task.status === 'COMPLETED') {
      completedAt = null;
    }

    const updated = await this.repo.updateTask(
      taskId,
      workspaceId,
      {
        boardId: column.boardId,
        boardColumnId: column.id,
        status: newStatus,
        completedAt,
      },
      task.version,
      client,
    );

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

    try {
      await remindersService.onTaskCompleted(taskId);
    } catch {
      // reminders notification hook error should not block task completion
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

  /**
   * Complete an individual occurrence of a recurring task.
   * Records completion in task_occurrences (sparse representation).
   * Strict Invariants:
   * - Does NOT mutate master task tasks.due_at (satisfies BR-TASK-008).
   * - Does NOT advance any cursor.
   * - Canonical occurrence identity remains immutable.
   * - Series becomes COMPLETED iff all occurrences in bounded series (COUNT or UNTIL) are accounted for.
   */
  async completeOccurrence(workspaceId, userId, taskId, occurrenceKey, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) {
      throw new NotFoundError('Task not found');
    }
    if (!task.recurrenceRuleId) {
      throw new ValidationError('Task is not part of a recurring series');
    }

    const rule = await this.recurrenceRepo.getRecurrenceRuleById(task.recurrenceRuleId, client);
    if (!rule) {
      throw new NotFoundError('Recurrence rule not found');
    }

    const completedAt = new Date().toISOString();
    const isAllDay = !occurrenceKey.includes('T');
    const originalDueAt = isAllDay ? null : occurrenceKey;
    const originalDueDate = isAllDay ? occurrenceKey : null;

    const existing = await this.taskOccurrencesRepo.findTaskOccurrence(
      taskId,
      occurrenceKey,
      workspaceId,
      client,
    );
    const overrideDueAt = existing ? existing.overrideDueAt : null;
    const overrideDueDate = existing ? existing.overrideDueDate : null;

    // 1. Sparse record in task_occurrences
    await this.taskOccurrencesRepo.upsertTaskOccurrence(
      {
        workspaceId,
        taskId,
        occurrenceKey,
        isAllDay,
        originalDueAt,
        originalDueDate,
        overrideDueAt,
        overrideDueDate,
        status: 'COMPLETED',
        completedAt,
      },
      client,
    );

    // 2. Evaluate boundary completion for master series:
    // Only bounded series (COUNT or UNTIL) can automatically complete. Infinite series never automatically complete.
    let seriesCompleted = false;
    if (rule.occurrenceCount && rule.occurrenceCount > 0) {
      const counts = await this.taskOccurrencesRepo.countAccountedOccurrencesForTask(
        taskId,
        workspaceId,
        client,
      );
      if (counts.accountedCount >= rule.occurrenceCount) {
        await this.repo.updateTask(
          taskId,
          workspaceId,
          { status: 'COMPLETED', completedAt },
          null,
          client,
        );
        seriesCompleted = true;
      }
    } else if (rule.endAt) {
      // UNTIL-bounded series: check if all occurrences up to endAt are accounted for
      const allOccurrences = expandOccurrences(rule, rule.startAt, rule.endAt, {
        maxOccurrences: 2000,
      });
      const overrides = await this.taskOccurrencesRepo.findOccurrencesByTaskId(
        taskId,
        workspaceId,
        client,
      );
      const accountedKeys = new Set(
        overrides
          .filter(o => o.status === 'COMPLETED' || o.status === 'CANCELLED')
          .map(o => o.occurrenceKey),
      );
      const allAccounted =
        allOccurrences.length > 0 && allOccurrences.every(o => accountedKeys.has(o.occurrenceKey));
      if (allAccounted) {
        await this.repo.updateTask(
          taskId,
          workspaceId,
          { status: 'COMPLETED', completedAt },
          null,
          client,
        );
        seriesCompleted = true;
      }
    }

    return {
      success: true,
      message: 'Task occurrence completed',
      taskId,
      occurrenceKey,
      status: 'COMPLETED',
      completedAt,
      isAllDay,
      originalDueAt,
      originalDueDate,
      overrideDueAt,
      overrideDueDate,
      effectiveDueAt: overrideDueAt || originalDueAt,
      effectiveDueDate: overrideDueDate || originalDueDate,
      seriesCompleted,
    };
  }

  /**
   * Reopen an individual occurrence of a recurring task.
   * Strict Invariants:
   * - Does NOT mutate master task tasks.due_at.
   * - Deletes non-rescheduled overrides (reverts to implicit dynamic TODO).
   * - Preserves reschedule override if rescheduled.
   * - If master task series was COMPLETED, reverts master task to TODO.
   */
  async reopenOccurrence(workspaceId, userId, taskId, occurrenceKey, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) {
      throw new NotFoundError('Task not found');
    }
    if (!task.recurrenceRuleId) {
      throw new ValidationError('Task is not part of a recurring series');
    }

    const existing = await this.taskOccurrencesRepo.findTaskOccurrence(
      taskId,
      occurrenceKey,
      workspaceId,
      client,
    );
    if (existing) {
      if (existing.overrideDueAt || existing.overrideDueDate) {
        // Rescheduled: retain override, reset status to TODO and completedAt to null
        await this.taskOccurrencesRepo.upsertTaskOccurrence(
          {
            workspaceId,
            taskId,
            occurrenceKey,
            isAllDay: existing.isAllDay,
            originalDueAt: existing.originalDueAt,
            originalDueDate: existing.originalDueDate,
            overrideDueAt: existing.overrideDueAt,
            overrideDueDate: existing.overrideDueDate,
            status: 'TODO',
            completedAt: null,
          },
          client,
        );
      } else {
        // Not rescheduled: delete row (reverts to implicit dynamic TODO)
        await this.taskOccurrencesRepo.deleteTaskOccurrence(
          taskId,
          occurrenceKey,
          workspaceId,
          client,
        );
      }
    }

    // If master task was COMPLETED, revert to TODO
    if (task.status === 'COMPLETED') {
      await this.repo.updateTask(
        taskId,
        workspaceId,
        { status: 'TODO', completedAt: null },
        null,
        client,
      );
    }

    return {
      success: true,
      message: 'Task occurrence reopened',
      taskId,
      occurrenceKey,
      status: 'TODO',
    };
  }

  /**
   * Cancel / skip an individual occurrence of a recurring task.
   */
  async cancelOccurrence(workspaceId, userId, taskId, occurrenceKey, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) {
      throw new NotFoundError('Task not found');
    }
    if (!task.recurrenceRuleId) {
      throw new ValidationError('Task is not part of a recurring series');
    }

    const rule = await this.recurrenceRepo.getRecurrenceRuleById(task.recurrenceRuleId, client);
    if (!rule) {
      throw new NotFoundError('Recurrence rule not found');
    }

    const isAllDay = !occurrenceKey.includes('T');
    const originalDueAt = isAllDay ? null : occurrenceKey;
    const originalDueDate = isAllDay ? occurrenceKey : null;

    await this.taskOccurrencesRepo.upsertTaskOccurrence(
      {
        workspaceId,
        taskId,
        occurrenceKey,
        isAllDay,
        originalDueAt,
        originalDueDate,
        status: 'CANCELLED',
        completedAt: null,
      },
      client,
    );

    // Check if bounded series is now fully accounted for (COUNT or UNTIL)
    let seriesCompleted = false;
    if (rule.occurrenceCount && rule.occurrenceCount > 0) {
      const counts = await this.taskOccurrencesRepo.countAccountedOccurrencesForTask(
        taskId,
        workspaceId,
        client,
      );
      if (counts.accountedCount >= rule.occurrenceCount) {
        await this.repo.updateTask(
          taskId,
          workspaceId,
          { status: 'COMPLETED', completedAt: new Date().toISOString() },
          null,
          client,
        );
        seriesCompleted = true;
      }
    } else if (rule.endAt) {
      const allOccurrences = expandOccurrences(rule, rule.startAt, rule.endAt, {
        maxOccurrences: 2000,
      });
      const overrides = await this.taskOccurrencesRepo.findOccurrencesByTaskId(
        taskId,
        workspaceId,
        client,
      );
      const accountedKeys = new Set(
        overrides
          .filter(o => o.status === 'COMPLETED' || o.status === 'CANCELLED')
          .map(o => o.occurrenceKey),
      );
      const allAccounted =
        allOccurrences.length > 0 && allOccurrences.every(o => accountedKeys.has(o.occurrenceKey));
      if (allAccounted) {
        await this.repo.updateTask(
          taskId,
          workspaceId,
          { status: 'COMPLETED', completedAt: new Date().toISOString() },
          null,
          client,
        );
        seriesCompleted = true;
      }
    }

    return {
      success: true,
      message: 'Task occurrence cancelled',
      taskId,
      occurrenceKey,
      status: 'CANCELLED',
      seriesCompleted,
    };
  }

  /**
   * Reschedule an individual occurrence of a recurring task.
   * Invariant: canonical occurrenceKey remains the original nominal identity.
   */
  async rescheduleOccurrence(
    workspaceId,
    userId,
    taskId,
    occurrenceKey,
    payload = {},
    client = undefined,
  ) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) {
      throw new NotFoundError('Task not found');
    }
    if (!task.recurrenceRuleId) {
      throw new ValidationError('Task is not part of a recurring series');
    }

    const isAllDay = !occurrenceKey.includes('T');
    const originalDueAt = isAllDay ? null : occurrenceKey;
    const originalDueDate = isAllDay ? occurrenceKey : null;
    const overrideDueAt = isAllDay ? null : payload.overrideDueAt || payload.newDueAt;
    const overrideDueDate = isAllDay ? payload.overrideDueDate || payload.newDueDate : null;

    const existing = await this.taskOccurrencesRepo.findTaskOccurrence(
      taskId,
      occurrenceKey,
      workspaceId,
      client,
    );
    const currentStatus = existing ? existing.status : 'TODO';
    const currentCompletedAt = existing ? existing.completedAt : null;

    await this.taskOccurrencesRepo.upsertTaskOccurrence(
      {
        workspaceId,
        taskId,
        occurrenceKey,
        isAllDay,
        originalDueAt,
        originalDueDate,
        overrideDueAt,
        overrideDueDate,
        status: currentStatus,
        completedAt: currentCompletedAt,
      },
      client,
    );

    return {
      success: true,
      message: 'Task occurrence rescheduled',
      taskId,
      occurrenceKey,
      isAllDay,
      effectiveDueAt: overrideDueAt,
      effectiveDueDate: overrideDueDate,
      status: currentStatus,
    };
  }

  /**
   * Expands and returns effective occurrences for a recurring task in a date range
   */
  async getTaskOccurrences(workspaceId, taskId, startAt, endAt, client = undefined) {
    const task = await this.repo.findTaskById(
      taskId,
      workspaceId,
      { includeDeleted: false },
      client,
    );
    if (!task) {
      throw new NotFoundError('Task not found');
    }
    if (!task.recurrenceRuleId) {
      return [
        {
          taskId: task.id,
          occurrenceKey: task.dueAt || task.createdAt,
          dueAt: task.dueAt,
          isAllDay: false,
          status: task.status,
          completedAt: task.completedAt,
        },
      ];
    }

    const rule = await this.recurrenceRepo.getRecurrenceRuleById(task.recurrenceRuleId, client);
    if (!rule) {
      throw new NotFoundError('Recurrence rule not found');
    }

    const nominalOccurrences = expandOccurrences(rule, startAt, endAt);
    const overrides = await this.taskOccurrencesRepo.findOccurrencesByTaskId(
      taskId,
      workspaceId,
      client,
    );
    const overrideMap = new Map(overrides.map(o => [o.occurrenceKey, o]));

    const items = nominalOccurrences.map(nom => {
      const override = overrideMap.get(nom.occurrenceKey);
      const isAllDay = !nom.occurrenceKey.includes('T');
      return {
        taskId: task.id,
        taskTitle: task.title,
        taskPriority: task.priority,
        occurrenceKey: nom.occurrenceKey,
        isAllDay,
        nominalDueAt: isAllDay ? null : nom.startAt,
        nominalDueDate: isAllDay ? nom.occurrenceKey : null,
        effectiveDueAt: override?.overrideDueAt || (isAllDay ? null : nom.startAt),
        effectiveDueDate: override?.overrideDueDate || (isAllDay ? nom.occurrenceKey : null),
        status: override ? override.status : 'TODO',
        completedAt: override ? override.completedAt : null,
      };
    });

    // Also include any occurrences whose nominal fell outside but was rescheduled into [startAt, endAt]
    for (const ov of overrides) {
      if (ov.overrideDueAt || ov.overrideDueDate) {
        const effDate = (ov.overrideDueAt || ov.overrideDueDate).slice(0, 10);
        const startDate = startAt.slice(0, 10);
        const endDate = endAt.slice(0, 10);
        if (
          effDate >= startDate &&
          effDate <= endDate &&
          !nominalOccurrences.some(n => n.occurrenceKey === ov.occurrenceKey)
        ) {
          items.push({
            taskId: task.id,
            taskTitle: task.title,
            taskPriority: task.priority,
            occurrenceKey: ov.occurrenceKey,
            isAllDay: ov.isAllDay,
            nominalDueAt: ov.originalDueAt,
            nominalDueDate: ov.originalDueDate,
            effectiveDueAt: ov.overrideDueAt || ov.originalDueAt,
            effectiveDueDate: ov.overrideDueDate || ov.originalDueDate,
            status: ov.status,
            completedAt: ov.completedAt,
          });
        }
      }
    }

    return items.sort((a, b) => {
      const aVal = a.effectiveDueAt || a.effectiveDueDate || '';
      const bVal = b.effectiveDueAt || b.effectiveDueDate || '';
      return aVal.localeCompare(bVal);
    });
  }
}

export const tasksService = new TasksService();
