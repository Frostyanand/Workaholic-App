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
  NOTE_CONTENT_FORMAT,
  NOTE_RELATIONSHIP_TARGET_TYPE,
  NOTE_RELATIONSHIP_TYPE,
  SEMESTER_STATUS,
  ACADEMIC_DAY_STATUS,
  BOOKING_PAGE_STATUS,
  BOOKING_STATUS,
  COLLAB_TARGET_TYPE,
  ACTIVITY_TYPE,
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
  service: z.enum(['CALENDAR', 'TASKS', 'DRIVE', 'WORKSPACE']),
  redirectUri: z.string().url().optional(),
});

export const oauthCallbackInputSchema = z.object({
  code: z.string().trim().min(1, 'Authorization code is required'),
  state: z.string().trim().min(1, 'State token is required'),
  service: z.enum(['CALENDAR', 'TASKS', 'DRIVE', 'WORKSPACE']),
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
    snoozeMinutes: z.coerce.number().int().positive().optional(),
    snoozeUntil: z
      .string()
      .datetime({ message: 'snoozeUntil must be a valid ISO 8601 string' })
      .optional(),
    snoozedUntil: z
      .string()
      .datetime({ message: 'snoozedUntil must be a valid ISO 8601 string' })
      .optional(),
  })
  .refine(
    data =>
      data.durationMinutes !== undefined ||
      data.snoozeMinutes !== undefined ||
      data.snoozeUntil !== undefined ||
      data.snoozedUntil !== undefined,
    {
      message: 'Either durationMinutes/snoozeMinutes or snoozeUntil/snoozedUntil must be provided',
    },
  )
  .transform(data => ({
    durationMinutes: data.durationMinutes ?? data.snoozeMinutes,
    snoozeMinutes: data.snoozeMinutes ?? data.durationMinutes,
    snoozeUntil: data.snoozeUntil ?? data.snoozedUntil,
    snoozedUntil: data.snoozedUntil ?? data.snoozeUntil,
  }));

export const dismissReminderSchema = z.object({
  dismissAllOccurrences: z.boolean().default(false).optional(),
});

export const addRecipientSchema = z
  .object({
    userId: z.string().uuid({ message: 'userId must be a valid UUID' }).optional(),
    recipientUserId: z
      .string()
      .uuid({ message: 'recipientUserId must be a valid UUID' })
      .optional(),
  })
  .refine(data => data.userId || data.recipientUserId, {
    message: 'userId or recipientUserId is required',
  })
  .transform(data => ({
    userId: data.userId || data.recipientUserId,
    recipientUserId: data.recipientUserId || data.userId,
  }));

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

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(255).default('Untitled Note'),
  content: z.union([z.array(z.record(z.any())), z.record(z.any()), z.string()]).default([]),
  contentText: z.string().max(500000).optional(),
  contentFormat: z.nativeEnum(NOTE_CONTENT_FORMAT).default(NOTE_CONTENT_FORMAT.STRUCTURED),
  category: z.string().trim().max(100).nullable().optional(),
  isPinned: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

export const updateNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(255).optional(),
  content: z.union([z.array(z.record(z.any())), z.record(z.any()), z.string()]).optional(),
  contentText: z.string().max(500000).optional(),
  contentFormat: z.nativeEnum(NOTE_CONTENT_FORMAT).optional(),
  category: z.string().trim().max(100).nullable().optional(),
  isPinned: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

