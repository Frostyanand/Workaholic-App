import React, { useState, useEffect, useRef } from 'react';
import { PROJECT_STATUS } from '@workaholic/shared';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { ErrorBanner } from '../common/ErrorBanner.jsx';

export function CreateProjectModal({ isOpen, onClose, onCreateProject, initialData = null }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(PROJECT_STATUS.ACTIVE);
  const [startAt, setStartAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name || '');
        setDescription(initialData.description || '');
        setStatus(initialData.status || PROJECT_STATUS.ACTIVE);
        setStartAt(initialData.startAt ? initialData.startAt.slice(0, 16) : '');
        setDueAt(initialData.dueAt ? initialData.dueAt.slice(0, 16) : '');
      } else {
        setName('');
        setDescription('');
        setStatus(PROJECT_STATUS.ACTIVE);
        setStartAt('');
        setDueAt('');
      }
      setError(null);
    }
  }, [isOpen, initialData]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name cannot be empty');
      inputRef.current?.focus();
      return;
    }

    if (startAt && dueAt) {
      if (new Date(dueAt).getTime() < new Date(startAt).getTime()) {
        setError('Due date must be after or equal to start date');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreateProject({
        name: name.trim(),
        description: description.trim() || null,
        status,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title={initialData ? 'Edit Project' : 'Create New Project'}
      titleId="modal-project-title"
      maxWidth="520px"
      initialFocusRef={inputRef}
      showCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="project-name-input"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Project Name *
          </label>
          <input
            id="project-name-input"
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Website Redesign"
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

        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="project-description-input"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Description
          </label>
          <textarea
            id="project-description-input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Objectives, deliverables, and scope..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="project-status-select"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Status
          </label>
          <select
            id="project-status-select"
            value={status}
            onChange={e => setStatus(e.target.value)}
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
            <option value={PROJECT_STATUS.ACTIVE}>Active</option>
            <option value={PROJECT_STATUS.ON_HOLD}>On Hold</option>
            <option value={PROJECT_STATUS.COMPLETED}>Completed</option>
            <option value={PROJECT_STATUS.ARCHIVED}>Archived</option>
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div>
            <label
              htmlFor="project-start-date-input"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Start Date
            </label>
            <input
              id="project-start-date-input"
              type="datetime-local"
              value={startAt}
              onChange={e => setStartAt(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="project-due-date-input"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Target Due Date
            </label>
            <input
              id="project-due-date-input"
              type="datetime-local"
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
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
            {isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
