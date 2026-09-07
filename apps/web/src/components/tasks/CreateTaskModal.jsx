import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle } from 'lucide-react';

export function CreateTaskModal({
  isOpen,
  onClose,
  onCreateTask,
  initialProjectId = null,
  initialBoardId = null,
  initialBoardColumnId = null,
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('P3');
  const [dueAt, setDueAt] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const titleInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setPriority('P3');
      setDueAt('');
      setEstimatedDuration('');
      setDescription('');
      setError(null);
      setSubmitting(false);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      titleInputRef.current?.focus();
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const payload = {
        title: title.trim(),
        priority,
        description: description.trim() || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        estimatedDuration: estimatedDuration ? parseInt(estimatedDuration, 10) : undefined,
        projectId: initialProjectId || undefined,
        boardId: initialBoardId || undefined,
        boardColumnId: initialBoardColumnId || undefined,
      };
      await onCreateTask(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-modal-title"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        padding: '16px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '520px',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <h3
            id="create-task-modal-title"
            style={{
              fontSize: '1.15rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Create New Task
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ color: 'var(--text-muted)', padding: '4px', borderRadius: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {error && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--accent-danger)',
                fontSize: '0.85rem',
                marginBottom: '16px',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Title Input */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="task-title-input"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Task Title <span style={{ color: 'var(--accent-danger)' }}>*</span>
            </label>
            <input
              id="task-title-input"
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What actionable work needs to be done?"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
              }}
            />
          </div>

          {/* Priority & Due Date Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
              marginBottom: '16px',
            }}
          >
            <div>
              <label
                htmlFor="task-priority-select"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Priority
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={e => setPriority(e.target.value)}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="P0">P0 - Critical</option>
                <option value="P1">P1 - Urgent</option>
                <option value="P2">P2 - High</option>
                <option value="P3">P3 - Medium</option>
                <option value="P4">P4 - Low</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="task-due-date-input"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Due Date & Time
              </label>
              <input
                id="task-due-date-input"
                type="datetime-local"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>

          {/* Estimated Duration */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="task-duration-input"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Estimated Duration (minutes)
            </label>
            <input
              id="task-duration-input"
              type="number"
              min="0"
              step="15"
              value={estimatedDuration}
              onChange={e => setEstimatedDuration(e.target.value)}
              placeholder="e.g. 60"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '9px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="task-description-input"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Description (Optional)
            </label>
            <textarea
              id="task-description-input"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional details, scope, or reference links..."
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '9px 18px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 22px',
                backgroundColor: 'var(--accent-primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 600,
                boxShadow: 'var(--shadow-sm)',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
