import React, { useState, useEffect, useRef } from 'react';
import { TASK_STATUS } from '@workaholic/shared';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { ErrorBanner } from '../common/ErrorBanner.jsx';

export function CreateColumnModal({ isOpen, onClose, onSaveColumn, initialData = null }) {
  const [name, setName] = useState('');
  const [statusMapping, setStatusMapping] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name || '');
        setStatusMapping(initialData.statusMapping || '');
      } else {
        setName('');
        setStatusMapping('');
      }
      setError(null);
    }
  }, [isOpen, initialData]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Column name cannot be empty');
      inputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSaveColumn({
        name: name.trim(),
        statusMapping: statusMapping || null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save column');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title={initialData ? 'Edit Column' : 'Add Column'}
      titleId="modal-column-title"
      maxWidth="440px"
      initialFocusRef={inputRef}
      showCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="column-name-input"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Column Name *
          </label>
          <input
            id="column-name-input"
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. In Review"
            aria-invalid={!!error}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-primary)',
              border: error ? '1px solid var(--accent-danger)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.9375rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="column-status-mapping"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Task Status Mapping (Optional)
          </label>
          <select
            id="column-status-mapping"
            value={statusMapping}
            onChange={e => setStatusMapping(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            <option value="">None (Custom Workflow Column)</option>
            <option value={TASK_STATUS.TODO}>To Do (TODO)</option>
            <option value={TASK_STATUS.IN_PROGRESS}>In Progress (IN_PROGRESS)</option>
            <option value={TASK_STATUS.BLOCKED}>Blocked (BLOCKED)</option>
            <option value={TASK_STATUS.COMPLETED}>Done (COMPLETED)</option>
          </select>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              margin: '6px 0 0 0',
              lineHeight: 1.4,
            }}
          >
            When tasks are moved to this column, their status will automatically update to this
            mapped value.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Add Column'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
