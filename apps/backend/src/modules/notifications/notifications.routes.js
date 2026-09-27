import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  listNotificationsQuerySchema,
  notificationPreferencesSchema,
} from '@workaholic/shared';
import { notificationsService } from './notifications.service.js';

const notificationIdParamsSchema = z.object({
  id: idSchema,
});

/**
 * Notifications route definitions conforming to docs/15.API-SPECIFICATION.md Section 50 & 51.
 */
export async function notificationsRoutes(fastify, _opts) {
  // All notification endpoints are user-scoped and require authentication
  fastify.addHook('preHandler', requireAuth);

  // 1. List Notifications for Current User
  fastify.get(
    '/',
    {
      preValidation: [validateRequest({ query: listNotificationsQuerySchema })],
    },
    async (request, reply) => {
      const notifications = await notificationsService.listNotifications(
        request.validated.query,
        request.user.id,
      );
      return sendSuccess(reply, notifications);
    },
  );

  // 2. Unread Count Badge
  fastify.get('/unread-count', async (request, reply) => {
    const count = await notificationsService.getUnreadCount(request.user.id);
    return sendSuccess(reply, { count });
  });

  // 3. Mark Single Notification Read
  fastify.post(
    '/:id/read',
    {
      preValidation: [validateRequest({ params: notificationIdParamsSchema })],
    },
    async (request, reply) => {
      const updated = await notificationsService.markAsRead(request.params.id, request.user.id);
      return sendSuccess(reply, updated);
    },
  );

  // 4. Dismiss Single Notification
  fastify.post(
    '/:id/dismiss',
    {
      preValidation: [validateRequest({ params: notificationIdParamsSchema })],
    },
    async (request, reply) => {
      const updated = await notificationsService.markAsDismissed(
        request.params.id,
        request.user.id,
      );
      return sendSuccess(reply, updated);
    },
  );

  // 5. Mark All Read
  fastify.post('/read-all', async (request, reply) => {
    const count = await notificationsService.markAllAsRead(request.user.id);
    return sendSuccess(reply, { markedRead: count });
  });
}

/**
 * Notification Preferences route definitions conforming to Section 51
 */
export async function notificationPreferencesRoutes(fastify, _opts) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async (request, reply) => {
    const preferences = await notificationsService.getPreferences(request.user.id);
    return sendSuccess(reply, preferences);
  });

  fastify.patch(
    '/',
    {
      preValidation: [validateRequest({ body: notificationPreferencesSchema })],
    },
    async (request, reply) => {
      const updated = await notificationsService.updatePreferences(
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, updated);
    },
  );
}