export const noteQuerySchema = z.object({
  q: z.string().max(255).optional(),
  category: z.string().max(100).optional(),
  tag: z.string().max(100).optional(),
  isPinned: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform(val => val === true || val === 'true')
    .optional(),
  isFavorite: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform(val => val === true || val === 'true')
    .optional(),
  isArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform(val => val === true || val === 'true')
    .default(false),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const createNoteRelationshipSchema = z.object({
  targetType: z.nativeEnum(NOTE_RELATIONSHIP_TARGET_TYPE),
  targetId: idSchema,
  relationshipType: z.nativeEnum(NOTE_RELATIONSHIP_TYPE).default(NOTE_RELATIONSHIP_TYPE.RELATES_TO),
  metadata: z.record(z.any()).optional().default({}),
});

export const convertChecklistItemSchema = z.object({
  itemId: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(255).optional(),
  projectId: idSchema.optional().nullable(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']).optional(),
  description: z.string().max(2000).optional(),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().trim().max(50).default('#6366F1'),
});

// Phase 18: Academic Calendar and Day Order Schemas
export const createSemesterSchema = z
  .object({
    name: z.string().trim().min(1, 'Semester name is required').max(255),
    academicYear: z.string().trim().max(50).optional().nullable(),
    institution: z.string().trim().max(255).optional().nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format'),
    timezone: z.string().trim().max(100).default('UTC'),
    dayOrderCount: z.coerce.number().int().min(1).max(10).default(5),
    calendarId: idSchema.optional().nullable(),
    metadata: z.record(z.any()).optional().default({}),
  })
  .refine(data => data.endDate >= data.startDate, {
    message: 'endDate cannot be before startDate',
    path: ['endDate'],
  });

export const updateSemesterSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    academicYear: z.string().trim().max(50).optional().nullable(),
    institution: z.string().trim().max(255).optional().nullable(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format')
      .optional(),
    timezone: z.string().trim().max(100).optional(),
    dayOrderCount: z.coerce.number().int().min(1).max(10).optional(),
    calendarId: idSchema.optional().nullable(),
    status: z.nativeEnum(SEMESTER_STATUS).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .refine(
    data => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'endDate cannot be before startDate',
      path: ['endDate'],
    },
  );

export const setAcademicDateSchema = z.object({
  calendarDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'calendarDate must be in YYYY-MM-DD format'),
  dayStatus: z.nativeEnum(ACADEMIC_DAY_STATUS),
  reason: z.string().trim().max(500).optional().nullable(),
  dayOrder: z
    .string()
    .regex(/^DO\d+$/, 'dayOrder must be in format DO1..DO10')
    .optional()
    .nullable(),
  overrideDayOrder: z
    .string()
    .regex(/^DO\d+$/, 'overrideDayOrder must be in format DO1..DO10')
    .optional()
    .nullable(),
});

export const academicDateQuerySchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const createClassScheduleSchema = z.object({
  name: z.string().trim().min(1, 'Schedule name is required').max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  semesterId: idSchema.optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateClassScheduleSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  semesterId: idSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createScheduleEntrySchema = z
  .object({
    classScheduleId: idSchema.optional(),
    dayOrder: z.string().regex(/^DO\d+$/, 'dayOrder must be in format DO1..DO10'),
    courseName: z.string().trim().min(1, 'Course name is required').max(255),
    courseCode: z.string().trim().max(50).optional().nullable(),
    instructor: z.string().trim().max(255).optional().nullable(),
    room: z.string().trim().max(100).optional().nullable(),
    startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'startTime must be HH:MM or HH:MM:SS'),
    endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'endTime must be HH:MM or HH:MM:SS'),
    color: z.string().trim().max(50).default('#6366F1'),
    metadata: z.record(z.any()).optional().default({}),
  })
  .refine(
    data => {
      const s = data.startTime.length === 5 ? `${data.startTime}:00` : data.startTime;
      const e = data.endTime.length === 5 ? `${data.endTime}:00` : data.endTime;
      return e > s;
    },
    {
      message: 'endTime must be strictly after startTime',
      path: ['endTime'],
    },
  );

export const updateScheduleEntrySchema = z
  .object({
    dayOrder: z
      .string()
      .regex(/^DO\d+$/)
      .optional(),
    courseName: z.string().trim().min(1).max(255).optional(),
    courseCode: z.string().trim().max(50).optional().nullable(),
    instructor: z.string().trim().max(255).optional().nullable(),
    room: z.string().trim().max(100).optional().nullable(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    color: z.string().trim().max(50).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .refine(
    data => {
      if (data.startTime && data.endTime) {
        const s = data.startTime.length === 5 ? `${data.startTime}:00` : data.startTime;
        const e = data.endTime.length === 5 ? `${data.endTime}:00` : data.endTime;
        return e > s;
      }
      return true;
    },
    {
      message: 'endTime must be strictly after startTime',
      path: ['endTime'],
    },
  );

export const academicGenerateSchema = z.object({
  classScheduleId: idSchema.optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const cancelClassSchema = z.object({
  scheduleEntryId: idSchema,
  calendarDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'calendarDate must be in YYYY-MM-DD format'),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const rescheduleClassSchema = z
  .object({
    scheduleEntryId: idSchema,
    calendarDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'calendarDate must be in YYYY-MM-DD format'),
    rescheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'rescheduledDate must be in YYYY-MM-DD format'),
    rescheduledStartTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'rescheduledStartTime must be HH:MM or HH:MM:SS'),
    rescheduledEndTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'rescheduledEndTime must be HH:MM or HH:MM:SS'),
    rescheduledRoom: z.string().trim().max(100).optional().nullable(),
    reason: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    data => {
      const s =
        data.rescheduledStartTime.length === 5
          ? `${data.rescheduledStartTime}:00`
          : data.rescheduledStartTime;
      const e =
        data.rescheduledEndTime.length === 5
          ? `${data.rescheduledEndTime}:00`
          : data.rescheduledEndTime;
      if (data.rescheduledDate === data.calendarDate) {
        return e > s;
      }
      return e > s;
    },
    {
      message: 'rescheduledEndTime must be strictly after rescheduledStartTime',
      path: ['rescheduledEndTime'],
    },
  );

// =========================================================
// Phase 19: Public Calendar Schemas
// =========================================================

export const createPublicLinkSchema = z
  .object({
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .optional();

export const publicCalendarQuerySchema = z
  .object({
    start: z.string().datetime({ offset: true }).optional(),
    end: z.string().datetime({ offset: true }).optional(),
    timezone: z.string().trim().max(100).optional(),
  })
  .refine(
    data => {
      if (data.start && data.end) {
        return new Date(data.end).getTime() >= new Date(data.start).getTime();
      }
      return true;
    },
    {
      message: 'end must be on or after start',
      path: ['end'],
    },
  )
  .refine(
    data => {
      if (data.start && data.end) {
        const diffMs = new Date(data.end).getTime() - new Date(data.start).getTime();
        const maxMs = 366 * 24 * 60 * 60 * 1000;
        return diffMs <= maxMs;
      }
      return true;
    },
    {
      message: 'Date range cannot exceed 366 days',
      path: ['end'],
    },
  );

export const publicTokenParamSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16, 'Token is too short')
    .max(128, 'Token is too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Malformed token characters'),
});

// =========================================================
// Phase 20: Booking & Availability Schemas
// =========================================================

export const bookingSlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createBookingPageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(100, 'Slug cannot exceed 100 characters')
    .regex(
      bookingSlugRegex,
      'Slug must consist of lowercase alphanumeric words separated by single hyphens',
    ),
  description: z.string().trim().max(2000).optional().nullable(),
  timezone: z.string().trim().min(1).max(50).default('UTC'),
  calendarId: idSchema.optional().nullable(),
  status: z.nativeEnum(BOOKING_PAGE_STATUS).default(BOOKING_PAGE_STATUS.ACTIVE),
});

export const updateBookingPageSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(
      bookingSlugRegex,
      'Slug must consist of lowercase alphanumeric words separated by single hyphens',
    )
    .optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  timezone: z.string().trim().min(1).max(50).optional(),
  calendarId: idSchema.optional().nullable(),
  status: z.nativeEnum(BOOKING_PAGE_STATUS).optional(),
});

