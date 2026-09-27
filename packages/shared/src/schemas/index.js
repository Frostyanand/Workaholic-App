import { z } from 'zod';
import {
  TASK_STATUS,
  TASK_PRIORITY,
  ERROR_CODE,
  DEPENDENCY_TYPE,
  TASK_LINK_TYPE,
  PROJECT_STATUS,
  PROJECT_ROLE,
  CALENDAR_SOURCE,
  CALENDAR_VISIBILITY,
  EVENT_VISIBILITY,
  RECURRENCE_FREQUENCY,
  RECURRENCE_EDIT_MODE,
  REMINDER_TRIGGER_TYPE,
  REMINDER_PRIORITY,
  REMINDER_STATUS,
  NOTIFICATION_TYPE,
  TRUSTED_PERMISSION,
  SYNC_DIRECTION,
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

export const recurrenceRuleSchema = z
  .object({
    frequency: z.nativeEnum(RECURRENCE_FREQUENCY),
    interval: z.coerce.number().int().positive().default(1),
    byWeekday: z.array(z.coerce.number().int().min(0).max(6)).nullable().optional(),
    byMonthDay: z.array(z.coerce.number().int().min(1).max(31)).nullable().optional(),
    byMonth: z.array(z.coerce.number().int().min(1).max(12)).nullable().optional(),
    bySetPos: z.coerce.number().int().min(-366).max(366).nullable().optional(),
    startAt: z.string().datetime({ message: 'startAt must be a valid ISO 8601 string' }).optional(),
    endAt: z
      .string()
      .datetime({ message: 'endAt must be a valid ISO 8601 string' })
      .nullable()
      .optional(),
    occurrenceCount: z.coerce.number().int().positive().nullable().optional(),
    timezone: z.string().trim().max(100).default('UTC'),
  })
  .superRefine((data, ctx) => {
    if (data.endAt && data.occurrenceCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cannot specify both endAt (UNTIL) and occurrenceCount (COUNT)',
        path: ['endAt'],
      });
    }
  });

export const editOccurrenceSchema = z.object({
  editMode: z.nativeEnum(RECURRENCE_EDIT_MODE).default(RECURRENCE_EDIT_MODE.THIS),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  isAllDay: z.boolean().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  location: z.string().trim().max(500).nullable().optional(),
  meetingUrl: z.string().trim().max(1000).nullable().optional(),
  status: z.string().optional(),
  recurrence: recurrenceRuleSchema.optional(),
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
  recurrenceRuleId: z.string().uuid().nullable().optional(),
  recurrence: recurrenceRuleSchema.nullable().optional(),
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

// Calendar Schemas (Phase 8)
export const createCalendarSchema = z.object({
  name: z
    .string({ required_error: 'Calendar name is required' })
    .trim()
    .min(1, 'Calendar name cannot be empty')
    .max(255, 'Calendar name must not exceed 255 characters'),
  description: z.string().trim().max(10000).nullable().optional(),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Color must be a valid hex string (e.g. #3B82F6)')
    .default('#3B82F6'),
  sourceType: z.nativeEnum(CALENDAR_SOURCE).default(CALENDAR_SOURCE.WORKAHOLIC),
  visibility: z.nativeEnum(CALENDAR_VISIBILITY).default(CALENDAR_VISIBILITY.PRIVATE),
  timezone: z.string().trim().max(100).default('UTC'),
  isDefault: z.boolean().default(false),
  externalAccountId: z.string().trim().max(255).nullable().optional(),
  externalCalendarId: z.string().trim().max(255).nullable().optional(),
});

export const updateCalendarSchema = createCalendarSchema.partial();

export const calendarQuerySchema = z.object({
  sourceType: z.nativeEnum(CALENDAR_SOURCE).optional(),
  visibility: z.nativeEnum(CALENDAR_VISIBILITY).optional(),
  search: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Event Schemas (Phase 8 - Whole-date all-day semantics + timed events)
export const createEventSchema = z
  .object({
    calendarId: z.string().uuid({ message: 'Valid calendar ID is required' }),
    title: z
      .string({ required_error: 'Event title is required' })
      .trim()
      .min(1, 'Event title cannot be empty')
      .max(255, 'Event title must not exceed 255 characters'),
    description: z.string().trim().max(10000).nullable().optional(),
    location: z.string().trim().max(500).nullable().optional(),
    meetingUrl: z.string().trim().max(1000).nullable().optional(),
    visibility: z.nativeEnum(EVENT_VISIBILITY).default(EVENT_VISIBILITY.PRIVATE),
    sourceType: z.nativeEnum(CALENDAR_SOURCE).default(CALENDAR_SOURCE.WORKAHOLIC),
    sourceReference: z.string().trim().max(255).nullable().optional(),
    recurrenceRuleId: z.string().uuid().nullable().optional(),
    recurrence: recurrenceRuleSchema.nullable().optional(),
    timezone: z.string().trim().max(100).default('UTC'),
    isAllDay: z.boolean().default(false),
    startAt: z.string().nullable().optional(),
    endAt: z.string().nullable().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
      .nullable()
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format')
      .nullable()
      .optional(),
    taskIds: z.array(z.string().uuid()).optional().default([]),
    projectIds: z.array(z.string().uuid()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.isAllDay) {
      const hasDateStrings = Boolean(data.startDate);
      const hasTimestamps = Boolean(data.startAt);

      if (!hasDateStrings && !hasTimestamps) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'All-day event requires either startDate or startAt',
          path: ['startDate'],
        });
        return;
      }

      if (hasDateStrings) {
        const start = data.startDate;
        const end = data.endDate || data.startDate;
        if (end < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'endDate cannot be before startDate',
            path: ['endDate'],
          });
        }
      } else if (hasTimestamps) {
        const start = new Date(data.startAt);
        const end = data.endAt ? new Date(data.endAt) : start;
        if (Number.isNaN(start.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'startAt must be a valid datetime string',
            path: ['startAt'],
          });
        } else if (end.getTime() < start.getTime()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'endAt cannot be before startAt',
            path: ['endAt'],
          });
        }
      }
    } else {
      if (!data.startAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'startAt is required for timed events',
          path: ['startAt'],
        });
        return;
      }
      if (!data.endAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endAt is required for timed events',
          path: ['endAt'],
        });
        return;
      }
      const start = new Date(data.startAt);
      const end = new Date(data.endAt);
      if (Number.isNaN(start.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'startAt must be a valid ISO datetime string',
          path: ['startAt'],
        });
      } else if (Number.isNaN(end.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endAt must be a valid ISO datetime string',
          path: ['endAt'],
        });
      } else if (end.getTime() <= start.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endAt must be strictly after startAt for timed events',
          path: ['endAt'],
        });
      }
    }
  });

