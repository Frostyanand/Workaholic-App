import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { Button } from '../components/common/Button.jsx';
import { getPublicCalendarFeed } from '../services/public-calendar.api.js';

export function PublicCalendarPage() {
  const { token } = useParams();
  const [feed, setFeed] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'agenda'
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Calculate temporal query range based on currentDate
  const queryRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(year, month + 2, 0, 23, 59, 59)).toISOString();
    return { start, end };
  }, [currentDate]);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPublicCalendarFeed(token, queryRange);
      setFeed(data);
    } catch (err) {
      setError({
        status: err.status || 500,
        code: err.code || 'UNKNOWN_ERROR',
        message: err.message || 'Unable to load public calendar',
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, queryRange]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handlePrev = () => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() - 1);
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + 1);
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Group events by YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map();
    if (!feed?.events) return map;

    for (const ev of feed.events) {
      const dateKey = ev.startDate || ev.start?.slice(0, 10);
      if (dateKey) {
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey).push(ev);
      }
    }
    return map;
  }, [feed?.events]);

  // Month grid generator
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const days = [];
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sun

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date: d,
        dateKey: d.toISOString().slice(0, 10),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const d = new Date(year, month, day);
      days.push({
        date: d,
        dateKey: d.toISOString().slice(0, 10),
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill standard 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day);
      days.push({
        date: d,
        dateKey: d.toISOString().slice(0, 10),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  const monthTitle = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const formatEventTime = ev => {
    if (ev.isAllDay) return 'All day';
    try {
      const s = new Date(ev.start).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const e = new Date(ev.end).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${s} – ${e}`;
    } catch {
      return '';
    }
  };

  // Error State Render
  if (error) {
    const isRevoked = error.code === 'RESOURCE_REVOKED';
    const isExpired = error.code === 'LINK_EXPIRED';

    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0F172A',
          color: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            backgroundColor: '#1E293B',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            border: '1px solid #334155',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>
            {isRevoked ? '🚫' : isExpired ? '⏳' : '🔍'}
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 12px 0' }}>
            {isRevoked
              ? 'Calendar Link Revoked'
              : isExpired
                ? 'Calendar Link Expired'
                : 'Calendar Link Unavailable'}
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '0.9375rem', lineHeight: 1.6, margin: 0 }}>
            {isRevoked
              ? 'This public calendar link has been revoked by the owner and is no longer providing access.'
              : isExpired
                ? 'This public calendar link has reached its configured expiration deadline.'
                : 'This link is invalid or may have been deleted. Please check the URL or request an updated link from the calendar owner.'}
          </p>
          <div
            style={{
              marginTop: '32px',
              paddingTop: '20px',
              borderTop: '1px solid #334155',
              fontSize: '0.75rem',
              color: '#64748B',
            }}
          >
            Powered by Workaholic Personal Operating System
          </div>
        </div>
      </div>
    );
  }

  // Loading State Render
  if (isLoading && !feed) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0F172A',
          color: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LoadingSpinner size="large" />
        <p style={{ marginTop: '16px', color: '#94A3B8', fontSize: '0.9375rem' }}>
          Loading public calendar feed...
        </p>
      </div>
    );
  }

  const calendarColor = feed?.calendar?.color || '#3B82F6';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0F172A',
        color: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          backgroundColor: '#1E293B',
          borderBottom: '1px solid #334155',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: calendarColor,
              boxShadow: `0 0 10px ${calendarColor}88`,
            }}
          />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
              {feed?.calendar?.name || 'Public Calendar'}
            </h1>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '4px',
                fontSize: '0.75rem',
                color: '#94A3B8',
              }}
            >
              <span>🌐 {feed?.calendar?.timezone || 'UTC'}</span>
              <span>•</span>
              <span
                style={{
                  color: '#6EE7B7',
                  backgroundColor: '#064E3B',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                🔒 Privacy Protected
              </span>
            </div>
          </div>
        </div>

        {/* View and Navigation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#0F172A',
              borderRadius: '8px',
              border: '1px solid #334155',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setViewMode('month')}
              style={{
                padding: '6px 14px',
                border: 'none',
                background: viewMode === 'month' ? '#3B82F6' : 'transparent',
                color: viewMode === 'month' ? '#FFFFFF' : '#94A3B8',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              style={{
                padding: '6px 14px',
                border: 'none',
                background: viewMode === 'agenda' ? '#3B82F6' : 'transparent',
                color: viewMode === 'agenda' ? '#FFFFFF' : '#94A3B8',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Agenda
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Button variant="secondary" size="small" onClick={handlePrev} aria-label="Previous">
              ‹
            </Button>
            <Button variant="secondary" size="small" onClick={handleToday}>
              Today
            </Button>
            <Button variant="secondary" size="small" onClick={handleNext} aria-label="Next">
              ›
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{ flex: 1, padding: '24px', maxWidth: '1280px', width: '100%', margin: '0 auto' }}
      >
        {/* Month Title Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{monthTitle}</h2>
          <div style={{ fontSize: '0.8125rem', color: '#64748B' }}>
            {feed?.events?.length || 0} scheduled block{feed?.events?.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* View Render */}
        {viewMode === 'month' ? (
          <div
            style={{
              backgroundColor: '#1E293B',
              borderRadius: '12px',
              border: '1px solid #334155',
              overflow: 'hidden',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* Weekday Headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid #334155',
                backgroundColor: '#0F172A',
                textAlign: 'center',
                fontWeight: 600,
                fontSize: '0.75rem',
                color: '#94A3B8',
                padding: '8px 0',
              }}
            >
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                <div key={day}>{day}</div>
              ))}
            </div>

            {/* Month Day Cells */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
              }}
            >
              {monthDays.map((d, index) => {
                const dayEvents = eventsByDate.get(d.dateKey) || [];
                const isToday = d.dateKey === new Date().toISOString().slice(0, 10);

                return (
                  <div
                    key={index}
                    style={{
                      minHeight: '100px',
                      padding: '8px',
                      borderRight: (index + 1) % 7 === 0 ? 'none' : '1px solid #334155',
                      borderBottom: '1px solid #334155',
                      backgroundColor: d.isCurrentMonth
                        ? isToday
                          ? '#1E3A8A22'
                          : '#1E293B'
                        : '#0F172A44',
                      opacity: d.isCurrentMonth ? 1 : 0.45,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: isToday ? 700 : 500,
                          color: isToday ? '#60A5FA' : '#E2E8F0',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: isToday ? '50%' : 'none',
                          backgroundColor: isToday ? '#1E40AF' : 'transparent',
                        }}
                      >
                        {d.date.getDate()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {dayEvents.slice(0, 3).map(ev => {
                        const isPrivate = ev.title === 'Busy';
                        return (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            style={{
                              backgroundColor: isPrivate ? '#334155' : calendarColor,
                              color: '#FFFFFF',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              fontSize: '0.6875rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={`${ev.title} (${formatEventTime(ev)})`}
                          >
                            <span>{isPrivate ? '🔒' : '📅'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ev.title}
                            </span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div
                          style={{ fontSize: '0.6875rem', color: '#94A3B8', paddingLeft: '4px' }}
                        >
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Agenda View */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {feed?.events && feed.events.length > 0 ? (
              feed.events.map(ev => {
                const isPrivate = ev.title === 'Busy';
                const dateFormatted = new Date(ev.start).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <div
                    key={ev.id}
                    data-testid="agenda-event-card"
                    onClick={() => setSelectedEvent(ev)}
                    style={{
                      backgroundColor: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '1.25rem' }}>{isPrivate ? '🔒' : '📅'}</span>
                      <div>
                        <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#F8FAFC' }}>
                          {ev.title}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '2px' }}>
                          {dateFormatted} • {formatEventTime(ev)}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: isPrivate ? '#334155' : '#1E3A8A',
                        color: isPrivate ? '#CBD5E1' : '#93C5FD',
                      }}
                    >
                      {isPrivate ? 'Busy' : 'Public Event'}
                    </span>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  padding: '48px',
                  textAlign: 'center',
                  backgroundColor: '#1E293B',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                  color: '#94A3B8',
                }}
              >
                No scheduled events in this period.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Selected Event Detail Modal */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div
            style={{
              backgroundColor: '#1E293B',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '420px',
              width: '90%',
              border: '1px solid #334155',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>{selectedEvent.title === 'Busy' ? '🔒' : '📅'}</span>
                <span>{selectedEvent.title}</span>
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.875rem', color: '#CBD5E1', marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#64748B' }}>Time: </span>
                {formatEventTime(selectedEvent)}
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Date: </span>
                {new Date(selectedEvent.start).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>

            {selectedEvent.title === 'Busy' && (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#0F172A',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  color: '#94A3B8',
                  lineHeight: 1.5,
                  marginBottom: '16px',
                }}
              >
                🛡️ This is a private block. Specific details, attendees, and description are hidden
                by privacy policies.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="small" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #334155',
          backgroundColor: '#0F172A',
          padding: '16px 24px',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: '#64748B',
        }}
      >
        Workaholic Anonymous Calendar Viewer • End-to-End Privacy Preservation
      </footer>
    </div>
  );
}
