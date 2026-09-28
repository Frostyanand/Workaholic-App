import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CalendarHeader } from '../components/calendar/CalendarHeader.jsx';
import { CalendarFilterPanel } from '../components/calendar/CalendarFilterPanel.jsx';
import { MonthView } from '../components/calendar/MonthView.jsx';
import { WeekView } from '../components/calendar/WeekView.jsx';
import { DayView } from '../components/calendar/DayView.jsx';
import { AgendaView } from '../components/calendar/AgendaView.jsx';
import { CreateEventModal } from '../components/calendar/CreateEventModal.jsx';
import { EventDetailModal } from '../components/calendar/EventDetailModal.jsx';
import { CreateCalendarModal } from '../components/calendar/CreateCalendarModal.jsx';
import { GoogleSyncModal } from '../components/calendar/GoogleSyncModal.jsx';
import { PublicCalendarModal } from '../components/calendar/PublicCalendarModal.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';
import {
  fetchCalendars,
  fetchCalendarEvents,
  createCalendar as apiCreateCalendar,
  createEvent as apiCreateEvent,
  updateEvent as apiUpdateEvent,
  deleteEvent as apiDeleteEvent,
  editOccurrence as apiEditOccurrence,
  cancelOccurrence as apiCancelOccurrence,
} from '../services/calendar.api.js';
import { getWeekDates, getMonthMatrix, toLocalDateString } from '../utils/calendar.js';

