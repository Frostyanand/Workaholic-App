import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  createSubtaskSchema,
  createDependencySchema,
  createTaskLinkSchema,
  createLabelSchema,
  assignLabelSchema,
  createWorkBlockSchema,
} from '@workaholic/shared';
import { tasksService } from './tasks.service.js';

const taskIdParamsSchema = z.object({
  id: idSchema,
});

const labelIdParamsSchema = z.object({
  labelId: idSchema,
});

const taskLabelParamsSchema = z.object({
  id: idSchema,
  labelId: idSchema,
});

const taskDependencyParamsSchema = z.object({
  id: idSchema,
  dependencyId: idSchema,
});

const taskLinkParamsSchema = z.object({
  id: idSchema,
  linkId: idSchema,
});

const taskWorkBlockParamsSchema = z.object({
  id: idSchema,
  blockId: idSchema,
});

/**
 * Tasks module route definitions conforming to API-SPECIFICATION.md Section 31-34.
 */
export async function tasksRoutes(fastify, _opts) {
  // Pre-handler hook enforcing authentication and workspace authorization
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // ---------------------------------------------------------
  // Label routes (defined before /:id to prevent route shadowing)
  // ---------------------------------------------------------
  fastify.get(
    '/labels',
    {
      preHandler: authHooks,
    },
    async (request, reply) => {
      const labels = await tasksService.listLabels(request.workspace.id);
      return sendSuccess(reply, labels);
    },
  );

  fastify.post(
    '/labels',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ body: createLabelSchema })],
    },
    async (request, reply) => {
      const label = await tasksService.createLabel(request.workspace.id, request.validated.body);
      return sendSuccess(reply, label, 201);
    },
  );

  fastify.delete(
    '/labels/:labelId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: labelIdParamsSchema })],
    },
    async (request, reply) => {
      await tasksService.deleteLabel(request.params.labelId, request.workspace.id);
      return sendSuccess(reply, { success: true });
    },
  );

  // ---------------------------------------------------------
  // Task collection routes
  // ---------------------------------------------------------
  fastify.get(
    '/',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ query: taskQuerySchema })],
    },
    async (request, reply) => {
      const queryParams = request.validated.query;
      const { limit = 50, offset = 0, ...filters } = queryParams;

      try {
        const result = await tasksService.listTasks(request.workspace.id, filters, {
          limit,
          offset,
        });

        return sendSuccess(reply, result.tasks, 200, {
          limit: result.limit,
          offset: result.offset,
          total: result.total,
        });
      } catch (err) {
        if (err.code === '22P02') {
          return sendSuccess(reply, [], 200, { limit, offset, total: 0 });
        }
        throw err;
      }
    },
  );

  fastify.post(
    '/',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ body: createTaskSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.createTask(
        request.workspace.id,
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, task, 201);
    },
  );

  // ---------------------------------------------------------
  // Individual task routes
  // ---------------------------------------------------------
  fastify.get(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.getTaskById(request.params.id, request.workspace.id);
      return sendSuccess(reply, task);
    },
  );

  fastify.patch(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: taskIdParamsSchema,
          body: updateTaskSchema,
        }),
      ],
    },
    async (request, reply) => {
      const task = await tasksService.updateTask(
        request.params.id,
        request.workspace.id,
        request.validated.body,
      );
      return sendSuccess(reply, task);
    },
  );

  fastify.delete(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.deleteTask(request.params.id, request.workspace.id);
      return sendSuccess(reply, task);
    },
  );

  fastify.post(
    '/:id/complete',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.completeTask(
        request.params.id,
        request.workspace.id,
        request.user.id,
      );
      return sendSuccess(reply, task);
    },
  );

  fastify.post(
    '/:id/reopen',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.reopenTask(
        request.params.id,
        request.workspace.id,
        request.user.id,
      );
      return sendSuccess(reply, task);
    },
  );

  fastify.post(
    '/:id/restore',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.restoreTask(request.params.id, request.workspace.id);
      return sendSuccess(reply, task);
    },
  );

  // ---------------------------------------------------------
  // Subtasks
  // ---------------------------------------------------------
  fastify.get(
    '/:id/subtasks',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.getTaskById(request.params.id, request.workspace.id);
      return sendSuccess(reply, task.subtasks);
    },
  );

  fastify.post(
    '/:id/subtasks',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: taskIdParamsSchema,
          body: createSubtaskSchema,
        }),
      ],
    },
    async (request, reply) => {
      const subtask = await tasksService.createSubtask(
        request.params.id,
        request.workspace.id,
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, subtask, 201);
    },
  );

  // ---------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------
  fastify.get(
    '/:id/dependencies',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.getTaskById(request.params.id, request.workspace.id);
      return sendSuccess(reply, task.dependencies);
    },
  );

  fastify.post(
    '/:id/dependencies',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: taskIdParamsSchema,
          body: createDependencySchema,
        }),
      ],
    },
    async (request, reply) => {
      const dependency = await tasksService.addDependency(
        request.params.id,
        request.workspace.id,
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, dependency, 201);
    },
  );

  fastify.delete(
    '/:id/dependencies/:dependencyId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskDependencyParamsSchema })],
    },
    async (request, reply) => {
      await tasksService.removeDependency(
        request.params.id,
        request.workspace.id,
        request.params.dependencyId,
      );
      return sendSuccess(reply, { success: true });
    },
  );

  // ---------------------------------------------------------
  // Task Labels
  // ---------------------------------------------------------
  fastify.post(
    '/:id/labels',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: taskIdParamsSchema,
          body: assignLabelSchema,
        }),
      ],
    },
    async (request, reply) => {
      const result = await tasksService.addLabelToTask(
        request.params.id,
        request.workspace.id,
        request.validated.body.labelId,
      );
      return sendSuccess(reply, result, 201);
    },
  );

  fastify.delete(
    '/:id/labels/:labelId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskLabelParamsSchema })],
    },
    async (request, reply) => {
      const result = await tasksService.removeLabelFromTask(
        request.params.id,
        request.workspace.id,
        request.params.labelId,
      );
      return sendSuccess(reply, result);
    },
  );

  // ---------------------------------------------------------
  // Task Links
  // ---------------------------------------------------------
  fastify.get(
    '/:id/links',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.getTaskById(request.params.id, request.workspace.id);
      return sendSuccess(reply, task.links);
    },
  );

  fastify.post(
    '/:id/links',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: taskIdParamsSchema,
          body: createTaskLinkSchema,
        }),
      ],
    },
    async (request, reply) => {
      const link = await tasksService.addLinkToTask(
        request.params.id,
        request.workspace.id,
        request.validated.body,
      );
      return sendSuccess(reply, link, 201);
    },
  );

  fastify.delete(
    '/:id/links/:linkId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskLinkParamsSchema })],
    },
    async (request, reply) => {
      const result = await tasksService.removeLinkFromTask(
        request.params.id,
        request.workspace.id,
        request.params.linkId,
      );
      return sendSuccess(reply, result);
    },
  );

  // ---------------------------------------------------------
  // Scheduled Work Blocks
  // ---------------------------------------------------------
  fastify.get(
    '/:id/work-blocks',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskIdParamsSchema })],
    },
    async (request, reply) => {
      const task = await tasksService.getTaskById(request.params.id, request.workspace.id);
      return sendSuccess(reply, task.workBlocks);
    },
  );

  fastify.post(
    '/:id/work-blocks',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: taskIdParamsSchema,
          body: createWorkBlockSchema,
        }),
      ],
    },
    async (request, reply) => {
      const block = await tasksService.createWorkBlock(
        request.params.id,
        request.workspace.id,
        request.validated.body,
      );
      return sendSuccess(reply, block, 201);
    },
  );

  fastify.delete(
    '/:id/work-blocks/:blockId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: taskWorkBlockParamsSchema })],
    },
    async (request, reply) => {
      const result = await tasksService.removeWorkBlock(
        request.params.id,
        request.workspace.id,
        request.params.blockId,
      );
      return sendSuccess(reply, result);
    },
  );
}
