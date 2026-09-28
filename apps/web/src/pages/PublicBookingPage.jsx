import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Globe,
  User,
  Mail,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
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

export function PublicBookingPage() {
  const { slug } = useParams();

  // Page data
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  // Booking Flow Steps: 'TYPE' | 'SLOT' | 'DETAILS' | 'CONFIRMED'
  const [step, setStep] = useState('TYPE');
  const [selectedType, setSelectedType] = useState(null);

  // Date & Timezone selection
  const [guestTimezone, setGuestTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    // YYYY-MM-DD
    return today.toISOString().split('T')[0];
  });

  // Slots state
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Guest details form state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Confirmed booking state
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load public page and types
  useEffect(() => {
    async function loadPage() {
      if (!slug) return;
      try {
        setLoading(true);
        setPageError(null);
        const data = await bookingApi.fetchPublicBookingPage(slug);
        setPage(data);

        // If only 1 type exists, auto-select it
        if (data?.bookingTypes && data.bookingTypes.length === 1) {
          setSelectedType(data.bookingTypes[0]);
          setStep('SLOT');
        }
      } catch (err) {
        setPageError({
          status: err.status || 500,
          message: err.message || 'This booking page is unavailable or has been revoked.',
        });
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [slug]);

  // Load availability slots when date, type, or timezone changes
  const loadSlots = useCallback(async () => {
    if (!slug || !selectedType || !selectedDate) return;

    try {
      setSlotsLoading(true);
      const res = await bookingApi.fetchPublicAvailability(
        slug,
        selectedType.id,
        selectedDate,
        selectedDate,
        guestTimezone,
      );
      setAvailableSlots(res?.slots || []);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, selectedType, selectedDate, guestTimezone]);

  useEffect(() => {
    if (step === 'SLOT' && selectedType) {
      loadSlots();
    }
  }, [step, selectedType, selectedDate, guestTimezone, loadSlots]);

  // Handle date navigation (prev/next day)
  const handleDateShift = days => {
    const current = new Date(`${selectedDate}T00:00:00`);
    current.setDate(current.getDate() + days);
    const formatted = current.toISOString().split('T')[0];
    setSelectedDate(formatted);
    setSelectedSlot(null);
  };

  // Submit booking
  async function handleConfirmBooking(e) {
    e.preventDefault();
    if (!guestName.trim() || !guestEmail.trim()) {
      setSubmitError('Please enter your name and email address');
      return;
    }
    if (!selectedSlot) {
      setSubmitError('No slot selected');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      const idempotencyKey = `pub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const payload = {
        bookingTypeId: selectedType.id,
        startAt: selectedSlot.startAt,
        timezone: guestTimezone,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim().toLowerCase(),
        guestNotes: guestNotes.trim() || undefined,
        idempotencyKey,
      };

      const result = await bookingApi.createPublicBooking(slug, payload);
      setConfirmedBooking(result);
      setStep('CONFIRMED');
    } catch (err) {
      setSubmitError(
        err.status === 409
          ? 'This time slot was just taken by another guest. Please choose a different slot.'
          : err.message || 'Failed to confirm booking. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Format date helper
  const formattedSelectedDate = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

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

  if (pageError) {
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
          data-testid="public-booking-error"
          style={{
            maxWidth: '460px',
            textAlign: 'center',
            background: 'var(--bg-secondary, #131722)',
            padding: '36px',
            borderRadius: '16px',
            border: '1px solid var(--border-color, #2d3748)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
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
            Booking Page Unavailable
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
            {pageError.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="public-booking-container"
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
          Workaholic Booking
        </span>
      </div>

      {/* Main Booking Card */}
      <div
        data-testid="public-booking-card"
        style={{
          width: '100%',
          maxWidth: step === 'SLOT' ? '880px' : '640px',
          background: 'var(--bg-secondary, #131722)',
          border: '1px solid var(--border-color, #2d3748)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Card Header */}
        <div
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid var(--border-color, #2d3748)',
            background: 'rgba(255, 255, 255, 0.015)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Calendar size={18} color="var(--accent-primary, #6366f1)" />
            <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>{page?.name}</h1>
          </div>
          {page?.description && (
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary, #94a3b8)',
                margin: '4px 0 0 0',
              }}
            >
              {page.description}
            </p>
          )}
        </div>

        {/* STEP 1: Select Appointment Type */}
        {step === 'TYPE' && (
          <div style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>
              Select an appointment type
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {page?.bookingTypes?.map(type => (
                <button
                  key={type.id}
                  type="button"
                  data-testid={`select-type-btn-${type.id}`}
                  onClick={() => {
                    setSelectedType(type);
                    setStep('SLOT');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, #2d3748)',
                    borderLeft: `5px solid ${type.color || '#6366f1'}`,
                    background: 'rgba(255, 255, 255, 0.02)',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px 0' }}>
                      {type.name}
                    </h3>
                    {type.description && (
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-secondary, #94a3b8)',
                          margin: '0 0 8px 0',
                        }}
                      >
                        {type.description}
                      </p>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} /> {type.durationMinutes} mins
                      </span>
                      {type.location && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={14} /> {type.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={20} color="var(--text-secondary, #94a3b8)" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: Slot Discovery (Date + Timeslots) */}
        {step === 'SLOT' && selectedType && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr' }}>
            {/* Left sidebar: Type Info & Date controls */}
            <div
              style={{
                padding: '28px',
                borderRight: '1px solid var(--border-color, #2d3748)',
                background: 'rgba(0, 0, 0, 0.15)',
              }}
            >
              {page?.bookingTypes?.length > 1 && (
                <button
                  type="button"
                  onClick={() => setStep('TYPE')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary, #6366f1)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginBottom: '16px',
                    padding: 0,
                  }}
                >
                  <ChevronLeft size={16} /> All appointment types
                </button>
              )}

              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0' }}>
                {selectedType.name}
              </h3>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--text-secondary, #94a3b8)',
                  marginBottom: '24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={15} /> {selectedType.durationMinutes} minutes
                </div>
                {selectedType.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={15} /> {selectedType.location}
                  </div>
                )}
              </div>

              {/* Timezone Selector */}
              <div style={{ marginBottom: '24px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: 'var(--text-secondary, #94a3b8)',
                  }}
                >
                  <Globe size={14} /> Timezone
                </label>
                <select
                  value={guestTimezone}
                  onChange={e => setGuestTimezone(e.target.value)}
                  data-testid="guest-timezone-select"
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
                  {!COMMON_TIMEZONES.includes(guestTimezone) && (
                    <option value={guestTimezone}>{guestTimezone}</option>
                  )}
                </select>
              </div>

              {/* Date Input */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: 'var(--text-secondary, #94a3b8)',
                  }}
                >
                  Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => {
                    setSelectedDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                  data-testid="guest-date-input"
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
            </div>

            {/* Right Panel: Available Slots */}
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Available Slots</h4>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)' }}>
                    {formattedSelectedDate}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleDateShift(-1)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color, #2d3748)',
                      borderRadius: '6px',
                      padding: '6px',
                      color: 'var(--text-secondary, #94a3b8)',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDateShift(1)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color, #2d3748)',
                      borderRadius: '6px',
                      padding: '6px',
                      color: 'var(--text-secondary, #94a3b8)',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {slotsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <LoadingSpinner size="md" />
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary, #94a3b8)',
                      marginTop: '8px',
                    }}
                  >
                    Finding open slots...
                  </p>
                </div>
              ) : availableSlots.length === 0 ? (
                <div
                  data-testid="no-slots-notice"
                  style={{
                    padding: '36px',
                    textAlign: 'center',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                    border: '1px dashed var(--border-color, #2d3748)',
                    color: 'var(--text-secondary, #94a3b8)',
                  }}
                >
                  <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>
                    No slots available on this day
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    Try choosing another date or adjusting your timezone.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: '10px',
                    maxHeight: '360px',
                    overflowY: 'auto',
                    paddingRight: '6px',
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
                        data-testid={`slot-btn-${idx}`}
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: isSelected
                            ? '1px solid var(--accent-primary, #6366f1)'
                            : '1px solid var(--border-color, #2d3748)',
                          background: isSelected
                            ? 'var(--accent-primary, #6366f1)'
                            : 'rgba(255, 255, 255, 0.03)',
                          color: isSelected ? '#fff' : 'var(--text-primary, #f1f5f9)',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'center',
                        }}
                      >
                        {timeLabel}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Slot Selected: Next Button */}
              {selectedSlot && (
                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: '24px',
                    borderTop: '1px solid var(--border-color, #2d3748)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setStep('DETAILS')}
                    data-testid="proceed-to-details-btn"
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--accent-primary, #6366f1)',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Next: Enter Details
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Guest Details Form */}
        {step === 'DETAILS' && selectedType && selectedSlot && (
          <div style={{ padding: '32px' }}>
            <button
              type="button"
              onClick={() => setStep('SLOT')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary, #6366f1)',
                fontSize: '13px',
                cursor: 'pointer',
                marginBottom: '16px',
                padding: 0,
              }}
            >
              <ChevronLeft size={16} /> Choose a different time
            </button>

            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Your Details</h2>

            {/* Appointment Summary Box */}
            <div
              style={{
                padding: '16px',
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '8px',
                marginBottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '13px',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--accent-primary, #6366f1)' }}>
                {selectedType.name}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--text-secondary, #94a3b8)',
                }}
              >
                <Calendar size={14} /> {formattedSelectedDate} at{' '}
                {new Date(selectedSlot.startAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: guestTimezone,
                })}{' '}
                ({guestTimezone})
              </div>
              {selectedType.location && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--text-secondary, #94a3b8)',
                  }}
                >
                  <MapPin size={14} /> {selectedType.location}
                </div>
              )}
            </div>

            {submitError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--accent-danger, #ef4444)',
                  color: '#fca5a5',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{submitError}</span>
              </div>
            )}

            <form
              onSubmit={handleConfirmBooking}
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
                  Your Name *
                </label>
                <div style={{ position: 'relative' }}>
                  <User
                    size={16}
                    style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}
                  />
                  <input
                    type="text"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    required
                    data-testid="guest-name-input"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 38px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #2d3748)',
                      background: 'var(--bg-primary, #0a0d14)',
                      color: '#fff',
                      fontSize: '14px',
                    }}
                  />
                </div>
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
                  Your Email Address *
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={16}
                    style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}
                  />
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    placeholder="jane@example.com"
                    required
                    data-testid="guest-email-input"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 38px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #2d3748)',
                      background: 'var(--bg-primary, #0a0d14)',
                      color: '#fff',
                      fontSize: '14px',
                    }}
                  />
                </div>
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
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={guestNotes}
                  onChange={e => setGuestNotes(e.target.value)}
                  placeholder="Share anything that will help prepare for our meeting..."
                  rows={3}
                  data-testid="guest-notes-input"
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

              <div style={{ marginTop: '12px' }}>
                <button
                  type="submit"
                  disabled={submitting}
                  data-testid="confirm-booking-btn"
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-primary, #6366f1)',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Confirming Appointment...' : 'Schedule Appointment'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 4: Booking Confirmed Screen */}
        {step === 'CONFIRMED' && confirmedBooking && (
          <div
            data-testid="booking-confirmed-screen"
            style={{ padding: '40px 32px', textAlign: 'center' }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <CheckCircle2 size={36} color="#10b981" />
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
              Appointment Scheduled!
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary, #94a3b8)',
                marginBottom: '24px',
              }}
            >
              We have reserved your time slot and a confirmation email has been dispatched to{' '}
              <strong style={{ color: '#fff' }}>{confirmedBooking.guestEmail}</strong>.
            </p>

            {/* Appointment Details Box */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color, #2d3748)',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'left',
                marginBottom: '24px',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                {confirmedBooking.bookingTypeName || selectedType?.name}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--text-secondary, #94a3b8)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={15} />
                  <span>
                    {new Date(confirmedBooking.startAt).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={15} />
                  <span>
                    {new Date(confirmedBooking.startAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: guestTimezone,
                    })}{' '}
                    -{' '}
                    {new Date(confirmedBooking.endAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: guestTimezone,
                    })}{' '}
                    ({guestTimezone})
                  </span>
                </div>

                {confirmedBooking.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={15} />
                    <span>{confirmedBooking.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Manage Link Card */}
            {confirmedBooking.manageToken && (
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.05)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'left',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--accent-primary, #6366f1)',
                    marginBottom: '4px',
                  }}
                >
                  Need to make changes later?
                </div>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary, #94a3b8)',
                    margin: '0 0 10px 0',
                  }}
                >
                  You can reschedule or cancel this appointment at any time using your self-service
                  management link:
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link
                    to={`/book/manage/${confirmedBooking.manageToken}`}
                    data-testid="guest-manage-link"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--bg-primary, #0a0d14)',
                      border: '1px solid var(--border-color, #2d3748)',
                      borderRadius: '6px',
                      color: 'var(--accent-primary, #6366f1)',
                      fontSize: '12px',
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <ExternalLink size={13} /> Manage Appointment
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/book/manage/${confirmedBooking.manageToken}`;
                      navigator.clipboard.writeText(url);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color, #2d3748)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Copy size={13} /> {copiedLink ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
