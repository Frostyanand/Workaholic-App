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
  const [editMode, setEditMode] = useState('THIS');
  const [recurrenceFreq, setRecurrenceFreq] = useState('NONE');
  const [customUnit, setCustomUnit] = useState('WEEKLY');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState([1]);
  const [recurrenceEndType, setRecurrenceEndType] = useState('NEVER');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [recurrenceCount, setRecurrenceCount] = useState(10);
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

      if (initialEvent.isRecurring) {
        setEditMode('THIS');
      }
      if (initialEvent.recurrenceRule) {
        setRecurrenceFreq(initialEvent.recurrenceRule.frequency || 'NONE');
        setRecurrenceInterval(initialEvent.recurrenceRule.interval || 1);
        if (initialEvent.recurrenceRule.endAt) {
          setRecurrenceEndType('UNTIL');
          setRecurrenceUntil(toLocalDateString(new Date(initialEvent.recurrenceRule.endAt)));
        } else if (initialEvent.recurrenceRule.occurrenceCount) {
          setRecurrenceEndType('COUNT');
          setRecurrenceCount(initialEvent.recurrenceRule.occurrenceCount);
        } else {
          setRecurrenceEndType('NEVER');
        }
      }
    } else {
      // New Event Default
      setTitle('');
      setCalendarId(calendars.find(c => c.isDefault)?.id || calendars[0]?.id || '');
      setIsAllDay(false);
      setEditMode('THIS');
      setRecurrenceFreq('NONE');
      setRecurrenceInterval(1);
      setCustomUnit('WEEKLY');
      setSelectedDays([1]);
      setRecurrenceEndType('NEVER');
      setRecurrenceUntil('');
      setRecurrenceCount(10);

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

      if (initialEvent?.isRecurring) {
        payload.editMode = editMode;
      }

      if (recurrenceFreq !== 'NONE') {
        let recurrenceRule = null;
        if (recurrenceFreq === 'WEEKDAYS') {
          recurrenceRule = {
            frequency: 'WEEKLY',
            interval: 1,
            byWeekday: [1, 2, 3, 4, 5],
          };
        } else if (recurrenceFreq === 'CUSTOM') {
          recurrenceRule = {
            frequency: customUnit,
            interval: Math.max(1, parseInt(recurrenceInterval, 10) || 1),
            ...(customUnit === 'WEEKLY' && selectedDays.length > 0
              ? { byWeekday: selectedDays }
              : {}),
          };
        } else {
          recurrenceRule = {
            frequency: recurrenceFreq,
            interval: Math.max(1, parseInt(recurrenceInterval, 10) || 1),
          };
        }

        if (recurrenceEndType === 'UNTIL' && recurrenceUntil) {
          recurrenceRule.endAt = `${recurrenceUntil}T23:59:59.999Z`;
        } else if (recurrenceEndType === 'COUNT' && recurrenceCount > 0) {
          recurrenceRule.occurrenceCount = parseInt(recurrenceCount, 10);
        }

        payload.recurrence = recurrenceRule;
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

        {/* Recurring Series Edit Scope */}
        {initialEvent?.isRecurring && (
          <div
            id="recurring-edit-scope"
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid var(--accent-primary)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-xs)',
            }}
          >
            <span
              style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}
            >
              Edit Recurring Event
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { value: 'THIS', label: 'This occurrence only' },
                { value: 'THIS_AND_FOLLOWING', label: 'This and following occurrences' },
                { value: 'SERIES', label: 'All occurrences in series' },
              ].map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    fontSize: '0.8125rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="editMode"
                    value={opt.value}
                    checked={editMode === opt.value}
                    onChange={() => setEditMode(opt.value)}
                    style={{ cursor: 'pointer' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
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

        {/* Recurrence Settings */}
        {(!initialEvent?.isRecurring ||
          editMode === 'SERIES' ||
          editMode === 'THIS_AND_FOLLOWING') && (
          <div
            style={{
              padding: 'var(--space-md)',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label
                htmlFor="event-recurrence-freq"
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                }}
              >
                Repeat
              </label>
            </div>
            <select
              id="event-recurrence-freq"
              value={recurrenceFreq}
              onChange={e => setRecurrenceFreq(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="NONE">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKDAYS">Every weekday (Monday to Friday)</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
              <option value="CUSTOM">Custom...</option>
            </select>

            {recurrenceFreq === 'CUSTOM' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-sm)',
                  marginTop: 'var(--space-xs)',
                  paddingTop: 'var(--space-xs)',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Repeat every
                  </span>
                  <input
                    id="event-recurrence-interval"
                    type="number"
                    min="1"
                    max="99"
                    value={recurrenceInterval}
                    onChange={e =>
                      setRecurrenceInterval(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    style={{
                      width: '60px',
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <select
                    id="event-recurrence-unit"
                    value={customUnit}
                    onChange={e => setCustomUnit(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="DAILY">Day(s)</option>
                    <option value="WEEKLY">Week(s)</option>
                    <option value="MONTHLY">Month(s)</option>
                    <option value="YEARLY">Year(s)</option>
                  </select>
                </div>

                {customUnit === 'WEEKLY' && (
                  <div>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '6px',
                      }}
                    >
                      Repeat on
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[
                        { label: 'S', day: 0 },
                        { label: 'M', day: 1 },
                        { label: 'T', day: 2 },
                        { label: 'W', day: 3 },
                        { label: 'T', day: 4 },
                        { label: 'F', day: 5 },
                        { label: 'S', day: 6 },
                      ].map(({ label, day }) => {
                        const isSelected = selectedDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                if (selectedDays.length > 1) {
                                  setSelectedDays(selectedDays.filter(d => d !== day));
                                }
                              } else {
                                setSelectedDays([...selectedDays, day].sort((a, b) => a - b));
                              }
                            }}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              border: isSelected
                                ? '1px solid var(--accent-primary)'
                                : '1px solid var(--border-subtle)',
                              backgroundColor: isSelected
                                ? 'var(--accent-primary)'
                                : 'var(--bg-secondary)',
                              color: isSelected ? '#fff' : 'var(--text-secondary)',
                              fontWeight: isSelected ? '600' : 'normal',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.75rem',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {recurrenceFreq !== 'NONE' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  marginTop: 'var(--space-xs)',
                  paddingTop: 'var(--space-xs)',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: '600',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Ends
                </span>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    fontSize: '0.8125rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="recurrenceEndType"
                    value="NEVER"
                    checked={recurrenceEndType === 'NEVER'}
                    onChange={() => setRecurrenceEndType('NEVER')}
                  />
                  Never
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    fontSize: '0.8125rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="recurrenceEndType"
                    value="UNTIL"
                    checked={recurrenceEndType === 'UNTIL'}
                    onChange={() => setRecurrenceEndType('UNTIL')}
                  />
                  On date
                  {recurrenceEndType === 'UNTIL' && (
                    <input
                      id="event-recurrence-until"
                      type="date"
                      value={recurrenceUntil}
                      onChange={e => setRecurrenceUntil(e.target.value)}
                      style={{
                        marginLeft: '8px',
                        padding: '4px 8px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8125rem',
                      }}
                    />
                  )}
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    fontSize: '0.8125rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="recurrenceEndType"
                    value="COUNT"
                    checked={recurrenceEndType === 'COUNT'}
                    onChange={() => setRecurrenceEndType('COUNT')}
                  />
                  After
                  {recurrenceEndType === 'COUNT' && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginLeft: '8px',
                      }}
                    >
                      <input
                        id="event-recurrence-count"
                        type="number"
                        min="1"
                        max="999"
                        value={recurrenceCount}
                        onChange={e =>
                          setRecurrenceCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        style={{
                          width: '55px',
                          padding: '4px 8px',
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '0.8125rem',
                        }}
                      />
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        occurrences
                      </span>
                    </div>
                  )}
                </label>
              </div>
            )}
          </div>
        )}

        {initialEvent?.isRecurring && editMode === 'THIS' && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            ℹ️ Changes will apply to this occurrence only. To modify the recurrence pattern, select
            "All occurrences in series".
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
