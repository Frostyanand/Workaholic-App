import { describe, it, expect } from 'vitest';
import {
  TASK_STATUS,
  TASK_PRIORITY,
  ERROR_CODE,
  createTaskSchema,
  idempotencyKeySchema,
  apiErrorSchema,
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
});
