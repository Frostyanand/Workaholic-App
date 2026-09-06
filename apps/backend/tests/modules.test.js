import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';

describe('Backend Application Structure & Domain Modules (Task 1.2)', () => {
  let app;

  beforeAll(async () => {
    app = createApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('provides public session status via auth module', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data).toEqual({
      authenticated: false,
      user: null,
    });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('rejects unauthenticated requests to protected domain modules with standard envelope', async () => {
    const endpoints = [
      '/api/v1/users/me',
      '/api/v1/workspaces',
      '/api/v1/tasks',
      '/api/v1/calendar/events',
      '/api/v1/notes',
    ];

    for (const url of endpoints) {
      const response = await app.inject({
        method: 'GET',
        url,
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(body.error.message).toBe('Authentication required');
      expect(body.error.requestId).toBeDefined();
      expect(response.headers['x-request-id']).toBe(body.error.requestId);
    }
  });

  it('propagates client-supplied x-request-id header across responses and error envelopes', async () => {
    const customReqId = 'custom-test-req-id-12345';
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        'x-request-id': customReqId,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['x-request-id']).toBe(customReqId);
    const body = JSON.parse(response.payload);
    expect(body.error.requestId).toBe(customReqId);
  });

  it('serves authenticated responses when user context is attached to request', async () => {
    // Create an app instance with an auth simulation hook
    const authApp = createApp({ logger: false });
    const mockUser = {
      id: 'usr_mock_123',
      email: 'pilot@workaholic.local',
      displayName: 'Pilot User',
    };

    authApp.addHook('preHandler', async request => {
      request.user = mockUser;
      request.workspace = { id: 'ws_mock_123' };
    });

    await authApp.ready();

    // /users/me
    const userRes = await authApp.inject({
      method: 'GET',
      url: '/api/v1/users/me',
    });
    expect(userRes.statusCode).toBe(200);
    const userBody = JSON.parse(userRes.payload);
    expect(userBody.data).toEqual(mockUser);

    // /workspaces
    const wsRes = await authApp.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
    });
    expect(wsRes.statusCode).toBe(200);
    const wsBody = JSON.parse(wsRes.payload);
    expect(Array.isArray(wsBody.data)).toBe(true);

    // /tasks
    const taskRes = await authApp.inject({
      method: 'GET',
      url: '/api/v1/tasks',
    });
    expect(taskRes.statusCode).toBe(200);
    const taskBody = JSON.parse(taskRes.payload);
    expect(Array.isArray(taskBody.data)).toBe(true);
    expect(taskBody.pagination).toEqual({ limit: 50, offset: 0, total: 0 });

    // /calendar/events
    const calRes = await authApp.inject({
      method: 'GET',
      url: '/api/v1/calendar/events',
    });
    expect(calRes.statusCode).toBe(200);
    const calBody = JSON.parse(calRes.payload);
    expect(Array.isArray(calBody.data)).toBe(true);

    // /notes
    const noteRes = await authApp.inject({
      method: 'GET',
      url: '/api/v1/notes',
    });
    expect(noteRes.statusCode).toBe(200);
    const noteBody = JSON.parse(noteRes.payload);
    expect(Array.isArray(noteBody.data)).toBe(true);
    expect(noteBody.pagination).toEqual({ limit: 50, offset: 0, total: 0 });

    await authApp.close();
  });
});
