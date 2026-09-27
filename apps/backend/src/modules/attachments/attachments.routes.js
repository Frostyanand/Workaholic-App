import { requireAuth } from '../auth/auth.middleware.js';
import * as attachmentsRepo from './attachments.repository.js';
import { googleDriveSyncService } from '../integrations/google/google-drive-sync.service.js';
import { enqueueGoogleDriveUpload } from '../integrations/google/google-sync-dispatcher.js';
import { sendSuccess } from '../../core/response.js';
import { NotFoundError } from '../../core/errors.js';
import { createAttachmentSchema, googleDriveUploadSchema } from '@workaholic/shared';

/**
 * Fastify Routes for Attachments API
 * Conforms to docs/15.API-SPECIFICATION.md Section 47,
 * docs/19.INTEGRATION-SPECIFICATION.md Section 25-29,
 * and REQ-GDRIVE-001 through REQ-GDRIVE-006.
 */
export async function attachmentsRoutes(fastify) {
  // 1. POST /api/v1/attachments - Upload or create attachment
  fastify.post('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId =
      request.body?.workspaceId || request.query?.workspaceId || request.workspace?.id;
    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required in body, query, or workspace context',
          requestId: request.id,
        },
      });
    }

    // Check if this is a Drive file upload with content
    if (request.body?.content) {
      const parsed = googleDriveUploadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Invalid upload payload',
            details: parsed.error.format(),
            requestId: request.id,
          },
        });
      }

      if (parsed.data.async) {
        const job = await enqueueGoogleDriveUpload(request.user.id, workspaceId, parsed.data);
        return sendSuccess(reply, { queued: true, jobId: job.id }, 202);
      }

      const attachment = await googleDriveSyncService.uploadAttachment(
        request.user.id,
        workspaceId,
        parsed.data,
      );
      return sendSuccess(reply, attachment, 201);
    }

    // Standard metadata attachment creation
    const parsed = createAttachmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message || 'Invalid attachment payload',
          details: parsed.error.format(),
          requestId: request.id,
        },
      });
    }

    const attachment = await attachmentsRepo.createAttachment({
      ...parsed.data,
      workspaceId,
      ownerUserId: request.user.id,
    });

    return sendSuccess(reply, attachment, 201);
  });

  // 2. GET /api/v1/attachments - List attachments by target resource
  fastify.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId = request.query?.workspaceId || request.workspace?.id;
    const { targetType, targetId } = request.query;

    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required in query or workspace context',
          requestId: request.id,
        },
      });
    }

    if (!targetType || !targetId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'targetType and targetId query parameters are required',
          requestId: request.id,
        },
      });
    }

    const attachments = await attachmentsRepo.findAttachmentsByTarget(
      targetType,
      targetId,
      workspaceId,
    );
    return sendSuccess(reply, attachments);
  });

  // 3. GET /api/v1/attachments/:id - Retrieve attachment
  fastify.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId = request.query?.workspaceId || request.workspace?.id;
    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required in query or workspace context',
          requestId: request.id,
        },
      });
    }

    const attachment = await attachmentsRepo.findAttachmentById(request.params.id, workspaceId);
    if (!attachment) {
      throw new NotFoundError(`Attachment ${request.params.id} not found`);
    }

    return sendSuccess(reply, attachment);
  });

  // 4. DELETE /api/v1/attachments/:id - Detach attachment (or explicit Drive delete)
  // Conforms to REQ-GDRIVE-004 and REQ-GDRIVE-005
  fastify.delete('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const workspaceId = request.query?.workspaceId || request.workspace?.id;
    if (!workspaceId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required in query or workspace context',
          requestId: request.id,
        },
      });
    }

    const deleteDriveFile =
      request.query?.deleteDriveFile === 'true' || request.body?.deleteDriveFile === true;

    if (deleteDriveFile) {
      // Explicit destructive Drive deletion (REQ-GDRIVE-005)
      const result = await googleDriveSyncService.explicitDeleteDriveFile(
        request.user.id,
        workspaceId,
        { attachmentId: request.params.id },
      );
      return sendSuccess(reply, {
        detached: true,
        deletedDriveFile: true,
        ...result,
      });
    }

    // Default detach relationship only (REQ-GDRIVE-004)
    const result = await googleDriveSyncService.detachAttachment(
      request.user.id,
      workspaceId,
      request.params.id,
    );

    return sendSuccess(reply, {
      detached: true,
      deletedDriveFile: false,
      preservedExternalFile: true,
      ...result,
    });
  });
}
