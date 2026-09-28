import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { validateRequest } from '../../core/validation.js';
import { idSchema } from '@workaholic/shared';
import { workspacesService } from './workspaces.service.js';

const workspaceParamsSchema = z.object({
  id: idSchema,
});

const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1, 'Workspace name cannot be empty').max(255),
  workspaceType: z.enum(['PERSONAL', 'TEAM']).default('PERSONAL'),
});

const addMemberInputSchema = z
  .object({
    userId: idSchema.optional(),
    email: z.string().email().optional(),
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
    status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED']).default('ACTIVE'),
  })
  .refine(data => data.userId || data.email, {
    message: 'Either userId or email is required',
  });

const memberParamsSchema = z.object({
  id: idSchema,
  userId: idSchema,
});

const updateMemberRoleInputSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

/**
 * Workspaces module route definitions.
 * Establishes workspace boundaries, membership scoping, and resource isolation.
 * Conforms to docs/15.API-SPECIFICATION.md Section 7 & docs/11.PERMISSIONS-MODEL.md.
 */
export async function workspacesRoutes(fastify, _opts) {
  // List user workspaces
  fastify.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    if (request.user?.id) {
      try {
        const workspaces = await workspacesService.getUserWorkspaces(request.user.id);
        return sendSuccess(reply, workspaces);
      } catch (err) {
        if (err.code === '22P02') {
          return sendSuccess(reply, []);
        }
        throw err;
      }
    }
    return sendSuccess(reply, []);
  });

  // Create workspace (requester becomes OWNER)
  fastify.post(
    '/',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ body: createWorkspaceInputSchema })],
    },
    async (request, reply) => {
      const workspace = await workspacesService.createWorkspace(
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, workspace, 201);
    },
  );

  // Get workspace by ID (with tenant membership verification)
  fastify.get(
    '/:id',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ params: workspaceParamsSchema })],
    },
    async (request, reply) => {
      const workspace = await workspacesService.getWorkspaceById(
        request.params.id,
        request.user.id,
      );
      return sendSuccess(reply, workspace);
    },
  );

  // List members of a workspace
  fastify.get(
    '/:id/members',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ params: workspaceParamsSchema })],
    },
    async (request, reply) => {
      const members = await workspacesService.getWorkspaceMembers(
        request.params.id,
        request.user.id,
      );
      return sendSuccess(reply, members);
    },
  );

  // Add member to workspace (OWNER or ADMIN only)
  fastify.post(
    '/:id/members',
    {
      preHandler: [requireAuth],
      preValidation: [
        validateRequest({
          params: workspaceParamsSchema,
          body: addMemberInputSchema,
        }),
      ],
    },
    async (request, reply) => {
      const member = await workspacesService.addMember(
        request.params.id,
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, member, 201);
    },
  );

  // Update member role (OWNER or ADMIN only)
  fastify.patch(
    '/:id/members/:userId',
    {
      preHandler: [requireAuth],
      preValidation: [
        validateRequest({
          params: memberParamsSchema,
          body: updateMemberRoleInputSchema,
        }),
      ],
    },
    async (request, reply) => {
      const updated = await workspacesService.updateMemberRole(
        request.params.id,
        request.user.id,
        request.params.userId,
        request.validated.body.role,
      );
      return sendSuccess(reply, updated);
    },
  );

  // Remove member from workspace (OWNER/ADMIN or self-leave)
  fastify.delete(
    '/:id/members/:userId',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ params: memberParamsSchema })],
    },
    async (request, reply) => {
      const result = await workspacesService.removeMember(
        request.params.id,
        request.user.id,
        request.params.userId,
      );
      return sendSuccess(reply, { removed: true, member: result });
    },
  );
}
