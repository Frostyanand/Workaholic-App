import React from 'react';
import { Button } from '../common/Button.jsx';

export function CalendarFilterPanel({
  calendars = [],
  selectedCalendarIds = [],
  onToggleCalendar,
  onSelectAllCalendars,
  onDeselectAllCalendars,
  includeWorkBlocks,
  onToggleWorkBlocks,
  includeTasks,
  onToggleTasks,
  onCreateCalendar,
}) {
  return (
    <div
      className="calendar-filter-panel"
      style={{
        width: '240px',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-lg)',
        padding: 'var(--space-md)',
        overflowY: 'auto',
      }}
    >
      {/* 1. Calendars Section */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-sm)',
          }}
        >
          <h3
            style={{
              fontSize: '0.8125rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
            }}
          >
            Calendars
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {onSelectAllCalendars && (
              <button
                type="button"
                onClick={onSelectAllCalendars}
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 2px',
                }}
              >
                All
              </button>
            )}
            {onDeselectAllCalendars && (
              <button
                type="button"
                onClick={onDeselectAllCalendars}
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 2px',
                }}
              >
                None
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateCalendar}
              style={{ padding: '2px 6px', fontSize: '0.75rem' }}
            >
              + Add
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {calendars.map(cal => {
            const isSelected = selectedCalendarIds.includes(cal.id);
            return (
              <label
                key={cal.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  fontSize: '0.875rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleCalendar(cal.id)}
                  style={{
                    accentColor: cal.color,
                    width: '15px',
                    height: '15px',
                    cursor: 'pointer',
                  }}
                />
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: cal.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {cal.name}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 2. Integrated Sources */}
      <div>
        <h3
          style={{
            fontSize: '0.8125rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-sm)',
          }}
        >
          Integrated Work
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '4px 6px',
            }}
          >
            <input
              type="checkbox"
              checked={includeWorkBlocks}
              onChange={e => onToggleWorkBlocks(e.target.checked)}
              style={{ accentColor: '#10B981', width: '15px', height: '15px', cursor: 'pointer' }}
            />
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                flexShrink: 0,
              }}
            />
            <span>Work Blocks</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '4px 6px',
            }}
          >
            <input
              type="checkbox"
              checked={includeTasks}
              onChange={e => onToggleTasks(e.target.checked)}
              style={{ accentColor: '#EF4444', width: '15px', height: '15px', cursor: 'pointer' }}
            />
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#EF4444',
                flexShrink: 0,
              }}
            />
            <span>Task Deadlines</span>
          </label>
        </div>
      </div>
    </div>
  );
}
