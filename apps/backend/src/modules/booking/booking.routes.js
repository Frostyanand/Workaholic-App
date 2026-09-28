import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createBookingPageSchema,
  updateBookingPageSchema,
  createBookingTypeSchema,
  updateBookingTypeSchema,
  setAvailabilityRulesSchema,
  createAvailabilityExceptionSchema,
  bookingAvailabilityQuerySchema,
  createPublicBookingSchema,
  cancelBookingSchema,
  rescheduleBookingSchema,
  bookingSlugParamSchema,
  manageTokenParamSchema,
} from '@workaholic/shared';
import { bookingService } from './booking.service.js';
import { bookingRateLimit } from '../../core/rate-limiter.js';

const idParamSchema = z.object({
  id: idSchema,
});

const pageIdParamSchema = z.object({
  pageId: idSchema,
});

/**
 * Booking Authenticated Management Routes
 * Mounted at /api/v1/booking
 */
export async function bookingManagementRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // 1. Booking Pages CRUD
  fastify.post(
    '/pages',
    {
      preHandler: [...authHooks, validateRequest({ body: createBookingPageSchema })],
    },
    async (request, reply) => {
      const page = await bookingService.createBookingPage(
        request.workspace.id,
        request.user,
        request.body,
      );
      return sendSuccess(reply, page, 201);
    },
  );

  fastify.get(
    '/pages',
    {
      preHandler: authHooks,
    },
    async (request, reply) => {
      const pages = await bookingService.listBookingPages(request.workspace.id, request.user);
      return sendSuccess(reply, pages);
    },
  );

  fastify.get(
    '/pages/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const page = await bookingService.getBookingPage(
        request.workspace.id,
        request.user,
        request.params.id,
      );
      return sendSuccess(reply, page);
    },
  );

  fastify.patch(
    '/pages/:id',
    {
      preHandler: [
        ...authHooks,
        validateRequest({ params: idParamSchema, body: updateBookingPageSchema }),
      ],
    },
    async (request, reply) => {
      const updated = await bookingService.updateBookingPage(
        request.workspace.id,
        request.user,
        request.params.id,
        request.body,
      );
      return sendSuccess(reply, updated);
    },
  );

  fastify.delete(
    '/pages/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const deleted = await bookingService.deleteBookingPage(
        request.workspace.id,
        request.user,
        request.params.id,
      );
      return sendSuccess(reply, deleted);
    },
  );

  // 2. Booking Types CRUD
  fastify.post(
    '/pages/:pageId/types',
    {
      preHandler: [
        ...authHooks,
        validateRequest({ params: pageIdParamSchema, body: createBookingTypeSchema }),
      ],
    },
    async (request, reply) => {
      const type = await bookingService.createBookingType(
        request.workspace.id,
        request.user,
        request.params.pageId,
        request.body,
      );
      return sendSuccess(reply, type, 201);
    },
  );

  fastify.get(
    '/pages/:pageId/types',
    {
      preHandler: [...authHooks, validateRequest({ params: pageIdParamSchema })],
    },
    async (request, reply) => {
      const types = await bookingService.listBookingTypes(request.params.pageId);
      return sendSuccess(reply, types);
    },
  );

  fastify.patch(
    '/types/:id',
    {
      preHandler: [
        ...authHooks,
        validateRequest({ params: idParamSchema, body: updateBookingTypeSchema }),
      ],
    },
    async (request, reply) => {
      const updated = await bookingService.updateBookingType(
        request.workspace.id,
        request.user,
        request.params.id,
        request.body,
      );
      return sendSuccess(reply, updated);
    },
  );

  fastify.delete(
    '/types/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const deleted = await bookingService.deleteBookingType(
        request.workspace.id,
        request.user,
        request.params.id,
      );
      return sendSuccess(reply, deleted);
    },
  );

  // 3. Availability Rules & Exceptions
  fastify.put(
    '/pages/:pageId/availability-rules',
    {
      preHandler: [
        ...authHooks,
        validateRequest({ params: pageIdParamSchema, body: setAvailabilityRulesSchema }),
      ],
    },
    async (request, reply) => {
      const rules = await bookingService.setAvailabilityRules(
        request.workspace.id,
        request.user,
        request.params.pageId,
        request.body.rules,
      );
      return sendSuccess(reply, rules);
    },
  );

  fastify.get(
    '/pages/:pageId/availability-rules',
    {
      preHandler: [...authHooks, validateRequest({ params: pageIdParamSchema })],
    },
    async (request, reply) => {
      const rules = await bookingService.getAvailabilityRules(
        request.workspace.id,
        request.user,
        request.params.pageId,
      );
      return sendSuccess(reply, rules);
    },
  );

  fastify.post(
    '/pages/:pageId/exceptions',
    {
      preHandler: [
        ...authHooks,
        validateRequest({ params: pageIdParamSchema, body: createAvailabilityExceptionSchema }),
      ],
    },
    async (request, reply) => {
      const exc = await bookingService.createAvailabilityException(
        request.workspace.id,
        request.user,
        request.params.pageId,
        request.body,
      );
      return sendSuccess(reply, exc, 201);
    },
  );

  fastify.delete(
    '/exceptions/:id',
    {
      preHandler: [...authHooks, validateRequest({ params: idParamSchema })],
    },
    async (request, reply) => {
      const deleted = await bookingService.deleteAvailabilityException(
        request.workspace.id,
        request.user,
        request.params.id,
      );
      return sendSuccess(reply, deleted);
    },
  );

  // 4. Owner Bookings Management
  fastify.get(
    '/bookings',
    {
      preHandler: authHooks,
    },
    async (request, reply) => {
      const bookings = await bookingService.listOwnerBookings(
        request.workspace.id,
        request.user,
        request.query || {},
      );
      return sendSuccess(reply, bookings);
    },
  );

  fastify.post(
    '/bookings/:id/cancel',
    {
      preHandler: [
        ...authHooks,
        validateRequest({ params: idParamSchema, body: cancelBookingSchema }),
      ],
    },
    async (request, reply) => {
      const cancelled = await bookingService.ownerCancelBooking(
        request.workspace.id,
        request.user,
        request.params.id,
        request.body?.reason,
      );
      return sendSuccess(reply, cancelled);
    },
  );

  fastify.post(
    '/bookings/:id/reschedule',
    {
      preHandler: [
        ...authHooks,
        validateRequest({ params: idParamSchema, body: rescheduleBookingSchema }),
      ],
    },
    async (request, reply) => {
      const rescheduled = await bookingService.ownerRescheduleBooking(
        request.workspace.id,
        request.user,
        request.params.id,
        request.body.newStartAt,
        request.body.timezone,
        request.body.reason,
      );
      return sendSuccess(reply, rescheduled);
    },
  );
}

