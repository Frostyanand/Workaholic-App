import { z } from 'zod';
import {
  TASK_STATUS,
  TASK_PRIORITY,
  ERROR_CODE,
  DEPENDENCY_TYPE,
  TASK_LINK_TYPE,
  PROJECT_STATUS,
  PROJECT_ROLE,
} from '../constants/index.js';

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
  description: z.string().trim().max(10000).nullable().optional(),
  priority: z.nativeEnum(TASK_PRIORITY).default(TASK_PRIORITY.P3),
  status: z.nativeEnum(TASK_STATUS).default(TASK_STATUS.TODO),
  projectId: z.string().uuid().nullable().optional(),
  boardId: z.string().uuid().nullable().optional(),
  boardColumnId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  startAt: z
    .string()
    .datetime({ message: 'startAt must be a valid ISO 8601 string' })
    .nullable()
    .optional(),
  dueAt: z
    .string()
    .datetime({ message: 'dueAt must be a valid ISO 8601 string' })
    .nullable()
    .optional(),
  estimatedDuration: z.coerce
    .number()
    .int('estimatedDuration must be an integer')
    .nonnegative('estimatedDuration cannot be negative')
    .nullable()
    .optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  version: z.coerce.number().int().positive().optional(),
});

export const taskQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  labelId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
  boardColumnId: z.string().uuid().optional(),
  overdue: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform(val => val === true || val === 'true')
    .optional(),
  search: z.string().trim().max(255).optional(),
  sort: z
    .enum([
      'due_at',
      'dueAt',
      'priority',
      'created_at',
      'createdAt',
      'title',
      'updated_at',
      'updatedAt',
    ])
    .default('created_at'),
  order: z.enum(['asc', 'desc', 'ASC', 'DESC']).default('desc'),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  cursor: z.string().optional(),
});

export const createSubtaskSchema = z.object({
  title: z
    .string({ required_error: 'Subtask title is required' })
    .trim()
    .min(1, 'Subtask title cannot be empty')
    .max(255, 'Subtask title must not exceed 255 characters'),
  description: z.string().trim().max(10000).nullable().optional(),
  priority: z.nativeEnum(TASK_PRIORITY).default(TASK_PRIORITY.P3),
  startAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  estimatedDuration: z.coerce.number().int().nonnegative().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

export const createDependencySchema = z.object({
  dependsOnTaskId: idSchema,
  dependencyType: z.nativeEnum(DEPENDENCY_TYPE).default(DEPENDENCY_TYPE.BLOCKS),
});

const SAFE_URL_PREFIX_REGEX = /^(https?:\/\/|mailto:|\/)/i;

export const createTaskLinkSchema = z.object({
  url: z
    .string({ required_error: 'URL is required' })
    .trim()
    .min(1, 'URL cannot be empty')
    .refine(
      url => {
        const lower = url.trim().toLowerCase();
        if (
          lower.startsWith('javascript:') ||
          lower.startsWith('data:') ||
          lower.startsWith('vbscript:')
        ) {
          return false;
        }
        return SAFE_URL_PREFIX_REGEX.test(lower);
      },
      { message: 'URL must use a safe protocol (http, https, mailto, or relative internal path)' },
    ),
  title: z.string().trim().max(255).nullable().optional(),
  linkType: z.nativeEnum(TASK_LINK_TYPE).default(TASK_LINK_TYPE.EXTERNAL),
});

export const createLabelSchema = z.object({
  name: z
    .string({ required_error: 'Label name is required' })
    .trim()
    .min(1, 'Label name cannot be empty')
    .max(100, 'Label name must not exceed 100 characters'),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Color must be a valid hex string (e.g. #4F46E5)')
    .default('#4F46E5'),
  description: z.string().trim().max(500).nullable().optional(),
});

export const updateLabelSchema = createLabelSchema.partial();

export const assignLabelSchema = z.object({
  labelId: idSchema,
});

export const createWorkBlockSchema = z
  .object({
    startAt: z.string().datetime({ message: 'startAt must be a valid ISO 8601 string' }),
    endAt: z.string().datetime({ message: 'endAt must be a valid ISO 8601 string' }),
    timezone: z.string().trim().max(100).default('UTC'),
    calendarId: z.string().uuid().nullable().optional(),
  })
  .refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'endAt must be strictly after startAt',
    path: ['endAt'],
  });

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
export const firebaseAuthInputSchema = z.object({
  idToken: z.string().trim().min(10, 'Firebase ID token is required'),
  device: z
    .object({
      platform: z.enum(['WEB', 'WINDOWS', 'ANDROID']).default('WEB'),
      deviceName: z.string().trim().min(1).max(255).optional(),
      applicationVersion: z.string().max(50).optional(),
    })
    .optional(),
});

export const authSessionExchangeInputSchema = firebaseAuthInputSchema;
export const googleAuthInputSchema = firebaseAuthInputSchema; // Backwards compatibility alias

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

// Project Schemas (Phase 6)
export const createProjectSchema = z.object({
  name: z
    .string({ required_error: 'Project name is required' })
    .trim()
    .min(1, 'Project name cannot be empty')
    .max(255, 'Project name must not exceed 255 characters'),
  description: z.string().trim().max(10000).nullable().optional(),
  status: z.nativeEnum(PROJECT_STATUS).default(PROJECT_STATUS.ACTIVE),
  ownerUserId: z.string().uuid().nullable().optional(),
  startAt: z
    .string()
    .datetime({ message: 'startAt must be a valid ISO 8601 string' })
    .nullable()
    .optional(),
  dueAt: z
    .string()
    .datetime({ message: 'dueAt must be a valid ISO 8601 string' })
    .nullable()
    .optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export const projectQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().trim().max(255).optional(),
  sort: z
    .enum(['created_at', 'updated_at', 'name', 'due_at', 'createdAt', 'updatedAt', 'dueAt'])
    .default('created_at'),
  order: z.enum(['asc', 'desc', 'ASC', 'DESC']).default('desc'),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const addProjectMemberSchema = z.object({
  userId: z.string().uuid({ message: 'Valid user ID is required' }),
  role: z.nativeEnum(PROJECT_ROLE).default(PROJECT_ROLE.MEMBER),
});

// Board Schemas (Phase 6)
export const createBoardSchema = z.object({
  name: z
    .string({ required_error: 'Board name is required' })
    .trim()
    .min(1, 'Board name cannot be empty')
    .max(255, 'Board name must not exceed 255 characters'),
  description: z.string().trim().max(10000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const updateBoardSchema = createBoardSchema.partial();

export const boardQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  search: z.string().trim().max(255).optional(),
  sort: z
    .enum(['created_at', 'updated_at', 'name', 'createdAt', 'updatedAt'])
    .default('created_at'),
  order: z.enum(['asc', 'desc', 'ASC', 'DESC']).default('desc'),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Board Column Schemas (Phase 6)
export const createBoardColumnSchema = z.object({
  name: z
    .string({ required_error: 'Column name is required' })
    .trim()
    .min(1, 'Column name cannot be empty')
    .max(100, 'Column name must not exceed 100 characters'),
  position: z.coerce.number().int().nonnegative().optional(),
  statusMapping: z.nativeEnum(TASK_STATUS).nullable().optional(),
});

export const updateBoardColumnSchema = createBoardColumnSchema.partial();

export const reorderBoardColumnsSchema = z.object({
  columnIds: z.array(z.string().uuid()).min(1, 'At least one column ID is required'),
});

export const moveBoardTaskSchema = z.object({
  columnId: z.string().uuid({ message: 'Valid column ID is required' }),
  status: z.nativeEnum(TASK_STATUS).optional(),
});
