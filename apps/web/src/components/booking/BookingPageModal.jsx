import React, { useState, useEffect } from 'react';
import { X, Calendar, Globe, Tag, AlertCircle } from 'lucide-react';
import * as bookingApi from '../../services/booking.api.js';
import * as calendarApi from '../../services/calendar.api.js';

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

export function BookingPageModal({ isOpen, onClose, workspaceId, page = null, onSaved }) {
  const isEditing = Boolean(page?.id);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [status, setStatus] = useState('ACTIVE');
  const [calendarId, setCalendarId] = useState('');
  const [calendars, setCalendars] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    if (page) {
      setName(page.name || '');
      setSlug(page.slug || '');
      setDescription(page.description || '');
      setTimezone(page.timezone || 'UTC');
      setStatus(page.status || 'ACTIVE');
      setCalendarId(page.calendarId || '');
    } else {
      setName('');
      setSlug('');
      setDescription('');
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      setStatus('ACTIVE');
      setCalendarId('');
    }
    setError(null);

    // Load workspace calendars
    async function loadCals() {
      try {
        const cals = await calendarApi.fetchCalendars(workspaceId);
        setCalendars(cals || []);
        if (!page?.calendarId && cals?.length > 0) {
          const defaultCal = cals.find(c => c.isDefault) || cals[0];
          setCalendarId(defaultCal.id);
        }
      } catch {
        // Non-fatal
      }
    }
    loadCals();
  }, [isOpen, page, workspaceId]);

  function handleNameChange(e) {
    const val = e.target.value;
    setName(val);
    if (
      !isEditing &&
      (!slug ||
        slug ===
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''))
    ) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setSlug(generated);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a name for this booking page');
      return;
    }
    if (!slug.trim()) {
      setError('Please provide a URL slug');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        timezone,
        status,
        calendarId: calendarId || null,
      };

      let result;
      if (isEditing) {
        result = await bookingApi.updateBookingPage(workspaceId, page.id, payload);
      } else {
        result = await bookingApi.createBookingPage(workspaceId, payload);
      }

      onSaved(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save booking page');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      data-testid="booking-page-modal"
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
          maxWidth: '540px',
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
            <Calendar size={20} color="var(--accent-primary, #6366f1)" />
            {isEditing ? 'Edit Booking Page' : 'Create Booking Page'}
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
              Booking Page Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. 1-on-1 Mentorship & Advisory"
              required
              data-testid="page-name-input"
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
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
            >
              URL Slug *
            </label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  background: 'var(--bg-tertiary, #1e2433)',
                  border: '1px solid var(--border-color, #2d3748)',
                  borderRight: 'none',
                  padding: '10px 12px',
                  borderTopLeftRadius: '8px',
                  borderBottomLeftRadius: '8px',
                  color: 'var(--text-secondary, #94a3b8)',
                  fontSize: '13px',
                }}
              >
                /book/
              </span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))}
                placeholder="alex-advisory"
                required
                data-testid="page-slug-input"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderTopRightRadius: '8px',
                  borderBottomRightRadius: '8px',
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
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief welcome message or instructions for guests."
              rows={3}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
              >
                <Globe size={13} style={{ display: 'inline', marginRight: '4px' }} />
                Timezone
              </label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
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

            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
              >
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #2d3748)',
                  background: 'var(--bg-primary, #0a0d14)',
                  color: '#fff',
                  fontSize: '13px',
                }}
              >
                <option value="ACTIVE">Active (Publicly bookable)</option>
                <option value="DISABLED">Disabled (Unavailable)</option>
              </select>
            </div>
          </div>

          {calendars.length > 0 && (
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
              >
                <Tag size={13} style={{ display: 'inline', marginRight: '4px' }} />
                Target Calendar for Confirmed Appointments
              </label>
              <select
                value={calendarId}
                onChange={e => setCalendarId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #2d3748)',
                  background: 'var(--bg-primary, #0a0d14)',
                  color: '#fff',
                  fontSize: '13px',
                }}
              >
                {calendars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #2d3748)',
                background: 'transparent',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              data-testid="save-booking-page-btn"
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-primary, #6366f1)',
                color: '#fff',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
