import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

export function ScheduleEntryModal({
  isOpen,
  onClose,
  entry = null,
  defaultDayOrder = 'DO1',
  dayOrderCount = 5,
  onSubmit,
}) {
  const [dayOrder, setDayOrder] = useState(defaultDayOrder);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [room, setRoom] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState('#6366F1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (entry) {
        setDayOrder(entry.dayOrder || defaultDayOrder);
        setCourseName(entry.courseName || '');
        setCourseCode(entry.courseCode || '');
        setInstructor(entry.instructor || '');
        setRoom(entry.room || '');
        setStartTime(entry.startTime || '09:00');
        setEndTime(entry.endTime || '10:00');
        setColor(entry.color || '#6366F1');
      } else {
        setDayOrder(defaultDayOrder);
        setCourseName('');
        setCourseCode('');
        setInstructor('');
        setRoom('');
        setStartTime('09:00');
        setEndTime('10:00');
        setColor('#6366F1');
      }
      setError(null);
    }
  }, [isOpen, entry, defaultDayOrder]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!courseName.trim()) {
      setError('Course name is required');
      return;
    }
    if (!startTime || !endTime) {
      setError('Start time and end time are required');
      return;
    }
    if (endTime <= startTime) {
      setError('End time must be strictly after start time');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        dayOrder,
        courseName: courseName.trim(),
        courseCode: courseCode.trim() || undefined,
        instructor: instructor.trim() || undefined,
        room: room.trim() || undefined,
        startTime,
        endTime,
        color,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save class entry');
    } finally {
      setIsSubmitting(false);
    }
  }

  const doOptions = Array.from({ length: dayOrderCount || 5 }, (_, i) => `DO${i + 1}`);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={entry ? 'Edit Class Entry' : 'Add Class to Timetable'}
      size="md"
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        {error && (
          <div
            style={{
              padding: '0.6rem 0.8rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--accent-danger, #ef4444)',
              borderRadius: '6px',
              color: '#f87171',
              fontSize: '0.85rem',
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Day Order *
            </label>
            <select
              value={dayOrder}
              onChange={e => setDayOrder(e.target.value)}
              data-testid="schedule-entry-do-select"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            >
              {doOptions.map(doKey => (
                <option key={doKey} value={doKey}>
                  {doKey}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Course / Subject Name *
            </label>
            <input
              type="text"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
              placeholder="e.g. Operating Systems, Mathematics"
              data-testid="schedule-entry-name-input"
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Course Code
            </label>
            <input
              type="text"
              value={courseCode}
              onChange={e => setCourseCode(e.target.value)}
              placeholder="e.g. 18CSC302J"
              data-testid="schedule-entry-code-input"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Instructor / Faculty
            </label>
            <input
              type="text"
              value={instructor}
              onChange={e => setInstructor(e.target.value)}
              placeholder="e.g. Dr. Raman"
              data-testid="schedule-entry-instructor-input"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Room / Classroom
            </label>
            <input
              type="text"
              value={room}
              onChange={e => setRoom(e.target.value)}
              placeholder="e.g. Tech Park 401"
              data-testid="schedule-entry-room-input"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Card Color
            </label>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              data-testid="schedule-entry-color-input"
              style={{
                width: '100%',
                height: '38px',
                padding: '2px',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Start Time *
            </label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              data-testid="schedule-entry-start-time"
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              End Time *
            </label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              data-testid="schedule-entry-end-time"
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginTop: '0.5rem',
          }}
        >
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={isSubmitting}
            data-testid="save-schedule-entry-btn"
          >
            {entry ? 'Save Changes' : 'Add Class'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
