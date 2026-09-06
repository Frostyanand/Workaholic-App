import { testConnection, getPoolMetrics } from '../../core/db.js';
import { getQueueMetrics } from '../../core/jobs.repository.js';
import { sendSuccess } from '../../core/response.js';

/**
 * Health & Readiness Probes
 * Conforms to docs/6.SYSTEM-ARCHITECTURE.md Section 58 & docs/15.API-SPECIFICATION.md
 */
export async function healthRoutes(fastify, _opts) {
  // Liveness probe — process is alive
  fastify.get('/health', async (_request, reply) => {
    return sendSuccess(reply, {
      status: 'ok',
      service: 'workaholic-backend',
      timestamp: new Date().toISOString(),
    });
  });

  // Database readiness probe — PostgreSQL connection & pool metrics
  fastify.get('/health/db', async (request, reply) => {
    try {
      const dbInfo = await testConnection();
      return sendSuccess(reply, {
        status: 'ok',
        database: 'connected',
        timestamp: dbInfo.current_time,
        pool: getPoolMetrics(),
      });
    } catch (err) {
      fastify.log.warn({ err, reqId: request.id }, 'Health database check failed');
      return reply.status(503).send({
        error: {
          code: 'TEMPORARY_FAILURE',
          message: 'Database is currently unavailable',
          requestId: request.id,
        },
      });
    }
  });

  // Queue readiness probe — Background jobs queue metrics
  fastify.get('/health/queue', async (_request, reply) => {
    const queueMetrics = await getQueueMetrics();
    return sendSuccess(reply, {
      status: 'ok',
      queue: queueMetrics,
    });
  });

  // Comprehensive readiness probe — DB + Queue ready for traffic
  fastify.get('/health/ready', async (request, reply) => {
    try {
      const dbInfo = await testConnection();
      const queueMetrics = await getQueueMetrics();

      return sendSuccess(reply, {
        status: 'ready',
        service: 'workaholic-backend',
        timestamp: dbInfo.current_time,
        checks: {
          database: 'connected',
          queue: 'ready',
        },
        pool: getPoolMetrics(),
        queue: queueMetrics,
      });
    } catch (err) {
      fastify.log.warn({ err, reqId: request.id }, 'Full readiness check failed');
      return reply.status(503).send({
        error: {
          code: 'TEMPORARY_FAILURE',
          message: 'Service is temporarily not ready to accept traffic',
          requestId: request.id,
        },
      });
    }
  });
}
