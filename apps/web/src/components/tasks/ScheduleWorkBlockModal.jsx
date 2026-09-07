import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { toLocalDateString } from '../../utils/calendar.js';

export function ScheduleWorkBlockModal({ isOpen, onClose, task, onSubmit }) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setDate(toLocalDateString(now));

      // Suggest next hour
      const nextHour = (now.getHours() + 1) % 24;
      const endHour = (nextHour + 1) % 24;
      setStartTime(`${String(nextHour).padStart(2, '0')}:00`);
      setEndTime(`${String(endHour).padStart(2, '0')}:00`);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !task) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!date || !startTime || !endTime) {
      setError('Date, start time, and end time are required.');
      return;
    }

    const startIso = new Date(`${date}T${startTime}:00`).toISOString();
    const endIso = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endIso) <= new Date(startIso)) {
      setError('End time must be strictly after start time.');
      return;
    }

    try {
      setIsSubmitting(true);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await onSubmit({
        startAt: startIso,
        endAt: endIso,
        timezone: tz,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to schedule work block');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Work Block" size="sm">
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div>
          <label
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              display: 'block',
              marginBottom: '4px',
            }}
          >
            Task
          </label>
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            {task.title}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
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

        <div>
          <label
            htmlFor="work-block-date"
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '6px',
            }}
          >
            Date
          </label>
          <input
            id="work-block-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label
              htmlFor="work-block-start"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              Start Time
            </label>
            <input
              id="work-block-start"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              required
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

          <div>
            <label
              htmlFor="work-block-end"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              End Time
            </label>
            <input
              id="work-block-end"
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              required
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
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Scheduling...' : 'Schedule Block'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
