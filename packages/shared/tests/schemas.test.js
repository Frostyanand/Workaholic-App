import { describe, it, expect } from 'vitest';
import {
  TASK_STATUS,
  TASK_PRIORITY,
  ERROR_CODE,
  RECURRENCE_FREQUENCY,
  PLATFORM,
  WORKSPACE_TYPE,
  MEMBERSHIP_STATUS,
  DEVICE_TRUST_STATE,
  SESSION_TYPE,
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  createSubtaskSchema,
  createDependencySchema,
  createTaskLinkSchema,
  createLabelSchema,
  createWorkBlockSchema,
  DEPENDENCY_TYPE,
  idempotencyKeySchema,
  apiErrorSchema,
  apiSuccessSingleSchema,
  apiSuccessCollectionSchema,
  createUserSchema,
  createWorkspaceSchema,
  createMembershipSchema,
  createDeviceSchema,
  createSessionSchema,
} from '../src/index.js';

describe('@workaholic/shared constants', () => {
  it('exposes immutable task statuses', () => {
    expect(TASK_STATUS.TODO).toBe('TODO');
    expect(TASK_STATUS.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(TASK_STATUS.COMPLETED).toBe('COMPLETED');
    expect(TASK_STATUS.DONE).toBe('COMPLETED'); // Resolves to COMPLETED
    expect(() => {
      TASK_STATUS.NEW_STATUS = 'NEW';
    }).toThrow();
  });

  it('exposes immutable error codes matching API spec', () => {
    expect(ERROR_CODE.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ERROR_CODE.AUTHENTICATION_REQUIRED).toBe('AUTHENTICATION_REQUIRED');
    expect(ERROR_CODE.FORBIDDEN).toBe('FORBIDDEN');
    expect(ERROR_CODE.CONFLICT).toBe('CONFLICT');
  });
});

describe('@workaholic/shared validation schemas', () => {
  it('validates a valid task creation payload', () => {
    const payload = {
      title: 'Complete project understanding',
      priority: TASK_PRIORITY.HIGH,
      status: TASK_STATUS.TODO,
    };
    const result = createTaskSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data.title).toBe('Complete project understanding');
    expect(result.data.priority).toBe('HIGH');
  });

  it('rejects an empty task title with validation error', () => {
    const result = createTaskSchema.safeParse({ title: '   ' });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain('Task title cannot be empty');
  });

  it('validates idempotency key boundaries', () => {
    expect(idempotencyKeySchema.safeParse('key_123').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('validates standard error response structure', () => {
    const errorResponse = {
      error: {
        code: ERROR_CODE.VALIDATION_ERROR,
        message: 'Invalid field value',
        requestId: 'req_abc123',
        fields: { title: 'Required' },
      },
    };
    expect(apiErrorSchema.safeParse(errorResponse).success).toBe(true);
  });

  it('validates standard single-resource success envelope', () => {
    const singleResponse = {
      data: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Task',
      },
    };
    expect(apiSuccessSingleSchema.safeParse(singleResponse).success).toBe(true);
    expect(apiSuccessSingleSchema.safeParse({}).success).toBe(false);
  });

  it('validates standard collection success envelope with pagination', () => {
    const collectionResponse = {
      data: [{ id: '1' }, { id: '2' }],
      pagination: {
        limit: 20,
        cursor: 'cursor_abc',
      },
    };
    expect(apiSuccessCollectionSchema.safeParse(collectionResponse).success).toBe(true);
    expect(apiSuccessCollectionSchema.safeParse({ data: 'not-an-array' }).success).toBe(false);
  });
});

describe('@workaholic/shared domain enums', () => {
  it('exposes immutable recurrence frequencies and platforms', () => {
    expect(RECURRENCE_FREQUENCY.DAILY).toBe('DAILY');
    expect(RECURRENCE_FREQUENCY.WEEKLY).toBe('WEEKLY');
    expect(PLATFORM.WEB).toBe('WEB');
    expect(PLATFORM.WINDOWS).toBe('WINDOWS');
    expect(PLATFORM.ANDROID).toBe('ANDROID');
  });

  it('exposes immutable workspace types, membership statuses, device trust states, and session types', () => {
    expect(WORKSPACE_TYPE.PERSONAL).toBe('PERSONAL');
    expect(WORKSPACE_TYPE.TEAM).toBe('TEAM');
    expect(MEMBERSHIP_STATUS.ACTIVE).toBe('ACTIVE');
    expect(DEVICE_TRUST_STATE.TRUSTED).toBe('TRUSTED');
    expect(SESSION_TYPE.WEB).toBe('WEB');
  });
});

describe('@workaholic/shared core entity schemas', () => {
  it('validates a valid user creation payload', () => {
    const valid = createUserSchema.safeParse({
      displayName: 'Alice Engineer',
      email: 'alice@example.com',
      preferences: { theme: 'dark' },
    });
    expect(valid.success).toBe(true);
    expect(valid.data.timezone).toBe('UTC');
    expect(valid.data.locale).toBe('en');

    const invalidEmail = createUserSchema.safeParse({
      displayName: 'Alice',
      email: 'not-an-email',
    });
    expect(invalidEmail.success).toBe(false);
  });

  it('validates a valid workspace creation payload', () => {
    const valid = createWorkspaceSchema.safeParse({
      name: 'Engineering Workspace',
      ownerUserId: '123e4567-e89b-12d3-a456-426614174000',
      workspaceType: 'TEAM',
    });
    expect(valid.success).toBe(true);

    const invalidOwner = createWorkspaceSchema.safeParse({
      name: 'Engineering',
      ownerUserId: 'not-a-uuid',
    });
    expect(invalidOwner.success).toBe(false);
  });

  it('validates membership, device, and session payloads', () => {
    const validMembership = createMembershipSchema.safeParse({
      workspaceId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '223e4567-e89b-12d3-a456-426614174000',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(validMembership.success).toBe(true);

    const validDevice = createDeviceSchema.safeParse({
      userId: '123e4567-e89b-12d3-a456-426614174000',
      platform: 'WINDOWS',
      deviceName: 'Workstation 1',
      trustState: 'TRUSTED',
    });
    expect(validDevice.success).toBe(true);

    const validSession = createSessionSchema.safeParse({
      userId: '123e4567-e89b-12d3-a456-426614174000',
      sessionTokenHash: 'hash_abc_123',
      sessionType: 'DESKTOP',
      expiresAt: '2026-12-31T23:59:59.000Z',
    });
    expect(validSession.success).toBe(true);
  });

  it('validates Phase 5 Task Management schemas and constants', () => {
    // 1. Task priorities P0-P4
    expect(TASK_PRIORITY.P0).toBe('P0');
    expect(TASK_PRIORITY.P1).toBe('P1');
    expect(TASK_PRIORITY.P2).toBe('P2');
    expect(TASK_PRIORITY.P3).toBe('P3');
    expect(TASK_PRIORITY.P4).toBe('P4');

    // 2. Task statuses
    expect(TASK_STATUS.TODO).toBe('TODO');
    expect(TASK_STATUS.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(TASK_STATUS.BLOCKED).toBe('BLOCKED');
    expect(TASK_STATUS.COMPLETED).toBe('COMPLETED');
    expect(TASK_STATUS.CANCELLED).toBe('CANCELLED');

    // 3. Create task with full properties
    const taskPayload = {
      title: 'Implement Task Domain',
      description: 'Full Phase 5 implementation',
      priority: TASK_PRIORITY.P0,
      status: TASK_STATUS.IN_PROGRESS,
      startAt: '2026-09-07T00:00:00.000Z',
      dueAt: '2026-09-07T12:00:00.000Z',
      estimatedDuration: 120,
    };
    const parsedTask = createTaskSchema.safeParse(taskPayload);
    expect(parsedTask.success).toBe(true);
    expect(parsedTask.data.priority).toBe('P0');
    expect(parsedTask.data.estimatedDuration).toBe(120);

    // 4. Update task schema with optimistic concurrency version
    const updatePayload = {
      title: 'Updated Task Title',
      version: 2,
    };
    const parsedUpdate = updateTaskSchema.safeParse(updatePayload);
    expect(parsedUpdate.success).toBe(true);
    expect(parsedUpdate.data.version).toBe(2);

    // 5. Task query schema with overdue and sort
    const queryPayload = {
      status: 'TODO',
      priority: 'P1',
      overdue: 'true',
      sort: 'due_at',
      order: 'asc',
      limit: '25',
    };
    const parsedQuery = taskQuerySchema.safeParse(queryPayload);
    expect(parsedQuery.success).toBe(true);
    expect(parsedQuery.data.overdue).toBe(true);
    expect(parsedQuery.data.limit).toBe(25);
    expect(parsedQuery.data.sort).toBe('due_at');

    // 6. Subtask schema
    const subtaskPayload = {
      title: 'Subtask 1: Migration',
      priority: TASK_PRIORITY.P1,
      estimatedDuration: 30,
    };
    const parsedSubtask = createSubtaskSchema.safeParse(subtaskPayload);
    expect(parsedSubtask.success).toBe(true);

    // 7. Dependency schema
    const depPayload = {
      dependsOnTaskId: '123e4567-e89b-12d3-a456-426614174000',
      dependencyType: DEPENDENCY_TYPE.BLOCKS,
    };
    const parsedDep = createDependencySchema.safeParse(depPayload);
    expect(parsedDep.success).toBe(true);

    // 8. Task link schema (safe URLs accepted, dangerous URLs rejected)
    expect(createTaskLinkSchema.safeParse({ url: 'https://example.com' }).success).toBe(true);
    expect(createTaskLinkSchema.safeParse({ url: 'http://example.com/api' }).success).toBe(true);
    expect(createTaskLinkSchema.safeParse({ url: '/internal/tasks/123' }).success).toBe(true);
    expect(createTaskLinkSchema.safeParse({ url: 'mailto:test@example.com' }).success).toBe(true);

    const jsUrl = createTaskLinkSchema.safeParse({ url: 'javascript:alert(1)' });
    expect(jsUrl.success).toBe(false);
    expect(jsUrl.error.issues[0].message).toContain('safe protocol');

    const dataUrl = createTaskLinkSchema.safeParse({
      url: 'data:text/html,<script>alert(1)</script>',
    });
    expect(dataUrl.success).toBe(false);

    // 9. Label schema
    const labelPayload = {
      name: 'Urgent Bug',
      color: '#EF4444',
      description: 'Critical issues',
    };
    const parsedLabel = createLabelSchema.safeParse(labelPayload);
    expect(parsedLabel.success).toBe(true);
    expect(createLabelSchema.safeParse({ name: 'Invalid Color', color: 'blue' }).success).toBe(
      false,
    );

    // 10. Work block schema with chronological validation
    const validBlock = createWorkBlockSchema.safeParse({
      startAt: '2026-09-07T10:00:00.000Z',
      endAt: '2026-09-07T11:00:00.000Z',
      timezone: 'UTC',
    });
    expect(validBlock.success).toBe(true);

    const invalidBlock = createWorkBlockSchema.safeParse({
      startAt: '2026-09-07T11:00:00.000Z',
      endAt: '2026-09-07T10:00:00.000Z',
      timezone: 'UTC',
    });
    expect(invalidBlock.success).toBe(false);
  });

  it('validates Phase 6 Project, Board, and Column schemas', async () => {
    const {
      PROJECT_STATUS,
      PROJECT_ROLE,
      createProjectSchema,
      updateProjectSchema,
      projectQuerySchema,
      addProjectMemberSchema,
      createBoardSchema,
      createBoardColumnSchema,
      reorderBoardColumnsSchema,
      moveBoardTaskSchema,
    } = await import('../src/index.js');

    // 1. Project creation
    const validProject = createProjectSchema.safeParse({
      name: 'Alpha Project',
      description: 'Main deliverable',
      status: PROJECT_STATUS.ACTIVE,
    });
    expect(validProject.success).toBe(true);
    expect(validProject.data.status).toBe('ACTIVE');

    expect(createProjectSchema.safeParse({ name: '   ' }).success).toBe(false);

    // 2. Project update
    expect(updateProjectSchema.safeParse({ status: PROJECT_STATUS.COMPLETED }).success).toBe(true);

    // 3. Project query
    expect(projectQuerySchema.safeParse({ status: 'ACTIVE', search: 'Alpha' }).success).toBe(true);

    // 4. Project member
    expect(
      addProjectMemberSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: PROJECT_ROLE.ADMIN,
      }).success,
    ).toBe(true);
    expect(addProjectMemberSchema.safeParse({ userId: 'invalid-uuid' }).success).toBe(false);

    // 5. Board creation
    expect(
      createBoardSchema.safeParse({
        name: 'Sprint Kanban',
        projectId: '123e4567-e89b-12d3-a456-426614174000',
      }).success,
    ).toBe(true);
    expect(createBoardSchema.safeParse({ name: '' }).success).toBe(false);

    // 6. Board Column
    expect(
      createBoardColumnSchema.safeParse({
        name: 'In Progress',
        position: 1,
        statusMapping: 'IN_PROGRESS',
      }).success,
    ).toBe(true);
    expect(createBoardColumnSchema.safeParse({ name: '', position: -1 }).success).toBe(false);

    // 7. Reorder Columns
    expect(
      reorderBoardColumnsSchema.safeParse({
        columnIds: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
      }).success,
    ).toBe(true);
    expect(reorderBoardColumnsSchema.safeParse({ columnIds: [] }).success).toBe(false);

    // 8. Move Task
    expect(
      moveBoardTaskSchema.safeParse({
        columnId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'COMPLETED',
      }).success,
    ).toBe(true);
  });
});
