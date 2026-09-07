import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { ErrorBanner } from '../common/ErrorBanner.jsx';

export function CreateBoardModal({
  isOpen,
  onClose,
  onCreateBoard,
  projects = [],
  initialProjectId = null,
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setProjectId(initialProjectId || '');
      setError(null);
    }
  }, [isOpen, initialProjectId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Board name cannot be empty');
      inputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreateBoard({
        name: name.trim(),
        description: description.trim() || null,
        projectId: projectId ? projectId : null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create board');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title="Create New Board"
      titleId="modal-board-title"
      maxWidth="480px"
      initialFocusRef={inputRef}
      showCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="board-name-input"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Board Name *
          </label>
          <input
            id="board-name-input"
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sprint Kanban"
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
            htmlFor="board-description-input"
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
            id="board-description-input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Board purpose and workflow scope..."
            rows={2}
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

        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="board-project-select"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Associated Project (Optional)
          </label>
          <select
            id="board-project-select"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
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
            <option value="">None (Independent Workspace Board)</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
            {isSubmitting ? 'Creating...' : 'Create Board'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
