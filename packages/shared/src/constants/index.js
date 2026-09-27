/**
 * Workaholic Core Domain Constants
 * Authoritative constants matching DOMAIN-MODEL.md and BUSINESS-RULES.md
 */

export const TASK_STATUS = Object.freeze({
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  DONE: 'COMPLETED', // Backward-compatible alias resolving to COMPLETED
  CANCELLED: 'CANCELLED',
});

export const TASK_PRIORITY = Object.freeze({
  P0: 'P0', // Critical
  P1: 'P1', // Urgent
  P2: 'P2', // High
  P3: 'P3', // Medium
  P4: 'P4', // Low
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

export const DEPENDENCY_TYPE = Object.freeze({
  BLOCKS: 'BLOCKS',
  BLOCKED_BY: 'BLOCKED_BY',
  DEPENDS_ON: 'DEPENDS_ON',
  RELATED_TO: 'RELATED_TO',
});

export const TASK_LINK_TYPE = Object.freeze({
  EXTERNAL: 'EXTERNAL',
  INTERNAL: 'INTERNAL',
});

export const WORK_BLOCK_STATUS = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

export const DAY_ORDER = Object.freeze({
  DO1: 'DO1',
  DO2: 'DO2',
  DO3: 'DO3',
  DO4: 'DO4',
  DO5: 'DO5',
  DO6: 'DO6',
});

export const CALENDAR_SOURCE = Object.freeze({
  WORKAHOLIC: 'WORKAHOLIC',
  GOOGLE: 'GOOGLE',
  COLLEGE: 'COLLEGE',
  DAY_ORDER: 'DAY_ORDER',
  HOLIDAY: 'HOLIDAY',
  BIRTHDAY: 'BIRTHDAY',
  BOOKING: 'BOOKING',
  IMPORTED: 'IMPORTED',
});

export const WORKSPACE_ROLE = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
});

export const ERROR_CODE = Object.freeze({
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  TEMPORARY_FAILURE: 'TEMPORARY_FAILURE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export const RECURRENCE_FREQUENCY = Object.freeze({
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
});

export const RECURRENCE_EDIT_MODE = Object.freeze({
  THIS: 'THIS',
  THIS_AND_FOLLOWING: 'THIS_AND_FOLLOWING',
  SERIES: 'SERIES',
});

export const RECURRENCE_EXCEPTION_TYPE = Object.freeze({
  CANCELLED: 'CANCELLED',
  MODIFIED: 'MODIFIED',
  RESCHEDULED: 'RESCHEDULED',
  COMPLETED: 'COMPLETED',
});

export const WEEKDAY = Object.freeze({
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
});

export const PLATFORM = Object.freeze({
  WEB: 'WEB',
  WINDOWS: 'WINDOWS',
  ANDROID: 'ANDROID',
});

export const WORKSPACE_TYPE = Object.freeze({
  PERSONAL: 'PERSONAL',
  TEAM: 'TEAM',
});

export const MEMBERSHIP_STATUS = Object.freeze({
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REMOVED: 'REMOVED',
});

export const DEVICE_TRUST_STATE = Object.freeze({
  TRUSTED: 'TRUSTED',
  UNTRUSTED: 'UNTRUSTED',
  REVOKED: 'REVOKED',
});

export const SESSION_TYPE = Object.freeze({
  WEB: 'WEB',
  DESKTOP: 'DESKTOP',
  MOBILE: 'MOBILE',
  API: 'API',
});

export const JOB_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

export const PROJECT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
  CANCELLED: 'CANCELLED',
});

export const PROJECT_ROLE = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
});

export const EVENT_VISIBILITY = Object.freeze({
  PRIVATE: 'PRIVATE',
  SHARED: 'SHARED',
  PUBLIC: 'PUBLIC',
});

export const EVENT_STATUS = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  TENTATIVE: 'TENTATIVE',
  CANCELLED: 'CANCELLED',
});

export const CALENDAR_VISIBILITY = Object.freeze({
  PRIVATE: 'PRIVATE',
  SHARED: 'SHARED',
  PUBLIC: 'PUBLIC',
});

export const CALENDAR_VIEW = Object.freeze({
  DAY: 'DAY',
  WEEK: 'WEEK',
  WORKWEEK: 'WORKWEEK',
  MONTH: 'MONTH',
  AGENDA: 'AGENDA',
});
