import React from 'react';
import { EmptyState } from '../common/EmptyState.jsx';
import { Badge } from '../common/Badge.jsx';
import { formatISODate } from '@workaholic/shared';

export function AgendaView({
  events = [],
  workBlocks = [],
  deadlines = [],
  onSelectEvent,
  onCreateEvent,
}) {
  const allItems = [
    ...events,
    ...workBlocks.map(wb => ({ ...wb, isWorkBlock: true })),
    ...deadlines.map(d => ({ ...d, isDeadline: true, isAllDay: true })),
  ];

  if (allItems.length === 0) {
    return (
      <EmptyState
        title="No scheduled events in this period"
        description="Your schedule is clear. Create an event or time block to plan your work."
        actionLabel="+ Create Event"
        onAction={onCreateEvent}
      />
    );
  }

  // Group items by calendar date
  const grouped = {};
  for (const item of allItems) {
    let dateKey;
    if (item.isAllDay) {
      dateKey = item.startDate || (item.startAt ? formatISODate(item.startAt) : 'Undated');
    } else {
      dateKey = item.startAt ? new Date(item.startAt).toISOString().split('T')[0] : 'Undated';
    }

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(item);
  }

  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="agenda-view" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)' }}>
      <div
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-xl)',
        }}
      >
        {sortedDates.map(dateKey => {
          const items = grouped[dateKey];
          const dateObj = new Date(`${dateKey}T00:00:00.000Z`);
          const formattedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          });

          return (
            <div
              key={dateKey}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}
            >
              {/* Date Group Header */}
              <div
                style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: 'var(--space-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{formattedDate}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Event Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                {items.map(item => {
                  const isAllDay = item.isAllDay;
                  const color = item.calendarColor || '#3B82F6';

                  let timeDisplay = 'All Day';
                  if (!isAllDay && item.startAt && item.endAt) {
                    const s = new Date(item.startAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    });
                    const e = new Date(item.endAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    });
                    timeDisplay = `${s} – ${e}`;
                  }

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectEvent?.(item)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-md)',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: `4px solid ${color}`,
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        transition: 'var(--transition-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}
                        >
                          <span
                            style={{
                              fontWeight: '600',
                              fontSize: '0.9375rem',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {item.title}
                          </span>
                          {item.calendarName && (
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-full)',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {item.calendarName}
                            </span>
                          )}
                          {item.conflicts && item.conflicts.length > 0 && (
                            <Badge variant="warning">Conflict</Badge>
                          )}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>{timeDisplay}</span>
                          {item.location && <span>📍 {item.location}</span>}
                          {item.meetingUrl && (
                            <a
                              href={item.meetingUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                color: 'var(--accent-primary)',
                                textDecoration: 'underline',
                              }}
                            >
                              Join Call ↗
                            </a>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>&rarr;</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
