import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createShareCodeSchema,
  redeemShareCodeSchema,
  updateTrustedPermissionsSchema,
  createCommentSchema,
  listCommentsQuerySchema,
  listActivityQuerySchema,
} from '@workaholic/shared';
import { collaborationService } from './collaboration.service.js';
import * as workspacesRepo from '../workspaces/workspaces.repository.js';
import { shareCodeRateLimit } from '../../core/rate-limiter.js';

const idParamSchema = z.object({
  id: idSchema,
});

/**
 * Trusted Sharing route definitions.
 * Prefix: /api/v1/trusted
 */
export async function trustedRoutes(fastify, _opts) {
  // Generate onboarding share code
  fastify.post(
    '/share-codes',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ body: createShareCodeSchema })],
    },
    async (request, reply) => {
      const code = await collaborationService.createShareCode(
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, code, 201);
    },
  );

  // List owner's share codes
  fastify.get(
    '/share-codes',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const codes = await collaborationService.listShareCodes(request.user.id);
      return sendSuccess(reply, codes);
    },
  );

  // Revoke share code
  fastify.delete(
    '/share-codes/:id',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const result = await collaborationService.revokeShareCode(request.params.id, request.user.id);
      return sendSuccess(reply, result);
    },
  );

  // Redeem onboarding share code
  fastify.post(
    '/share-codes/redeem',
    {
      preHandler: [requireAuth, shareCodeRateLimit],
      preValidation: [validateRequest({ body: redeemShareCodeSchema })],
    },
    async (request, reply) => {
      const relationship = await collaborationService.redeemShareCode(
        request.user.id,
        request.validated.body.code,
      );
      return sendSuccess(reply, relationship, 201);
    },
  );

  // List trusted relationships
  fastify.get(
    '/relationships',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const relationships = await collaborationService.listRelationships(request.user.id);
      return sendSuccess(reply, relationships);
    },
  );

  // Get specific relationship
  fastify.get(
    '/relationships/:id',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const relationship = await collaborationService.getRelationship(
        request.params.id,
        request.user.id,
      );
      return sendSuccess(reply, relationship);
    },
  );

  // Update permissions
  fastify.patch(
    '/relationships/:id/permissions',
    {
      preHandler: [requireAuth],
      preValidation: [
        validateRequest({
          params: idParamSchema,
          body: updateTrustedPermissionsSchema,
        }),
      ],
    },
    async (request, reply) => {
      const updated = await collaborationService.updatePermissions(
        request.params.id,
        request.user.id,
        request.validated.body.permissions,
      );
      return sendSuccess(reply, updated);
    },
  );

  // Revoke relationship
  fastify.post(
    '/relationships/:id/revoke',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const revoked = await collaborationService.revokeRelationship(
        request.params.id,
        request.user.id,
      );
      return sendSuccess(reply, revoked);
    },
  );
}

/**
 * Collaboration route definitions.
 * Prefix: /api/v1/collaboration
 */
export async function collaborationRoutes(fastify, _opts) {
  // Create comment
  fastify.post(
    '/comments',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ body: createCommentSchema })],
    },
    async (request, reply) => {
      const comment = await collaborationService.createComment(
        request.user.id,
        request.validated.body,
      );
      return sendSuccess(reply, comment, 201);
    },
  );

  // List comments
  fastify.get(
    '/comments',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ query: listCommentsQuerySchema })],
    },
    async (request, reply) => {
      const comments = await collaborationService.listComments(
        request.user.id,
        request.validated.query,
      );
      return sendSuccess(reply, comments);
    },
  );

  // Delete comment
  fastify.delete(
    '/comments/:id',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const result = await collaborationService.deleteComment(request.params.id, request.user.id);
      return sendSuccess(reply, result);
    },
  );

  // Activity feed
  fastify.get(
    '/activity',
    {
      preHandler: [requireAuth],
      preValidation: [validateRequest({ query: listActivityQuerySchema })],
    },
    async (request, reply) => {
      const activities = await collaborationService.listActivity(
        request.user.id,
        request.validated.query,
      );
      return sendSuccess(reply, activities);
    },
  );

  // List eligible collaborators (Workspace members + Trusted contacts)
  fastify.get(
    '/members',
    {
      preHandler: [requireAuth, requireWorkspaceAccess()],
    },
    async (request, reply) => {
      const members = await workspacesRepo.findWorkspaceMemberships(request.workspace.id);
      const trusted = await collaborationService.listRelationships(request.user.id);
      const activeTrusted = trusted
        .filter(t => t.status === 'ACTIVE')
        .map(t => ({
          userId: t.isOwner ? t.trustedUserId : t.ownerUserId,
          userDisplayName: t.isOwner ? t.trustedName : t.ownerName,
          userEmail: t.isOwner ? t.trustedEmail : t.ownerEmail,
          role: 'TRUSTED_CONTACT',
          status: 'ACTIVE',
        }));

      const seen = new Set();
      const combined = [];
      for (const m of [...members, ...activeTrusted]) {
        if (!seen.has(m.userId)) {
          seen.add(m.userId);
          combined.push(m);
        }
      }

      return sendSuccess(reply, combined);
    },
  );
}
