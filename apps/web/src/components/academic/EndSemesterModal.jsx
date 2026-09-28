import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';

export function EndSemesterModal({ isOpen, onClose, semester, onConfirm }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !semester) return null;

  async function handleConfirm() {
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(semester.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to end semester');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`End Semester: ${semester.name}`} size="md">
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
        data-testid="end-semester-modal"
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

        {/* High-impact notification header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-danger, #ef4444)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.9rem',
          }}
          data-testid="end-semester-warning"
        >
          <AlertOctagon size={24} style={{ flexShrink: 0, marginTop: '2px', color: '#ef4444' }} />
          <div>
            <strong style={{ fontSize: '0.95rem', color: '#fff' }}>
              Are you sure you want to end this semester?
            </strong>
            <p style={{ margin: '6px 0 0 0', lineHeight: 1.5 }}>
              This operation stops future generation for <strong>{semester.name}</strong> and
              removes future generated academic class events.
            </p>
          </div>
        </div>

        {/* What will be preserved list (UX-SPECIFICATION.md Section 31) */}
        <div
          style={{
            background: 'var(--bg-surface, #161c2e)',
            border: '1px solid var(--border-subtle, #232b40)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-secondary, #94a3b8)',
            }}
          >
            The following data is strictly PRESERVED:
          </span>
          <ul
            style={{
              margin: '0.5rem 0 0 0',
              paddingLeft: '1.25rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted, #cbd5e1)',
              lineHeight: 1.6,
            }}
          >
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={15} color="#10b981" /> Past academic class history and attended
              events
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={15} color="#10b981" /> Reusable class timetable definitions and
              templates
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={15} color="#10b981" /> Historical Day Order sequence mappings
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={15} color="#10b981" /> Unrelated personal events, tasks, and
              Google Calendar events
            </li>
          </ul>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={handleConfirm}
            loading={isSubmitting}
            data-testid="confirm-end-semester-btn"
          >
            End Semester
          </Button>
        </div>
      </div>
    </Modal>
  );
}
