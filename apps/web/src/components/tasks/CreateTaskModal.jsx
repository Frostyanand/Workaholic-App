import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { ErrorBanner } from '../common/ErrorBanner.jsx';
import { listEligibleMembers } from '../../services/collaboration.api.js';

export function CreateTaskModal({
  isOpen,
  onClose,
  onCreateTask,
  initialProjectId = null,
  initialBoardId = null,
  initialBoardColumnId = null,
  workspaceId = null,
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('P3');
  const [dueAt, setDueAt] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [eligibleMembers, setEligibleMembers] = useState([]);
  const [recurrenceFreq, setRecurrenceFreq] = useState('NONE');
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
      setAssigneeUserId('');
      setRecurrenceFreq('NONE');
      setError(null);
      setSubmitting(false);

      if (workspaceId) {
        listEligibleMembers(workspaceId)
          .then(setEligibleMembers)
          .catch(() => {});
      }
    }
  }, [isOpen, workspaceId]);

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
        assigneeUserId: assigneeUserId || undefined,
        projectId: initialProjectId || undefined,
        boardId: initialBoardId || undefined,
        boardColumnId: initialBoardColumnId || undefined,
      };

      if (recurrenceFreq !== 'NONE') {
        payload.recurrence = {
          frequency: recurrenceFreq === 'WEEKDAYS' ? 'WEEKLY' : recurrenceFreq,
          interval: 1,
          ...(recurrenceFreq === 'WEEKDAYS' ? { byWeekday: [1, 2, 3, 4, 5] } : {}),
        };
      }

      await onCreateTask(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title="Create New Task"
      titleId="create-task-modal-title"
      maxWidth="520px"
      initialFocusRef={titleInputRef}
      showCloseButton={!submitting}
    >
      <form onSubmit={handleSubmit}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

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
            aria-invalid={!!error}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-surface)',
              border: error ? '1px solid var(--accent-danger)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.95rem',
              outline: 'none',
              boxSizing: 'border-box',
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
                boxSizing: 'border-box',
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
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Assignee Selection (Phase 21: Trusted Sharing & Collaboration) */}
        {eligibleMembers.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="task-assignee-select"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Assignee
            </label>
            <select
              id="task-assignee-select"
              value={assigneeUserId}
              onChange={e => setAssigneeUserId(e.target.value)}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '9px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Unassigned (Self)</option>
              {eligibleMembers.map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.userDisplayName || m.userEmail} ({m.role})
                </option>
              ))}
            </select>
          </div>
        )}

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
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Recurrence */}
        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="task-recurrence-select"
            style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Repeat
          </label>
          <select
            id="task-recurrence-select"
            value={recurrenceFreq}
            onChange={e => setRecurrenceFreq(e.target.value)}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '9px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          >
            <option value="NONE">Does not repeat</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKDAYS">Every weekday (Mon-Fri)</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
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
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={submitting}>
            {submitting ? 'Creating...' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
