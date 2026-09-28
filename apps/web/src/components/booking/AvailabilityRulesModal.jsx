import React, { useState, useEffect } from 'react';
import { X, Clock, AlertCircle, Check } from 'lucide-react';
import * as bookingApi from '../../services/booking.api.js';

const DAYS = [
  { index: 1, name: 'Monday', short: 'Mon' },
  { index: 2, name: 'Tuesday', short: 'Tue' },
  { index: 3, name: 'Wednesday', short: 'Wed' },
  { index: 4, name: 'Thursday', short: 'Thu' },
  { index: 5, name: 'Friday', short: 'Fri' },
  { index: 6, name: 'Saturday', short: 'Sat' },
  { index: 0, name: 'Sunday', short: 'Sun' },
];

export function AvailabilityRulesModal({
  isOpen,
  onClose,
  workspaceId,
  pageId,
  pageName,
  onSaved,
}) {
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen || !pageId) return;

    async function loadRules() {
      try {
        setLoading(true);
        setError(null);
        setSuccess(false);

        const existing = await bookingApi.getAvailabilityRules(workspaceId, pageId);
        const map = {};

        // Initialize default week: Mon-Fri 09:00 to 17:00, Sat-Sun disabled
        DAYS.forEach(d => {
          map[d.index] = {
            dayOfWeek: d.index,
            startTime: '09:00',
            endTime: '17:00',
            isEnabled: d.index >= 1 && d.index <= 5,
          };
        });

        // Overlay existing rules from backend
        if (Array.isArray(existing) && existing.length > 0) {
          existing.forEach(r => {
            const startClean = (r.startTime || '09:00').substring(0, 5);
            const endClean = (r.endTime || '17:00').substring(0, 5);
            map[r.dayOfWeek] = {
              dayOfWeek: r.dayOfWeek,
              startTime: startClean,
              endTime: endClean,
              isEnabled: r.isEnabled !== false,
            };
          });
        }

        setSchedule(map);
      } catch (err) {
        setError(err.message || 'Failed to load availability rules');
      } finally {
        setLoading(false);
      }
    }

    loadRules();
  }, [isOpen, pageId, workspaceId]);

  function handleToggleDay(dayIndex) {
    setSchedule(prev => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        isEnabled: !prev[dayIndex]?.isEnabled,
      },
    }));
  }

  function handleTimeChange(dayIndex, field, value) {
    setSchedule(prev => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const rulesPayload = Object.values(schedule).map(item => ({
        dayOfWeek: Number(item.dayOfWeek),
        startTime: `${item.startTime}:00`,
        endTime: `${item.endTime}:00`,
        isEnabled: Boolean(item.isEnabled),
      }));

      await bookingApi.setAvailabilityRules(workspaceId, pageId, rulesPayload);
      setSuccess(true);
      if (onSaved) onSaved(rulesPayload);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to update availability schedule');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      data-testid="availability-rules-modal"
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
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary, #f1f5f9)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color, #2d3748)',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Clock size={20} color="var(--accent-primary, #6366f1)" />
              Weekly Availability Schedule
            </h2>
            {pageName && (
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '13px',
                  color: 'var(--text-secondary, #94a3b8)',
                }}
              >
                Page: {pageName}
              </p>
            )}
          </div>
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

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
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

          {success && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid var(--accent-success, #10b981)',
                color: '#6ee7b7',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={16} />
              <span>Schedule updated successfully!</span>
            </div>
          )}

          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary, #94a3b8)',
              marginBottom: '16px',
            }}
          >
            Set standard recurring hours when you are open for appointments on this booking page.
          </p>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
              Loading schedule...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {DAYS.map(d => {
                const item = schedule[d.index] || {
                  dayOfWeek: d.index,
                  startTime: '09:00',
                  endTime: '17:00',
                  isEnabled: false,
                };

                return (
                  <div
                    key={d.index}
                    data-testid={`day-row-${d.index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #2d3748)',
                      background: item.isEnabled
                        ? 'rgba(255, 255, 255, 0.02)'
                        : 'rgba(0, 0, 0, 0.2)',
                    }}
                  >
                    {/* Day Toggle & Label */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        minWidth: '130px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.isEnabled}
                        onChange={() => handleToggleDay(d.index)}
                        data-testid={`day-checkbox-${d.index}`}
                        id={`day-${d.index}`}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <label
                        htmlFor={`day-${d.index}`}
                        style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          color: item.isEnabled ? '#fff' : 'var(--text-secondary, #94a3b8)',
                        }}
                      >
                        {d.name}
                      </label>
                    </div>

                    {/* Time Window Selectors */}
                    {item.isEnabled ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="time"
                          value={item.startTime}
                          onChange={e => handleTimeChange(d.index, 'startTime', e.target.value)}
                          data-testid={`start-time-${d.index}`}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #2d3748)',
                            background: 'var(--bg-primary, #0a0d14)',
                            color: '#fff',
                            fontSize: '13px',
                          }}
                        />
                        <span style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '13px' }}>
                          to
                        </span>
                        <input
                          type="time"
                          value={item.endTime}
                          onChange={e => handleTimeChange(d.index, 'endTime', e.target.value)}
                          data-testid={`end-time-${d.index}`}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #2d3748)',
                            background: 'var(--bg-primary, #0a0d14)',
                            color: '#fff',
                            fontSize: '13px',
                          }}
                        />
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-secondary, #64748b)',
                          fontStyle: 'italic',
                        }}
                      >
                        Unavailable
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            padding: '16px 24px',
            borderTop: '1px solid var(--border-color, #2d3748)',
          }}
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
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            data-testid="save-schedule-btn"
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent-primary, #6366f1)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
