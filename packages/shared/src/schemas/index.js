import { z } from 'zod';
import { TASK_STATUS, TASK_PRIORITY, ERROR_CODE } from '../constants/index.js';

export const idSchema = z.string().uuid({ message: 'Invalid UUID identifier' });

export const idempotencyKeySchema = z
  .string()
  .min(1, 'Idempotency key must not be empty')
  .max(128, 'Idempotency key exceeds maximum length of 128 characters');

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Task title is required' })
    .trim()
    .min(1, 'Task title cannot be empty')
    .max(255, 'Task title must not exceed 255 characters'),
  description: z.string().trim().max(10000).optional(),
  priority: z.nativeEnum(TASK_PRIORITY).default(TASK_PRIORITY.MEDIUM),
  status: z.nativeEnum(TASK_STATUS).default(TASK_STATUS.TODO),
  projectId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
  dueAt: z
    .string()
    .datetime({ message: 'dueAt must be a valid ISO 8601 string' })
    .optional()
    .nullable(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.nativeEnum(ERROR_CODE),
    message: z.string(),
    requestId: z.string().optional(),
    fields: z.record(z.string()).optional(),
  }),
});
