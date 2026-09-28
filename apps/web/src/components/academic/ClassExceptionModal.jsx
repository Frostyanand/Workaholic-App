import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Ban, CalendarClock } from 'lucide-react';

export function ClassExceptionModal({
  isOpen,
  onClose,
  mode = 'CANCEL', // 'CANCEL' | 'RESCHEDULE'
  classEvent = null,
  calendarDate = '',
  scheduleEntry = null,
  onSubmit,
}) {
  const [reason, setReason] = useState('');
  const [rescheduledDate, setRescheduledDate] = useState('');
  const [rescheduledStartTime, setRescheduledStartTime] = useState('14:00');
  const [rescheduledEndTime, setRescheduledEndTime] = useState('15:00');
  const [rescheduledRoom, setRescheduledRoom] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setRescheduledDate(calendarDate || new Date().toISOString().slice(0, 10));
      setRescheduledStartTime(scheduleEntry?.startTime || '14:00');
      setRescheduledEndTime(scheduleEntry?.endTime || '15:00');
      setRescheduledRoom(scheduleEntry?.room || '');
      setError(null);
    }
  }, [isOpen, calendarDate, scheduleEntry]);

  if (!isOpen) return null;

  const isCancel = mode === 'CANCEL';

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!calendarDate) {
      setError('Original calendar date is required');
      return;
    }

    try {
      setIsSubmitting(true);
      if (isCancel) {
        await onSubmit({
          scheduleEntryId: scheduleEntry?.id || classEvent?.schedule_entry_id,
          calendarDate,
          reason: reason.trim() || undefined,
        });
      } else {
        if (!rescheduledDate || !rescheduledStartTime || !rescheduledEndTime) {
          setError('Rescheduled date, start time, and end time are required');
          return;
        }
        if (rescheduledEndTime <= rescheduledStartTime) {
          setError('End time must be strictly after start time');
          return;
        }
        await onSubmit({
          scheduleEntryId: scheduleEntry?.id || classEvent?.schedule_entry_id,
          calendarDate,
          rescheduledDate,
          rescheduledStartTime,
          rescheduledEndTime,
          rescheduledRoom: rescheduledRoom.trim() || undefined,
          reason: reason.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err.message || `Failed to ${isCancel ? 'cancel' : 'reschedule'} class`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const courseTitle = scheduleEntry?.courseName || classEvent?.title || 'Selected Class';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isCancel ? `Cancel Class: ${courseTitle}` : `Reschedule Class: ${courseTitle}`}
      size="md"
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        data-testid="class-exception-modal"
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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 0.8rem',
            background: 'var(--bg-surface, #161c2e)',
            border: '1px solid var(--border-subtle, #232b40)',
            borderRadius: '6px',
            fontSize: '0.85rem',
          }}
        >
          {isCancel ? (
            <Ban size={16} color="#ef4444" />
          ) : (
            <CalendarClock size={16} color="#6366f1" />
          )}
          <span>
            Target occurrence on <strong>{calendarDate}</strong> ({courseTitle})
          </span>
        </div>

        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
          {isCancel
            ? 'Only this single class occurrence will be marked as cancelled. The underlying Day Order timetable and other classes on this date will remain active.'
            : 'This class will move to the designated date and time as an occurrence exception. The reusable schedule template remains unchanged.'}
        </p>

        {!isCancel && (
          <>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  marginBottom: '0.35rem',
                  fontWeight: 500,
                }}
              >
                Rescheduled Date *
              </label>
              <input
                type="date"
                value={rescheduledDate}
                onChange={e => setRescheduledDate(e.target.value)}
                data-testid="reschedule-date-input"
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
                  value={rescheduledStartTime}
                  onChange={e => setRescheduledStartTime(e.target.value)}
                  data-testid="reschedule-start-time"
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
                  value={rescheduledEndTime}
                  onChange={e => setRescheduledEndTime(e.target.value)}
                  data-testid="reschedule-end-time"
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

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  marginBottom: '0.35rem',
                  fontWeight: 500,
                }}
              >
                Rescheduled Room (Optional)
              </label>
              <input
                type="text"
                value={rescheduledRoom}
                onChange={e => setRescheduledRoom(e.target.value)}
                placeholder="e.g. Lab 3, Auditorium"
                data-testid="reschedule-room-input"
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
          </>
        )}

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.85rem',
              marginBottom: '0.35rem',
              fontWeight: 500,
            }}
          >
            Reason (Optional)
          </label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={isCancel ? 'e.g. Faculty on leave, Symposium' : 'e.g. Compensation class'}
            data-testid="exception-reason-input"
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginTop: '0.5rem',
          }}
        >
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
          <Button
            variant={isCancel ? 'danger' : 'primary'}
            type="submit"
            loading={isSubmitting}
            data-testid="confirm-exception-btn"
          >
            {isCancel ? 'Confirm Cancellation' : 'Confirm Reschedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
