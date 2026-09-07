import React, { useRef, useEffect } from 'react';
import {
  toLocalDateString,
  filterAllDayEventsForDate,
  filterTimedEventsForDate,
  calculateEventGridPosition,
  isSameCalendarDate,
  DAY_NAMES,
  MONTH_NAMES,
} from '../../utils/calendar.js';

export function DayView({
  currentDate,
  events = [],
  workBlocks = [],
  deadlines = [],
  onSelectEvent,
  onCreateEventAtSlot,
}) {
  const dateObj = new Date(currentDate);
  const today = new Date();
  const dateStr = toLocalDateString(dateObj);
  const isToday = isSameCalendarDate(dateObj, today);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 8 * 60; // 8 AM
    }
  }, []);

  const allItems = [
    ...events,
    ...workBlocks.map(wb => ({ ...wb, isWorkBlock: true })),
    ...deadlines.map(d => ({ ...d, isDeadline: true, isAllDay: true })),
  ];

  const allDayEvents = filterAllDayEventsForDate(allItems, dateStr);
  const timedEvents = filterTimedEventsForDate(allItems, dateStr);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div
      className="day-view"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
    >
      {/* 1. Header Banner */}
      <div
        style={{
          padding: 'var(--space-md) var(--space-lg)',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)',
        }}
      >
        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: '700',
            color: isToday ? 'var(--accent-primary)' : 'var(--text-primary)',
          }}
        >
          {dateObj.getDate()}
        </div>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)' }}>
            {DAY_NAMES[dateObj.getDay()]}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {MONTH_NAMES[dateObj.getMonth()]} {dateObj.getFullYear()}
          </div>
        </div>
      </div>

      {/* 2. All-Day Events Section */}
      {allDayEvents.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '2px solid var(--border-strong)',
            padding: 'var(--space-xs) var(--space-md)',
            gap: 'var(--space-md)',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: '600',
              color: 'var(--text-muted)',
              textAlign: 'right',
            }}
          >
            all-day
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
            {allDayEvents.map(evt => (
              <div
                key={evt.id}
                onClick={() => onSelectEvent?.(evt)}
                title={evt.title}
                style={{
                  backgroundColor: evt.calendarColor || '#3B82F6',
                  color: '#ffffff',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                {evt.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. 24-Hour Time Grid */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: 'var(--bg-primary)',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr',
            minHeight: `${24 * 60}px`,
            position: 'relative',
          }}
        >
          {/* Time Gutter */}
          <div style={{ borderRight: '1px solid var(--border-subtle)', userSelect: 'none' }}>
            {hours.map(hour => (
              <div
                key={`time-${hour}`}
                style={{
                  height: '60px',
                  textAlign: 'right',
                  paddingRight: 'var(--space-md)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  transform: 'translateY(-8px)',
                }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Time Column Slot Container */}
          <div style={{ position: 'relative' }}>
            {hours.map(hour => (
              <div
                key={`slot-${hour}`}
                onClick={() => onCreateEventAtSlot?.(dateStr, hour)}
                style={{
                  height: '60px',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                }}
              />
            ))}

            {/* Timed Event Chips */}
            {timedEvents.map(evt => {
              const pos = calculateEventGridPosition(evt);
              const bgColor = evt.calendarColor || '#3B82F6';

              return (
                <div
                  key={evt.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectEvent?.(evt);
                  }}
                  style={{
                    position: 'absolute',
                    top: pos.top,
                    height: pos.height,
                    left: '12px',
                    right: '12px',
                    backgroundColor: evt.isWorkBlock
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(99, 102, 241, 0.25)',
                    borderLeft: `5px solid ${bgColor}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    zIndex: 2,
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  <div
                    style={{
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {evt.title}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginTop: '2px',
                    }}
                  >
                    {pos.startLabel} – {pos.endLabel} {evt.location ? `• ${evt.location}` : ''}
                  </div>
                  {evt.description && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {evt.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
