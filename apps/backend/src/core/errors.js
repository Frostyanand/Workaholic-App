import { ERROR_CODE } from '@workaholic/shared';

export class AppError extends Error {
  constructor(code, message, statusCode = 400, fields = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', fields = undefined) {
    super(ERROR_CODE.VALIDATION_ERROR, message, 400, fields);
  }
}

export class AuthenticationRequiredError extends AppError {
  constructor(message = 'Authentication required') {
    super(ERROR_CODE.AUTHENTICATION_REQUIRED, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(ERROR_CODE.FORBIDDEN, message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(ERROR_CODE.NOT_FOUND, message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'State conflict') {
    super(ERROR_CODE.CONFLICT, message, 409);
  }
}

/**
 * Standard Fastify error handler format
 */
export function formatErrorResponse(error, requestId) {
  const code =
    error.code && Object.values(ERROR_CODE).includes(error.code)
      ? error.code
      : ERROR_CODE.INTERNAL_ERROR;

  const response = {
    error: {
      code,
      message:
        error.statusCode && error.statusCode < 500
          ? error.message
          : 'An internal server error occurred',
      requestId,
    },
  };

  if (error.fields) {
    response.error.fields = error.fields;
  }

  return response;
}