export function CalendarPage() {
  const context = useOutletContext() || {};
  const currentWorkspace = context.currentWorkspace;
  const workspaceId = currentWorkspace?.id;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('MONTH');
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState([]);
  const [events, setEvents] = useState([]);
  const [workBlocks, setWorkBlocks] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [includeWorkBlocks, setIncludeWorkBlocks] = useState(true);
  const [includeTasks, setIncludeTasks] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreateCalendarModalOpen, setIsCreateCalendarModalOpen] = useState(false);
  const [isGoogleSyncModalOpen, setIsGoogleSyncModalOpen] = useState(false);
  const [isPublicCalendarModalOpen, setIsPublicCalendarModalOpen] = useState(false);
  const [sharingCalendar, setSharingCalendar] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [slotDate, setSlotDate] = useState(null);
  const [slotHour, setSlotHour] = useState(undefined);

  const handleOpenShareCalendar = calToShare => {
    const target = calToShare || calendars.find(c => c.isDefault) || calendars[0];
    if (target) {
      setSharingCalendar(target);
      setIsPublicCalendarModalOpen(true);
    }
  };

  // 1. Fetch Calendars
  const loadCalendars = useCallback(async () => {
    try {
      const cals = await fetchCalendars(workspaceId);
      setCalendars(cals);
      setSelectedCalendarIds(prev => {
        if (prev.length === 0) return cals.map(c => c.id);
        return prev;
      });
    } catch (err) {
      console.error('Failed to load calendars:', err);
      setError(err.message || 'Failed to load calendars');
    }
  }, [workspaceId]);

  // 2. Compute date range boundaries based on active view and date
  const computeWindowRange = useCallback(() => {
    const d = new Date(currentDate);

    if (view === 'MONTH') {
      const matrix = getMonthMatrix(d);
      const start = toLocalDateString(matrix[0][0]);
      const end = toLocalDateString(matrix[5][6]);
      return {
        start: `${start}T00:00:00.000Z`,
        end: `${end}T23:59:59.999Z`,
      };
    }

    if (view === 'WEEK' || view === 'WORKWEEK') {
      const weekDays = getWeekDates(d, view === 'WORKWEEK');
      const start = toLocalDateString(weekDays[0]);
      const end = toLocalDateString(weekDays[weekDays.length - 1]);
      return {
        start: `${start}T00:00:00.000Z`,
        end: `${end}T23:59:59.999Z`,
      };
    }

    if (view === 'DAY') {
      const dayStr = toLocalDateString(d);
      return {
        start: `${dayStr}T00:00:00.000Z`,
        end: `${dayStr}T23:59:59.999Z`,
      };
    }

    // AGENDA: current month range
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = toLocalDateString(new Date(year, month, 1));
    const end = toLocalDateString(new Date(year, month + 1, 0));
    return {
      start: `${start}T00:00:00.000Z`,
      end: `${end}T23:59:59.999Z`,
    };
  }, [currentDate, view]);

  // 3. Fetch Events for Active Range
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const range = computeWindowRange();
      const res = await fetchCalendarEvents(workspaceId, {
        start: range.start,
        end: range.end,
        calendarIds: selectedCalendarIds.length > 0 ? selectedCalendarIds : undefined,
        includeWorkBlocks,
        includeTasks,
      });

      setEvents(res.events || []);
      setWorkBlocks(res.workBlocks || []);
      setDeadlines(res.deadlines || []);
    } catch (err) {
      console.error('Failed to load events:', err);
      setError(err.message || 'Failed to load calendar events');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, computeWindowRange, selectedCalendarIds, includeWorkBlocks, includeTasks]);

  useEffect(() => {
    loadCalendars();
  }, [loadCalendars]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Navigation handlers
  function handleNavigatePrev() {
    setCurrentDate(prev => {
      const next = new Date(prev);
      if (view === 'MONTH' || view === 'AGENDA') next.setMonth(next.getMonth() - 1);
      else if (view === 'WEEK' || view === 'WORKWEEK') next.setDate(next.getDate() - 7);
      else if (view === 'DAY') next.setDate(next.getDate() - 1);
      return next;
    });
  }

  function handleNavigateNext() {
    setCurrentDate(prev => {
      const next = new Date(prev);
      if (view === 'MONTH' || view === 'AGENDA') next.setMonth(next.getMonth() + 1);
      else if (view === 'WEEK' || view === 'WORKWEEK') next.setDate(next.getDate() + 7);
      else if (view === 'DAY') next.setDate(next.getDate() + 1);
      return next;
    });
  }

  function handleNavigateToday() {
    setCurrentDate(new Date());
  }

  // Event Selection & Detail
  function handleSelectEvent(item) {
    setSelectedEvent(item);
    setIsDetailModalOpen(true);
  }

  function handleSlotClick(dateStr, hour) {
    setSlotDate(dateStr);
    setSlotHour(hour);
    setEditingEvent(null);
    setIsCreateModalOpen(true);
  }

  // Create / Update Event Submit
  async function handleCreateEventSubmit(payload) {
    if (editingEvent) {
      if (editingEvent.isRecurring && payload.editMode && payload.editMode !== 'SERIES') {
        const baseId = editingEvent.baseEventId || editingEvent.id;
        const occKey = editingEvent.occurrenceKey;
        await apiEditOccurrence(baseId, occKey, workspaceId, payload);
      } else {
        const targetId = editingEvent.baseEventId || editingEvent.id;
        await apiUpdateEvent(targetId, workspaceId, payload);
      }
    } else {
      await apiCreateEvent(workspaceId, payload);
    }
    await loadEvents();
  }

  // Delete Event Submit
  async function handleDeleteEvent(eventOrId, mode = 'SERIES') {
    if (typeof eventOrId === 'object' && eventOrId.isRecurring && mode === 'THIS') {
      const baseId = eventOrId.baseEventId || eventOrId.id;
      const occKey = eventOrId.occurrenceKey;
      await apiCancelOccurrence(baseId, occKey, workspaceId);
    } else {
      const id = typeof eventOrId === 'object' ? eventOrId.baseEventId || eventOrId.id : eventOrId;
      await apiDeleteEvent(id, workspaceId);
    }
    await loadEvents();
  }

  // Create Calendar Submit
  async function handleCreateCalendarSubmit(payload) {
    const newCal = await apiCreateCalendar(workspaceId, payload);
    setCalendars(prev => [...prev, newCal]);
    setSelectedCalendarIds(prev => [...prev, newCal.id]);
    await loadEvents();
  }

  function handleToggleCalendar(calId) {
    setSelectedCalendarIds(prev =>
      prev.includes(calId) ? prev.filter(id => id !== calId) : [...prev, calId],
    );
  }

  return (
    <div
      className="calendar-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - var(--topbar-height))',
        backgroundColor: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      <h1
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Calendar
      </h1>
      {/* Calendar Header */}
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
        onNavigateToday={handleNavigateToday}
        onCreateEvent={() => {
          setSlotDate(toLocalDateString(currentDate));
          setSlotHour(undefined);
          setEditingEvent(null);
          setIsCreateModalOpen(true);
        }}
        onToggleFilter={() => setIsFilterOpen(prev => !prev)}
        isFilterOpen={isFilterOpen}
        onShareCalendar={() => handleOpenShareCalendar()}
      />

      {error && (
        <div style={{ padding: 'var(--space-sm) var(--space-lg)' }}>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Main Layout Area: Sidebar Filter + Active Calendar View */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isFilterOpen && (
          <CalendarFilterPanel
            calendars={calendars}
            selectedCalendarIds={selectedCalendarIds}
            onToggleCalendar={handleToggleCalendar}
            onSelectAllCalendars={() => setSelectedCalendarIds(calendars.map(c => c.id))}
            onDeselectAllCalendars={() => setSelectedCalendarIds([])}
            includeWorkBlocks={includeWorkBlocks}
            onToggleWorkBlocks={setIncludeWorkBlocks}
            includeTasks={includeTasks}
            onToggleTasks={setIncludeTasks}
            onCreateCalendar={() => setIsCreateCalendarModalOpen(true)}
            onOpenGoogleSync={() => setIsGoogleSyncModalOpen(true)}
            onShareCalendar={cal => handleOpenShareCalendar(cal)}
            onOpenPublicShare={() => handleOpenShareCalendar()}
          />
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {isLoading && (
            <div
              style={{
                position: 'absolute',
                top: 'var(--space-md)',
                right: 'var(--space-md)',
                zIndex: 10,
                backgroundColor: 'rgba(22, 28, 46, 0.8)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <LoadingSpinner size="sm" />
            </div>
          )}

          {view === 'MONTH' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              workBlocks={workBlocks}
              deadlines={deadlines}
              onSelectEvent={handleSelectEvent}
              onCreateEventAtDate={dateStr => handleSlotClick(dateStr, undefined)}
            />
          )}

          {view === 'WEEK' && (
            <WeekView
              currentDate={currentDate}
              isWorkweek={false}
              events={events}
              workBlocks={workBlocks}
              deadlines={deadlines}
              onSelectEvent={handleSelectEvent}
              onCreateEventAtSlot={handleSlotClick}
            />
          )}

          {view === 'WORKWEEK' && (
            <WeekView
              currentDate={currentDate}
              isWorkweek={true}
              events={events}
              workBlocks={workBlocks}
              deadlines={deadlines}
              onSelectEvent={handleSelectEvent}
              onCreateEventAtSlot={handleSlotClick}
            />
          )}

          {view === 'DAY' && (
            <DayView
              currentDate={currentDate}
              events={events}
              workBlocks={workBlocks}
              deadlines={deadlines}
              onSelectEvent={handleSelectEvent}
              onCreateEventAtSlot={handleSlotClick}
            />
          )}

          {view === 'AGENDA' && (
            <AgendaView
              events={events}
              workBlocks={workBlocks}
              deadlines={deadlines}
              onSelectEvent={handleSelectEvent}
              onCreateEvent={() => {
                setSlotDate(toLocalDateString(currentDate));
                setSlotHour(undefined);
                setEditingEvent(null);
                setIsCreateModalOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateEventSubmit}
        calendars={calendars}
        initialDate={slotDate}
        initialHour={slotHour}
        initialEvent={editingEvent}
      />

      <EventDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        event={selectedEvent}
        onEdit={evt => {
          setEditingEvent(evt);
          setIsCreateModalOpen(true);
        }}
        onDelete={handleDeleteEvent}
      />

      <CreateCalendarModal
        isOpen={isCreateCalendarModalOpen}
        onClose={() => setIsCreateCalendarModalOpen(false)}
        onSubmit={handleCreateCalendarSubmit}
      />

      <GoogleSyncModal
        isOpen={isGoogleSyncModalOpen}
        onClose={() => setIsGoogleSyncModalOpen(false)}
        workspaceId={workspaceId}
        onSyncComplete={() => {
          loadCalendars();
          loadEvents();
        }}
      />

      <PublicCalendarModal
        isOpen={isPublicCalendarModalOpen}
        onClose={() => setIsPublicCalendarModalOpen(false)}
        calendar={sharingCalendar}
        workspaceId={workspaceId}
        onLinkUpdated={() => {
          loadCalendars();
        }}
      />
    </div>
  );
}
