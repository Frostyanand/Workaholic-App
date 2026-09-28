import React, { useState } from 'react';
import { X, Calendar, AlertTriangle, AlertCircle } from 'lucide-react';
import * as bookingApi from '../../services/booking.api.js';

export function OwnerBookingActionModal({
  isOpen,
  onClose,
  workspaceId,
  booking,
  mode = 'cancel', // 'cancel' | 'reschedule'
  onSuccess,
}) {
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !booking) return null;

  const isCancel = mode === 'cancel';

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      if (isCancel) {
        const res = await bookingApi.ownerCancelBooking(
          workspaceId,
          booking.id,
          reason.trim() || undefined,
        );
        if (onSuccess) onSuccess(res);
      } else {
        if (!newDate || !newTime) {
          setError('Please specify both the new date and time');
          return;
        }
        // Build ISO start time string
        const newStartAt = new Date(`${newDate}T${newTime}:00`).toISOString();
        const res = await bookingApi.ownerRescheduleBooking(
          workspaceId,
          booking.id,
          newStartAt,
          booking.timezone || 'UTC',
          reason.trim() || undefined,
        );
        if (onSuccess) onSuccess(res);
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      data-testid="owner-booking-action-modal"
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
            {isCancel ? (
              <>
                <AlertTriangle size={20} color="var(--accent-danger, #ef4444)" />
                Cancel Appointment
              </>
            ) : (
              <>
                <Calendar size={20} color="var(--accent-primary, #6366f1)" />
                Reschedule Appointment
              </>
            )}
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

        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{booking.guestName}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
            {booking.guestEmail}
          </div>
          <div
            style={{ fontSize: '12px', color: 'var(--accent-primary, #6366f1)', marginTop: '4px' }}
          >
            Current: {new Date(booking.startAt).toLocaleString()} ({booking.timezone || 'UTC'})
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {!isCancel && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  New Date *
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  required
                  data-testid="reschedule-date-input"
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
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  New Time *
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  required
                  data-testid="reschedule-time-input"
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
              Reason for {isCancel ? 'Cancellation' : 'Rescheduling'} (Optional)
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide a reason for the guest..."
              rows={3}
              data-testid="action-reason-input"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #2d3748)',
                background: 'var(--bg-primary, #0a0d14)',
                color: '#fff',
                fontSize: '14px',
                resize: 'vertical',
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
              data-testid="confirm-action-btn"
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: isCancel
                  ? 'var(--accent-danger, #ef4444)'
                  : 'var(--accent-primary, #6366f1)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Processing...' : isCancel ? 'Confirm Cancellation' : 'Confirm Reschedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
