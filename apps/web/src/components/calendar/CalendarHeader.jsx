import React from 'react';
import { Button } from '../common/Button.jsx';
import { formatHeaderTitle } from '../../utils/calendar.js';

export function CalendarHeader({
  currentDate,
  view,
  onViewChange,
  onNavigatePrev,
  onNavigateNext,
  onNavigateToday,
  onCreateEvent,
  onToggleFilter,
  isFilterOpen,
  onShareCalendar,
}) {
  const views = [
    { id: 'DAY', label: 'Day' },
    { id: 'WEEK', label: 'Week' },
    { id: 'WORKWEEK', label: 'Workweek' },
    { id: 'MONTH', label: 'Month' },
    { id: 'AGENDA', label: 'Agenda' },
  ];

  return (
    <header
      className="calendar-header"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-md)',
        padding: 'var(--space-md) var(--space-lg)',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
      }}
    >
      {/* Left Navigation Cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNavigateToday}
          aria-label="Jump to current date"
        >
          Today
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigatePrev}
            aria-label="Previous period"
            style={{ padding: '6px 10px' }}
          >
            &larr;
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateNext}
            aria-label="Next period"
            style={{ padding: '6px 10px' }}
          >
            &rarr;
          </Button>
        </div>

        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginLeft: 'var(--space-sm)',
            userSelect: 'none',
          }}
        >
          {formatHeaderTitle(currentDate, view)}
        </h2>
      </div>

      {/* Right Controls Cluster */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}
      >
        {/* View Switcher Segmented Control */}
        <div
          role="tablist"
          aria-label="Calendar view selector"
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-secondary)',
            padding: '3px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {views.map(v => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => onViewChange(v.id)}
              style={{
                padding: '4px 12px',
                fontSize: '0.8125rem',
                fontWeight: view === v.id ? '600' : '400',
                color: view === v.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: view === v.id ? 'var(--bg-surface-elevated)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                transition: 'var(--transition-fast)',
                cursor: 'pointer',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Filter Toggle Button */}
        <Button
          variant={isFilterOpen ? 'primary' : 'secondary'}
          size="sm"
          onClick={onToggleFilter}
          aria-label="Toggle calendar visibility filter"
        >
          Calendars
        </Button>

        {/* Share Public Link Button */}
        {onShareCalendar && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onShareCalendar}
            aria-label="Share calendar public link"
          >
            🔗 Share Link
          </Button>
        )}

        {/* Action Buttons */}
        <Button
          variant="primary"
          size="sm"
          onClick={onCreateEvent}
          aria-label="Create new calendar event"
        >
          + Event
        </Button>
      </div>
    </header>
  );
}
