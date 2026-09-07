import React from 'react';
import {
  getMonthMatrix,
  toLocalDateString,
  filterAllDayEventsForDate,
  filterTimedEventsForDate,
  isSameCalendarDate,
  DAY_SHORT_NAMES,
} from '../../utils/calendar.js';

export function MonthView({
  currentDate,
  events = [],
  workBlocks = [],
  deadlines = [],
  onSelectEvent,
  onCreateEventAtDate,
}) {
  const matrix = getMonthMatrix(currentDate);
  const today = new Date();
  const currentMonth = new Date(currentDate).getMonth();

  // Combine timed items for cell rendering
  const allItems = [
    ...events,
    ...workBlocks.map(wb => ({ ...wb, isWorkBlock: true })),
    ...deadlines.map(d => ({ ...d, isDeadline: true, isAllDay: true })),
  ];

  return (
    <div
      className="month-view"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
    >
      {/* Day of Week Headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          textAlign: 'center',
          padding: 'var(--space-xs) 0',
          fontWeight: '600',
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
        }}
      >
        {DAY_SHORT_NAMES.map(day => (
          <div key={day} style={{ padding: '4px' }}>
            {day}
          </div>
        ))}
      </div>

      {/* 6-Week Calendar Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(6, 1fr)',
          flex: 1,
          backgroundColor: 'var(--bg-secondary)',
          gap: '1px',
        }}
      >
        {matrix.map((week, weekIdx) => (
          <div
            key={`week-${weekIdx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '1px',
            }}
          >
            {week.map(dateObj => {
              const dateStr = toLocalDateString(dateObj);
              const isToday = isSameCalendarDate(dateObj, today);
              const isOtherMonth = dateObj.getMonth() !== currentMonth;

              const dayAllDay = filterAllDayEventsForDate(allItems, dateStr);
              const dayTimed = filterTimedEventsForDate(allItems, dateStr);
              const totalItems = [...dayAllDay, ...dayTimed];

              return (
                <div
                  key={dateStr}
                  onClick={e => {
                    if (
                      e.target === e.currentTarget ||
                      e.target.classList.contains('month-cell-header')
                    ) {
                      onCreateEventAtDate?.(dateStr);
                    }
                  }}
                  style={{
                    backgroundColor: isToday ? 'rgba(99, 102, 241, 0.04)' : 'var(--bg-surface)',
                    padding: 'var(--space-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    opacity: isOtherMonth ? 0.45 : 1,
                    position: 'relative',
                    minHeight: '80px',
                  }}
                >
                  {/* Cell Header: Date Number */}
                  <div
                    className="month-cell-header"
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: isToday ? '700' : '500',
                        color: isToday ? '#ffffff' : 'var(--text-secondary)',
                        backgroundColor: isToday ? 'var(--accent-primary)' : 'transparent',
                        borderRadius: 'var(--radius-full)',
                        width: '20px',
                        height: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {dateObj.getDate()}
                    </span>
                  </div>

                  {/* Events in Cell */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      overflowY: 'auto',
                      flex: 1,
                    }}
                  >
                    {totalItems.slice(0, 3).map(item => {
                      const isAllDay = item.isAllDay;
                      const bgColor = item.calendarColor || '#3B82F6';

                      return (
                        <div
                          key={item.id}
                          className="month-event-pill"
                          onClick={e => {
                            e.stopPropagation();
                            onSelectEvent?.(item);
                          }}
                          title={item.title}
                          style={{
                            padding: '2px 4px',
                            borderRadius: '3px',
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            backgroundColor: isAllDay ? bgColor : 'rgba(255, 255, 255, 0.05)',
                            color: isAllDay ? '#ffffff' : 'var(--text-primary)',
                            borderLeft: isAllDay ? 'none' : `3px solid ${bgColor}`,
                            cursor: 'pointer',
                            transition: 'var(--transition-fast)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {!isAllDay && item.startAt && (
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                              {new Date(item.startAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })}
                            </span>
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.title}
                          </span>
                        </div>
                      );
                    })}

                    {totalItems.length > 3 && (
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: 'var(--text-muted)',
                          paddingLeft: '4px',
                        }}
                      >
                        +{totalItems.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
