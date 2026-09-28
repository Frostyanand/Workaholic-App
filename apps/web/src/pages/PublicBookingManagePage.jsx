import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { Badge } from '../components/common/Badge.jsx';
import * as bookingApi from '../services/booking.api.js';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function PublicBookingManagePage() {
  const { token } = useParams();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Timezone
  const [guestTimezone, setGuestTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  // Action state: 'VIEW' | 'CANCEL' | 'RESCHEDULE'
  const [actionView, setActionView] = useState('VIEW');
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Reschedule slots state
  const [rescheduleDate, setRescheduleDate] = useState(
    () => new Date().toISOString().split('T')[0],
  );
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Fetch Booking by Token
  const loadBooking = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const data = await bookingApi.fetchPublicBooking(token);
      setBooking(data);
      if (data?.timezone) {
        setGuestTimezone(data.timezone);
      }
    } catch (err) {
      setError(err.message || 'Appointment not found or link has expired.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadBooking();
  }, [loadBooking]);

  // Load slots for reschedule
  const loadRescheduleSlots = useCallback(async () => {
    if (!booking?.pageSlug || !booking?.bookingTypeId || !rescheduleDate) return;
    try {
      setSlotsLoading(true);
      const res = await bookingApi.fetchPublicAvailability(
        booking.pageSlug,
        booking.bookingTypeId,
        rescheduleDate,
        rescheduleDate,
        guestTimezone,
      );
      setAvailableSlots(res?.slots || []);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [booking, rescheduleDate, guestTimezone]);

  useEffect(() => {
    if (actionView === 'RESCHEDULE') {
      loadRescheduleSlots();
    }
  }, [actionView, loadRescheduleSlots]);

  // Handle Cancellation
  async function handleConfirmCancel(e) {
    e.preventDefault();
    try {
      setActionLoading(true);
      setActionError(null);
      const res = await bookingApi.guestCancelBooking(token, actionReason.trim() || undefined);
      setBooking(res);
      setActionSuccess('Your appointment has been successfully cancelled.');
      setActionView('VIEW');
    } catch (err) {
      setActionError(
        err.message || 'Failed to cancel appointment. Cancellation notice policy may prevent this.',
      );
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Reschedule
  async function handleConfirmReschedule(e) {
    e.preventDefault();
    if (!selectedSlot) {
      setActionError('Please select a new time slot');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      const res = await bookingApi.guestRescheduleBooking(
        token,
        selectedSlot.startAt,
        guestTimezone,
        actionReason.trim() || undefined,
      );
      setBooking(res);
      setActionSuccess('Your appointment has been successfully rescheduled!');
      setActionView('VIEW');
      setSelectedSlot(null);
    } catch (err) {
      setActionError(
        err.message || 'Failed to reschedule. Selected slot may no longer be available.',
      );
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #0a0d14)',
          color: 'var(--text-primary, #f1f5f9)',
        }}
      >
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #0a0d14)',
          color: 'var(--text-primary, #f1f5f9)',
          padding: '24px',
        }}
      >
        <div
          data-testid="manage-booking-error"
          style={{
            maxWidth: '460px',
            textAlign: 'center',
            background: 'var(--bg-secondary, #131722)',
            padding: '36px',
            borderRadius: '16px',
            border: '1px solid var(--border-color, #2d3748)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <AlertCircle size={28} color="var(--accent-danger, #ef4444)" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '12px' }}>
            Appointment Not Found
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
            {error || 'Invalid management link.'}
          </p>
        </div>
      </div>
    );
  }

  const isConfirmed = booking.status === 'CONFIRMED';
  const isCancelled = booking.status === 'CANCELLED';
  const isRescheduled = booking.status === 'RESCHEDULED';

  let statusVariant = 'muted';
  if (isConfirmed) statusVariant = 'success';
  if (isCancelled) statusVariant = 'danger';
  if (isRescheduled) statusVariant = 'warning';

  return (
    <div
      data-testid="public-booking-manage-container"
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary, #0a0d14)',
        color: 'var(--text-primary, #f1f5f9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 16px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Brand Header */}
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--accent-primary, #6366f1)',
          }}
        >
          Workaholic Booking • Guest Self-Service
        </span>
      </div>

      <div
        data-testid="manage-booking-card"
        style={{
          width: '100%',
          maxWidth: '620px',
          background: 'var(--bg-secondary, #131722)',
          border: '1px solid var(--border-color, #2d3748)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Card Header */}
        <div
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid var(--border-color, #2d3748)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)' }}>
              Appointment with
            </span>
            <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '2px 0 0 0' }}>
              {booking.pageName || 'Host'}
            </h1>
          </div>
          <Badge variant={statusVariant}>{booking.status}</Badge>
        </div>

        {/* Feedback Alerts */}
        <div style={{ padding: '0 32px', paddingTop: actionSuccess || actionError ? '20px' : '0' }}>
          {actionSuccess && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid var(--accent-success, #10b981)',
                color: '#6ee7b7',
                padding: '12px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={16} />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--accent-danger, #ef4444)',
                color: '#fca5a5',
                padding: '12px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{actionError}</span>
            </div>
          )}
        </div>

        {/* VIEW MODE: Booking Information */}
        {actionView === 'VIEW' && (
          <div style={{ padding: '28px 32px' }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px 0' }}>
                {booking.bookingTypeName || 'Scheduled Meeting'}
              </h2>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary, #94a3b8)' }}>
                Reserved for <strong style={{ color: '#fff' }}>{booking.guestName}</strong> (
                {booking.guestEmail})
              </div>
            </div>

            {/* Time & Details Box */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color, #2d3748)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={18} color="var(--accent-primary, #6366f1)" />
                <span style={{ fontWeight: 500 }}>
                  {new Date(booking.startAt).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={18} color="var(--accent-primary, #6366f1)" />
                <span>
                  {new Date(booking.startAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: guestTimezone,
                  })}{' '}
                  -{' '}
                  {new Date(booking.endAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: guestTimezone,
                  })}{' '}
                  ({guestTimezone})
                </span>
              </div>

              {booking.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MapPin size={18} color="var(--accent-primary, #6366f1)" />
                  <span>{booking.location}</span>
                </div>
              )}
            </div>

            {/* Cancellation Notice if Cancelled */}
            {isCancelled && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '20px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 600, color: '#fca5a5', marginBottom: '4px' }}>
                  This appointment was cancelled
                </div>
                {booking.cancellationReason && (
                  <div style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                    Reason: {booking.cancellationReason}
                  </div>
                )}
              </div>
            )}

            {/* Rescheduled Notice if Rescheduled */}
            {isRescheduled && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '20px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 600, color: '#fcd34d', marginBottom: '4px' }}>
                  This appointment was rescheduled
                </div>
                {booking.rescheduledToManageToken && (
                  <Link
                    to={`/book/manage/${booking.rescheduledToManageToken}`}
                    style={{ color: 'var(--accent-primary, #6366f1)', textDecoration: 'underline' }}
                  >
                    View new appointment →
                  </Link>
                )}
              </div>
            )}

            {/* Actions for Confirmed Bookings */}
            {isConfirmed && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  data-testid="guest-reschedule-btn"
                  onClick={() => {
                    setActionError(null);
                    setActionSuccess(null);
                    setActionView('RESCHEDULE');
                  }}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #2d3748)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Reschedule
                </button>

                <button
                  type="button"
                  data-testid="guest-cancel-btn"
                  onClick={() => {
                    setActionError(null);
                    setActionSuccess(null);
                    setActionView('CANCEL');
                  }}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '8px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#fca5a5',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* CANCEL VIEW */}
        {actionView === 'CANCEL' && (
          <div style={{ padding: '28px 32px' }}>
            <h3
              style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#fca5a5' }}
            >
              Cancel Appointment
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary, #94a3b8)',
                marginBottom: '20px',
              }}
            >
              Are you sure you want to cancel your appointment? This action cannot be undone.
            </p>

            <form
              onSubmit={handleConfirmCancel}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Reason for cancellation (Optional)
                </label>
                <textarea
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  placeholder="Let the host know why you are cancelling..."
                  rows={3}
                  data-testid="guest-cancel-reason-input"
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
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActionView('VIEW')}
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
                  Keep Appointment
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  data-testid="confirm-guest-cancel-btn"
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-danger, #ef4444)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* RESCHEDULE VIEW */}
        {actionView === 'RESCHEDULE' && (
          <div style={{ padding: '28px 32px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              Select a New Appointment Time
            </h3>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary, #94a3b8)',
                marginBottom: '20px',
              }}
            >
              Choose a new available slot that fits your schedule.
            </p>

            {/* Date & Timezone selector */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  New Date
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => {
                    setRescheduleDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                  data-testid="guest-reschedule-date-input"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
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
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Timezone
                </label>
                <select
                  value={guestTimezone}
                  onChange={e => setGuestTimezone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #2d3748)',
                    background: 'var(--bg-primary, #0a0d14)',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                >
                  {COMMON_TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Slots Grid */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '10px',
                }}
              >
                Open Slots
              </label>

              {slotsLoading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <LoadingSpinner size="sm" />
                </div>
              ) : availableSlots.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '8px',
                    border: '1px dashed var(--border-color, #2d3748)',
                    color: 'var(--text-secondary, #94a3b8)',
                    fontSize: '13px',
                  }}
                >
                  No open slots on this date. Please pick another day.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                    gap: '8px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  {availableSlots.map((slot, idx) => {
                    const start = new Date(slot.startAt);
                    const timeLabel = start.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: guestTimezone,
                    });
                    const isSelected = selectedSlot?.startAt === slot.startAt;

                    return (
                      <button
                        key={idx}
                        type="button"
                        data-testid={`reschedule-slot-btn-${idx}`}
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          padding: '10px',
                          borderRadius: '6px',
                          border: isSelected
                            ? '1px solid var(--accent-primary, #6366f1)'
                            : '1px solid var(--border-color, #2d3748)',
                          background: isSelected
                            ? 'var(--accent-primary, #6366f1)'
                            : 'rgba(255, 255, 255, 0.03)',
                          color: isSelected ? '#fff' : 'var(--text-primary, #f1f5f9)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {timeLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <form
              onSubmit={handleConfirmReschedule}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Reason for rescheduling (Optional)
                </label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  placeholder="e.g. Schedule conflict"
                  data-testid="guest-reschedule-reason-input"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #2d3748)',
                    background: 'var(--bg-primary, #0a0d14)',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setActionView('VIEW')}
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
                  disabled={!selectedSlot || actionLoading}
                  data-testid="confirm-guest-reschedule-btn"
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-primary, #6366f1)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: !selectedSlot || actionLoading ? 'not-allowed' : 'pointer',
                    opacity: !selectedSlot || actionLoading ? 0.7 : 1,
                  }}
                >
                  {actionLoading ? 'Rescheduling...' : 'Confirm New Time'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
