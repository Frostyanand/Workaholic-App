import { PROVIDER_ERROR_CATEGORY, SYNC_FAILURE_REASON } from '@workaholic/shared';

/**
 * Classifies an external provider error into canonical synchronization categories.
 * Conforms to docs/8.SYNC-SPECIFICATION.md Section 64-66,
 * and docs/21.COST-ARCHITECTURE.md Section 31.
 *
 * @param {Error | Object} err
 * @returns {{
 *   category: string,
 *   reason: string,
 *   isRetryable: boolean,
 *   shouldReauth: boolean,
 *   httpStatus: number,
 *   message: string
 * }}
 */
export function classifySyncError(err) {
  if (!err) {
    return {
      category: PROVIDER_ERROR_CATEGORY.UNKNOWN,
      reason: SYNC_FAILURE_REASON.UNKNOWN_PROVIDER_ERROR,
      isRetryable: false,
      shouldReauth: false,
      httpStatus: 500,
      message: 'Unknown synchronization failure',
    };
  }

  const status = err.status || err.statusCode || err.response?.status || 0;
  const code = String(err.code || err.error?.code || '').toUpperCase();
  const rawMsg = err.message || err.error?.message || '';
  const msg = rawMsg.toLowerCase();

  // 1. Authentication / Authorization Failures
  if (
    status === 401 ||
    err.reauthRequired === true ||
    code === 'REAUTH_REQUIRED' ||
    code === 'NOT_CONNECTED' ||
    msg.includes('reauth') ||
    msg.includes('invalid_grant') ||
    msg.includes('token expired') ||
    msg.includes('unauthorized') ||
    msg.includes('credentials unavailable')
  ) {
    return {
      category: PROVIDER_ERROR_CATEGORY.AUTHENTICATION,
      reason: msg.includes('refresh')
        ? SYNC_FAILURE_REASON.TOKEN_REFRESH_FAILED
        : SYNC_FAILURE_REASON.AUTHORIZATION_REVOKED,
      isRetryable: false,
      shouldReauth: true,
      httpStatus: 401,
      message: rawMsg || 'Authorization required or token expired',
    };
  }

  // 2. Rate Limits
  if (
    status === 429 ||
    code === 'RATE_LIMIT_EXCEEDED' ||
    msg.includes('rate limit') ||
    msg.includes('userratelimitexceeded') ||
    msg.includes('quotaexceeded') ||
    msg.includes('too many requests')
  ) {
    return {
      category: PROVIDER_ERROR_CATEGORY.RATE_LIMIT,
      reason: SYNC_FAILURE_REASON.PROVIDER_RATE_LIMIT,
      isRetryable: true,
      shouldReauth: false,
      httpStatus: 429,
      message: rawMsg || 'Provider rate limit exceeded',
    };
  }

  // 3. Not Found (External resource missing / deleted)
  if (
    status === 404 ||
    code === 'NOT_FOUND' ||
    msg.includes('not found') ||
    msg.includes('notfound') ||
    msg.includes('deleted')
  ) {
    return {
      category: PROVIDER_ERROR_CATEGORY.NOT_FOUND,
      reason: SYNC_FAILURE_REASON.INVALID_EXTERNAL_OBJECT,
      isRetryable: false,
      shouldReauth: false,
      httpStatus: 404,
      message: rawMsg || 'External resource not found',
    };
  }

  // 4. Conflicts
  if (status === 409 || code === 'CONFLICT' || msg.includes('conflict')) {
    return {
      category: PROVIDER_ERROR_CATEGORY.CONFLICT,
      reason: SYNC_FAILURE_REASON.SYNC_CONFLICT,
      isRetryable: false,
      shouldReauth: false,
      httpStatus: 409,
      message: rawMsg || 'Synchronization conflict detected',
    };
  }

  // 5. Validation / Bad Request
  if (
    status === 400 ||
    code === 'VALIDATION_ERROR' ||
    msg.includes('validation') ||
    msg.includes('invalid argument') ||
    msg.includes('invalid_request')
  ) {
    return {
      category: PROVIDER_ERROR_CATEGORY.VALIDATION,
      reason: SYNC_FAILURE_REASON.INVALID_MAPPING,
      isRetryable: false,
      shouldReauth: false,
      httpStatus: 400,
      message: rawMsg || 'Validation error in synchronization payload',
    };
  }

  // 6. Permanent Permissions / Forbidden
  if (status === 403 && !msg.includes('rate limit') && !msg.includes('quota')) {
    return {
      category: PROVIDER_ERROR_CATEGORY.PERMANENT,
      reason: SYNC_FAILURE_REASON.PERMISSION_DENIED,
      isRetryable: false,
      shouldReauth: false,
      httpStatus: 403,
      message: rawMsg || 'Permission denied by external provider',
    };
  }

  // 7. Transient Network / Server Outages
  if (
    status >= 500 ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('econnreset')
  ) {
    return {
      category: PROVIDER_ERROR_CATEGORY.TRANSIENT,
      reason:
        status >= 500
          ? SYNC_FAILURE_REASON.PROVIDER_UNAVAILABLE
          : SYNC_FAILURE_REASON.NETWORK_FAILURE,
      isRetryable: true,
      shouldReauth: false,
      httpStatus: status >= 500 ? status : 503,
      message: rawMsg || 'Transient provider or network failure',
    };
  }

  // 8. Default Unknown
  return {
    category: PROVIDER_ERROR_CATEGORY.UNKNOWN,
    reason: SYNC_FAILURE_REASON.UNKNOWN_PROVIDER_ERROR,
    isRetryable: false,
    shouldReauth: false,
    httpStatus: status || 500,
    message: rawMsg || 'Unknown provider error occurred',
  };
}