export const updateEventSchema = z
  .object({
    calendarId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(10000).nullable().optional(),
    location: z.string().trim().max(500).nullable().optional(),
    meetingUrl: z.string().trim().max(1000).nullable().optional(),
    visibility: z.nativeEnum(EVENT_VISIBILITY).optional(),
    sourceType: z.nativeEnum(CALENDAR_SOURCE).optional(),
    sourceReference: z.string().trim().max(255).nullable().optional(),
    recurrenceRuleId: z.string().uuid().nullable().optional(),
    recurrence: recurrenceRuleSchema.nullable().optional(),
    timezone: z.string().trim().max(100).optional(),
    isAllDay: z.boolean().optional(),
    startAt: z.string().nullable().optional(),
    endAt: z.string().nullable().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
      .nullable()
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format')
      .nullable()
      .optional(),
    taskIds: z.array(z.string().uuid()).optional(),
    projectIds: z.array(z.string().uuid()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startAt && data.endAt && data.isAllDay === false) {
      const start = new Date(data.startAt);
      const end = new Date(data.endAt);
      if (end.getTime() <= start.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endAt must be strictly after startAt for timed events',
          path: ['endAt'],
        });
      }
    }
    if (data.startDate && data.endDate) {
      if (data.endDate < data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endDate cannot be before startDate',
          path: ['endDate'],
        });
      }
    }
  });

export const calendarRangeQuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  calendarIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(val => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return val
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }),
  sourceType: z.nativeEnum(CALENDAR_SOURCE).optional(),
  timezone: z.string().default('UTC'),
  includeTasks: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform(val => val === true || val === 'true')
    .optional()
    .default(false),
  includeWorkBlocks: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform(val => val === true || val === 'true')
    .optional()
    .default(true),
});

// Today / Command Center Query Schema (Phase 9)
export const todayQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
    .optional(),
  timezone: z.string().trim().max(100).optional(),
});

// Phase 11: Reminders Schemas
export const createReminderSchema = z
  .object({
    workspaceId: z.string().uuid({ message: 'workspaceId must be a valid UUID' }).optional(),
    taskId: z.string().uuid().nullable().optional(),
    eventId: z.string().uuid().nullable().optional(),
    bookingId: z.string().uuid().nullable().optional(),
    triggerType: z.nativeEnum(REMINDER_TRIGGER_TYPE),
    triggerAt: z
      .string()
      .datetime({ message: 'triggerAt must be a valid ISO 8601 string' })
      .nullable()
      .optional(),
    relativeOffset: z.string().nullable().optional(),
    priority: z.nativeEnum(REMINDER_PRIORITY).default(REMINDER_PRIORITY.NORMAL),
    recipientUserIds: z.array(z.string().uuid()).optional(),
    title: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.triggerType === REMINDER_TRIGGER_TYPE.ABSOLUTE_TIME && !data.triggerAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'triggerAt is required for ABSOLUTE_TIME reminders',
        path: ['triggerAt'],
      });
    }
    if (
      (data.triggerType === REMINDER_TRIGGER_TYPE.BEFORE_EVENT ||
        data.triggerType === REMINDER_TRIGGER_TYPE.BEFORE_DEADLINE) &&
      !data.relativeOffset
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'relativeOffset is required for relative reminders',
        path: ['relativeOffset'],
      });
    }
  });