export const createBookingTypeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(
      bookingSlugRegex,
      'Slug must consist of lowercase alphanumeric words separated by single hyphens',
    ),
  description: z.string().trim().max(2000).optional().nullable(),
  duration: z.coerce.number().int().min(5, 'Duration must be at least 5 minutes').max(1440),
  bufferBefore: z.coerce.number().int().min(0, 'Buffer before must be >= 0').max(1440).default(0),
  bufferAfter: z.coerce.number().int().min(0, 'Buffer after must be >= 0').max(1440).default(0),
  minimumNotice: z.coerce
    .number()
    .int()
    .min(0, 'Minimum notice must be >= 0')
    .max(43200)
    .default(120),
  maximumHorizon: z.coerce
    .number()
    .int()
    .min(1, 'Maximum horizon must be >= 1 day')
    .max(365)
    .default(30),
  cancellationDeadline: z.coerce
    .number()
    .int()
    .min(0, 'Cancellation deadline must be >= 0')
    .max(43200)
    .default(60),
  reschedulingEnabled: z.boolean().default(true),
  location: z.string().trim().max(255).optional().nullable(),
  meetingUrl: z.string().trim().url().max(2048).optional().nullable().or(z.literal('')),
  createTask: z.boolean().default(false),
  taskPriority: z.nativeEnum(TASK_PRIORITY).default(TASK_PRIORITY.P3),
  isActive: z.boolean().default(true),
});

