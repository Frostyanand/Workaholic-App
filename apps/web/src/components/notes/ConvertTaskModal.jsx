import React, { useState } from 'react';
import { CheckSquare, ArrowRight, AlertCircle } from 'lucide-react';
import * as notesApi from '../../services/notes.api.js';

/**
 * ConvertTaskModal
 * Modal allowing explicit conversion of a note checklist item into a Workaholic Task.
 * Conforms to BR-NOTE-001, BR-NOTE-002, and REQ-NOTE-008.
 *
 * @param {Object} props
 * @param {string} props.noteId
 * @param {string} [props.workspaceId]
 * @param {Object} props.item - Checklist item { id, text, checked, convertedTaskId }
 * @param {Function} props.onClose
 * @param {Function} props.onSuccess - Callback receiving { task, noteId, alreadyConverted }
 */
export function ConvertTaskModal({ noteId, workspaceId, item, onClose, onSuccess }) {
  const [title, setTitle] = useState(item?.text || '');
  const [priority, setPriority] = useState('P3');
  const [description, setDescription] = useState('');
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    try {
      setConverting(true);
      setError(null);

      const result = await notesApi.convertChecklistItemToTask(workspaceId, noteId, {
        itemId: item.id,
        title: title.trim(),
        priority,
        description: description.trim() || undefined,
      });

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to convert checklist item to task');
    } finally {
      setConverting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      data-testid="convert-task-modal"
    >
      <div
        style={{
          background: 'var(--bg-primary, #111827)',
          border: '1px solid var(--border, #374151)',
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <CheckSquare size={20} color="#6366F1" />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
            Convert Checklist Item to Task
          </h3>
        </div>

        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-muted, #9CA3AF)',
            margin: '0 0 1rem 0',
            lineHeight: 1.4,
          }}
        >
          This will explicitly create a new Workaholic Task linked to this note checklist item. The
          checklist item will remain in the note and be marked as converted.
        </p>

        {error && (
          <div
            style={{
              padding: '0.5rem',
              marginBottom: '1rem',
              borderRadius: '4px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                marginBottom: '0.3rem',
              }}
            >
              Task Title
            </label>
            <input
              type="text"
              className="form-control"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Complete literature review"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border, #374151)',
                background: 'var(--bg-secondary, #1F2937)',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
              required
              data-testid="convert-task-title-input"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                marginBottom: '0.3rem',
              }}
            >
              Priority
            </label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border, #374151)',
                background: 'var(--bg-secondary, #1F2937)',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
              data-testid="convert-task-priority-select"
            >
              <option value="P0">P0 - Urgent</option>
              <option value="P1">P1 - High</option>
              <option value="P2">P2 - Medium</option>
              <option value="P3">P3 - Normal</option>
              <option value="P4">P4 - Low</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 500,
                marginBottom: '0.3rem',
              }}
            >
              Description / Notes (Optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional task description..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border, #374151)',
                background: 'var(--bg-secondary, #1F2937)',
                color: 'inherit',
                fontSize: '0.85rem',
                resize: 'vertical',
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={converting}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={converting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.4rem 0.8rem',
                borderRadius: '4px',
                background: '#6366F1',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
              data-testid="confirm-convert-task-btn"
            >
              {converting ? 'Converting...' : 'Create Task'} <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
