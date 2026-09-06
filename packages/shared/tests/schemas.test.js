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
    expect(TASK_STATUS.DONE).toBe('DONE');
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
});
