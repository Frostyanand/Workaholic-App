import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
];

export function CreateCalendarModal({ isOpen, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const visibility = 'PRIVATE';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Calendar name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        color,
        visibility,
      });
      setName('');
      setDescription('');
      setColor(PRESET_COLORS[0]);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create calendar');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Calendar" size="sm">
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
      >
        {error && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--accent-danger)',
              borderRadius: 'var(--radius-sm)',
              color: '#fca5a5',
              fontSize: '0.8125rem',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="calendar-name"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: '600',
              marginBottom: '4px',
              color: 'var(--text-secondary)',
            }}
          >
            Calendar Name *
          </label>
          <input
            id="calendar-name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Work, College, or Family"
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: '600',
              marginBottom: '6px',
              color: 'var(--text-secondary)',
            }}
          >
            Color
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: c,
                  border: color === c ? '2px solid #ffffff' : '2px solid transparent',
                  cursor: 'pointer',
                  transform: color === c ? 'scale(1.15)' : 'scale(1)',
                  transition: 'var(--transition-fast)',
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="calendar-description"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: '600',
              marginBottom: '4px',
              color: 'var(--text-secondary)',
            }}
          >
            Description
          </label>
          <textarea
            id="calendar-description"
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional calendar notes..."
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              resize: 'vertical',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-sm)',
            marginTop: 'var(--space-xs)',
          }}
        >
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Calendar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
