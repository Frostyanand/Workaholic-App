import React, { useState } from 'react';
import { X, CalendarX, AlertCircle } from 'lucide-react';
import * as bookingApi from '../../services/booking.api.js';

export function DateExceptionModal({ isOpen, onClose, workspaceId, pageId, onSaved }) {
  const [exceptionDate, setExceptionDate] = useState('');
  const [isAvailable, setIsAvailable] = useState(false);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('15:00');
  const [reason, setReason] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!exceptionDate) {
      setError('Please choose a date');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        exceptionDate,
        isAvailable,
        startTime: isAvailable ? `${startTime}:00` : null,
        endTime: isAvailable ? `${endTime}:00` : null,
        reason: reason.trim() || null,
      };

      const res = await bookingApi.createAvailabilityException(workspaceId, pageId, payload);
      if (onSaved) onSaved(res);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add date exception');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      data-testid="date-exception-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--bg-secondary, #131722)',
          border: '1px solid var(--border-color, #2d3748)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary, #f1f5f9)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CalendarX size={20} color="var(--accent-primary, #6366f1)" />
            Add Date Override / Exception
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--accent-danger, #ef4444)',
              color: '#fca5a5',
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
            >
              Override Date *
            </label>
            <input
              type="date"
              value={exceptionDate}
              onChange={e => setExceptionDate(e.target.value)}
              required
              data-testid="exception-date-input"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #2d3748)',
                background: 'var(--bg-primary, #0a0d14)',
                color: '#fff',
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={e => setIsAvailable(e.target.checked)}
                data-testid="exception-available-toggle"
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px' }}>
                Open with custom hours (unchecked = block full day / holiday)
              </span>
            </label>
          </div>

          {isAvailable && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: 'var(--text-secondary, #94a3b8)',
                    marginBottom: '4px',
                  }}
                >
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  data-testid="exception-start-time"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #2d3748)',
                    background: 'var(--bg-primary, #0a0d14)',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: 'var(--text-secondary, #94a3b8)',
                    marginBottom: '4px',
                  }}
                >
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  data-testid="exception-end-time"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #2d3748)',
                    background: 'var(--bg-primary, #0a0d14)',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
            >
              Reason / Label (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. National Holiday, Doctor Appointment"
              data-testid="exception-reason-input"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #2d3748)',
                background: 'var(--bg-primary, #0a0d14)',
                color: '#fff',
                fontSize: '14px',
              }}
            />
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #2d3748)',
                background: 'transparent',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              data-testid="save-exception-btn"
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-primary, #6366f1)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Adding...' : 'Add Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