/**
 * Public Unauthenticated Booking Routes
 * Mounted at /api/v1/booking-pages and top-level /booking-pages
 */
export async function publicBookingRoutes(fastify, _opts) {
  function applySecurityHeaders(reply) {
    reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
  }

  // 1. Get Public Booking Page View
  fastify.get(
    '/booking-pages/:slug',
    {
      preHandler: [bookingRateLimit, validateRequest({ params: bookingSlugParamSchema })],
    },
    async (request, reply) => {
      applySecurityHeaders(reply);
      const data = await bookingService.getPublicBookingPage(request.params.slug);
      return sendSuccess(reply, data);
    },
  );

  // 2. Get Public Availability Slots
  fastify.get(
    '/booking-pages/:slug/availability',
    {
      preHandler: [
        bookingRateLimit,
        validateRequest({
          params: bookingSlugParamSchema,
          query: bookingAvailabilityQuerySchema,
        }),
      ],
    },
    async (request, reply) => {
      applySecurityHeaders(reply);
      const data = await bookingService.getPublicAvailability(request.params.slug, request.query);
      return sendSuccess(reply, data);
    },
  );

  // 3. Create Public Booking (Atomic confirmation)
  fastify.post(
    '/booking-pages/:slug/bookings',
    {
      preHandler: [
        bookingRateLimit,
        validateRequest({
          params: bookingSlugParamSchema,
          body: createPublicBookingSchema,
        }),
      ],
    },
    async (request, reply) => {
      applySecurityHeaders(reply);
      const confirmed = await bookingService.createPublicBooking(request.params.slug, request.body);
      return sendSuccess(reply, confirmed, 201);
    },
  );

  // 4. Guest Booking Self-Service: View
  fastify.get(
    '/public/bookings/:token',
    {
      preHandler: [bookingRateLimit, validateRequest({ params: manageTokenParamSchema })],
    },
    async (request, reply) => {
      applySecurityHeaders(reply);
      const data = await bookingService.getPublicBooking(request.params.token);
      return sendSuccess(reply, data);
    },
  );

  // 5. Guest Booking Self-Service: Cancel
  fastify.post(
    '/public/bookings/:token/cancel',
    {
      preHandler: [
        bookingRateLimit,
        validateRequest({
          params: manageTokenParamSchema,
          body: cancelBookingSchema,
        }),
      ],
    },
    async (request, reply) => {
      applySecurityHeaders(reply);
      const cancelled = await bookingService.guestCancelBooking(
        request.params.token,
        request.body?.reason,
      );
      return sendSuccess(reply, cancelled);
    },
  );

  // 6. Guest Booking Self-Service: Reschedule
  fastify.post(
    '/public/bookings/:token/reschedule',
    {
      preHandler: [
        bookingRateLimit,
        validateRequest({
          params: manageTokenParamSchema,
          body: rescheduleBookingSchema,
        }),
      ],
    },
    async (request, reply) => {
      applySecurityHeaders(reply);
      const rescheduled = await bookingService.guestRescheduleBooking(
        request.params.token,
        request.body.newStartAt,
        request.body.timezone,
        request.body.reason,
      );
      return sendSuccess(reply, rescheduled);
    },
  );
}
