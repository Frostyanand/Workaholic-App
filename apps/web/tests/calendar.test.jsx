// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { CalendarHeader } from '../src/components/calendar/CalendarHeader.jsx';
import { MonthView } from '../src/components/calendar/MonthView.jsx';
import { WeekView } from '../src/components/calendar/WeekView.jsx';
import { DayView } from '../src/components/calendar/DayView.jsx';
import { AgendaView } from '../src/components/calendar/AgendaView.jsx';
import { CreateEventModal } from '../src/components/calendar/CreateEventModal.jsx';
import { EventDetailModal } from '../src/components/calendar/EventDetailModal.jsx';

describe('Calendar Web UI Components (Phase 8)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  describe('CalendarHeader', () => {
    it('renders current view title and handles view switching', async () => {
      const onViewChange = vi.fn();
      const onNavigateToday = vi.fn();
      const onNavigateNext = vi.fn();

      const testDate = new Date('2026-09-15T12:00:00.000Z');

      await act(async () => {
        root.render(
          <CalendarHeader
            currentDate={testDate}
            view="MONTH"
            onViewChange={onViewChange}
            onNavigatePrev={vi.fn()}
            onNavigateNext={onNavigateNext}
            onNavigateToday={onNavigateToday}
            onCreateEvent={vi.fn()}
            onCreateCalendar={vi.fn()}
            onToggleFilter={vi.fn()}
            isFilterOpen={true}
          />,
        );
      });

      expect(container.textContent).toContain('September 2026');

      // Click "Week" tab
      const weekBtn = Array.from(container.querySelectorAll('button[role="tab"]')).find(
        b => b.textContent === 'Week',
      );
      expect(weekBtn).toBeDefined();

      await act(async () => {
        weekBtn.click();
      });
      expect(onViewChange).toHaveBeenCalledWith('WEEK');

      // Click "Today" button
      const todayBtn = container.querySelector('button[aria-label="Jump to current date"]');
      await act(async () => {
        todayBtn.click();
      });
      expect(onNavigateToday).toHaveBeenCalled();
    });
  });

  describe('MonthView', () => {
    it('renders all-day events and timed events in monthly cells', async () => {
      const onSelectEvent = vi.fn();
      const testDate = new Date('2026-09-15T12:00:00.000Z');

      const mockEvents = [
        {
          id: 'evt-all-day-1',
          title: 'College Holiday',
          isAllDay: true,
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          calendarColor: '#3B82F6',
        },
        {
          id: 'evt-timed-1',
          title: 'Design Review',
          isAllDay: false,
          startAt: '2026-09-15T14:00:00.000Z',
          endAt: '2026-09-15T15:00:00.000Z',
          calendarColor: '#8B5CF6',
        },
      ];

      await act(async () => {
        root.render(
          <MonthView currentDate={testDate} events={mockEvents} onSelectEvent={onSelectEvent} />,
        );
      });

      expect(container.textContent).toContain('College Holiday');
      expect(container.textContent).toContain('Design Review');

      // Click an event pill
      const eventPill = container.querySelector('.month-event-pill');
      expect(eventPill).toBeDefined();

      await act(async () => {
        eventPill.click();
      });
      expect(onSelectEvent).toHaveBeenCalledWith(mockEvents[0]);
    });
  });

  describe('WeekView & All-Day Separation', () => {
    it('separates all-day banner row from the 24-hour grid', async () => {
      const testDate = new Date('2026-09-15T12:00:00.000Z');
      const mockEvents = [
        {
          id: 'allday-1',
          title: 'Annual Symposium',
          isAllDay: true,
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          calendarColor: '#10B981',
        },
        {
          id: 'timed-1',
          title: 'Lab Meeting',
          isAllDay: false,
          startAt: '2026-09-15T10:00:00.000Z',
          endAt: '2026-09-15T11:00:00.000Z',
          calendarColor: '#3B82F6',
        },
      ];

      await act(async () => {
        root.render(<WeekView currentDate={testDate} events={mockEvents} />);
      });

      expect(container.textContent).toContain('all-day');
      expect(container.textContent).toContain('Annual Symposium');
      expect(container.textContent).toContain('Lab Meeting');
    });
  });

  describe('AgendaView', () => {
    it('groups events chronologically and displays conflict badges', async () => {
      const mockEvents = [
        {
          id: 'conflicted-1',
          title: 'Executive Meeting',
          isAllDay: false,
          startAt: '2026-09-15T10:00:00.000Z',
          endAt: '2026-09-15T11:00:00.000Z',
          conflicts: [{ id: 'other-1', title: 'Overlapping Session' }],
        },
      ];

      await act(async () => {
        root.render(<AgendaView events={mockEvents} />);
      });

      expect(container.textContent).toContain('Executive Meeting');
      expect(container.textContent).toContain('Conflict');
    });

    it('displays empty state when no events exist in range', async () => {
      await act(async () => {
        root.render(<AgendaView events={[]} />);
      });

      expect(container.textContent).toContain('No scheduled events in this period');
    });
  });

  describe('CreateEventModal', () => {
    it('submits all-day event payload with whole calendar dates', async () => {
      const onSubmit = vi.fn().mockResolvedValue({});
      const onClose = vi.fn();
      const calendars = [{ id: 'cal-1', name: 'Personal', isDefault: true }];

      await act(async () => {
        root.render(
          <CreateEventModal
            isOpen={true}
            onClose={onClose}
            onSubmit={onSubmit}
            calendars={calendars}
            initialDate="2026-09-15"
          />,
        );
      });

      // Type title using nativeSetter
      const titleInput = container.querySelector('#event-title');
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeSetter.call(titleInput, 'Hackathon 2026');
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Toggle all-day checkbox
      const allDayCheck = container.querySelector('#event-all-day');
      await act(async () => {
        allDayCheck.click();
      });

      // Submit
      const submitBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        submitBtn.click();
      });

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Hackathon 2026',
          isAllDay: true,
          startDate: '2026-09-15',
          endDate: '2026-09-15',
        }),
      );
    });
  });

  describe('EventDetailModal', () => {
    it('displays full event details and conflict alert warning', async () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();

      const event = {
        id: 'evt-detail-1',
        title: 'Strategy Summit',
        calendarName: 'Work',
        calendarColor: '#6366F1',
        isAllDay: false,
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T16:00:00.000Z',
        location: 'Room 401',
        meetingUrl: 'https://meet.google.com/abc',
        description: 'Quarterly review of team targets',
        conflicts: [{ id: 'conf-1', title: 'Prior Board Meeting' }],
      };

      await act(async () => {
        root.render(
          <EventDetailModal
            isOpen={true}
            onClose={vi.fn()}
            event={event}
            onEdit={onEdit}
            onDelete={onDelete}
          />,
        );
      });

      expect(container.textContent).toContain('Strategy Summit');
      expect(container.textContent).toContain('Work');
      expect(container.textContent).toContain('Room 401');
      expect(container.textContent).toContain('https://meet.google.com/abc');
      expect(container.textContent).toContain('Quarterly review of team targets');
      expect(container.textContent).toContain(
        'Scheduling Conflict: Overlaps with Prior Board Meeting',
      );
    });
  });

  describe('DayView', () => {
    it('renders single day column and timed event', async () => {
      const currentDate = new Date('2026-09-15T12:00:00.000Z');
      const events = [
        {
          id: 'evt-day-1',
          title: 'Deep Focus Session',
          calendarColor: '#10B981',
          isAllDay: false,
          startAt: '2026-09-15T09:00:00.000Z',
          endAt: '2026-09-15T11:00:00.000Z',
        },
      ];

      await act(async () => {
        root.render(
          <DayView
            currentDate={currentDate}
            events={events}
            onSelectEvent={vi.fn()}
            onCreateEventAtSlot={vi.fn()}
          />,
        );
      });

      expect(container.textContent).toContain('Deep Focus Session');
      expect(container.querySelector('.day-view')).toBeTruthy();
    });
  });
});
