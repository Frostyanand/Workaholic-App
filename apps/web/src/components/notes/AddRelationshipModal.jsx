import React, { useState } from 'react';
import { Link2, AlertCircle, Plus } from 'lucide-react';
import * as notesApi from '../../services/notes.api.js';

/**
 * AddRelationshipModal
 * Allows explicit linking of a note to Task, Project, Event, Board, Note, or Person.
 * Conforms to REQ-NOTE-005.
 *
 * @param {Object} props
 * @param {string} props.noteId
 * @param {string} [props.workspaceId]
 * @param {Function} props.onClose
 * @param {Function} props.onSuccess
 */
export function AddRelationshipModal({ noteId, workspaceId, onClose, onSuccess }) {
  const [targetType, setTargetType] = useState('TASK');
  const [targetId, setTargetId] = useState('');
  const [relationshipType, setRelationshipType] = useState('RELATES_TO');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!targetId.trim()) {
      setError('Target ID is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const rel = await notesApi.addNoteRelationship(workspaceId, noteId, {
        targetType,
        targetId: targetId.trim(),
        relationshipType,
      });

      if (onSuccess) {
        onSuccess(rel);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add relationship');
    } finally {
      setSaving(false);
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
      data-testid="add-relationship-modal"
    >
      <div
        style={{
          background: 'var(--bg-primary, #111827)',
          border: '1px solid var(--border, #374151)',
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '440px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Link2 size={20} color="#6366F1" />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
            Link Note to Domain Object
          </h3>
        </div>

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
              Target Resource Type
            </label>
            <select
              value={targetType}
              onChange={e => setTargetType(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border, #374151)',
                background: 'var(--bg-secondary, #1F2937)',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
              data-testid="relationship-target-type-select"
            >
              <option value="TASK">Task</option>
              <option value="PROJECT">Project</option>
              <option value="EVENT">Calendar Event</option>
              <option value="BOARD">Board</option>
              <option value="NOTE">Another Note</option>
              <option value="PERSON">Person / Collaborator</option>
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
              Target UUID / Identifier
            </label>
            <input
              type="text"
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
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
              data-testid="relationship-target-id-input"
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
              Relationship Type
            </label>
            <select
              value={relationshipType}
              onChange={e => setRelationshipType(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border, #374151)',
                background: 'var(--bg-secondary, #1F2937)',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              <option value="RELATES_TO">Relates To</option>
              <option value="REFERENCES">References</option>
              <option value="DEPENDS_ON">Depends On</option>
              <option value="PARENT_OF">Parent Of</option>
              <option value="CHILD_OF">Child Of</option>
            </select>
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
              disabled={saving}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
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
              data-testid="confirm-add-relationship-btn"
            >
              <Plus size={14} /> {saving ? 'Linking...' : 'Establish Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
