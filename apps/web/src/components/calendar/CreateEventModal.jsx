import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { toLocalDateString } from '../../utils/calendar.js';

export function CreateEventModal({
  isOpen,
  onClose,
  onSubmit,
  calendars = [],
  initialDate,
  initialHour,
  initialEvent = null,
}) {
  const [title, setTitle] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PRIVATE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialEvent) {
      setTitle(initialEvent.title || '');
      setCalendarId(initialEvent.calendarId || calendars[0]?.id || '');
      setIsAllDay(Boolean(initialEvent.isAllDay));
      if (initialEvent.isAllDay) {
        setStartDate(initialEvent.startDate || '');
        setEndDate(initialEvent.endDate || initialEvent.startDate || '');
      } else {
        const s = new Date(initialEvent.startAt);
        const e = new Date(initialEvent.endAt);
        setStartDate(toLocalDateString(s));
        setEndDate(toLocalDateString(e));
        setStartTime(s.toTimeString().slice(0, 5));
        setEndTime(e.toTimeString().slice(0, 5));
      }
      setLocation(initialEvent.location || '');
      setMeetingUrl(initialEvent.meetingUrl || '');
      setDescription(initialEvent.description || '');
      setVisibility(initialEvent.visibility || 'PRIVATE');
    } else {
      // New Event Default
      setTitle('');
      setCalendarId(calendars.find(c => c.isDefault)?.id || calendars[0]?.id || '');
      setIsAllDay(false);

      const targetDate = initialDate || toLocalDateString(new Date());
      setStartDate(targetDate);
      setEndDate(targetDate);

      const hour = initialHour !== undefined ? String(initialHour).padStart(2, '0') : '09';
      const nextHour =
        initialHour !== undefined ? String(Math.min(initialHour + 1, 23)).padStart(2, '0') : '10';
      setStartTime(`${hour}:00`);
      setEndTime(`${nextHour}:00`);

      setLocation('');
      setMeetingUrl('');
      setDescription('');
      setVisibility('PRIVATE');
    }
    setError(null);
  }, [isOpen, initialEvent, initialDate, initialHour, calendars]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Event title is required');
      return;
    }
    if (!calendarId) {
      setError('Please select a calendar');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let payload;
      if (isAllDay) {
        if (!startDate) {
          throw new Error('Start date is required for all-day events');
        }
        payload = {
          calendarId,
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          meetingUrl: meetingUrl.trim() || null,
          visibility,
          isAllDay: true,
          startDate,
          endDate: endDate || startDate,
        };
      } else {
        if (!startDate || !startTime || !endTime) {
          throw new Error('Date and time intervals are required');
        }
        const startIso = new Date(`${startDate}T${startTime}:00`).toISOString();
        const endIso = new Date(`${endDate || startDate}T${endTime}:00`).toISOString();

        if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
          throw new Error('End time must be strictly after start time');
        }

        payload = {
          calendarId,
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          meetingUrl: meetingUrl.trim() || null,
          visibility,
          isAllDay: false,
          startAt: startIso,
          endAt: endIso,
        };
      }

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save event');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialEvent ? 'Edit Event' : 'Create New Event'}
      size="md"
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
      >
        {error && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--accent-danger)',
              borderRadius: 'var(--radius-sm)',
              color: '#fca5a5',
              fontSize: '0.8125rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Title Input */}
        <div>
          <label
            htmlFor="event-title"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: '600',
              marginBottom: '4px',
              color: 'var(--text-secondary)',
            }}
          >
            Title *
          </label>
          <input
            id="event-title"
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Sprint Review or College Holiday"
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Calendar & Visibility */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
          <div>
            <label
              htmlFor="event-calendar"
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: '600',
                marginBottom: '4px',
                color: 'var(--text-secondary)',
              }}
            >
              Calendar *
            </label>
            <select
              id="event-calendar"
              value={calendarId}
              onChange={e => setCalendarId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            >
              {calendars.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isDefault ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="event-visibility"
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: '600',
                marginBottom: '4px',
                color: 'var(--text-secondary)',
              }}
            >
              Visibility
            </label>
            <select
              id="event-visibility"
              value={visibility}
              onChange={e => setVisibility(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="PRIVATE">Private (Only you)</option>
              <option value="SHARED">Shared (Workspace members)</option>
              <option value="PUBLIC">Public (Booking & public links)</option>
            </select>
          </div>
        </div>

        {/* All-Day Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <input
            id="event-all-day"
            type="checkbox"
            checked={isAllDay}
            onChange={e => setIsAllDay(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label
            htmlFor="event-all-day"
            style={{ fontSize: '0.875rem', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            All-day event (whole calendar date)
          </label>
        </div>

        {/* Temporal Pickers */}
        {isAllDay ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div>
              <label
                htmlFor="event-start-date"
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                Start Date
              </label>
              <input
                id="event-start-date"
                type="date"
                required
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label
                htmlFor="event-end-date"
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                End Date
              </label>
              <input
                id="event-end-date"
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}
            >
              <div>
                <label
                  htmlFor="event-start-date"
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Date
                </label>
                <input
                  id="event-start-date"
                  type="date"
                  required
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setEndDate(e.target.value);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xs)' }}
              >
                <div>
                  <label
                    htmlFor="event-start-time"
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Start
                  </label>
                  <input
                    id="event-start-time"
                    type="time"
                    required
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="event-end-time"
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    End
                  </label>
                  <input
                    id="event-end-time"
                    type="time"
                    required
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Location & URL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
          <div>
            <label
              htmlFor="event-location"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginBottom: '4px',
              }}
            >
              Location
            </label>
            <input
              id="event-location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Conference Room B"
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <label
              htmlFor="event-meeting-url"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginBottom: '4px',
              }}
            >
              Meeting URL
            </label>
            <input
              id="event-meeting-url"
              type="url"
              value={meetingUrl}
              onChange={e => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/..."
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="event-description"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            Description
          </label>
          <textarea
            id="event-description"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Agenda, notes, or background context..."
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-sm)',
            marginTop: 'var(--space-sm)',
          }}
        >
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initialEvent ? 'Update Event' : 'Create Event'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
