import { ValidationError } from './errors.js';

/**
 * Fastify preValidation hook factory using Zod schemas.
 * Validates params, query, body, and/or headers against provided Zod schemas.
 * Conforms to docs/15.API-SPECIFICATION.md Section 11 & Section 18.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.params]
 * @param {import('zod').ZodSchema} [schemas.query]
 * @param {import('zod').ZodSchema} [schemas.body]
 * @param {import('zod').ZodSchema} [schemas.headers]
 * @returns {Function} Fastify preValidation hook
 */
export function validateRequest(schemas = {}) {
  const { params, query, body, headers } = schemas;

  return async function preValidationHook(request, _reply) {
    const fields = {};
    let hasError = false;

    if (params && request.params) {
      const result = params.safeParse(request.params);
      if (!result.success) {
        hasError = true;
        for (const issue of result.error.issues) {
          const fieldPath = issue.path.join('.') || 'params';
          fields[fieldPath] = issue.message;
        }
      } else {
        request.params = result.data;
      }
    }

    if (query && request.query) {
      const result = query.safeParse(request.query);
      if (!result.success) {
        hasError = true;
        for (const issue of result.error.issues) {
          const fieldPath = issue.path.join('.') || 'query';
          fields[fieldPath] = issue.message;
        }
      } else {
        request.query = result.data;
      }
    }

    if (body) {
      const result = body.safeParse(request.body ?? {});
      if (!result.success) {
        hasError = true;
        for (const issue of result.error.issues) {
          const fieldPath = issue.path.join('.') || 'body';
          fields[fieldPath] = issue.message;
        }
      } else {
        request.body = result.data;
      }
    }

    if (headers && request.headers) {
      const result = headers.safeParse(request.headers);
      if (!result.success) {
        hasError = true;
        for (const issue of result.error.issues) {
          const fieldPath = issue.path.join('.') || 'headers';
          fields[fieldPath] = issue.message;
        }
      }
    }

    if (hasError) {
      throw new ValidationError('Validation failed', fields);
    }

    request.validated = {
      params: params ? request.params : undefined,
      query: query ? request.query : undefined,
      body: body ? request.body : undefined,
    };
  };
}
