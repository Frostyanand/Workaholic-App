import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createProjectSchema,
  updateProjectSchema,
  projectQuerySchema,
  addProjectMemberSchema,
} from '@workaholic/shared';
import { projectsService } from './projects.service.js';

const projectIdParamsSchema = z.object({
  id: idSchema,
});

const projectMemberParamsSchema = z.object({
  id: idSchema,
  userId: idSchema,
});

/**
 * Project module route definitions conforming to API-SPECIFICATION.md Section 35.
 */
export async function projectsRoutes(fastify, _opts) {
  // Enforce authentication and workspace membership on all project endpoints
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // 1. GET /api/v1/projects
  fastify.get(
    '/',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ query: projectQuerySchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const { projects, total } = await projectsService.listProjects(workspaceId, request.query);

      return sendSuccess(reply, projects, 200, {
        total,
        limit: request.query.limit || 50,
        offset: request.query.offset || 0,
      });
    },
  );

  // 2. POST /api/v1/projects
  fastify.post(
    '/',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ body: createProjectSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const userId = request.user.id;
      const project = await projectsService.createProject(workspaceId, userId, request.body);

      return sendSuccess(reply, project, 201);
    },
  );

  // 3. GET /api/v1/projects/:id
  fastify.get(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: projectIdParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const project = await projectsService.getProjectById(request.params.id, workspaceId);

      return sendSuccess(reply, project);
    },
  );

  // 4. PATCH /api/v1/projects/:id
  fastify.patch(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: projectIdParamsSchema,
        body: updateProjectSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const updated = await projectsService.updateProject(
        request.params.id,
        workspaceId,
        request.body,
      );

      return sendSuccess(reply, updated);
    },
  );

  // 5. DELETE /api/v1/projects/:id
  fastify.delete(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: projectIdParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const deleted = await projectsService.deleteProject(request.params.id, workspaceId);

      return sendSuccess(reply, deleted);
    },
  );

  // 6. POST /api/v1/projects/:id/restore
  fastify.post(
    '/:id/restore',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: projectIdParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const restored = await projectsService.restoreProject(request.params.id, workspaceId);

      return sendSuccess(reply, restored);
    },
  );

  // 7. GET /api/v1/projects/:id/members
  fastify.get(
    '/:id/members',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: projectIdParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const members = await projectsService.listMembers(request.params.id, workspaceId);

      return sendSuccess(reply, members);
    },
  );

  // 8. POST /api/v1/projects/:id/members
  fastify.post(
    '/:id/members',
    {
      preHandler: authHooks,
      preValidation: validateRequest({
        params: projectIdParamsSchema,
        body: addProjectMemberSchema,
      }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const member = await projectsService.addMember(request.params.id, workspaceId, request.body);

      return sendSuccess(reply, member, 201);
    },
  );

  // 9. DELETE /api/v1/projects/:id/members/:userId
  fastify.delete(
    '/:id/members/:userId',
    {
      preHandler: authHooks,
      preValidation: validateRequest({ params: projectMemberParamsSchema }),
    },
    async (request, reply) => {
      const workspaceId = request.workspace.id;
      const removed = await projectsService.removeMember(
        request.params.id,
        workspaceId,
        request.params.userId,
      );

      return sendSuccess(reply, removed);
    },
  );
}
