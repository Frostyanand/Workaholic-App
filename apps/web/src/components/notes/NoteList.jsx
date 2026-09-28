import React from 'react';
import { Pin, Star, Archive, Clock, FileText } from 'lucide-react';

/**
 * NoteList Component
 * Renders the filterable, searchable list of notes.
 *
 * @param {Object} props
 * @param {Array<Object>} props.notes
 * @param {string|null} props.activeNoteId
 * @param {Function} props.onSelectNote
 * @param {Function} [props.onTogglePin]
 * @param {Function} [props.onToggleFavorite]
 * @param {Function} [props.onToggleArchive]
 */
export function NoteList({
  notes,
  activeNoteId,
  onSelectNote,
  onTogglePin: _onTogglePin,
  onToggleFavorite: _onToggleFavorite,
  onToggleArchive: _onToggleArchive,
}) {
  if (!notes || notes.length === 0) {
    return (
      <div
        style={{
          padding: '2rem 1rem',
          textAlign: 'center',
          color: 'var(--text-muted, #64748b)',
          fontSize: '0.9rem',
        }}
        data-testid="notes-empty-state"
      >
        <FileText size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
        <p style={{ margin: 0 }}>No notes found</p>
      </div>
    );
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return (
    <div
      className="notes-list-items"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem' }}
      data-testid="notes-list"
    >
      {notes.map(note => {
        const isActive = note.id === activeNoteId;
        const tags = Array.isArray(note.tags) ? note.tags : [];

        return (
          <div
            key={note.id}
            onClick={() => onSelectNote(note.id)}
            data-testid={`note-list-item-${note.id}`}
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              cursor: 'pointer',
              background: isActive
                ? 'var(--bg-surface-elevated, #1e263c)'
                : 'var(--bg-secondary, #101522)',
              border: `1px solid ${
                isActive ? 'var(--accent-primary, #6366f1)' : 'var(--border-subtle, #232b40)'
              }`,
              transition: 'all 150ms ease',
            }}
          >
            {/* Header: Title and Pin/Favorite flags */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '0.5rem',
                marginBottom: '0.35rem',
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: isActive ? '#fff' : 'var(--text-primary, #f1f5f9)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {note.title || 'Untitled Note'}
              </h4>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {note.isPinned && <Pin size={12} color="#6366F1" fill="#6366F1" title="Pinned" />}
                {note.isFavorite && (
                  <Star size={12} color="#F59E0B" fill="#F59E0B" title="Favorite" />
                )}
                {note.isArchived && <Archive size={12} color="#9CA3AF" title="Archived" />}
              </div>
            </div>

            {/* Snippet / Preview */}
            <p
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.8rem',
                color: 'var(--text-muted, #64748b)',
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {note.contentText || 'No preview text'}
            </p>

            {/* Footer: Category & Tags & Date */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.35rem',
                fontSize: '0.75rem',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}
              >
                {note.category && (
                  <span
                    style={{
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: '#818CF8',
                      padding: '0.1rem 0.35rem',
                      borderRadius: '4px',
                      fontWeight: 500,
                    }}
                  >
                    {note.category}
                  </span>
                )}
                {tags.slice(0, 2).map(tag => (
                  <span
                    key={tag}
                    style={{
                      background: 'var(--bg-surface, #161c2e)',
                      color: 'var(--text-secondary, #94a3b8)',
                      padding: '0.1rem 0.3rem',
                      borderRadius: '3px',
                    }}
                  >
                    #{tag}
                  </span>
                ))}
                {tags.length > 2 && (
                  <span style={{ color: 'var(--text-muted, #64748b)' }}>+{tags.length - 2}</span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  color: 'var(--text-muted, #64748b)',
                }}
              >
                <Clock size={10} />
                <span>{formatTime(note.updatedAt || note.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
