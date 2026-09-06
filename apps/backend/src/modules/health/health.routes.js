import { testConnection } from '../../core/db.js';

export async function healthRoutes(fastify, _opts) {
  // Liveness check - process is alive
  fastify.get('/health', async (request, reply) => {
    return reply.status(200).send({
      data: {
        status: 'ok',
        service: 'workaholic-backend',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Readiness check - database connection is available
  fastify.get('/health/db', async (request, reply) => {
    try {
      const dbInfo = await testConnection();
      return reply.status(200).send({
        data: {
          status: 'ok',
          database: 'connected',
          timestamp: dbInfo.current_time,
        },
      });
    } catch (err) {
      fastify.log.warn({ err }, 'Health database check failed');
      return reply.status(503).send({
        error: {
          code: 'TEMPORARY_FAILURE',
          message: 'Database is currently unavailable',
          requestId: request.id,
        },
      });
    }
  });
}
