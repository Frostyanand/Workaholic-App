import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createReminderSchema,
  updateReminderSchema,
  snoozeReminderSchema,
  dismissReminderSchema,
  addRecipientSchema,
  listRemindersQuerySchema,
} from '@workaholic/shared';
import { remindersService } from './reminders.service.js';

const reminderIdParamsSchema = z.object({
  id: idSchema,
});

const reminderRecipientParamsSchema = z.object({
  id: idSchema,
  recipientId: idSchema,
});

/**
 * Reminders route definitions conforming to docs/15.API-SPECIFICATION.md Section 48 & 49.
 */
export async function remindersRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // 1. List Reminders
  fastify.get(
    '/',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ query: listRemindersQuerySchema })],
    },
    async (request, reply) => {
      const reminders = await remindersService.listReminders({
        ...request.validated.query,
        workspaceId: request.workspace.id,
      });
      return sendSuccess(reply, reminders);
    },
  );

  // 2. Create Reminder
  fastify.post(
    '/',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ body: createReminderSchema })],
    },
    async (request, reply) => {
      const reminder = await remindersService.createReminder(
        {
          ...request.validated.body,
          workspaceId: request.workspace.id,
        },
        request.user,
      );
      return sendSuccess(reply, reminder, 201);
    },
  );

  // 3. Get Reminder Details
  fastify.get(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: reminderIdParamsSchema })],
    },
    async (request, reply) => {
      const reminder = await remindersService.getReminder(request.params.id, request.workspace.id);
      return sendSuccess(reply, reminder);
    },
  );

  // 4. Update Reminder
  fastify.patch(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({ params: reminderIdParamsSchema, body: updateReminderSchema }),
      ],
    },
    async (request, reply) => {
      const updated = await remindersService.updateReminder(
        request.params.id,
        request.validated.body,
        request.workspace.id,
      );
      return sendSuccess(reply, updated);
    },
  );

  // 5. Delete Reminder
  fastify.delete(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: reminderIdParamsSchema })],
    },
    async (request, reply) => {
      await remindersService.deleteReminder(request.params.id, request.workspace.id);
      return sendSuccess(reply, { deleted: true });
    },
  );

  // 6. Snooze Reminder (User-specific action)
  fastify.post(
    '/:id/snooze',
    {
      preHandler: [requireAuth],
      preValidation: [
        validateRequest({ params: reminderIdParamsSchema, body: snoozeReminderSchema }),
      ],
    },
    async (request, reply) => {
      const result = await remindersService.snoozeReminder(
        request.params.id,
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, result);
    },
  );

  // 7. Dismiss Reminder (User-specific action)
  fastify.post(
    '/:id/dismiss',
    {
      preHandler: [requireAuth],
      preValidation: [
        validateRequest({ params: reminderIdParamsSchema, body: dismissReminderSchema }),
      ],
    },
    async (request, reply) => {
      const result = await remindersService.dismissReminder(
        request.params.id,
        request.user.id,
        request.validated.body || {},
      );
      return sendSuccess(reply, result);
    },
  );

  // 8. Add Shared Recipient
  fastify.post(
    '/:id/recipients',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({ params: reminderIdParamsSchema, body: addRecipientSchema }),
      ],
    },
    async (request, reply) => {
      const result = await remindersService.addRecipient(
        request.params.id,
        request.validated.body.userId,
        request.user,
        request.workspace.id,
      );
      return sendSuccess(reply, result, 201);
    },
  );

  // 9. Remove Shared Recipient
  fastify.delete(
    '/:id/recipients/:recipientId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: reminderRecipientParamsSchema })],
    },
    async (request, reply) => {
      await remindersService.removeRecipient(
        request.params.id,
        request.params.recipientId,
        request.user,
        request.workspace.id,
      );
      return sendSuccess(reply, { removed: true });
    },
  );
}