export const updateBookingTypeSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(
      bookingSlugRegex,
      'Slug must consist of lowercase alphanumeric words separated by single hyphens',
    )
    .optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  duration: z.coerce.number().int().min(5).max(1440).optional(),
  bufferBefore: z.coerce.number().int().min(0).max(1440).optional(),
  bufferAfter: z.coerce.number().int().min(0).max(1440).optional(),
  minimumNotice: z.coerce.number().int().min(0).max(43200).optional(),
  maximumHorizon: z.coerce.number().int().min(1).max(365).optional(),
  cancellationDeadline: z.coerce.number().int().min(0).max(43200).optional(),
  reschedulingEnabled: z.boolean().optional(),
  location: z.string().trim().max(255).optional().nullable(),
  meetingUrl: z.string().trim().url().max(2048).optional().nullable().or(z.literal('')),
  createTask: z.boolean().optional(),
  taskPriority: z.nativeEnum(TASK_PRIORITY).optional(),
  isActive: z.boolean().optional(),
});

export const createAvailabilityRuleSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'startTime must be in HH:MM or HH:MM:SS format'),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'endTime must be in HH:MM or HH:MM:SS format'),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD')
      .optional()
      .nullable(),
    effectiveUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveUntil must be YYYY-MM-DD')
      .optional()
      .nullable(),
    timezone: z.string().trim().max(50).default('UTC'),
  })
  .refine(
    data => {
      const s = data.startTime.length === 5 ? `${data.startTime}:00` : data.startTime;
      const e = data.endTime.length === 5 ? `${data.endTime}:00` : data.endTime;
      return e > s;
    },
    {
      message: 'endTime must be strictly after startTime',
      path: ['endTime'],
    },
  );

export const setAvailabilityRulesSchema = z.object({
  rules: z.array(createAvailabilityRuleSchema),
});

export const createAvailabilityExceptionSchema = z
  .object({
    exceptionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'exceptionDate must be in YYYY-MM-DD format'),
    isUnavailable: z.boolean().default(true),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'startTime must be in HH:MM or HH:MM:SS format')
      .optional()
      .nullable(),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'endTime must be in HH:MM or HH:MM:SS format')
      .optional()
      .nullable(),
    reason: z.string().trim().max(255).optional().nullable(),
  })
  .refine(
    data => {
      if (!data.isUnavailable) {
        if (!data.startTime || !data.endTime) return false;
        const s = data.startTime.length === 5 ? `${data.startTime}:00` : data.startTime;
        const e = data.endTime.length === 5 ? `${data.endTime}:00` : data.endTime;
        return e > s;
      }
      return true;
    },
    {
      message:
        'Available exceptions must provide valid startTime and endTime where endTime > startTime',
      path: ['endTime'],
    },
  );

