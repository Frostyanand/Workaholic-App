import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool } from '../src/core/db.js';

describe('Backend Health & Core API Pipeline', () => {
  let app;

  beforeAll(async () => {
    app = createApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it('GET /api/v1/health returns 200 with service status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe('ok');
    expect(body.data.service).toBe('workaholic-backend');
    expect(body.data.timestamp).toBeDefined();
  });

  it('generates and echoes x-request-id header', async () => {
    const customReqId = 'custom-test-req-id-12345';
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        'x-request-id': customReqId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(customReqId);
  });

  it('formats 404 errors matching API-SPECIFICATION.md envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nonexistent-route',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBeDefined();
    expect(body.error.requestId).toBeDefined();
  });
});
