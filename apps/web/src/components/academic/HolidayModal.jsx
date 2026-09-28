import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { AlertTriangle } from 'lucide-react';
import { ACADEMIC_DAY_STATUS } from '@workaholic/shared';

export function HolidayModal({ isOpen, onClose, dateItem = null, semester = null, onSubmit }) {
  const [calendarDate, setCalendarDate] = useState('');
  const [dayStatus, setDayStatus] = useState(ACADEMIC_DAY_STATUS.HOLIDAY);
  const [reason, setReason] = useState('');
  const [overrideDayOrder, setOverrideDayOrder] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (dateItem) {
        setCalendarDate(dateItem.calendarDate || '');
        setDayStatus(dateItem.dayStatus || ACADEMIC_DAY_STATUS.HOLIDAY);
        setReason(dateItem.reason || '');
        setOverrideDayOrder(dateItem.overrideDayOrder || '');
      } else {
        const todayStr = new Date().toISOString().slice(0, 10);
        setCalendarDate(todayStr);
        setDayStatus(ACADEMIC_DAY_STATUS.HOLIDAY);
        setReason('');
        setOverrideDayOrder('');
      }
      setError(null);
    }
  }, [isOpen, dateItem]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!calendarDate) {
      setError('Date is required');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        calendarDate,
        dayStatus,
        reason: reason.trim() || undefined,
        overrideDayOrder: overrideDayOrder || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update academic date');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isHoliday = dayStatus === ACADEMIC_DAY_STATUS.HOLIDAY;
  const isSpecialWorking = dayStatus === ACADEMIC_DAY_STATUS.SPECIAL_WORKING_DAY;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isHoliday ? 'Academic Holiday / Shift' : 'Academic Date Rule'}
      size="md"
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        data-testid="holiday-modal"
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

        {/* Warning Banner conforming to UX-SPECIFICATION.md Section 30 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid var(--accent-warning, #f59e0b)',
            borderRadius: '6px',
            color: '#fbbf24',
            fontSize: '0.85rem',
            lineHeight: 1.4,
          }}
          data-testid="holiday-shift-warning"
        >
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Day Order Shift Warning:</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              Setting a holiday or modifying working status shifts subsequent Day Orders across the
              academic calendar and automatically recalculates affected timetable occurrences.
              Reusable schedule templates remain unchanged.
            </p>
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
            Date *
          </label>
          <input
            type="date"
            className="input-field"
            value={calendarDate}
            onChange={e => setCalendarDate(e.target.value)}
            data-testid="academic-date-input"
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
            Date Status *
          </label>
          <select
            value={dayStatus}
            onChange={e => setDayStatus(e.target.value)}
            data-testid="academic-day-status-select"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              background: 'var(--bg-surface, #161c2e)',
              border: '1px solid var(--border-subtle, #232b40)',
              color: 'inherit',
            }}
          >
            <option value={ACADEMIC_DAY_STATUS.HOLIDAY}>
              Holiday (Does not advance Day Order)
            </option>
            <option value={ACADEMIC_DAY_STATUS.SPECIAL_WORKING_DAY}>
              Special Working Day (e.g. Working Saturday)
            </option>
            <option value={ACADEMIC_DAY_STATUS.WORKING_DAY}>Standard Working Day</option>
            <option value={ACADEMIC_DAY_STATUS.OTHER_NON_WORKING_DAY}>Other Non-Working Day</option>
          </select>
        </div>

        {isSpecialWorking && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                marginBottom: '0.35rem',
                fontWeight: 500,
              }}
            >
              Override Day Order (Optional)
            </label>
            <select
              value={overrideDayOrder}
              onChange={e => setOverrideDayOrder(e.target.value)}
              data-testid="override-day-order-select"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            >
              <option value="">Standard Sequence Progression</option>
              {Array.from({ length: semester?.dayOrderCount || 5 }, (_, i) => `DO${i + 1}`).map(
                doKey => (
                  <option key={doKey} value={doKey}>
                    Assign {doKey} Schedule
                  </option>
                ),
              )}
            </select>
          </div>
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
            Reason / Description
          </label>
          <input
            type="text"
            className="input-field"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. SRM Campus Founder Holiday, Diwali, Working Saturday"
            data-testid="academic-date-reason-input"
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
            Cancel
          </Button>
          <Button
            variant={isHoliday ? 'danger' : 'primary'}
            type="submit"
            loading={isSubmitting}
            data-testid="confirm-holiday-shift-btn"
          >
            {isHoliday ? 'Apply Holiday & Shift' : 'Save Date Rule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
