import { randomBytes } from 'node:crypto';
import { withTransaction } from '../../core/db.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../core/errors.js';
import {
  BOOKING_PAGE_STATUS,
  BOOKING_STATUS,
  CALENDAR_SOURCE,
  NOTIFICATION_TYPE,
} from '@workaholic/shared';
import * as bookingRepo from './booking.repository.js';
import * as eventsRepo from '../calendar/events.repository.js';
import * as calendarsRepo from '../calendar/calendars.repository.js';
import * as tasksRepo from '../tasks/tasks.repository.js';
import * as usersRepo from '../users/users.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { localToUtc } from '../recurrence/recurrence.engine.js';

export function sanitizeBookingResponse(booking) {
  if (!booking) return null;
  return {
    id: booking.id,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestNotes: booking.guestNotes,
    startAt: booking.startAt,
    endAt: booking.endAt,
    timezone: booking.timezone,
    status: booking.status,
    manageToken: booking.manageToken,
    idempotencyKey: booking.idempotencyKey,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
    rescheduledFromBookingId: booking.rescheduledFromBookingId,
    rescheduledToBookingId: booking.rescheduledToBookingId,
    ...(booking.bookingTypeName ? { bookingTypeName: booking.bookingTypeName } : {}),
    ...(booking.bookingPageName ? { bookingPageName: booking.bookingPageName } : {}),
    ...(booking.bookingPageSlug ? { bookingPageSlug: booking.bookingPageSlug } : {}),
  };
}

export class BookingService {
  constructor(
    bRepo = bookingRepo,
    eRepo = eventsRepo,
    cRepo = calendarsRepo,
    tRepo = tasksRepo,
    uRepo = usersRepo,
    nService = notificationsService,
  ) {
    this.bookingRepo = bRepo;
    this.eventsRepo = eRepo;
    this.calendarsRepo = cRepo;
    this.tasksRepo = tRepo;
    this.usersRepo = uRepo;
    this.notificationsService = nService;
  }

  // =========================================================
  // Authenticated Management: Booking Pages
  // =========================================================

  async createBookingPage(workspaceId, user, data) {
    const existing = await this.bookingRepo.getBookingPageBySlug(data.slug);
    if (existing) {
      throw new ConflictError(`Slug "${data.slug}" is already in use`);
    }

    let calendarId = data.calendarId;
    if (!calendarId) {
      const defaultCal = await this.calendarsRepo.findDefaultCalendar(workspaceId);
      calendarId = defaultCal?.id || null;
    }

    const page = await this.bookingRepo.createBookingPage({
      ownerUserId: user.id,
      workspaceId,
      calendarId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      timezone: data.timezone || user.timezone || 'UTC',
      status: data.status || BOOKING_PAGE_STATUS.ACTIVE,
    });

    // Seed default availability rules: Monday - Friday 09:00 - 17:00
    const defaultRules = [1, 2, 3, 4, 5].map(weekday => ({
      weekday,
      startTime: '09:00:00',
      endTime: '17:00:00',
      timezone: page.timezone,
    }));
    await this.bookingRepo.setAvailabilityRules(page.id, defaultRules);

    return page;
  }