export const bookingAvailabilityQuerySchema = z
  .object({
    bookingTypeId: idSchema,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format'),
    timezone: z.string().trim().max(50).optional(),
  })
  .refine(
    data => {
      return data.endDate >= data.startDate;
    },
    {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    },
  )
  .refine(
    data => {
      const diffMs = new Date(data.endDate).getTime() - new Date(data.startDate).getTime();
      const maxMs = 93 * 24 * 60 * 60 * 1000; // max 3 months query
      return diffMs <= maxMs;
    },
    {
      message: 'Availability query window cannot exceed 93 days',
      path: ['endDate'],
    },
  );

export const createPublicBookingSchema = z.object({
  bookingTypeId: idSchema,
  startAt: z.string().datetime({ offset: true }),
  guestName: z.string().trim().min(1, 'Guest name is required').max(255),
  guestEmail: z.string().trim().email('Valid email is required').max(255),
  guestNotes: z.string().trim().max(2000).optional().nullable(),
  timezone: z.string().trim().max(50).default('UTC'),
  idempotencyKey: z.string().trim().max(128).optional().nullable(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const rescheduleBookingSchema = z.object({
  newStartAt: z.string().datetime({ offset: true }),
  timezone: z.string().trim().max(50).optional(),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const bookingSlugParamSchema = z.object({
  slug: z.string().trim().min(2).max(100),
});

export const manageTokenParamSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16, 'Token is too short')
    .max(128, 'Token is too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Malformed token characters'),
});

export const listBookingsQuerySchema = z.object({
  bookingPageId: idSchema.optional(),
  status: z.nativeEnum(BOOKING_STATUS).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Phase 21: Trusted Sharing & Collaboration Schemas
export const createShareCodeSchema = z.object({
  expiresInMinutes: z.coerce.number().int().min(5).max(1440).default(60),
  defaultPermissions: z
    .array(z.nativeEnum(TRUSTED_PERMISSION))
    .default([
      TRUSTED_PERMISSION.VIEW_CALENDAR,
      TRUSTED_PERMISSION.RECEIVE_REMINDERS,
      TRUSTED_PERMISSION.VIEW_TASKS,
    ]),
});

export const redeemShareCodeSchema = z.object({
  code: z.string().trim().min(6, 'Share code is required').max(64),
});

export const updateTrustedPermissionsSchema = z.object({
  permissions: z.array(z.nativeEnum(TRUSTED_PERMISSION)),
});

export const createCommentSchema = z.object({
  workspaceId: idSchema,
  targetType: z.nativeEnum(COLLAB_TARGET_TYPE),
  targetId: idSchema,
  content: z.string().trim().min(1, 'Comment content cannot be empty').max(10000),
  mentionedUserIds: z.array(idSchema).optional(),
});

export const listCommentsQuerySchema = z.object({
  workspaceId: idSchema,
  targetType: z.nativeEnum(COLLAB_TARGET_TYPE),
  targetId: idSchema,
});

export const addReminderRecipientSchema = z.object({
  recipientUserId: idSchema,
});

export const snoozeReminderRecipientSchema = z.object({
  snoozeMinutes: z.coerce.number().int().min(1).max(10080).default(15),
  snoozedUntil: z.string().datetime().optional(),
});

export const listActivityQuerySchema = z.object({
  workspaceId: idSchema,
  targetType: z.nativeEnum(COLLAB_TARGET_TYPE).optional(),
  targetId: idSchema.optional(),
  activityType: z.nativeEnum(ACTIVITY_TYPE).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
