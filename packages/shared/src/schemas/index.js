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

export const apiSuccessSingleSchema = z.object({
  data: z.unknown().refine(val => val !== undefined, {
    message: 'data property is required',
  }),
});

export const apiSuccessCollectionSchema = z.object({
  data: z.array(z.unknown()),
  pagination: paginationQuerySchema.optional(),
});

// User schemas
export const createUserSchema = z.object({
  displayName: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  profileImageReference: z.string().nullable().optional(),
  timezone: z.string().max(100).default('UTC'),
  locale: z.string().max(50).default('en'),
  preferences: z.record(z.unknown()).default({}),
});

export const updateUserSchema = createUserSchema.partial();

// Workspace schemas
export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  workspaceType: z.enum(['PERSONAL', 'TEAM']).default('PERSONAL'),
  ownerUserId: idSchema,
});

export const updateWorkspaceSchema = createWorkspaceSchema.partial();

// Workspace membership schemas
export const createMembershipSchema = z.object({
  workspaceId: idSchema,
  userId: idSchema,
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED']).default('ACTIVE'),
});

// Device schemas
export const createDeviceSchema = z.object({
  userId: idSchema,
  platform: z.enum(['WEB', 'WINDOWS', 'ANDROID']),
  deviceName: z.string().trim().min(1).max(255),
  applicationVersion: z.string().max(50).nullable().optional(),
  pushTokenReference: z.string().nullable().optional(),
  trustState: z.enum(['TRUSTED', 'UNTRUSTED', 'REVOKED']).default('UNTRUSTED'),
});

// Session schemas
export const createSessionSchema = z.object({
  userId: idSchema,
  deviceId: idSchema.nullable().optional(),
  sessionTokenHash: z.string().min(1).max(255),
  sessionType: z.enum(['WEB', 'DESKTOP', 'MOBILE', 'API']).default('WEB'),
  expiresAt: z.string().datetime({ message: 'expiresAt must be a valid ISO 8601 string' }),
});

// Background job schemas
export const createJobSchema = z.object({
  jobType: z.string().trim().min(1, 'jobType cannot be empty').max(100),
  payload: z.record(z.unknown()).default({}),
  queue: z.string().trim().min(1).max(100).default('default'),
  priority: z.number().int().default(0),
  runAt: z.string().datetime().optional(),
  maxAttempts: z.number().int().positive().default(3),
});

// Auth & OAuth schemas (Phase 4)
export const googleAuthInputSchema = z.object({
  idToken: z.string().trim().min(10, 'Google ID token is required'),
  device: z
    .object({
      platform: z.enum(['WEB', 'WINDOWS', 'ANDROID']).default('WEB'),
      deviceName: z.string().trim().min(1).max(255).optional(),
      applicationVersion: z.string().max(50).optional(),
    })
    .optional(),
});

export const oauthAuthorizeQuerySchema = z.object({
  service: z.enum(['CALENDAR', 'TASKS', 'DRIVE']),
  redirectUri: z.string().url().optional(),
});

export const oauthCallbackInputSchema = z.object({
  code: z.string().trim().min(1, 'Authorization code is required'),
  state: z.string().trim().min(1, 'State token is required'),
  service: z.enum(['CALENDAR', 'TASKS', 'DRIVE']),
});

export const updateDeviceTrustInputSchema = z.object({
  trustState: z.enum(['TRUSTED', 'UNTRUSTED']),
});

export const securityEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  eventType: z.string().optional(),
});
