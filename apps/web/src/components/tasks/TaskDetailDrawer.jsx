import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle2, Circle, Save, Tag } from 'lucide-react';
import { Button } from '../common/Button.jsx';
import { ErrorBanner } from '../common/ErrorBanner.jsx';
import * as tasksApi from '../../services/tasks.api.js';

export function TaskDetailDrawer({ task, isOpen, onClose, onTaskUpdated }) {
  const [activeTask, setActiveTask] = useState(task);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const [status, setStatus] = useState('TODO');
  const [dueAt, setDueAt] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [assigningLabel, setAssigningLabel] = useState(false);
  const [error, setError] = useState(null);

  const drawerRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement;

    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 50);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!drawerRef.current) return;
        const focusables = drawerRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (task) {
      setActiveTask(task);
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'P3');
      setStatus(task.status || 'TODO');
      setDueAt(task.dueAt ? task.dueAt.slice(0, 16) : '');
      setEstimatedDuration(task.estimatedDuration ? String(task.estimatedDuration) : '');
      setError(null);
    }
  }, [task]);

  if (!isOpen || !activeTask) return null;

  async function handleSave(e) {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const updateData = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        estimatedDuration: estimatedDuration ? parseInt(estimatedDuration, 10) : null,
        version: activeTask.version,
      };

      const updated = await tasksApi.updateTask(activeTask.id, activeTask.workspaceId, updateData);
      setActiveTask(updated);
      onTaskUpdated(updated);
    } catch (err) {
      if (err.status === 409 || err.code === 'CONFLICT') {
        setError('Task was modified concurrently by another session. Please reload.');
      } else {
        setError(err.message || 'Failed to update task');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSubtask(e) {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    try {
      setAddingSubtask(true);
      setError(null);
      const subtask = await tasksApi.createSubtask(activeTask.id, activeTask.workspaceId, {
        title: newSubtaskTitle.trim(),
        priority: 'P3',
      });
      setNewSubtaskTitle('');
      // Update local subtasks
      const updatedSubtasks = [...(activeTask.subtasks || []), subtask];
      const updated = {
        ...activeTask,
        subtasks: updatedSubtasks,
        subtaskCount: updatedSubtasks.length,
      };
      setActiveTask(updated);
      onTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to add subtask');
    } finally {
      setAddingSubtask(false);
    }
  }

  async function handleToggleSubtask(subtask) {
    try {
      const isDone = subtask.status === 'COMPLETED';
      const updated = isDone
        ? await tasksApi.reopenTask(subtask.id, activeTask.workspaceId)
        : await tasksApi.completeTask(subtask.id, activeTask.workspaceId);

      const updatedSubtasks = (activeTask.subtasks || []).map(s =>
        s.id === subtask.id ? updated : s,
      );
      const newActive = { ...activeTask, subtasks: updatedSubtasks };
      setActiveTask(newActive);
      onTaskUpdated(newActive);
    } catch (err) {
      setError(err.message || 'Failed to toggle subtask');
    }
  }

  async function handleAssignLabel(e) {
    e.preventDefault();
    const name = newLabelName.trim();
    if (!name) return;

    try {
      setAssigningLabel(true);
      setError(null);
      const createdLabel = await tasksApi.createLabel(activeTask.workspaceId, {
        name,
        color: '#4F46E5',
      });
      await tasksApi.assignLabel(activeTask.id, activeTask.workspaceId, createdLabel.id);

      const updatedLabels = [...(activeTask.labels || []), createdLabel];
      const updated = {
        ...activeTask,
        labels: updatedLabels,
      };
      setActiveTask(updated);
      onTaskUpdated(updated);
      setNewLabelName('');
    } catch (err) {
      setError(err.message || 'Failed to assign label');
    } finally {
      setAssigningLabel(false);
    }
  }

  async function handleRemoveLabel(labelId) {
    try {
      setError(null);
      await tasksApi.removeLabel(activeTask.id, activeTask.workspaceId, labelId);
      const updatedLabels = (activeTask.labels || []).filter(l => l.id !== labelId);
      const updated = {
        ...activeTask,
        labels: updatedLabels,
      };
      setActiveTask(updated);
      onTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to remove label');
    }
  }

  return (
    <>
      <div
        data-testid="drawer-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          zIndex: 999,
          backdropFilter: 'blur(2px)',
        }}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-heading"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
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
            id="task-detail-heading"
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Task Details
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task details"
            style={{
              color: 'var(--text-muted)',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {error && (
            <div style={{ marginBottom: '16px' }}>
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            </div>
          )}

          {/* Title Field */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}
            >
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
                fontWeight: 500,
              }}
            />
          </div>

          {/* Status & Priority Row */}
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
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '4px',
                }}
              >
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="BLOCKED">Blocked</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '4px',
                }}
              >
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
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
          </div>

          {/* Due Date & Estimated Duration */}
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
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '4px',
                }}
              >
                Due Date
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '4px',
                }}
              >
                Duration (mins)
              </label>
              <input
                type="number"
                min="0"
                step="15"
                value={estimatedDuration}
                onChange={e => setEstimatedDuration(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>

          {/* Description Field */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}
            >
              Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Labels Section (TM-TASK-007) */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
              }}
            >
              <Tag size={15} color="var(--accent-primary)" />
              <h4
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Labels ({(activeTask.labels || []).length})
              </h4>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              {(activeTask.labels || []).length === 0 ? (
                <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                  No labels attached.
                </span>
              ) : (
                (activeTask.labels || []).map(label => (
                  <span
                    key={label.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: (label.color || '#4F46E5') + '26',
                      color: label.color || '#4F46E5',
                      border: `1px solid ${label.color || '#4F46E5'}4D`,
                    }}
                  >
                    <span>{label.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(label.id)}
                      aria-label={`Remove label ${label.name}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        color: 'inherit',
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add / Assign Label Form */}
            <form onSubmit={handleAssignLabel} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Add label name..."
                value={newLabelName}
                onChange={e => setNewLabelName(e.target.value)}
                disabled={assigningLabel}
                aria-label="New label name"
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
              <button
                type="submit"
                disabled={assigningLabel || !newLabelName.trim()}
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                Assign
              </button>
            </form>
          </div>

          {/* Subtasks Section */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <h4
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Subtasks ({activeTask.subtasks?.length || 0})
              </h4>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0' }}>
              {(activeTask.subtasks || []).map(sub => {
                const isDone = sub.status === 'COMPLETED';
                return (
                  <li
                    key={sub.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: '6px',
                      fontSize: '0.875rem',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(sub)}
                      style={{ color: isDone ? 'var(--accent-success)' : 'var(--text-muted)' }}
                    >
                      {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </button>
                    <span
                      style={{
                        flex: 1,
                        textDecoration: isDone ? 'line-through' : 'none',
                        color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                      }}
                    >
                      {sub.title}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Add Subtask Form */}
            <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Add a subtask..."
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                disabled={addingSubtask}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
              <button
                type="submit"
                disabled={addingSubtask || !newSubtaskTitle.trim()}
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                Add
              </button>
            </form>
          </div>

          {/* Metadata section */}
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}
          >
            <div>Task ID: {activeTask.id}</div>
            <div>Version: {activeTask.version}</div>
            <div>Created: {new Date(activeTask.createdAt).toLocaleString()}</div>
            <div>Last Updated: {new Date(activeTask.updatedAt).toLocaleString()}</div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} loading={saving} icon={Save}>
            Save Changes
          </Button>
        </div>
      </aside>
    </>
  );
}
