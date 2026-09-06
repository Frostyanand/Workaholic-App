import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';

describe('Observability Foundation (Task 3.7)', () => {
  let app;

  beforeAll(async () => {
    app = createApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Response Headers & Request Correlation', () => {
    it('returns x-request-id and x-response-time headers on successful requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-response-time']).toBeDefined();
      expect(res.headers['x-response-time']).toMatch(/^\d+(\.\d+)?ms$/);
    });

    it('propagates custom client x-request-id header', async () => {
      const customId = 'trace_req_obs_12345';
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          'x-request-id': customId,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('includes x-response-time on error responses as well', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/non-existent-route-xyz',
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-response-time']).toBeDefined();
    });
  });

  describe('Health and Readiness Probes', () => {
    it('GET /api/v1/health reports basic liveness', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('ok');
      expect(body.data.service).toBe('workaholic-backend');
      expect(body.data.timestamp).toBeDefined();
    });

    it('GET /api/v1/health/db reports live PostgreSQL connection and pool metrics', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health/db',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('ok');
      expect(body.data.database).toBe('connected');
      expect(body.data.pool).toBeDefined();
      expect(typeof body.data.pool.totalCount).toBe('number');
      expect(typeof body.data.pool.idleCount).toBe('number');
      expect(typeof body.data.pool.waitingCount).toBe('number');
    });

    it('GET /api/v1/health/queue reports background job queue metrics', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health/queue',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('ok');
      expect(body.data.queue).toBeDefined();
      expect(body.data.queue.queue).toBe('default');
      expect(typeof body.data.queue.total).toBe('number');
      expect(typeof body.data.queue.PENDING).toBe('number');
    });

    it('GET /api/v1/health/ready reports comprehensive readiness status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('ready');
      expect(body.data.checks.database).toBe('connected');
      expect(body.data.checks.queue).toBe('ready');
      expect(body.data.pool).toBeDefined();
      expect(body.data.queue).toBeDefined();
    });
  });

  describe('Structured Logging Output', () => {
    it('captures structured completion log entries', async () => {
      const loggedItems = [];
      const customLogger = {
        info: item => loggedItems.push(item),
        error: item => loggedItems.push(item),
        warn: item => loggedItems.push(item),
        fatal: item => loggedItems.push(item),
        trace: () => {},
        debug: () => {},
        child: () => customLogger,
      };

      const loggedApp = createApp({ logger: customLogger });
      await loggedApp.ready();

      await loggedApp.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      await loggedApp.close();

      const completionLog = loggedItems.find(item => item && item.method === 'GET');
      expect(completionLog).toBeDefined();
      expect(completionLog.url).toBe('/api/v1/health');
      expect(completionLog.statusCode).toBe(200);
      expect(typeof completionLog.durationMs).toBe('number');
      expect(completionLog.reqId).toBeDefined();
    });
  });
});
