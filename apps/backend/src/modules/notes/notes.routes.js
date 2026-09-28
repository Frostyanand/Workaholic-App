import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createNoteSchema,
  updateNoteSchema,
  noteQuerySchema,
  createNoteRelationshipSchema,
  convertChecklistItemSchema,
  NOTE_RELATIONSHIP_TARGET_TYPE,
} from '@workaholic/shared';
import { notesService } from './notes.service.js';
import * as notesRepo from './notes.repository.js';

const noteIdParamsSchema = z.object({
  id: idSchema,
});

const relationshipParamsSchema = z.object({
  id: idSchema,
  relationshipId: idSchema,
});

const relatedTargetQuerySchema = z.object({
  targetType: z.nativeEnum(NOTE_RELATIONSHIP_TARGET_TYPE),
  targetId: idSchema,
});

/**
 * Notes module route definitions.
 * Establishes central Note workspace, CRUD, search, tags, relationships, backlinks,
 * attachments integration, and explicit checklist-to-task conversion.
 */
export async function notesRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // ---------------------------------------------------------
  // Static sub-routes (registered before /:id to prevent shadowing)
  // ---------------------------------------------------------

  /**
   * List all workspace tags.
   */
  fastify.get(
    '/tags',
    {
      preHandler: authHooks,
    },
    async (request, reply) => {
      const tags = await notesService.getTags(request.user.id, request.workspace.id);
      return sendSuccess(reply, tags);
    },
  );

  /**
   * List all workspace categories.
   */
  fastify.get(
    '/categories',
    {
      preHandler: authHooks,
    },
    async (request, reply) => {
      const categories = await notesService.getCategories(request.user.id, request.workspace.id);
      return sendSuccess(reply, categories);
    },
  );

  /**
   * Reverse relationship discovery: find notes related to a specific target object.
   */
  fastify.get(
    '/related',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ query: relatedTargetQuerySchema })],
    },
    async (request, reply) => {
      const { targetType, targetId } = request.validated.query;
      const relatedNotes = await notesRepo.findNotesRelatedToTarget(
        targetType,
        targetId,
        request.workspace.id,
      );
      return sendSuccess(reply, relatedNotes);
    },
  );

  // ---------------------------------------------------------
  // Note collection routes
  // ---------------------------------------------------------

  /**
   * List notes with search, category/tag/pinned/favorite/archived filtering, and pagination.
   */
  fastify.get(
    '/',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ query: noteQuerySchema })],
    },
    async (request, reply) => {
      const queryParams = request.validated.query;
      const { limit = 50, offset = 0 } = queryParams;

      try {
        const result = await notesService.listNotes(
          request.user.id,
          request.workspace.id,
          queryParams,
        );

        return sendSuccess(reply, result.notes, 200, {
          limit,
          offset,
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

  /**
   * Create a new note with sanitized content and tags.
   */
  fastify.post(
    '/',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ body: createNoteSchema })],
    },
    async (request, reply) => {
      const note = await notesService.createNote(
        request.user.id,
        request.workspace.id,
        request.validated.body,
      );
      return sendSuccess(reply, note, 201);
    },
  );

  // ---------------------------------------------------------
  // Individual note routes
  // ---------------------------------------------------------

  /**
   * Get note by ID including tags, relationships, backlinks, and attachments.
   */
  fastify.get(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: noteIdParamsSchema })],
    },
    async (request, reply) => {
      const note = await notesService.getNote(
        request.user.id,
        request.workspace.id,
        request.params.id,
      );
      return sendSuccess(reply, note);
    },
  );

  /**
   * Update an existing note.
   */
  fastify.patch(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: noteIdParamsSchema, body: updateNoteSchema })],
    },
    async (request, reply) => {
      const updated = await notesService.updateNote(
        request.user.id,
        request.workspace.id,
        request.params.id,
        request.validated.body,
      );
      return sendSuccess(reply, updated);
    },
  );

  /**
   * Soft delete a note.
   */
  fastify.delete(
    '/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: noteIdParamsSchema })],
    },
    async (request, reply) => {
      const deleted = await notesService.deleteNote(
        request.user.id,
        request.workspace.id,
        request.params.id,
      );
      return sendSuccess(reply, { deleted: true, note: deleted });
    },
  );

  /**
   * Restore a soft-deleted note.
   */
  fastify.post(
    '/:id/restore',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: noteIdParamsSchema })],
    },
    async (request, reply) => {
      const restored = await notesService.restoreNote(
        request.user.id,
        request.workspace.id,
        request.params.id,
      );
      return sendSuccess(reply, restored);
    },
  );

  /**
   * Add an explicit relationship from Note to Task, Project, Event, Board, Person, or Note.
   */
  fastify.post(
    '/:id/relationships',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({ params: noteIdParamsSchema, body: createNoteRelationshipSchema }),
      ],
    },
    async (request, reply) => {
      const relationship = await notesService.addRelationship(
        request.user.id,
        request.workspace.id,
        request.params.id,
        request.validated.body,
      );
      return sendSuccess(reply, relationship, 201);
    },
  );

  /**
   * Remove an explicit relationship from Note.
   */
  fastify.delete(
    '/:id/relationships/:relationshipId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: relationshipParamsSchema })],
    },
    async (request, reply) => {
      await notesService.removeRelationship(
        request.user.id,
        request.workspace.id,
        request.params.id,
        request.params.relationshipId,
      );
      return sendSuccess(reply, { success: true });
    },
  );

  /**
   * Discover backlinks (other notes that reference this note).
   */
  fastify.get(
    '/:id/backlinks',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: noteIdParamsSchema })],
    },
    async (request, reply) => {
      const backlinks = await notesService.getBacklinks(
        request.user.id,
        request.workspace.id,
        request.params.id,
      );
      return sendSuccess(reply, backlinks);
    },
  );

  /**
   * Explicitly convert a checklist item inside a note into a Workaholic Task.
   * Conforms strictly to BR-NOTE-001, BR-NOTE-002, and REQ-NOTE-008.
   */
  fastify.post(
    '/:id/convert-checklist-item',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({ params: noteIdParamsSchema, body: convertChecklistItemSchema }),
      ],
    },
    async (request, reply) => {
      const result = await notesService.convertChecklistItem(
        request.user.id,
        request.workspace.id,
        request.params.id,
        request.validated.body,
      );
      return sendSuccess(reply, result, 201);
    },
  );
}
