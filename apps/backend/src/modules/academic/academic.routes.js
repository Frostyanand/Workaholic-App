/**
 * Academic & Day Order REST Routes
 * Mounts endpoints conforming to API-SPECIFICATION.md, CALENDAR-SPECIFICATION.md,
 * and BUSINESS-RULES.md (BR-DO-001 through BR-DO-016)
 */

import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireWorkspaceAccess } from '../../core/authorization.js';
import { validateRequest } from '../../core/validation.js';
import {
  idSchema,
  createSemesterSchema,
  updateSemesterSchema,
  setAcademicDateSchema,
  academicDateQuerySchema,
  createClassScheduleSchema,
  updateClassScheduleSchema,
  createScheduleEntrySchema,
  updateScheduleEntrySchema,
  academicGenerateSchema,
  cancelClassSchema,
  rescheduleClassSchema,
} from '@workaholic/shared';
import { academicService } from './academic.service.js';

const semesterIdParamsSchema = z.object({
  id: idSchema,
});

const scheduleIdParamsSchema = z.object({
  id: idSchema,
});

const scheduleEntryParamsSchema = z.object({
  id: idSchema,
  entryId: idSchema,
});

const dateParamSchema = z.object({
  id: idSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

export async function academicRoutes(fastify, _opts) {
  const authHooks = [requireAuth, requireWorkspaceAccess()];

  // =========================================================================
  // SEMESTERS
  // =========================================================================

  /**
   * POST /api/v1/academic/semesters
   * Create new semester with initial Day Order sequence
   */
  fastify.post(
    '/semesters',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ body: createSemesterSchema })],
    },
    async (request, reply) => {
      const payload = request.validated.body;
      const semester = await academicService.createSemester(
        request.workspace.id,
        request.user.id,
        payload,
      );
      return sendSuccess(reply, semester, 201);
    },
  );

  /**
   * GET /api/v1/academic/semesters
   * List semesters for active workspace
   */
  fastify.get(
    '/semesters',
    {
      preHandler: authHooks,
    },
    async (request, reply) => {
      const status = request.query?.status || null;
      const semesters = await academicService.listSemesters(request.workspace.id, { status });
      return sendSuccess(reply, semesters);
    },
  );

  /**
   * GET /api/v1/academic/semesters/:id
   * Get semester details
   */
  fastify.get(
    '/semesters/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: semesterIdParamsSchema })],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const semester = await academicService.getSemester(request.workspace.id, id);
      return sendSuccess(reply, semester);
    },
  );

  /**
   * PATCH /api/v1/academic/semesters/:id
   * Update semester
   */
  fastify.patch(
    '/semesters/:id',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: semesterIdParamsSchema,
          body: updateSemesterSchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const updates = request.validated.body;
      const updated = await academicService.updateSemester(request.workspace.id, id, updates);
      return sendSuccess(reply, updated);
    },
  );

  /**
   * POST /api/v1/academic/semesters/:id/activate
   * Activate semester
   */
  fastify.post(
    '/semesters/:id/activate',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: semesterIdParamsSchema })],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const activated = await academicService.activateSemester(request.workspace.id, id);
      return sendSuccess(reply, activated);
    },
  );

  /**
   * POST /api/v1/academic/semesters/:id/end
   * Explicit End Semester operation (REQ-DO-013, REQ-DO-014, REQ-DO-015)
   */
  fastify.post(
    '/semesters/:id/end',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: semesterIdParamsSchema })],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const result = await academicService.endSemester(request.workspace.id, id);
      return sendSuccess(reply, result);
    },
  );

  // =========================================================================
  // ACADEMIC CALENDAR & DAY ORDERS
  // =========================================================================

  /**
   * GET /api/v1/academic/semesters/:id/calendar
   * Retrieve academic calendar dates and Day Orders
   */
  fastify.get(
    '/semesters/:id/calendar',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: semesterIdParamsSchema,
          query: academicDateQuerySchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const query = request.validated.query || {};
      const dates = await academicService.getAcademicCalendar(request.workspace.id, id, query);
      return sendSuccess(reply, dates);
    },
  );

  /**
   * POST /api/v1/academic/semesters/:id/calendar/dates
   * Set or update date rule (e.g. mark holiday, special working day, override DO)
   * Triggers Day Order recalculation and shifts affected future events.
   */
  fastify.post(
    '/semesters/:id/calendar/dates',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: semesterIdParamsSchema,
          body: setAcademicDateSchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const payload = request.validated.body;
      const result = await academicService.setAcademicDate(request.workspace.id, id, payload);
      return sendSuccess(reply, result, 201);
    },
  );

  /**
   * DELETE /api/v1/academic/semesters/:id/calendar/dates/:date
   * Remove date rule (reverts to default) and shifts subsequent Day Orders.
   */
  fastify.delete(
    '/semesters/:id/calendar/dates/:date',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: dateParamSchema })],
    },
    async (request, reply) => {
      const { id, date } = request.validated.params;
      const result = await academicService.removeAcademicDate(request.workspace.id, id, date);
      return sendSuccess(reply, result);
    },
  );

  /**
   * GET /api/v1/academic/semesters/:id/day-orders
   * Get calculated Day Order sequence for date range
   */
  fastify.get(
    '/semesters/:id/day-orders',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: semesterIdParamsSchema,
          query: academicDateQuerySchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const query = request.validated.query || {};
      const dates = await academicService.getAcademicCalendar(request.workspace.id, id, query);
      const sequence = dates.map(d => ({
        calendarDate: d.calendarDate,
        dayStatus: d.dayStatus,
        dayOrder: d.dayOrder,
        overrideDayOrder: d.overrideDayOrder,
        reason: d.reason,
      }));
      return sendSuccess(reply, sequence);
    },
  );

  // =========================================================================
  // CLASS SCHEDULES (REUSABLE TIMETABLE TEMPLATES)
  // =========================================================================

  /**
   * POST /api/v1/academic/schedules
   * Create reusable class schedule template
   */
  fastify.post(
    '/schedules',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ body: createClassScheduleSchema })],
    },
    async (request, reply) => {
      const payload = request.validated.body;
      const schedule = await academicService.createClassSchedule(
        request.workspace.id,
        request.user.id,
        payload,
      );
      return sendSuccess(reply, schedule, 201);
    },
  );

  /**
   * GET /api/v1/academic/schedules
   * List schedules for active workspace
   */
  fastify.get(
    '/schedules',
    {
      preHandler: authHooks,
    },
    async (request, reply) => {
      const semesterId = request.query?.semesterId || null;
      const schedules = await academicService.listClassSchedules(request.workspace.id, {
        semesterId,
      });
      return sendSuccess(reply, schedules);
    },
  );

  /**
   * GET /api/v1/academic/schedules/:id
   * Get class schedule with all schedule entries
   */
  fastify.get(
    '/schedules/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: scheduleIdParamsSchema })],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const schedule = await academicService.getClassSchedule(request.workspace.id, id);
      return sendSuccess(reply, schedule);
    },
  );

  /**
   * PATCH /api/v1/academic/schedules/:id
   * Update class schedule
   */
  fastify.patch(
    '/schedules/:id',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: scheduleIdParamsSchema,
          body: updateClassScheduleSchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const updates = request.validated.body;
      const updated = await academicService.updateClassSchedule(request.workspace.id, id, updates);
      return sendSuccess(reply, updated);
    },
  );

  /**
   * DELETE /api/v1/academic/schedules/:id
   * Soft-delete class schedule
   */
  fastify.delete(
    '/schedules/:id',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: scheduleIdParamsSchema })],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      await academicService.deleteClassSchedule(request.workspace.id, id);
      return sendSuccess(reply, { deleted: true });
    },
  );

  // =========================================================================
  // SCHEDULE ENTRIES
  // =========================================================================

  /**
   * POST /api/v1/academic/schedules/:id/entries
   * Create class entry in schedule template
   */
  fastify.post(
    '/schedules/:id/entries',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: scheduleIdParamsSchema,
          body: createScheduleEntrySchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const payload = request.validated.body;
      const entry = await academicService.createScheduleEntry(request.workspace.id, id, payload);
      return sendSuccess(reply, entry, 201);
    },
  );

  /**
   * PATCH /api/v1/academic/schedules/:id/entries/:entryId
   * Update class entry in schedule template
   */
  fastify.patch(
    '/schedules/:id/entries/:entryId',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: scheduleEntryParamsSchema,
          body: updateScheduleEntrySchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id, entryId } = request.validated.params;
      const updates = request.validated.body;
      const updated = await academicService.updateScheduleEntry(
        request.workspace.id,
        id,
        entryId,
        updates,
      );
      return sendSuccess(reply, updated);
    },
  );

  /**
   * DELETE /api/v1/academic/schedules/:id/entries/:entryId
   * Delete class entry in schedule template
   */
  fastify.delete(
    '/schedules/:id/entries/:entryId',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: scheduleEntryParamsSchema })],
    },
    async (request, reply) => {
      const { id, entryId } = request.validated.params;
      await academicService.deleteScheduleEntry(request.workspace.id, id, entryId);
      return sendSuccess(reply, { deleted: true });
    },
  );

  // =========================================================================
  // EVENT GENERATION (IDEMPOTENT)
  // =========================================================================

  /**
   * POST /api/v1/academic/semesters/:id/generate
   * Idempotently generates native calendar events for the semester from active class schedule
   */
  fastify.post(
    '/semesters/:id/generate',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: semesterIdParamsSchema,
          body: academicGenerateSchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const payload = request.validated.body || {};
      const result = await academicService.generateAcademicSchedule(
        request.workspace.id,
        id,
        payload,
      );
      return sendSuccess(reply, result, 201);
    },
  );

  // =========================================================================
  // ACADEMIC EXCEPTIONS (CANCEL / RESCHEDULE)
  // =========================================================================

  /**
   * POST /api/v1/academic/semesters/:id/exceptions/cancel
   * Cancel specific class occurrence
   */
  fastify.post(
    '/semesters/:id/exceptions/cancel',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: semesterIdParamsSchema,
          body: cancelClassSchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const payload = request.validated.body;
      const exception = await academicService.cancelClass(request.workspace.id, id, payload);
      return sendSuccess(reply, exception, 201);
    },
  );

  /**
   * POST /api/v1/academic/semesters/:id/exceptions/reschedule
   * Reschedule specific class occurrence
   */
  fastify.post(
    '/semesters/:id/exceptions/reschedule',
    {
      preHandler: authHooks,
      preValidation: [
        validateRequest({
          params: semesterIdParamsSchema,
          body: rescheduleClassSchema,
        }),
      ],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const payload = request.validated.body;
      const exception = await academicService.rescheduleClass(request.workspace.id, id, payload);
      return sendSuccess(reply, exception, 201);
    },
  );

  /**
   * GET /api/v1/academic/semesters/:id/exceptions
   * List occurrence exceptions for semester
   */
  fastify.get(
    '/semesters/:id/exceptions',
    {
      preHandler: authHooks,
      preValidation: [validateRequest({ params: semesterIdParamsSchema })],
    },
    async (request, reply) => {
      const { id } = request.validated.params;
      const exceptions = await academicService.listAcademicExceptions(request.workspace.id, id);
      return sendSuccess(reply, exceptions);
    },
  );
}