  async updateBookingPage(workspaceId, user, pageId, data) {
    const page = await this.bookingRepo.getBookingPageById(pageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    if (page.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to modify this booking page');
    }

    if (data.slug && data.slug !== page.slug) {
      const existing = await this.bookingRepo.getBookingPageBySlug(data.slug);
      if (existing && existing.id !== pageId) {
        throw new ConflictError(`Slug "${data.slug}" is already in use`);
      }
    }

    return this.bookingRepo.updateBookingPage(pageId, data);
  }

  async getBookingPage(workspaceId, user, pageId) {
    const page = await this.bookingRepo.getBookingPageById(pageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }

    const types = await this.bookingRepo.listBookingTypesByPage(page.id);
    const rules = await this.bookingRepo.getAvailabilityRulesByPage(page.id);
    const exceptions = await this.bookingRepo.getAvailabilityExceptionsByPage(page.id);

    return {
      ...page,
      bookingTypes: types,
      availabilityRules: rules,
      availabilityExceptions: exceptions,
    };
  }

  async listBookingPages(workspaceId, _user) {
    const pages = await this.bookingRepo.listBookingPagesByWorkspace(workspaceId);
    const result = [];
    for (const page of pages) {
      const types = await this.bookingRepo.listBookingTypesByPage(page.id);
      result.push({
        ...page,
        bookingTypeCount: types.length,
      });
    }
    return result;
  }

  async deleteBookingPage(workspaceId, user, pageId) {
    const page = await this.bookingRepo.getBookingPageById(pageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    if (page.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to delete this booking page');
    }
    return this.bookingRepo.deleteBookingPage(pageId);
  }

  // =========================================================
  // Authenticated Management: Booking Types
  // =========================================================

  async createBookingType(workspaceId, user, pageId, data) {
    const page = await this.bookingRepo.getBookingPageById(pageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    if (page.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to modify this booking page');
    }

    return this.bookingRepo.createBookingType({
      bookingPageId: page.id,
      ...data,
    });
  }

  async updateBookingType(workspaceId, user, typeId, data) {
    const type = await this.bookingRepo.getBookingTypeById(typeId);
    if (!type) {
      throw new NotFoundError('Booking type not found');
    }
    const page = await this.bookingRepo.getBookingPageById(type.bookingPageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    if (page.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to modify this booking type');
    }

    return this.bookingRepo.updateBookingType(typeId, data);
  }

  async deleteBookingType(workspaceId, user, typeId) {
    const type = await this.bookingRepo.getBookingTypeById(typeId);
    if (!type) {
      throw new NotFoundError('Booking type not found');
    }
    const page = await this.bookingRepo.getBookingPageById(type.bookingPageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    if (page.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to delete this booking type');
    }

    return this.bookingRepo.deleteBookingType(typeId);
  }

  async listBookingTypes(pageId) {
    return this.bookingRepo.listBookingTypesByPage(pageId);
  }

  // =========================================================
  // Authenticated Management: Availability Rules & Exceptions
  // =========================================================

  async setAvailabilityRules(workspaceId, user, pageId, rules) {
    const page = await this.bookingRepo.getBookingPageById(pageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    if (page.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to modify availability rules');
    }

    return this.bookingRepo.setAvailabilityRules(page.id, rules);
  }

  async getAvailabilityRules(workspaceId, _user, pageId) {
    const page = await this.bookingRepo.getBookingPageById(pageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    return this.bookingRepo.getAvailabilityRulesByPage(page.id);
  }

  async createAvailabilityException(workspaceId, user, pageId, data) {
    const page = await this.bookingRepo.getBookingPageById(pageId);
    if (!page || page.workspaceId !== workspaceId) {
      throw new NotFoundError('Booking page not found');
    }
    if (page.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenError('Not authorized to modify exceptions');
    }

    return this.bookingRepo.createAvailabilityException({
      bookingPageId: page.id,
      ...data,
    });
  }

  async deleteAvailabilityException(workspaceId, user, exceptionId) {
    return this.bookingRepo.deleteAvailabilityException(exceptionId);
  }

  // =========================================================
  // Authenticated Management: Owner Bookings
  // =========================================================

  async listOwnerBookings(workspaceId, user, filters = {}) {
    return this.bookingRepo.listBookingsByOwner(user.id, filters);
  }

  async ownerCancelBooking(workspaceId, user, bookingId, reason = null) {
    return withTransaction(async client => {
      const booking = await this.bookingRepo.getBookingById(bookingId, client);
      if (!booking || booking.workspaceId !== workspaceId) {
        throw new NotFoundError('Booking not found');
      }
      if (booking.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
        throw new ForbiddenError('Not authorized to cancel this booking');
      }
      if (booking.status !== BOOKING_STATUS.CONFIRMED) {
        throw new ValidationError(`Cannot cancel booking with status ${booking.status}`);
      }

      const updated = await this.bookingRepo.updateBookingStatus(
        booking.id,
        BOOKING_STATUS.CANCELLED,
        { cancelledAt: new Date(), cancellationReason: reason },
        client,
      );

      if (booking.calendarEventId) {
        await this.eventsRepo.updateEvent(
          booking.calendarEventId,
          workspaceId,
          { status: 'CANCELLED' },
          client,
        );
      }

      if (booking.taskId) {
        await this.tasksRepo.updateTask(
          booking.taskId,
          workspaceId,
          { status: 'CANCELLED' },
          null,
          client,
        );
      }

      return updated;
    });
  }

  async ownerRescheduleBooking(
    workspaceId,
    user,
    bookingId,
    newStartAtStr,
    timezone = null,
    reason = null,
  ) {
    return withTransaction(async client => {
      const oldBooking = await this.bookingRepo.getBookingById(bookingId, client);
      if (!oldBooking || oldBooking.workspaceId !== workspaceId) {
        throw new NotFoundError('Booking not found');
      }
      if (oldBooking.ownerUserId !== user.id && user.role !== 'OWNER' && user.role !== 'ADMIN') {
        throw new ForbiddenError('Not authorized to reschedule this booking');
      }
      if (oldBooking.status !== BOOKING_STATUS.CONFIRMED) {
        throw new ValidationError(`Cannot reschedule booking with status ${oldBooking.status}`);
      }

      const bookingType = await this.bookingRepo.getBookingTypeById(
        oldBooking.bookingTypeId,
        client,
      );
      const newStartAt = new Date(newStartAtStr);
      if (Number.isNaN(newStartAt.getTime())) {
        throw new ValidationError('Invalid newStartAt timestamp');
      }

      const duration = bookingType.duration;
      const newEndAt = new Date(newStartAt.getTime() + duration * 60000);
      const bufferBefore = bookingType.bufferBefore || 0;
      const bufferAfter = bookingType.bufferAfter || 0;
      const newBufferStartAt = new Date(newStartAt.getTime() - bufferBefore * 60000);
      const newBufferEndAt = new Date(newEndAt.getTime() + bufferAfter * 60000);

      // Check conflicts
      const calendarEvents = await this.eventsRepo.findEventsByRange(
        workspaceId,
        { start: newBufferStartAt.toISOString(), end: newBufferEndAt.toISOString() },
        client,
      );
      const activeEvents = calendarEvents.filter(
        e => e.status !== 'CANCELLED' && e.id !== oldBooking.calendarEventId,
      );
      if (
        activeEvents.some(
          e =>
            new Date(e.startAt).getTime() < newBufferEndAt.getTime() &&
            new Date(e.endAt).getTime() > newBufferStartAt.getTime(),
        )
      ) {
        throw new ConflictError(
          'The newly requested slot conflicts with existing calendar appointments',
        );
      }

      const bookingConflicts = await this.bookingRepo.findConflictingConfirmedBookings(
        oldBooking.ownerUserId,
        newBufferStartAt,
        newBufferEndAt,
        oldBooking.id,
        client,
      );
      if (bookingConflicts.length > 0) {
        throw new ConflictError('The selected slot was just booked. Please choose another time.');
      }

      const newManageToken = 'bkm_' + randomBytes(24).toString('hex');
      let newBooking;
      try {
        newBooking = await this.bookingRepo.createBooking(
          {
            bookingTypeId: oldBooking.bookingTypeId,
            bookingPageId: oldBooking.bookingPageId,
            ownerUserId: oldBooking.ownerUserId,
            workspaceId: oldBooking.workspaceId,
            guestName: oldBooking.guestName,
            guestEmail: oldBooking.guestEmail,
            guestNotes: oldBooking.guestNotes,
            startAt: newStartAt,
            endAt: newEndAt,
            bufferStartAt: newBufferStartAt,
            bufferEndAt: newBufferEndAt,
            timezone: timezone || oldBooking.timezone,
            status: BOOKING_STATUS.CONFIRMED,
            manageToken: newManageToken,
            rescheduledFromBookingId: oldBooking.id,
          },
          client,
        );
      } catch (err) {
        if (err.code === '23P01' || err.code === '23505') {
          throw new ConflictError('The selected slot was just booked. Please choose another time.');
        }
        throw err;
      }

      await this.bookingRepo.updateBookingStatus(
        oldBooking.id,
        BOOKING_STATUS.RESCHEDULED,
        { rescheduledToBookingId: newBooking.id, cancellationReason: reason },
        client,
      );

      if (oldBooking.calendarEventId) {
        await this.eventsRepo.updateEvent(
          oldBooking.calendarEventId,
          workspaceId,
          {
            startAt: newStartAt,
            endAt: newEndAt,
            sourceReference: newBooking.id,
          },
          client,
        );
        await this.bookingRepo.updateBookingStatus(
          newBooking.id,
          newBooking.status,
          { calendarEventId: oldBooking.calendarEventId },
          client,
        );
        newBooking.calendarEventId = oldBooking.calendarEventId;
      }

      if (oldBooking.taskId) {
        await this.tasksRepo.updateTask(
          oldBooking.taskId,
          workspaceId,
          {
            dueAt: newStartAt,
            sourceReference: newBooking.id,
          },
          null,
          client,
        );
        await this.bookingRepo.updateBookingStatus(
          newBooking.id,
          newBooking.status,
          { taskId: oldBooking.taskId },
          client,
        );
        newBooking.taskId = oldBooking.taskId;
      }

      return newBooking;
    });
  }

  // =========================================================
  // Public Unauthenticated Endpoints: Booking Page & Availability
  // =========================================================

  async getPublicBookingPage(slug) {
    const page = await this.bookingRepo.getBookingPageBySlug(slug);
    if (!page || page.status !== BOOKING_PAGE_STATUS.ACTIVE) {
      throw new NotFoundError('Booking page not found or currently unavailable');
    }

    const owner = await this.usersRepo.findUserById(page.ownerUserId);
    const types = await this.bookingRepo.listBookingTypesByPage(page.id, true);

    return {
      slug: page.slug,
      name: page.name,
      description: page.description,
      timezone: page.timezone,
      ownerName: owner?.displayName || 'Host',
      bookingTypes: types.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        duration: t.duration,
        bufferBefore: t.bufferBefore,
        bufferAfter: t.bufferAfter,
        minimumNotice: t.minimumNotice,
        maximumHorizon: t.maximumHorizon,
        cancellationDeadline: t.cancellationDeadline,
        reschedulingEnabled: t.reschedulingEnabled,
        location: t.location,
      })),
    };
  }

  async getPublicAvailability(slug, query) {
    const page = await this.bookingRepo.getBookingPageBySlug(slug);
    if (!page || page.status !== BOOKING_PAGE_STATUS.ACTIVE) {
      throw new NotFoundError('Booking page not found or currently unavailable');
    }

    const bookingType = await this.bookingRepo.getBookingTypeById(query.bookingTypeId);
    if (!bookingType || bookingType.bookingPageId !== page.id || !bookingType.isActive) {
      throw new NotFoundError('Booking type not found or unavailable');
    }

    const pageTz = page.timezone || 'UTC';
    const targetTz = query.timezone || pageTz;

    const startDateStr = query.startDate;
    const endDateStr = query.endDate;

    const rules = await this.bookingRepo.getAvailabilityRulesByPage(page.id);
    const exceptions = await this.bookingRepo.getAvailabilityExceptionsByPage(
      page.id,
      startDateStr,
      endDateStr,
    );

    const now = Date.now();
    const earliestAllowedMs = now + bookingType.minimumNotice * 60000;
    const latestAllowedMs = now + bookingType.maximumHorizon * 86400000;

    // Convert date bounds to UTC range for calendar events query
    const [startY, startM, startD] = startDateStr.split('-').map(Number);
    const [endY, endM, endD] = endDateStr.split('-').map(Number);
    const rangeStartUtcIso = new Date(
      localToUtc(startY, startM, startD, 0, 0, 0, 0, pageTz),
    ).toISOString();
    const rangeEndUtcIso = new Date(
      localToUtc(endY, endM, endD, 23, 59, 59, 999, pageTz),
    ).toISOString();

    // Fetch calendar events in range (Workaholic native + Google synced)
    const calendarEvents = await this.eventsRepo.findEventsByRange(page.workspaceId, {
      start: rangeStartUtcIso,
      end: rangeEndUtcIso,
    });
    const activeEvents = calendarEvents.filter(e => e.status !== 'CANCELLED');

    // Fetch existing confirmed bookings in range
    const confirmedBookings = await this.bookingRepo.listBookingsByOwner(page.ownerUserId, {
      status: BOOKING_STATUS.CONFIRMED,
      startDate: rangeStartUtcIso,
      endDate: rangeEndUtcIso,
    });

    const slots = [];
    const stepMinutes = Math.min(bookingType.duration, 30);
    const stepMs = stepMinutes * 60000;
    const durationMs = bookingType.duration * 60000;
    const bufferBeforeMs = (bookingType.bufferBefore || 0) * 60000;
    const bufferAfterMs = (bookingType.bufferAfter || 0) * 60000;

    // Iterate through dates from startDate to endDate
    const current = new Date(Date.UTC(startY, startM - 1, startD));
    const endLimit = new Date(Date.UTC(endY, endM - 1, endD));

    while (current <= endLimit) {
      const year = current.getUTCFullYear();
      const month = current.getUTCMonth() + 1;
      const day = current.getUTCDate();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekday = current.getUTCDay();

      // Check date exception
      const exception = exceptions.find(e => e.exceptionDate === dateStr);
      let windows = [];

      if (exception) {
        if (!exception.isUnavailable && exception.startTime && exception.endTime) {
          windows.push({ startTime: exception.startTime, endTime: exception.endTime });
        }
      } else {
        const matchingRules = rules.filter(r => {
          if (r.weekday !== weekday) return false;
          if (r.effectiveFrom && dateStr < r.effectiveFrom) return false;
          if (r.effectiveUntil && dateStr > r.effectiveUntil) return false;
          return true;
        });
        for (const r of matchingRules) {
          windows.push({ startTime: r.startTime, endTime: r.endTime });
        }
      }

      for (const win of windows) {
        const [sH, sM, sS = 0] = win.startTime.split(':').map(Number);
        const [eH, eM, eS = 0] = win.endTime.split(':').map(Number);

        const winStartMs = new Date(localToUtc(year, month, day, sH, sM, sS, 0, pageTz)).getTime();
        const winEndMs = new Date(localToUtc(year, month, day, eH, eM, eS, 0, pageTz)).getTime();

        for (let slotStart = winStartMs; slotStart + durationMs <= winEndMs; slotStart += stepMs) {
          const slotEnd = slotStart + durationMs;

          // Check notice & horizon
          if (slotStart < earliestAllowedMs || slotStart > latestAllowedMs) {
            continue;
          }

          const bufStart = slotStart - bufferBeforeMs;
          const bufEnd = slotEnd + bufferAfterMs;

          // Check calendar events
          const hasCalendarConflict = activeEvents.some(e => {
            const eStart = new Date(e.startAt).getTime();
            const eEnd = new Date(e.endAt).getTime();
            return eStart < bufEnd && eEnd > bufStart;
          });
          if (hasCalendarConflict) continue;

          // Check existing bookings
          const hasBookingConflict = confirmedBookings.some(b => {
            const bBufStart = new Date(b.bufferStartAt).getTime();
            const bBufEnd = new Date(b.bufferEndAt).getTime();
            return bBufStart < bufEnd && bBufEnd > bufStart;
          });
          if (hasBookingConflict) continue;

          slots.push({
            startAt: new Date(slotStart).toISOString(),
            endAt: new Date(slotEnd).toISOString(),
            duration: bookingType.duration,
          });
        }
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return {
      slug: page.slug,
      timezone: targetTz,
      slots,
    };
  }

  // =========================================================
  // Public Unauthenticated Endpoints: Booking Creation & Self-Service
  // =========================================================

  async createPublicBooking(slug, bookingData) {
    if (bookingData.idempotencyKey) {
      const existing = await this.bookingRepo.getBookingByIdempotencyKey(
        bookingData.idempotencyKey,
      );
      if (existing) {
        return sanitizeBookingResponse(existing);
      }
    }

    return withTransaction(async client => {
      const page = await this.bookingRepo.getBookingPageBySlug(slug, client);
      if (!page || page.status !== BOOKING_PAGE_STATUS.ACTIVE) {
        throw new NotFoundError('Booking page not found or inactive');
      }

      const bookingType = await this.bookingRepo.getBookingTypeById(
        bookingData.bookingTypeId,
        client,
      );
      if (!bookingType || bookingType.bookingPageId !== page.id || !bookingType.isActive) {
        throw new NotFoundError('Booking appointment type not found or inactive');
      }

      const startAt = new Date(bookingData.startAt);
      if (Number.isNaN(startAt.getTime())) {
        throw new ValidationError('Invalid startAt timestamp');
      }

      const duration = bookingType.duration;
      const endAt = new Date(startAt.getTime() + duration * 60000);
      const bufferBefore = bookingType.bufferBefore || 0;
      const bufferAfter = bookingType.bufferAfter || 0;
      const bufferStartAt = new Date(startAt.getTime() - bufferBefore * 60000);
      const bufferEndAt = new Date(endAt.getTime() + bufferAfter * 60000);

      const now = Date.now();
      if (startAt.getTime() < now + bookingType.minimumNotice * 60000) {
        throw new ValidationError(
          `Bookings must be scheduled at least ${bookingType.minimumNotice} minutes in advance`,
        );
      }
      if (startAt.getTime() > now + bookingType.maximumHorizon * 86400000) {
        throw new ValidationError(
          `Bookings cannot be scheduled more than ${bookingType.maximumHorizon} days in advance`,
        );
      }

      // Check calendar conflicts in protected buffer window
      const calendarEvents = await this.eventsRepo.findEventsByRange(
        page.workspaceId,
        { start: bufferStartAt.toISOString(), end: bufferEndAt.toISOString() },
        client,
      );
      const activeEvents = calendarEvents.filter(e => e.status !== 'CANCELLED');
      const hasCalendarConflict = activeEvents.some(
        e =>
          new Date(e.startAt).getTime() < bufferEndAt.getTime() &&
          new Date(e.endAt).getTime() > bufferStartAt.getTime(),
      );
      if (hasCalendarConflict) {
        throw new ConflictError(
          'The requested time slot conflicts with existing calendar appointments',
        );
      }

      // Check existing confirmed booking conflicts with explicit row locks
      const existingConflicts = await this.bookingRepo.findConflictingConfirmedBookings(
        page.ownerUserId,
        bufferStartAt,
        bufferEndAt,
        null,
        client,
      );
      if (existingConflicts.length > 0) {
        throw new ConflictError(
          'The selected slot was just booked by someone else. Please choose another time.',
        );
      }

      const manageToken = 'bkm_' + randomBytes(24).toString('hex');

      let booking;
      try {
        booking = await this.bookingRepo.createBooking(
          {
            bookingTypeId: bookingType.id,
            bookingPageId: page.id,
            ownerUserId: page.ownerUserId,
            workspaceId: page.workspaceId,
            guestName: bookingData.guestName,
            guestEmail: bookingData.guestEmail,
            guestNotes: bookingData.guestNotes || null,
            startAt,
            endAt,
            bufferStartAt,
            bufferEndAt,
            timezone: bookingData.timezone || page.timezone,
            status: BOOKING_STATUS.CONFIRMED,
            manageToken,
            idempotencyKey: bookingData.idempotencyKey || null,
          },
          client,
        );
      } catch (err) {
        if (err.code === '23P01' || err.code === '23505') {
          throw new ConflictError(
            'The selected slot was just booked by someone else. Please choose another time.',
          );
        }
        throw err;
      }

      // Create Calendar Event with source_type = 'BOOKING' and source_reference = booking.id
      let targetCalendarId = page.calendarId;
      if (!targetCalendarId) {
        const defaultCal = await this.calendarsRepo.findDefaultCalendar(page.workspaceId, client);
        targetCalendarId = defaultCal?.id;
      }

      if (targetCalendarId) {
        const calendarEvent = await this.eventsRepo.createEvent(
          {
            calendarId: targetCalendarId,
            workspaceId: page.workspaceId,
            title: `${bookingType.name} with ${bookingData.guestName}`,
            description: bookingData.guestNotes
              ? `Guest: ${bookingData.guestName} (${bookingData.guestEmail})\nNotes: ${bookingData.guestNotes}`
              : `Guest: ${bookingData.guestName} (${bookingData.guestEmail})`,
            startAt,
            endAt,
            timezone: bookingData.timezone || page.timezone,
            location: bookingType.location || null,
            meetingUrl: bookingType.meetingUrl || null,
            visibility: 'PRIVATE',
            status: 'CONFIRMED',
            sourceType: CALENDAR_SOURCE.BOOKING,
            sourceReference: booking.id,
            createdBy: page.ownerUserId,
          },
          client,
        );

        await this.bookingRepo.updateBookingStatus(
          booking.id,
          booking.status,
          { calendarEventId: calendarEvent.id },
          client,
        );
        booking.calendarEventId = calendarEvent.id;
      }

      // Optional Task creation (REQ-BOOK-014)
      if (bookingType.createTask) {
        const task = await this.tasksRepo.createTask(
          {
            workspaceId: page.workspaceId,
            title: `Prepare for ${bookingType.name}: ${bookingData.guestName}`,
            description: `Appointment with ${bookingData.guestName} (${bookingData.guestEmail})\nScheduled for: ${startAt.toISOString()}\nManage Token: ${manageToken}`,
            status: 'TODO',
            priority: bookingType.taskPriority || 'P3',
            dueAt: startAt,
            createdBy: page.ownerUserId,
            sourceType: 'BOOKING',
            sourceReference: booking.id,
          },
          client,
        );

        await this.bookingRepo.updateBookingStatus(
          booking.id,
          booking.status,
          { taskId: task.id },
          client,
        );
        booking.taskId = task.id;
      }

      // Notify owner
      try {
        await this.notificationsService.createNotification(
          {
            recipientUserId: page.ownerUserId,
            notificationType: NOTIFICATION_TYPE.BOOKING,
            title: `New Booking: ${bookingType.name}`,
            body: `${bookingData.guestName} (${bookingData.guestEmail}) booked for ${startAt.toLocaleString()}`,
            targetReference: { type: 'BOOKING', id: booking.id },
          },
          client,
        );
      } catch {
        // non-fatal
      }

      return {
        ...sanitizeBookingResponse(booking),
        bookingTypeName: bookingType.name,
        location: bookingType.location,
        meetingUrl: bookingType.meetingUrl,
        duration: bookingType.duration,
      };
    });
  }

  async getPublicBooking(manageToken) {
    const booking = await this.bookingRepo.getBookingByManageToken(manageToken);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    const bookingType = await this.bookingRepo.getBookingTypeById(booking.bookingTypeId);

    return {
      ...sanitizeBookingResponse(booking),
      duration: bookingType?.duration,
      location: bookingType?.location,
      meetingUrl: bookingType?.meetingUrl,
      cancellationDeadline: bookingType?.cancellationDeadline,
      reschedulingEnabled: bookingType?.reschedulingEnabled,
    };
  }

  async guestCancelBooking(manageToken, reason = null) {
    return withTransaction(async client => {
      const booking = await this.bookingRepo.getBookingByManageToken(manageToken, client);
      if (!booking) {
        throw new NotFoundError('Booking not found');
      }
      if (booking.status !== BOOKING_STATUS.CONFIRMED) {
        throw new ValidationError(`Cannot cancel booking with status ${booking.status}`);
      }

      const bookingType = await this.bookingRepo.getBookingTypeById(booking.bookingTypeId, client);
      const deadlineMinutes = bookingType?.cancellationDeadline ?? 60;
      const now = Date.now();
      const timeUntilStartMinutes = (new Date(booking.startAt).getTime() - now) / 60000;

      if (timeUntilStartMinutes < deadlineMinutes) {
        throw new ValidationError(
          `Cancellations must be made at least ${deadlineMinutes} minutes before appointment time`,
        );
      }

      const updated = await this.bookingRepo.updateBookingStatus(
        booking.id,
        BOOKING_STATUS.CANCELLED,
        { cancelledAt: new Date(), cancellationReason: reason },
        client,
      );

      if (booking.calendarEventId) {
        await this.eventsRepo.updateEvent(
          booking.calendarEventId,
          booking.workspaceId,
          { status: 'CANCELLED' },
          client,
        );
      }

      if (booking.taskId) {
        await this.tasksRepo.updateTask(
          booking.taskId,
          booking.workspaceId,
          { status: 'CANCELLED' },
          null,
          client,
        );
      }

      try {
        await this.notificationsService.createNotification(
          {
            recipientUserId: booking.ownerUserId,
            notificationType: NOTIFICATION_TYPE.BOOKING,
            title: `Booking Cancelled: ${booking.guestName}`,
            body: `${booking.guestName} cancelled the appointment scheduled for ${new Date(booking.startAt).toLocaleString()}${reason ? ` (Reason: ${reason})` : ''}`,
            targetReference: { type: 'BOOKING', id: booking.id },
          },
          client,
        );
      } catch {
        // non-fatal
      }

      return sanitizeBookingResponse(updated);
    });
  }

  async guestRescheduleBooking(manageToken, newStartAtStr, timezone = null, reason = null) {
    return withTransaction(async client => {
      const oldBooking = await this.bookingRepo.getBookingByManageToken(manageToken, client);
      if (!oldBooking) {
        throw new NotFoundError('Booking not found');
      }
      if (oldBooking.status !== BOOKING_STATUS.CONFIRMED) {
        throw new ValidationError(`Cannot reschedule booking with status ${oldBooking.status}`);
      }

      const bookingType = await this.bookingRepo.getBookingTypeById(
        oldBooking.bookingTypeId,
        client,
      );
      if (!bookingType || !bookingType.reschedulingEnabled) {
        throw new ValidationError('Rescheduling is not permitted for this appointment type');
      }

      const deadlineMinutes = bookingType.cancellationDeadline ?? 60;
      const now = Date.now();
      const timeUntilStartMinutes = (new Date(oldBooking.startAt).getTime() - now) / 60000;
      if (timeUntilStartMinutes < deadlineMinutes) {
        throw new ValidationError(
          `Appointments cannot be rescheduled less than ${deadlineMinutes} minutes in advance`,
        );
      }

      const newStartAt = new Date(newStartAtStr);
      if (Number.isNaN(newStartAt.getTime())) {
        throw new ValidationError('Invalid newStartAt timestamp');
      }

      const duration = bookingType.duration;
      const newEndAt = new Date(newStartAt.getTime() + duration * 60000);
      const bufferBefore = bookingType.bufferBefore || 0;
      const bufferAfter = bookingType.bufferAfter || 0;
      const newBufferStartAt = new Date(newStartAt.getTime() - bufferBefore * 60000);
      const newBufferEndAt = new Date(newEndAt.getTime() + bufferAfter * 60000);

      if (newStartAt.getTime() < now + bookingType.minimumNotice * 60000) {
        throw new ValidationError(
          `New slot must be at least ${bookingType.minimumNotice} minutes in advance`,
        );
      }
      if (newStartAt.getTime() > now + bookingType.maximumHorizon * 86400000) {
        throw new ValidationError(
          `New slot cannot be more than ${bookingType.maximumHorizon} days in advance`,
        );
      }

      const calendarEvents = await this.eventsRepo.findEventsByRange(
        oldBooking.workspaceId,
        { start: newBufferStartAt.toISOString(), end: newBufferEndAt.toISOString() },
        client,
      );
      const activeEvents = calendarEvents.filter(
        e => e.status !== 'CANCELLED' && e.id !== oldBooking.calendarEventId,
      );
      if (
        activeEvents.some(
          e =>
            new Date(e.startAt).getTime() < newBufferEndAt.getTime() &&
            new Date(e.endAt).getTime() > newBufferStartAt.getTime(),
        )
      ) {
        throw new ConflictError(
          'The newly requested slot conflicts with existing calendar appointments',
        );
      }

      const bookingConflicts = await this.bookingRepo.findConflictingConfirmedBookings(
        oldBooking.ownerUserId,
        newBufferStartAt,
        newBufferEndAt,
        oldBooking.id,
        client,
      );
      if (bookingConflicts.length > 0) {
        throw new ConflictError(
          'The newly requested slot was just booked. Please select another time.',
        );
      }

      const newManageToken = 'bkm_' + randomBytes(24).toString('hex');
      let newBooking;
      try {
        newBooking = await this.bookingRepo.createBooking(
          {
            bookingTypeId: oldBooking.bookingTypeId,
            bookingPageId: oldBooking.bookingPageId,
            ownerUserId: oldBooking.ownerUserId,
            workspaceId: oldBooking.workspaceId,
            guestName: oldBooking.guestName,
            guestEmail: oldBooking.guestEmail,
            guestNotes: oldBooking.guestNotes,
            startAt: newStartAt,
            endAt: newEndAt,
            bufferStartAt: newBufferStartAt,
            bufferEndAt: newBufferEndAt,
            timezone: timezone || oldBooking.timezone,
            status: BOOKING_STATUS.CONFIRMED,
            manageToken: newManageToken,
            rescheduledFromBookingId: oldBooking.id,
          },
          client,
        );
      } catch (err) {
        if (err.code === '23P01' || err.code === '23505') {
          throw new ConflictError(
            'The newly requested slot was just booked. Please select another time.',
          );
        }
        throw err;
      }

      await this.bookingRepo.updateBookingStatus(
        oldBooking.id,
        BOOKING_STATUS.RESCHEDULED,
        { rescheduledToBookingId: newBooking.id, cancellationReason: reason },
        client,
      );

      if (oldBooking.calendarEventId) {
        await this.eventsRepo.updateEvent(
          oldBooking.calendarEventId,
          oldBooking.workspaceId,
          {
            startAt: newStartAt,
            endAt: newEndAt,
            sourceReference: newBooking.id,
          },
          client,
        );
        await this.bookingRepo.updateBookingStatus(
          newBooking.id,
          newBooking.status,
          { calendarEventId: oldBooking.calendarEventId },
          client,
        );
        newBooking.calendarEventId = oldBooking.calendarEventId;
      }

      if (oldBooking.taskId) {
        await this.tasksRepo.updateTask(
          oldBooking.taskId,
          oldBooking.workspaceId,
          {
            dueAt: newStartAt,
            sourceReference: newBooking.id,
          },
          null,
          client,
        );
        await this.bookingRepo.updateBookingStatus(
          newBooking.id,
          newBooking.status,
          { taskId: oldBooking.taskId },
          client,
        );
        newBooking.taskId = oldBooking.taskId;
      }

      try {
        await this.notificationsService.createNotification(
          {
            recipientUserId: oldBooking.ownerUserId,
            notificationType: NOTIFICATION_TYPE.BOOKING,
            title: `Booking Rescheduled: ${oldBooking.guestName}`,
            body: `${oldBooking.guestName} rescheduled from ${new Date(oldBooking.startAt).toLocaleString()} to ${newStartAt.toLocaleString()}`,
            targetReference: { type: 'BOOKING', id: newBooking.id },
          },
          client,
        );
      } catch {
        // non-fatal
      }

      return {
        ...sanitizeBookingResponse(newBooking),
        bookingTypeName: bookingType.name,
        location: bookingType.location,
        meetingUrl: bookingType.meetingUrl,
        duration: bookingType.duration,
      };
    });
  }
}

export const bookingService = new BookingService();
