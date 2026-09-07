import React, { useRef, useEffect } from 'react';
import {
  getWeekDates,
  toLocalDateString,
  filterAllDayEventsForDate,
  filterTimedEventsForDate,
  calculateEventGridPosition,
  isSameCalendarDate,
  DAY_SHORT_NAMES,
} from '../../utils/calendar.js';

export function WeekView({
  currentDate,
  isWorkweek = false,
  events = [],
  workBlocks = [],
  deadlines = [],
  onSelectEvent,
  onCreateEventAtSlot,
}) {
  const days = getWeekDates(currentDate, isWorkweek);
  const today = new Date();
  const scrollContainerRef = useRef(null);

  // Auto-scroll to 8:00 AM on initial mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 8 * 60; // 8 AM = 480px down
    }
  }, []);

  const allItems = [
    ...events,
    ...workBlocks.map(wb => ({ ...wb, isWorkBlock: true })),
    ...deadlines.map(d => ({ ...d, isDeadline: true, isAllDay: true })),
  ];

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div
      className="week-view"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
    >
      {/* 1. Day Column Headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `60px repeat(${days.length}, 1fr)`,
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingRight: '12px', // Match scrollbar offset
        }}
      >
        {/* Empty top-left time cell */}
        <div style={{ padding: '8px', borderRight: '1px solid var(--border-subtle)' }} />

        {days.map(dayObj => {
          const isToday = isSameCalendarDate(dayObj, today);
          const dayName = DAY_SHORT_NAMES[dayObj.getDay()];
          const dayNum = dayObj.getDate();

          return (
            <div
              key={dayObj.toISOString()}
              style={{
                textAlign: 'center',
                padding: 'var(--space-sm) 0',
                borderRight: '1px solid var(--border-subtle)',
                backgroundColor: isToday ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
              }}
            >
              <div
                style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}
              >
                {dayName}
              </div>
              <div
                style={{
                  fontSize: '1rem',
                  fontWeight: isToday ? '700' : '600',
                  color: isToday ? '#ffffff' : 'var(--text-primary)',
                  backgroundColor: isToday ? 'var(--accent-primary)' : 'transparent',
                  borderRadius: 'var(--radius-full)',
                  width: '28px',
                  height: '28px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '2px auto 0',
                }}
              >
                {dayNum}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Dedicated All-Day Event Banner Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `60px repeat(${days.length}, 1fr)`,
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '2px solid var(--border-strong)',
          minHeight: '36px',
          paddingRight: '12px',
        }}
      >
        <div
          style={{
            padding: '6px',
            fontSize: '0.6875rem',
            fontWeight: '600',
            color: 'var(--text-muted)',
            textAlign: 'right',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          all-day
        </div>

        {days.map(dayObj => {
          const dateStr = toLocalDateString(dayObj);
          const allDayEvents = filterAllDayEventsForDate(allItems, dateStr);

          return (
            <div
              key={`allday-${dateStr}`}
              style={{
                padding: '4px',
                borderRight: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {allDayEvents.map(evt => (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent?.(evt)}
                  title={evt.title}
                  style={{
                    backgroundColor: evt.calendarColor || '#3B82F6',
                    color: '#ffffff',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                  }}
                >
                  {evt.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* 3. Scrollable Hourly Time Grid */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `60px repeat(${days.length}, 1fr)`,
            minHeight: `${24 * 60}px`,
            position: 'relative',
          }}
        >
          {/* Time gutter labels */}
          <div style={{ borderRight: '1px solid var(--border-subtle)', userSelect: 'none' }}>
            {hours.map(hour => (
              <div
                key={`time-${hour}`}
                style={{
                  height: '60px',
                  textAlign: 'right',
                  paddingRight: 'var(--space-sm)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  transform: 'translateY(-8px)',
                }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {days.map(dayObj => {
            const dateStr = toLocalDateString(dayObj);
            const timedEvents = filterTimedEventsForDate(allItems, dateStr);
            const isToday = isSameCalendarDate(dayObj, today);

            return (
              <div
                key={`col-${dateStr}`}
                style={{
                  position: 'relative',
                  borderRight: '1px solid var(--border-subtle)',
                  backgroundColor: isToday ? 'rgba(99, 102, 241, 0.02)' : 'transparent',
                }}
              >
                {/* Horizontal Hour Guideline Slots */}
                {hours.map(hour => (
                  <div
                    key={`slot-${dateStr}-${hour}`}
                    onClick={() => onCreateEventAtSlot?.(dateStr, hour)}
                    style={{
                      height: '60px',
                      borderBottom: '1px solid var(--border-subtle)',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                    }}
                  />
                ))}

                {/* Timed Event Chips (Positioned absolutely) */}
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
                      title={`${evt.title} (${pos.startLabel} - ${pos.endLabel})`}
                      style={{
                        position: 'absolute',
                        top: pos.top,
                        height: pos.height,
                        left: '4px',
                        right: '4px',
                        backgroundColor: evt.isWorkBlock
                          ? 'rgba(16, 185, 129, 0.2)'
                          : 'rgba(99, 102, 241, 0.25)',
                        borderLeft: `4px solid ${bgColor}`,
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 6px',
                        fontSize: '0.75rem',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        zIndex: 2,
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'var(--transition-fast)',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {evt.title}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                        {pos.startLabel} - {pos.endLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
