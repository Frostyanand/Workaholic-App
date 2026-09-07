import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createBoardSchema,
  updateBoardSchema,
  boardQuerySchema,
  createBoardColumnSchema,
  updateBoardColumnSchema,
  reorderBoardColumnsSchema,
  moveBoardTaskSchema,
  taskQuerySchema,
} from '@workaholic/shared';
import { boardsService } from './boards.service.js';
import { tasksService } from '../tasks/tasks.service.js';

const boardIdParamsSchema = z.object({
  id: idSchema,
});

const columnIdParamsSchema = z.object({
  id: idSchema,
});

const boardColumnParamsSchema = z.object({
  id: idSchema,
  columnId: idSchema,
});

const boardTaskMoveParamsSchema = z.object({
  id: idSchema,
  taskId: idSchema,
});

/**
 * Boards module route definitions conforming to API-SPECIFICATION.md Section 36
 */
export async function boardsRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // 1. GET /api/v1/boards
  fastify.get(
    '/',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ query: boardQuerySchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const { boards, total } = await boardsService.listBoards(workspaceId, request.query);

      return sendSuccess(reply, boards, 200, {
        total,
        limit: request.query.limit || 50,
        offset: request.query.offset || 0,
      });
    },
  );

  // 2. POST /api/v1/boards
  fastify.post(
    '/',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ body: createBoardSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const userId = request.user.id;
      const board = await boardsService.createBoard(workspaceId, userId, request.body);

      return sendSuccess(reply, board, 201);
    },
  );

  // 3. GET /api/v1/boards/:id
  fastify.get(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: boardIdParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const board = await boardsService.getBoardById(request.params.id, workspaceId);

      return sendSuccess(reply, board);
    },
  );

  // 4. PATCH /api/v1/boards/:id
  fastify.patch(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: boardIdParamsSchema,
        body: updateBoardSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const updated = await boardsService.updateBoard(request.params.id, workspaceId, request.body);

      return sendSuccess(reply, updated);
    },
  );

  // 5. DELETE /api/v1/boards/:id
  fastify.delete(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: boardIdParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const deleted = await boardsService.deleteBoard(request.params.id, workspaceId);

      return sendSuccess(reply, deleted);
    },
  );

  // 6. POST /api/v1/boards/:id/restore
  fastify.post(
    '/:id/restore',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: boardIdParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const restored = await boardsService.restoreBoard(request.params.id, workspaceId);

      return sendSuccess(reply, restored);
    },
  );

  // 7. GET /api/v1/boards/:id/tasks
  fastify.get(
    '/:id/tasks',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: boardIdParamsSchema,
        query: taskQuerySchema.partial(),
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      // Ensure board exists in this workspace
      await boardsService.getBoardById(request.params.id, workspaceId);

      const filters = {
        ...request.query,
        boardId: request.params.id,
      };

      const result = await tasksService.listTasks(workspaceId, filters, {
        limit: request.query.limit || 100,
        offset: request.query.offset || 0,
      });

      return sendSuccess(reply, result.tasks, 200, {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      });
    },
  );

  // 8. POST /api/v1/boards/:id/columns
  fastify.post(
    '/:id/columns',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: boardIdParamsSchema,
        body: createBoardColumnSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const column = await boardsService.createColumn(request.params.id, workspaceId, request.body);

      return sendSuccess(reply, column, 201);
    },
  );

  // 9. PATCH /api/v1/boards/:id/columns/:columnId
  fastify.patch(
    '/:id/columns/:columnId',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: boardColumnParamsSchema,
        body: updateBoardColumnSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const updated = await boardsService.updateColumn(
        request.params.columnId,
        workspaceId,
        request.body,
      );

      return sendSuccess(reply, updated);
    },
  );

  // 10. DELETE /api/v1/boards/:id/columns/:columnId
  fastify.delete(
    '/:id/columns/:columnId',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: boardColumnParamsSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const deleted = await boardsService.deleteColumn(request.params.columnId, workspaceId);

      return sendSuccess(reply, deleted);
    },
  );

  // 11. PUT /api/v1/boards/:id/columns/reorder
  fastify.put(
    '/:id/columns/reorder',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: boardIdParamsSchema,
        body: reorderBoardColumnsSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const reordered = await boardsService.reorderColumns(
        request.params.id,
        workspaceId,
        request.body.columnIds,
      );

      return sendSuccess(reply, reordered);
    },
  );

  // 12. POST /api/v1/boards/:id/tasks/:taskId/move
  fastify.post(
    '/:id/tasks/:taskId/move',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: boardTaskMoveParamsSchema,
        body: moveBoardTaskSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      // Ensure board belongs to workspace
      await boardsService.getBoardById(request.params.id, workspaceId);

      const moved = await tasksService.moveTaskToColumn(
        request.params.taskId,
        workspaceId,
        request.body.columnId,
        request.body.status,
      );

      return sendSuccess(reply, moved);
    },
  );
}

/**
 * Direct column route definitions conforming to API-SPECIFICATION.md Section 36
 * PATCH /columns/:id
 * DELETE /columns/:id
 */
export async function columnsRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  fastify.patch(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: columnIdParamsSchema,
        body: updateBoardColumnSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const updated = await boardsService.updateColumn(
        request.params.id,
        workspaceId,
        request.body,
      );

      return sendSuccess(reply, updated);
    },
  );

  fastify.delete(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: columnIdParamsSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const deleted = await boardsService.deleteColumn(request.params.id, workspaceId);

      return sendSuccess(reply, deleted);
    },
  );
}
