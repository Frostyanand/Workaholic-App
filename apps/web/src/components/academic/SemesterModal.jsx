import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

export function SemesterModal({ isOpen, onClose, semester = null, onSubmit }) {
  const [name, setName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [institution, setInstitution] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [dayOrderCount, setDayOrderCount] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (semester) {
        setName(semester.name || '');
        setAcademicYear(semester.academicYear || '');
        setInstitution(semester.institution || '');
        setStartDate(semester.startDate || '');
        setEndDate(semester.endDate || '');
        setTimezone(semester.timezone || 'UTC');
        setDayOrderCount(semester.dayOrderCount || 5);
      } else {
        const today = new Date();
        const startStr = today.toISOString().slice(0, 10);
        const endD = new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000);
        const endStr = endD.toISOString().slice(0, 10);
        setName('');
        setAcademicYear(`${today.getFullYear()}-${today.getFullYear() + 1}`);
        setInstitution('SRM Institute of Science and Technology');
        setStartDate(startStr);
        setEndDate(endStr);
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        setDayOrderCount(5);
      }
      setError(null);
    }
  }, [isOpen, semester]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Semester name is required');
      return;
    }
    if (!startDate || !endDate) {
      setError('Start date and end date are required');
      return;
    }
    if (endDate < startDate) {
      setError('End date cannot be before start date');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name: name.trim(),
        academicYear: academicYear.trim() || undefined,
        institution: institution.trim() || undefined,
        startDate,
        endDate,
        timezone,
        dayOrderCount: Number(dayOrderCount) || 5,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save semester');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={semester ? 'Edit Semester' : 'Create New Semester'}
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

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.85rem',
              marginBottom: '0.35rem',
              fontWeight: 500,
            }}
          >
            Semester Name *
          </label>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Even Semester 2026 or Fall 2026"
            data-testid="semester-name-input"
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
              Academic Year
            </label>
            <input
              type="text"
              className="input-field"
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              placeholder="e.g. 2026-2027"
              data-testid="semester-year-input"
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
              Day Order Cycle
            </label>
            <select
              value={dayOrderCount}
              onChange={e => setDayOrderCount(Number(e.target.value))}
              data-testid="semester-docount-select"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'var(--bg-surface, #161c2e)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
              }}
            >
              <option value={5}>5 Day Orders (DO1 - DO5)</option>
              <option value={6}>6 Day Orders (DO1 - DO6)</option>
              <option value={4}>4 Day Orders (DO1 - DO4)</option>
            </select>
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
            Institution
          </label>
          <input
            type="text"
            className="input-field"
            value={institution}
            onChange={e => setInstitution(e.target.value)}
            placeholder="e.g. SRM Institute of Science and Technology"
            data-testid="semester-institution-input"
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
              Start Date *
            </label>
            <input
              type="date"
              className="input-field"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              data-testid="semester-start-date-input"
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
              End Date *
            </label>
            <input
              type="date"
              className="input-field"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              data-testid="semester-end-date-input"
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
            data-testid="save-semester-btn"
          >
            {semester ? 'Save Changes' : 'Create Semester'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
