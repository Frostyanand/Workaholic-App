import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { randomUUID } from 'node:crypto';
import { config } from './core/config.js';
import { formatErrorResponse } from './core/errors.js';
import { setupRequestContext } from './core/request-context.js';
import { authenticateRequest } from './modules/auth/auth.middleware.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { workspacesRoutes } from './modules/workspaces/workspaces.routes.js';
import { tasksRoutes } from './modules/tasks/tasks.routes.js';
import { calendarRoutes } from './modules/calendar/calendar.routes.js';
import { notesRoutes } from './modules/notes/notes.routes.js';

export function createApp(opts = {}) {
  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : { level: config.logLevel },
    genReqId: req => req.headers['x-request-id'] || randomUUID(),
    ...opts,
  });

  // Request context decorators (user, workspace, session)
  setupRequestContext(app);

  // Global authentication extraction preHandler hook
  app.addHook('preHandler', authenticateRequest);

  // Security headers & CORS
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, {
    origin: config.clientUrl || true,
    credentials: true,
  });

  // Request start timing for observability
  app.addHook('onRequest', async request => {
    request.startTime = process.hrtime.bigint();
  });

  // Standard API response headers (x-request-id & x-response-time)
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    if (request.startTime) {
      const diffNs = process.hrtime.bigint() - request.startTime;
      const ms = Number(diffNs) / 1e6;
      reply.header('x-response-time', `${ms.toFixed(2)}ms`);
    }
    return payload;
  });

  // Structured request completion log
  app.addHook('onResponse', async (request, reply) => {
    if (request.startTime && request.log) {
      const diffNs = process.hrtime.bigint() - request.startTime;
      const durationMs = Number((Number(diffNs) / 1e6).toFixed(2));
      request.log.info(
        {
          reqId: request.id,
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          durationMs,
          userId: request.user?.id || null,
          workspaceId: request.workspace?.id || null,
        },
        'Request completed',
      );
    }
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
    let statusCode = error.statusCode || 500;
    if (error.name === 'SyntaxError' || error.code?.startsWith('FST_ERR_CTP')) {
      statusCode = 400;
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      error.message = 'Invalid request payload';
    }

    if (statusCode >= 500) {
      request.log.error({ err: error, reqId: request.id }, 'Unhandled server error');
    }
    const formatted = formatErrorResponse(error, request.id);
    return reply.status(statusCode).send(formatted);
  });

  // Domain Module Routes
  app.register(healthRoutes, { prefix: '/api/v1' });
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(usersRoutes, { prefix: '/api/v1/users' });
  app.register(workspacesRoutes, { prefix: '/api/v1/workspaces' });
  app.register(tasksRoutes, { prefix: '/api/v1/tasks' });
  app.register(calendarRoutes, { prefix: '/api/v1/calendar' });
  app.register(notesRoutes, { prefix: '/api/v1/notes' });

  return app;
}
