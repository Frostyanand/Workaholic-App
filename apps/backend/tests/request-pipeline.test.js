import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { validateRequest } from '../src/core/validation.js';
import {
  ValidationError,
  AuthenticationRequiredError,
  AuthenticationFailedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitedError,
  ExternalServiceError,
  TemporaryFailureError,
  InternalError,
  formatErrorResponse,
} from '../src/core/errors.js';
import { sendSuccess } from '../src/core/response.js';
import { idSchema, paginationQuerySchema } from '@workaholic/shared';

describe('Request Pipeline & Error Model (Tasks 3.1 & 3.2)', () => {
  let app;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // Test route with validation
    const testBodySchema = z.object({
      title: z.string().min(3, 'Title must be at least 3 characters'),
      count: z.number().int().positive('Count must be positive'),
    });

    const testParamSchema = z.object({
      id: idSchema,
    });

    app.post(
      '/test/pipeline/:id',
      {
        preValidation: [
          validateRequest({
            params: testParamSchema,
            query: paginationQuerySchema,
            body: testBodySchema,
          }),
        ],
      },
      async (request, reply) => {
        return sendSuccess(reply, {
          validated: request.validated,
          params: request.params,
          query: request.query,
          body: request.body,
        });
      },
    );

    // Test routes throwing each error type
    app.get('/test/errors/validation', async () => {
      throw new ValidationError('Validation failed', { title: 'Required' });
    });

    app.get('/test/errors/auth-required', async () => {
      throw new AuthenticationRequiredError('Missing token');
    });

    app.get('/test/errors/auth-failed', async () => {
      throw new AuthenticationFailedError('Invalid credentials');
    });

    app.get('/test/errors/forbidden', async () => {
      throw new ForbiddenError('Insufficient permissions');
    });

    app.get('/test/errors/not-found', async () => {
      throw new NotFoundError('Task not found');
    });

    app.get('/test/errors/conflict', async () => {
      throw new ConflictError('Concurrent edit collision');
    });

    app.get('/test/errors/rate-limit', async () => {
      throw new RateLimitedError('Too many attempts');
    });

    app.get('/test/errors/external', async () => {
      throw new ExternalServiceError('Google Calendar API unavailable');
    });

    app.get('/test/errors/temp-failure', async () => {
      throw new TemporaryFailureError('Service temporarily unavailable');
    });

    app.get('/test/errors/internal', async () => {
      throw new InternalError('Explicit internal error');
    });

    app.get('/test/errors/unhandled', async () => {
      throw new Error('FATAL: connection to postgresql://admin:secret@db:5432 failed');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Request Validation & Pipeline (Task 3.1)', () => {
    it('accepts valid request and parses/coerces parameters', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const response = await app.inject({
        method: 'POST',
        url: `/test/pipeline/${validUuid}?limit=50`,
        payload: {
          title: 'Clean task',
          count: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const resBody = JSON.parse(response.payload);
      expect(resBody.data).toBeDefined();
      expect(resBody.data.params.id).toBe(validUuid);
      expect(resBody.data.query.limit).toBe(50);
      expect(resBody.data.body.title).toBe('Clean task');
      expect(resBody.data.body.count).toBe(5);
      expect(resBody.data.validated).toBeDefined();
    });

    it('rejects invalid path params with VALIDATION_ERROR and field error', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test/pipeline/not-a-uuid',
        payload: {
          title: 'Valid title',
          count: 1,
        },
      });

      expect(response.statusCode).toBe(400);
      const resBody = JSON.parse(response.payload);
      expect(resBody.error.code).toBe('VALIDATION_ERROR');
      expect(resBody.error.fields).toBeDefined();
      expect(resBody.error.fields.id).toBe('Invalid UUID identifier');
      expect(resBody.error.requestId).toBeDefined();
    });

    it('rejects invalid body payload with field errors for multiple invalid fields', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const response = await app.inject({
        method: 'POST',
        url: `/test/pipeline/${validUuid}`,
        payload: {
          title: 'ab', // too short (<3)
          count: -1, // not positive
        },
      });

      expect(response.statusCode).toBe(400);
      const resBody = JSON.parse(response.payload);
      expect(resBody.error.code).toBe('VALIDATION_ERROR');
      expect(resBody.error.fields).toBeDefined();
      expect(resBody.error.fields.title).toBe('Title must be at least 3 characters');
      expect(resBody.error.fields.count).toBe('Count must be positive');
    });

    it('handles malformed JSON body safely without leaking syntax errors', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const response = await app.inject({
        method: 'POST',
        url: `/test/pipeline/${validUuid}`,
        headers: { 'content-type': 'application/json' },
        payload: '{"title": broken json',
      });

      expect(response.statusCode).toBe(400);
      const resBody = JSON.parse(response.payload);
      expect(resBody.error.code).toBe('VALIDATION_ERROR');
      expect(resBody.error.message).toBe('Invalid request payload');
      expect(resBody.error.requestId).toBeDefined();
    });

    it('maintains standard response envelopes for single and collection responses', async () => {
      // Single resource helper test
      const singleReply = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        send(payload) {
          return { statusCode: this.statusCode, payload };
        },
      };

      const singleRes = sendSuccess(singleReply, { id: 'task_123' }, 201);
      expect(singleRes.statusCode).toBe(201);
      expect(singleRes.payload).toEqual({ data: { id: 'task_123' } });

      // Collection response helper test
      const colReply = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        send(payload) {
          return { statusCode: this.statusCode, payload };
        },
      };

      const colRes = sendSuccess(colReply, [{ id: 'task_1' }, { id: 'task_2' }], 200, {
        limit: 20,
        cursor: null,
      });
      expect(colRes.statusCode).toBe(200);
      expect(colRes.payload).toEqual({
        data: [{ id: 'task_1' }, { id: 'task_2' }],
        pagination: { limit: 20, cursor: null },
      });
    });
  });

  describe('Error Model Hierarchy (Task 3.2)', () => {
    it('handles ValidationError correctly (400)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/validation' });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Validation failed');
      expect(body.error.fields).toEqual({ title: 'Required' });
    });

    it('handles AuthenticationRequiredError correctly (401)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/auth-required' });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(body.error.message).toBe('Missing token');
    });

    it('handles AuthenticationFailedError correctly (401)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/auth-failed' });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
      expect(body.error.message).toBe('Invalid credentials');
    });

    it('handles ForbiddenError correctly (403)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/forbidden' });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Insufficient permissions');
    });

    it('handles NotFoundError correctly (404)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/not-found' });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Task not found');
    });

    it('handles ConflictError correctly (409)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/conflict' });
      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Concurrent edit collision');
    });

    it('handles RateLimitedError correctly (429)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/rate-limit' });
      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.message).toBe('Too many attempts');
    });

    it('handles ExternalServiceError correctly (502)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/external' });
      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(body.error.message).toBe('Google Calendar API unavailable');
    });

    it('handles TemporaryFailureError correctly (503)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/temp-failure' });
      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('TEMPORARY_FAILURE');
      expect(body.error.message).toBe('Service temporarily unavailable');
    });

    it('handles InternalError correctly (500)', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/internal' });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An internal server error occurred');
    });

    it('sanitizes unhandled 500 errors and prevents database credential leakage', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/errors/unhandled' });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      // Must NOT contain sensitive credentials or SQL connection strings
      expect(body.error.message).toBe('An internal server error occurred');
      expect(body.error.message).not.toContain('postgresql');
      expect(body.error.message).not.toContain('secret');
      expect(body.stack).toBeUndefined();
      expect(body.error.stack).toBeUndefined();
    });

    it('formats error responses with formatErrorResponse standalone helper', () => {
      const formatted = formatErrorResponse(new NotFoundError('Entity missing'), 'req_custom_999');
      expect(formatted).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Entity missing',
          requestId: 'req_custom_999',
        },
      });
    });
  });
});
