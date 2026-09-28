// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { BookingPageModal } from '../src/components/booking/BookingPageModal.jsx';
import { BookingTypeModal } from '../src/components/booking/BookingTypeModal.jsx';
import { AvailabilityRulesModal } from '../src/components/booking/AvailabilityRulesModal.jsx';
import { DateExceptionModal } from '../src/components/booking/DateExceptionModal.jsx';
import { OwnerBookingActionModal } from '../src/components/booking/OwnerBookingActionModal.jsx';
import { PublicBookingPage } from '../src/pages/PublicBookingPage.jsx';
import { PublicBookingManagePage } from '../src/pages/PublicBookingManagePage.jsx';
import * as bookingApi from '../src/services/booking.api.js';
import * as calendarApi from '../src/services/calendar.api.js';

function setInputValue(input, val) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  nativeSetter.call(input, val);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setTextareaValue(textarea, val) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  ).set;
  nativeSetter.call(textarea, val);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Booking Web Components (Phase 20: Booking & Availability Engine)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // =========================================================================
  // BookingPageModal Tests
  // =========================================================================
  describe('BookingPageModal Component', () => {
    it('renders nothing when isOpen is false', async () => {
      await act(async () => {
        root.render(
          <BookingPageModal
            isOpen={false}
            onClose={vi.fn()}
            workspaceId="ws_123"
            onSaved={vi.fn()}
          />,
        );
      });

      expect(container.innerHTML).toBe('');
    });

    it('renders create modal and creates a booking page', async () => {
      vi.spyOn(calendarApi, 'fetchCalendars').mockResolvedValue([
        { id: 'cal_primary', name: 'Workaholic Primary', isDefault: true },
      ]);
      const createSpy = vi.spyOn(bookingApi, 'createBookingPage').mockResolvedValue({
        id: 'bp_123',
        name: 'Advisory Sessions',
        slug: 'advisory-sessions',
        timezone: 'UTC',
        status: 'ACTIVE',
      });
      const onSaved = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <BookingPageModal
            isOpen={true}
            onClose={onClose}
            workspaceId="ws_123"
            onSaved={onSaved}
          />,
        );
      });

      expect(container.textContent).toContain('Create Booking Page');
      const nameInput = container.querySelector('[data-testid="page-name-input"]');
      expect(nameInput).toBeTruthy();

      await act(async () => {
        setInputValue(nameInput, 'Advisory Sessions');
      });

      const form = container.querySelector('form');
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(createSpy).toHaveBeenCalled();
      expect(createSpy.mock.calls[0][1].name).toBe('Advisory Sessions');
      expect(onSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // BookingTypeModal Tests
  // =========================================================================
  describe('BookingTypeModal Component', () => {
    it('renders create appointment type modal and submits configuration', async () => {
      const createSpy = vi.spyOn(bookingApi, 'createBookingType').mockResolvedValue({
        id: 'bt_123',
        name: '30 Min Quick Sync',
        durationMinutes: 30,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 15,
        createTask: true,
        taskPriority: 'HIGH',
      });
      const onSaved = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <BookingTypeModal
            isOpen={true}
            onClose={onClose}
            workspaceId="ws_123"
            pageId="bp_123"
            onSaved={onSaved}
          />,
        );
      });

      expect(container.textContent).toContain('New Appointment Type');
      const nameInput = container.querySelector('[data-testid="type-name-input"]');
      const bufferBeforeInput = container.querySelector('[data-testid="type-buffer-before-input"]');
      const bufferAfterInput = container.querySelector('[data-testid="type-buffer-after-input"]');
      const taskToggle = container.querySelector('[data-testid="type-create-task-toggle"]');

      await act(async () => {
        setInputValue(nameInput, '30 Min Quick Sync');
        setInputValue(bufferBeforeInput, '10');
        setInputValue(bufferAfterInput, '15');

        taskToggle.click();
      });

      const form = container.querySelector('#booking-type-form');
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(createSpy).toHaveBeenCalled();
      const payload = createSpy.mock.calls[0][2];
      expect(payload.name).toBe('30 Min Quick Sync');
      expect(payload.bufferBeforeMinutes).toBe(10);
      expect(payload.bufferAfterMinutes).toBe(15);
      expect(payload.createTask).toBe(true);
      expect(onSaved).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // AvailabilityRulesModal Tests
  // =========================================================================
  describe('AvailabilityRulesModal Component', () => {
    it('loads and saves weekly availability schedule', async () => {
      vi.spyOn(bookingApi, 'getAvailabilityRules').mockResolvedValue([
        { dayOfWeek: 1, startTime: '09:00:00', endTime: '17:00:00', isEnabled: true },
        { dayOfWeek: 2, startTime: '10:00:00', endTime: '18:00:00', isEnabled: true },
      ]);
      const setRulesSpy = vi
        .spyOn(bookingApi, 'setAvailabilityRules')
        .mockResolvedValue({ success: true });
      const onSaved = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <AvailabilityRulesModal
            isOpen={true}
            onClose={onClose}
            workspaceId="ws_123"
            pageId="bp_123"
            pageName="Advisory"
            onSaved={onSaved}
          />,
        );
      });

      expect(container.textContent).toContain('Weekly Availability Schedule');
      expect(container.textContent).toContain('Monday');
      expect(container.textContent).toContain('Tuesday');

      const saveBtn = container.querySelector('[data-testid="save-schedule-btn"]');
      expect(saveBtn).toBeTruthy();

      await act(async () => {
        saveBtn.click();
      });

      expect(setRulesSpy).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // DateExceptionModal Tests
  // =========================================================================
  describe('DateExceptionModal Component', () => {
    it('adds a date override exception', async () => {
      const createExceptionSpy = vi
        .spyOn(bookingApi, 'createAvailabilityException')
        .mockResolvedValue({
          id: 'ex_123',
          exceptionDate: '2026-10-01',
          isAvailable: false,
          reason: 'National Holiday',
        });
      const onSaved = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <DateExceptionModal
            isOpen={true}
            onClose={onClose}
            workspaceId="ws_123"
            pageId="bp_123"
            onSaved={onSaved}
          />,
        );
      });

      expect(container.textContent).toContain('Add Date Override / Exception');
      const dateInput = container.querySelector('[data-testid="exception-date-input"]');
      const reasonInput = container.querySelector('[data-testid="exception-reason-input"]');

      await act(async () => {
        setInputValue(dateInput, '2026-10-01');
        setInputValue(reasonInput, 'National Holiday');
      });

      const form = container.querySelector('form');
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(createExceptionSpy).toHaveBeenCalledWith(
        'ws_123',
        'bp_123',
        expect.objectContaining({
          exceptionDate: '2026-10-01',
          isAvailable: false,
          reason: 'National Holiday',
        }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // OwnerBookingActionModal Tests
  // =========================================================================
  describe('OwnerBookingActionModal Component', () => {
    const mockBooking = {
      id: 'bk_123',
      guestName: 'John Guest',
      guestEmail: 'john@example.com',
      startAt: '2026-10-05T10:00:00.000Z',
      endAt: '2026-10-05T10:30:00.000Z',
      timezone: 'UTC',
    };

    it('cancels a booking with reason', async () => {
      const cancelSpy = vi.spyOn(bookingApi, 'ownerCancelBooking').mockResolvedValue({
        ...mockBooking,
        status: 'CANCELLED',
      });
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <OwnerBookingActionModal
            isOpen={true}
            onClose={onClose}
            workspaceId="ws_123"
            booking={mockBooking}
            mode="cancel"
            onSuccess={onSuccess}
          />,
        );
      });

      expect(container.textContent).toContain('Cancel Appointment');
      expect(container.textContent).toContain('John Guest');

      const reasonInput = container.querySelector('[data-testid="action-reason-input"]');
      await act(async () => {
        setTextareaValue(reasonInput, 'Emergency meeting conflict');
      });

      const submitBtn = container.querySelector('[data-testid="confirm-action-btn"]');
      await act(async () => {
        submitBtn.click();
      });

      expect(cancelSpy).toHaveBeenCalledWith('ws_123', 'bk_123', 'Emergency meeting conflict');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PublicBookingPage Flow Tests
  // =========================================================================
  describe('PublicBookingPage Component Flow', () => {
    it('completes the public guest booking journey and displays confirmation', async () => {
      const mockPage = {
        name: 'Alex Product Advisory',
        description: 'Schedule a 1-on-1 session with Alex',
        timezone: 'America/New_York',
        bookingTypes: [
          {
            id: 'bt_456',
            name: 'Strategy Session',
            description: 'Deep dive into roadmaps and architecture',
            durationMinutes: 45,
            location: 'Google Meet',
            color: '#6366f1',
          },
        ],
      };

      vi.spyOn(bookingApi, 'fetchPublicBookingPage').mockResolvedValue(mockPage);
      vi.spyOn(bookingApi, 'fetchPublicAvailability').mockResolvedValue({
        slots: [
          {
            startAt: '2026-10-05T14:00:00.000Z',
            endAt: '2026-10-05T14:45:00.000Z',
          },
        ],
      });

      const createBookingSpy = vi.spyOn(bookingApi, 'createPublicBooking').mockResolvedValue({
        id: 'bk_confirmed_999',
        startAt: '2026-10-05T14:00:00.000Z',
        endAt: '2026-10-05T14:45:00.000Z',
        guestName: 'Jane Specialist',
        guestEmail: 'jane@specialist.org',
        bookingTypeName: 'Strategy Session',
        location: 'Google Meet',
        manageToken: 'mgmt_token_xyz987654321',
      });

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/book/alex-advisory']}>
            <Routes>
              <Route path="/book/:slug" element={<PublicBookingPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      // Page header rendered
      expect(container.textContent).toContain('Alex Product Advisory');
      expect(container.textContent).toContain('Strategy Session');

      // Slot button appears
      const slotBtn = container.querySelector('[data-testid="slot-btn-0"]');
      expect(slotBtn).toBeTruthy();

      await act(async () => {
        slotBtn.click();
      });

      // Proceed to details
      const nextBtn = container.querySelector('[data-testid="proceed-to-details-btn"]');
      expect(nextBtn).toBeTruthy();
      await act(async () => {
        nextBtn.click();
      });

      // Guest details form
      expect(container.textContent).toContain('Your Details');
      const nameInput = container.querySelector('[data-testid="guest-name-input"]');
      const emailInput = container.querySelector('[data-testid="guest-email-input"]');

      await act(async () => {
        setInputValue(nameInput, 'Jane Specialist');
        setInputValue(emailInput, 'jane@specialist.org');
      });

      const confirmBtn = container.querySelector('[data-testid="confirm-booking-btn"]');
      await act(async () => {
        confirmBtn.click();
      });

      // Confirmed screen
      expect(createBookingSpy).toHaveBeenCalled();
      expect(container.textContent).toContain('Appointment Scheduled!');
      expect(container.textContent).toContain('jane@specialist.org');
      expect(container.querySelector('[data-testid="guest-manage-link"]')).toBeTruthy();
    });
  });

  // =========================================================================
  // PublicBookingManagePage Tests
  // =========================================================================
  describe('PublicBookingManagePage Component', () => {
    it('renders guest self-service page and handles cancellation', async () => {
      const mockBooking = {
        bookingId: 'bk_999',
        pageName: 'Alex Advisory',
        pageSlug: 'alex-advisory',
        bookingTypeId: 'bt_456',
        bookingTypeName: 'Strategy Session',
        startAt: '2026-10-05T14:00:00.000Z',
        endAt: '2026-10-05T14:45:00.000Z',
        timezone: 'UTC',
        guestName: 'Jane Specialist',
        guestEmail: 'jane@specialist.org',
        status: 'CONFIRMED',
        location: 'Google Meet',
      };

      vi.spyOn(bookingApi, 'fetchPublicBooking').mockResolvedValue(mockBooking);
      const cancelSpy = vi.spyOn(bookingApi, 'guestCancelBooking').mockResolvedValue({
        ...mockBooking,
        status: 'CANCELLED',
        cancellationReason: 'Need to travel',
      });

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/book/manage/mgmt_token_xyz987654321']}>
            <Routes>
              <Route path="/book/manage/:token" element={<PublicBookingManagePage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Alex Advisory');
      expect(container.textContent).toContain('Strategy Session');
      expect(container.textContent).toContain('CONFIRMED');

      const cancelBtn = container.querySelector('[data-testid="guest-cancel-btn"]');
      expect(cancelBtn).toBeTruthy();

      await act(async () => {
        cancelBtn.click();
      });

      expect(container.textContent).toContain('Are you sure you want to cancel your appointment?');
      const reasonInput = container.querySelector('[data-testid="guest-cancel-reason-input"]');
      await act(async () => {
        setTextareaValue(reasonInput, 'Need to travel');
      });

      const confirmCancelBtn = container.querySelector('[data-testid="confirm-guest-cancel-btn"]');
      await act(async () => {
        confirmCancelBtn.click();
      });

      expect(cancelSpy).toHaveBeenCalledWith('mgmt_token_xyz987654321', 'Need to travel');
      expect(container.textContent).toContain('CANCELLED');
    });
  });
});
