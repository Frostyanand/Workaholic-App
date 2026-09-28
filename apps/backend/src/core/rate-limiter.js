import { RateLimitedError } from './errors.js';

/**
 * In-Memory Sliding-Window Rate Limiter for Fastify.
 * Conforms to docs/12.PRIVACY-SECURITY.md Section 51, docs/15.API-SPECIFICATION.md Section 75,
 * and REQ-SEC-006.
 *
 * Strict constraint: Pure JavaScript, zero external services (no Redis/Kafka/microservices).
 */
export class MemoryRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute default
    this.max = options.max || 60; // 60 requests per window
    this.hits = new Map();

    // Clean up expired buckets periodically (every 2 minutes)
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Cleans up expired rate-limit records to avoid memory leaks.
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (now > record.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  /**
   * Resets all tracked records (useful for test isolation).
   */
  reset() {
    this.hits.clear();
  }

  /**
   * Destroys timer on server shutdown.
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.hits.clear();
  }

  /**
   * Resolves client IP identifier safely.
   */
  getClientKey(request) {
    const forwarded = request.headers['x-forwarded-for'];
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : request.socket?.remoteAddress || '127.0.0.1';
    return ip;
  }

  /**
   * Generates a Fastify preHandler hook for a specific route or route group.
   * @param {Object} [overrideOptions]
   * @param {number} [overrideOptions.max]
   * @param {number} [overrideOptions.windowMs]
   * @param {string} [overrideOptions.bucket]
   */
  createPreHandler(overrideOptions = {}) {
    const max = overrideOptions.max || this.max;
    const windowMs = overrideOptions.windowMs || this.windowMs;
    const bucket = overrideOptions.bucket || 'default';

    return async (request, reply) => {
      // Allow bypass in test mode unless x-test-rate-limit header is explicitly provided
      if (
        process.env.NODE_ENV === 'test' &&
        !request.headers['x-test-rate-limit'] &&
        !overrideOptions.forceInTest
      ) {
        return;
      }

      const clientKey = this.getClientKey(request);
      const key = `${bucket}:${clientKey}`;
      const now = Date.now();

      let record = this.hits.get(key);
      if (!record || now > record.resetTime) {
        record = {
          count: 1,
          resetTime: now + windowMs,
        };
        this.hits.set(key, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, max - record.count);
      const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

      reply.header('RateLimit-Limit', max);
      reply.header('RateLimit-Remaining', remaining);
      reply.header('RateLimit-Reset', resetSeconds);

      if (record.count > max) {
        reply.header('Retry-After', resetSeconds);
        throw new RateLimitedError(
          `Too many requests. Rate limit of ${max} requests per ${Math.round(windowMs / 1000)}s exceeded. Please try again in ${resetSeconds} seconds.`,
        );
      }
    };
  }
}

export const rateLimiter = new MemoryRateLimiter();

// Pre-configured rate-limiting preHandlers for specific sensitivity profiles
export const authRateLimit = rateLimiter.createPreHandler({
  bucket: 'auth',
  max: 30,
  windowMs: 60 * 1000,
});

export const publicEndpointRateLimit = rateLimiter.createPreHandler({
  bucket: 'public',
  max: 60,
  windowMs: 60 * 1000,
});

export const bookingRateLimit = rateLimiter.createPreHandler({
  bucket: 'booking',
  max: 30,
  windowMs: 60 * 1000,
});

export const shareCodeRateLimit = rateLimiter.createPreHandler({
  bucket: 'sharing',
  max: 20,
  windowMs: 60 * 1000,
});
