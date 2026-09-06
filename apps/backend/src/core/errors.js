import { ERROR_CODE } from '@workaholic/shared';

/**
 * Base Application Error
 */
export class AppError extends Error {
  constructor(code, message, statusCode = 400, fields = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

/**
 * 400 Validation Error
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', fields = undefined) {
    super(ERROR_CODE.VALIDATION_ERROR, message, 400, fields);
  }
}

/**
 * 401 Authentication Required
 */
export class AuthenticationRequiredError extends AppError {
  constructor(message = 'Authentication required') {
    super(ERROR_CODE.AUTHENTICATION_REQUIRED, message, 401);
  }
}

/**
 * 401 Authentication Failed
 */
export class AuthenticationFailedError extends AppError {
  constructor(message = 'Authentication failed') {
    super(ERROR_CODE.AUTHENTICATION_FAILED, message, 401);
  }
}

/**
 * 403 Forbidden / Authorization Error
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(ERROR_CODE.FORBIDDEN, message, 403);
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(ERROR_CODE.NOT_FOUND, message, 404);
  }
}

/**
 * 409 Conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'State conflict') {
    super(ERROR_CODE.CONFLICT, message, 409);
  }
}

/**
 * 409 Sync Conflict
 */
export class SyncConflictError extends AppError {
  constructor(message = 'Synchronization conflict') {
    super(ERROR_CODE.SYNC_CONFLICT, message, 409);
  }
}

/**
 * 429 Rate Limited
 */
export class RateLimitedError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(ERROR_CODE.RATE_LIMITED, message, 429);
  }
}

/**
 * 502 External Service Error
 */
export class ExternalServiceError extends AppError {
  constructor(message = 'External service error') {
    super(ERROR_CODE.EXTERNAL_SERVICE_ERROR, message, 502);
  }
}

/**
 * 503 Temporary Failure
 */
export class TemporaryFailureError extends AppError {
  constructor(message = 'Temporary service failure') {
    super(ERROR_CODE.TEMPORARY_FAILURE, message, 503);
  }
}

/**
 * 500 Internal Error
 */
export class InternalError extends AppError {
  constructor(message = 'An internal server error occurred') {
    super(ERROR_CODE.INTERNAL_ERROR, message, 500);
  }
}

/**
 * Standard Fastify error formatter strictly conforming to docs/15.API-SPECIFICATION.md
 * Never leaks database details, stack traces, credentials, or sensitive internals.
 *
 * @param {Error} error
 * @param {string} [requestId]
 * @returns {{ error: { code: string, message: string, requestId?: string, fields?: Record<string, string> } }}
 */
export function formatErrorResponse(error, requestId) {
  const isAppError = error instanceof AppError;
  const statusCode = error.statusCode || 500;

  let code = ERROR_CODE.INTERNAL_ERROR;
  if (isAppError && error.code) {
    code = error.code;
  } else if (error.code && Object.values(ERROR_CODE).includes(error.code)) {
    code = error.code;
  } else if (statusCode === 400) {
    code = ERROR_CODE.VALIDATION_ERROR;
  } else if (statusCode === 401) {
    code = ERROR_CODE.AUTHENTICATION_REQUIRED;
  } else if (statusCode === 403) {
    code = ERROR_CODE.FORBIDDEN;
  } else if (statusCode === 404) {
    code = ERROR_CODE.NOT_FOUND;
  } else if (statusCode === 409) {
    code = ERROR_CODE.CONFLICT;
  } else if (statusCode === 429) {
    code = ERROR_CODE.RATE_LIMITED;
  } else if (statusCode === 502) {
    code = ERROR_CODE.EXTERNAL_SERVICE_ERROR;
  } else if (statusCode === 503) {
    code = ERROR_CODE.TEMPORARY_FAILURE;
  }

  // Sanitize message: never expose unhandled 500+ system messages or database internals
  let message = 'An internal server error occurred';
  if (isAppError && error.code !== ERROR_CODE.INTERNAL_ERROR) {
    message = error.message;
  } else if (statusCode < 500) {
    message = error.message || 'Client request error';
  }

  const response = {
    error: {
      code,
      message,
      requestId,
    },
  };

  if (error.fields && typeof error.fields === 'object' && Object.keys(error.fields).length > 0) {
    response.error.fields = error.fields;
  }

  return response;
}