export const updateReminderSchema = z.object({
  triggerType: z.nativeEnum(REMINDER_TRIGGER_TYPE).optional(),
  triggerAt: z
    .string()
    .datetime({ message: 'triggerAt must be a valid ISO 8601 string' })
    .nullable()
    .optional(),
  relativeOffset: z.string().nullable().optional(),
  priority: z.nativeEnum(REMINDER_PRIORITY).optional(),
  status: z.nativeEnum(REMINDER_STATUS).optional(),
});

export const snoozeReminderSchema = z
  .object({
    durationMinutes: z.coerce.number().int().positive().optional(),
    snoozeUntil: z
      .string()
      .datetime({ message: 'snoozeUntil must be a valid ISO 8601 string' })
      .optional(),
  })
  .refine(data => data.durationMinutes !== undefined || data.snoozeUntil !== undefined, {
    message: 'Either durationMinutes or snoozeUntil must be provided',
  });

export const dismissReminderSchema = z.object({
  dismissAllOccurrences: z.boolean().default(false).optional(),
});

export const addRecipientSchema = z.object({
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
});

export const listRemindersQuerySchema = z.object({
  taskId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

// Phase 11: Notifications Schemas
export const listNotificationsQuerySchema = z.object({
  type: z.nativeEnum(NOTIFICATION_TYPE).optional(),
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform(v => v === true || v === 'true')
    .optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export const updateNotificationSchema = z.object({
  read: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

export const notificationPreferencesSchema = z.object({
  channels: z
    .object({
      inApp: z.boolean().optional(),
      push: z.boolean().optional(),
      windowsDesktop: z.boolean().optional(),
      androidLocal: z.boolean().optional(),
    })
    .optional(),
  quietHours: z
    .object({
      enabled: z.boolean().default(false),
      start: z
        .string()
        .regex(/^\d{2}:\d{2}$/, 'start must be HH:MM format')
        .default('22:00'),
      end: z
        .string()
        .regex(/^\d{2}:\d{2}$/, 'end must be HH:MM format')
        .default('07:00'),
      allowCritical: z.boolean().default(true),
    })
    .optional(),
});

export const registerPushTokenSchema = z.object({
  platform: z.enum(['WEB', 'WINDOWS', 'ANDROID']),
  token: z.string().min(1, 'Token cannot be empty').max(4096),
  deviceName: z.string().max(255).optional(),
  deviceId: z.string().uuid().optional(),
});

export const createTrustedRelationshipSchema = z.object({
  trustedUserId: z.string().uuid({ message: 'trustedUserId must be a valid UUID' }),
  permissions: z.array(z.string()).default([TRUSTED_PERMISSION.RECEIVE_REMINDERS]),
});

export const googleConnectSchema = z.object({
  redirectUri: z.string().url('Invalid redirect URI').optional(),
});

export const googleCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  service: z.enum(['CALENDAR', 'TASKS', 'DRIVE']).default('CALENDAR'),
});

export const googleSyncOptionsSchema = z.object({
  calendarId: z.string().optional(),
  calendarMappingId: z.string().uuid().optional(),
  direction: z.nativeEnum(SYNC_DIRECTION).default(SYNC_DIRECTION.BIDIRECTIONAL),
  force: z.boolean().default(false),
});

export const googleTasksSyncOptionsSchema = z.object({
  taskListId: z.string().optional(),
  taskListMappingId: z.string().uuid().optional(),
  direction: z.nativeEnum(SYNC_DIRECTION).default(SYNC_DIRECTION.BIDIRECTIONAL),
  force: z.boolean().default(false),
  async: z.boolean().default(false),
});

export const createAttachmentSchema = z.object({
  targetType: z.enum(['TASK', 'PROJECT', 'NOTE']),
  targetId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255).default('application/octet-stream'),
  sizeBytes: z.coerce.number().int().nonnegative().default(0),
  sourceType: z.enum(['GOOGLE_DRIVE', 'LOCAL', 'EXTERNAL']).default('GOOGLE_DRIVE'),
  externalFileId: z.string().max(255).optional(),
  webUrl: z.string().url().optional().nullable(),
  uploadStatus: z.enum(['PENDING', 'UPLOADING', 'COMPLETED', 'FAILED']).default('COMPLETED'),
});

export const googleDriveUploadSchema = z.object({
  targetType: z.enum(['TASK', 'PROJECT', 'NOTE']),
  targetId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255).default('application/octet-stream'),
  content: z.string().min(1, 'content is required'),
  sizeBytes: z.coerce.number().int().nonnegative().optional(),
  description: z.string().max(1000).optional(),
  async: z.boolean().default(false),
});

export const googleDriveSyncOptionsSchema = z.object({
  attachmentId: idSchema.optional(),
  force: z.boolean().default(false),
  async: z.boolean().default(false),
});

export const syncDiagnosticQuerySchema = z.object({
  service: z.enum(['CALENDAR', 'TASKS', 'DRIVE']).optional(),
  status: z.enum(['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED']).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const syncRecoverySchema = z.object({
  service: z.enum(['CALENDAR', 'TASKS', 'DRIVE', 'ALL']).default('ALL'),
  resetCursor: z.boolean().default(false),
  force: z.boolean().default(true),
});
