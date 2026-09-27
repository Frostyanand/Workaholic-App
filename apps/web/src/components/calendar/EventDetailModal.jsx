import React from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';

export function EventDetailModal({ isOpen, onClose, event, onEdit, onDelete }) {
  if (!event) return null;

  const isAllDay = event.isAllDay;
  const color = event.calendarColor || '#3B82F6';

  let timeString = 'All-day Event';
  if (!isAllDay && event.startAt && event.endAt) {
    const s = new Date(event.startAt);
    const e = new Date(event.endAt);
    const datePart = s.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const startTime = s.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const endTime = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    timeString = `${datePart} • ${startTime} – ${endTime} (${event.timezone || 'UTC'})`;
  } else if (isAllDay) {
    const s = event.startDate || event.startAt?.split('T')[0];
    const e = event.endDate || event.endAt?.split('T')[0];
    timeString = s === e ? `Date: ${s}` : `Dates: ${s} through ${e}`;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={event.title} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {/* Conflict Warning Alert Banner */}
        {event.conflicts && event.conflicts.length > 0 && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid var(--accent-warning)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
            }}
          >
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <div style={{ fontSize: '0.8125rem', color: '#fde68a' }}>
              <strong>Scheduling Conflict:</strong> Overlaps with{' '}
              {event.conflicts.map(c => c.title).join(', ')}.
            </div>
          </div>
        )}

        {/* Calendar Badge & Time */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: color,
                display: 'inline-block',
              }}
            />
            <span
              style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)' }}
            >
              {event.calendarName || 'Calendar'}
            </span>
          </div>
          {isAllDay && <Badge variant="primary">All-Day</Badge>}
          {event.isRecurring && <Badge variant="secondary">🔄 Recurring</Badge>}
          {event.isWorkBlock && <Badge variant="success">Work Block</Badge>}
          {event.isDeadline && <Badge variant="danger">Deadline</Badge>}
          {event.visibility && (
            <Badge variant="secondary" id="event-detail-visibility">
              {event.visibility === 'PRIVATE'
                ? '🔒 Private'
                : event.visibility === 'SHARED'
                  ? '👥 Shared'
                  : '🌐 Public'}
            </Badge>
          )}
        </div>

        {/* Timing */}
        <div
          style={{
            fontSize: '0.875rem',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🕒</span>
          <span>{timeString}</span>
        </div>

        {/* Location */}
        {event.location && (
          <div
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📍</span>
            <span>{event.location}</span>
          </div>
        )}

        {/* Meeting URL */}
        {event.meetingUrl && (
          <div style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔗</span>
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
            >
              {event.meetingUrl}
            </a>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div
            style={{
              padding: 'var(--space-md)',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {event.description}
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'var(--space-md)',
          }}
        >
          {!event.isWorkBlock && !event.isDeadline ? (
            event.isRecurring ? (
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                <Button
                  variant="danger"
                  size="sm"
                  id="btn-delete-occurrence"
                  onClick={() => {
                    if (window.confirm('Delete this occurrence only?')) {
                      onDelete(event, 'THIS');
                      onClose();
                    }
                  }}
                >
                  Delete Occurrence
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  id="btn-delete-series"
                  onClick={() => {
                    if (window.confirm('Delete the entire recurring series?')) {
                      onDelete(event, 'SERIES');
                      onClose();
                    }
                  }}
                >
                  Delete Series
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this event?')) {
                    onDelete(event.id);
                    onClose();
                  }
                }}
              >
                Delete
              </Button>
            )
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            {!event.isWorkBlock && !event.isDeadline && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onEdit(event);
                  onClose();
                }}
              >
                Edit Event
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
