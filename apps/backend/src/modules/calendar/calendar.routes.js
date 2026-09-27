import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createCalendarSchema,
  updateCalendarSchema,
  calendarQuerySchema,
  createEventSchema,
  updateEventSchema,
  calendarRangeQuerySchema,
  editOccurrenceSchema,
} from '@workaholic/shared';
import { calendarService } from './calendar.service.js';

const idParamSchema = z.object({
  id: idSchema,
});

const occurrenceParamSchema = z.object({
  id: idSchema,
  occurrenceKey: z.string().min(1),
});

/**
 * Calendar module route definitions conforming to API-SPECIFICATION.md and CALENDAR-SPECIFICATION.md.
 */
export async function calendarRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // =========================================================
  // Calendar Container Endpoints
  // =========================================================

  // List calendars in active workspace
  fastify.get(
    '/calendars',
    {
      preHandler: [...authHooks, validateRequest({ query: calendarQuerySchema })],
    },
    async (request, reply) => {
      const calendars = await calendarService.listCalendars(
        request.workspace.id,
        request.user,
        request.query,
      );
      return sendSuccess(reply, calendars);
    },
  );

  // Create a new calendar
  fastify.post(
    '/calendars',
    {
      preHandler: [...authHooks, validateRequest({ body: createCalendarSchema })],
    },
    async (request, reply) => {
      const calendar = await calendarService.createCalendar(
        request.workspace.id,
        request.user,
        request.body,
      );
      return sendSuccess(reply, calendar, 201);
    },
  );

  // Get calendar by ID
  fastify.get(
    '/calendars/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const calendar = await calendarService.getCalendar(request.params.id, request.workspace.id);
      return sendSuccess(reply, calendar);
    },
  );

  // Update calendar by ID
  fastify.patch(
    '/calendars/:id',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: idParamSchema,
          body: updateCalendarSchema,
        }),
      ],
    },
    async (request, reply) => {
      const updated = await calendarService.updateCalendar(
        request.params.id,
        request.workspace.id,
        request.body,
      );
      return sendSuccess(reply, updated);
    },
  );

  // Delete calendar by ID
  fastify.delete(
    '/calendars/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      await calendarService.deleteCalendar(request.params.id, request.workspace.id);
      return sendSuccess(reply, { deleted: true, id: request.params.id });
    },
  );

  // =========================================================
  // Calendar Event Endpoints
  // =========================================================

  // Query events in temporal window (start, end)
  fastify.get(
    '/events',
    {
      preHandler: [...authHooks, validateRequest({ query: calendarRangeQuerySchema })],
    },
    async (request, reply) => {
      const result = await calendarService.getEventsRange(
        request.workspace.id,
        request.user,
        request.query,
      );
      return sendSuccess(reply, result.events, 200, {
        workBlocks: result.workBlocks,
        deadlines: result.deadlines,
        meta: result.meta,
      });
    },
  );

  // Create an event (all-day or timed)
  fastify.post(
    '/events',
    {
      preHandler: [...authHooks, validateRequest({ body: createEventSchema })],
    },
    async (request, reply) => {
      const event = await calendarService.createEvent(
        request.workspace.id,
        request.user,
        request.body,
      );
      return sendSuccess(reply, event, 201);
    },
  );

  // Get event by ID
  fastify.get(
    '/events/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const event = await calendarService.getEvent(request.params.id, request.workspace.id);
      return sendSuccess(reply, event);
    },
  );

  // Update event by ID
  fastify.patch(
    '/events/:id',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: idParamSchema,
          body: updateEventSchema,
        }),
      ],
    },
    async (request, reply) => {
      const updated = await calendarService.updateEvent(
        request.params.id,
        request.workspace.id,
        request.user,
        request.body,
      );
      return sendSuccess(reply, updated);
    },
  );

  // Delete event by ID
  fastify.delete(
    '/events/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      await calendarService.deleteEvent(request.params.id, request.workspace.id);
      return sendSuccess(reply, { deleted: true, id: request.params.id });
    },
  );

  // Edit occurrence of a recurring event (THIS, THIS_AND_FOLLOWING, SERIES)
  fastify.patch(
    '/events/:id/occurrences/:occurrenceKey',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: occurrenceParamSchema,
          body: editOccurrenceSchema,
        }),
      ],
    },
    async (request, reply) => {
      const result = await calendarService.editOccurrence(
        request.workspace.id,
        request.user,
        request.params.id,
        request.params.occurrenceKey,
        request.body,
      );
      return sendSuccess(reply, result);
    },
  );

  // Cancel occurrence of a recurring event
  fastify.delete(
    '/events/:id/occurrences/:occurrenceKey',
    {
      preHandler: [
        ...authHooks,
        validateRequest({
          params: occurrenceParamSchema,
        }),
      ],
    },
    async (request, reply) => {
      const result = await calendarService.cancelOccurrence(
        request.workspace.id,
        request.user,
        request.params.id,
        request.params.occurrenceKey,
      );
      return sendSuccess(reply, result);
    },
  );
}

/**
 * Route alias plugin to also mount /events and /calendars at top-level API namespace
 */
export async function calendarDirectRoutes(fastify, opts) {
  return calendarRoutes(fastify, opts);
}
