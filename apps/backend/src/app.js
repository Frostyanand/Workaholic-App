import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { randomUUID } from 'node:crypto';
import { config } from './core/config.js';
import { formatErrorResponse } from './core/errors.js';
import { healthRoutes } from './modules/health/health.routes.js';

export function createApp(opts = {}) {
  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : { level: config.logLevel },
    genReqId: req => req.headers['x-request-id'] || randomUUID(),
    ...opts,
  });

  // Security headers & CORS
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, {
    origin: config.clientUrl || true,
    credentials: true,
  });

  // Standard API response header
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  // Global Not Found Handler matching API-SPECIFICATION.md
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  });

  // Global Error Handler matching API-SPECIFICATION.md
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      request.log.error({ err: error, reqId: request.id }, 'Unhandled server error');
    }
    const formatted = formatErrorResponse(error, request.id);
    return reply.status(statusCode).send(formatted);
  });

  // Domain Routes
  app.register(healthRoutes, { prefix: '/api/v1' });

  return app;
}
