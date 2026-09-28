import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRateLimiter } from '../src/core/rate-limiter.js';
import { createApp } from '../src/app.js';

describe('In-Memory Rate Limiting (Phase 4 / Privacy & Security §51)', () => {
  let app;
  let limiter;

  beforeEach(async () => {
    limiter = new MemoryRateLimiter({ max: 3, windowMs: 1000 });
    app = createApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    limiter.destroy();
    await app.close();
  });

  it('allows requests within configured maximum limit', async () => {
    const handler = limiter.createPreHandler({ max: 3, windowMs: 1000, forceInTest: true });
    const mockReply = {
      headers: {},
      header(name, val) {
        this.headers[name] = val;
      },
    };
    const mockRequest = {
      headers: {},
      socket: { remoteAddress: '192.168.1.100' },
    };

    // First 3 requests should pass
    await expect(handler(mockRequest, mockReply)).resolves.toBeUndefined();
    expect(mockReply.headers['RateLimit-Remaining']).toBe(2);

    await expect(handler(mockRequest, mockReply)).resolves.toBeUndefined();
    expect(mockReply.headers['RateLimit-Remaining']).toBe(1);

    await expect(handler(mockRequest, mockReply)).resolves.toBeUndefined();
    expect(mockReply.headers['RateLimit-Remaining']).toBe(0);
  });

  it('rejects requests exceeding limit with RateLimitedError and 429 status', async () => {
    const handler = limiter.createPreHandler({ max: 2, windowMs: 1000, forceInTest: true });
    const mockReply = {
      headers: {},
      header(name, val) {
        this.headers[name] = val;
      },
    };
    const mockRequest = {
      headers: {},
      socket: { remoteAddress: '192.168.1.101' },
    };

    // 2 allowed requests
    await handler(mockRequest, mockReply);
    await handler(mockRequest, mockReply);

    // 3rd request must throw RateLimitedError
    await expect(handler(mockRequest, mockReply)).rejects.toThrow(/Rate limit/i);
    expect(mockReply.headers['Retry-After']).toBeDefined();
  });

  it('enforces rate limits on public calendar endpoint via HTTP', async () => {
    const testApp = createApp({ logger: false });
    await testApp.ready();

    // Send 65 rapid requests with x-test-rate-limit to public calendar route
    const responses = [];
    for (let i = 0; i < 65; i++) {
      const res = await testApp.inject({
        method: 'GET',
        url: '/public/calendars/test-token-rate-limit-12345',
        headers: {
          'x-test-rate-limit': 'true',
          'x-forwarded-for': '203.0.113.195',
        },
      });
      responses.push(res);
    }

    await testApp.close();

    // Initial requests may be 404 (not found) or 200, but subsequent must be 429
    const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);

    const first429 = rateLimitedResponses[0];
    const body = first429.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(first429.headers['retry-after']).toBeDefined();
    expect(first429.headers['ratelimit-limit']).toBe('60');
  });

  it('enforces rate limits on public booking endpoint via HTTP', async () => {
    const testApp = createApp({ logger: false });
    await testApp.ready();

    // Public booking has max 30 per minute
    const responses = [];
    for (let i = 0; i < 35; i++) {
      const res = await testApp.inject({
        method: 'GET',
        url: '/booking-pages/demo-page-slug',
        headers: {
          'x-test-rate-limit': 'true',
          'x-forwarded-for': '198.51.100.42',
        },
      });
      responses.push(res);
    }

    await testApp.close();

    const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);

    const first429 = rateLimitedResponses[0];
    const body = first429.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(first429.headers['retry-after']).toBeDefined();
    expect(first429.headers['ratelimit-limit']).toBe('30');
  });
});
