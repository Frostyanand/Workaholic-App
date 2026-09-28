import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Trash2, AtSign } from 'lucide-react';
import { Button } from '../common/Button.jsx';
import {
  listComments,
  createComment,
  deleteComment,
  listEligibleMembers,
} from '../../services/collaboration.api.js';

/**
 * Format relative or localized time.
 */
function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Parses comment text and highlights @mentions.
 */
function renderCommentContent(content) {
  if (!content) return null;
  // Match @username or @word
  const parts = content.split(/(@[a-zA-Z0-9._-]+)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={idx}
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: 'var(--color-primary, #3b82f6)',
            padding: '1px 5px',
            borderRadius: '4px',
            fontWeight: 600,
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

/**
 * Collaborative Comments Section.
 * Implements REQ-COLLAB-003, REQ-COLLAB-004, BR-COLLAB-003, BR-COLLAB-004.
 */
export function CommentSection({ targetType, targetId, workspaceId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState(null);
  const [eligibleMembers, setEligibleMembers] = useState([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const textareaRef = useRef(null);

  const loadComments = useCallback(async () => {
    if (!targetId || !targetType) return;
    setLoading(true);
    try {
      const items = await listComments({ targetType, targetId }, workspaceId);
      setComments(items);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType, workspaceId]);

  const loadEligibleMembers = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const members = await listEligibleMembers(workspaceId);
      setEligibleMembers(members);
    } catch {
      // Non-blocking fallback
    }
  }, [workspaceId]);

  useEffect(() => {
    loadComments();
    loadEligibleMembers();
  }, [loadComments, loadEligibleMembers]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      const newComment = await createComment(
        {
          targetType,
          targetId,
          content: trimmed,
        },
        workspaceId,
      );
      setComments(prev => [...prev, newComment]);
      setContent('');
      setShowMentionPicker(false);
    } catch (err) {
      setError(err.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId) {
    try {
      await deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      setError(err.message || 'Failed to delete comment');
    }
  }

  function insertMention(member) {
    const handle = member.userDisplayName || member.userEmail?.split('@')[0] || 'collaborator';
    const cleanHandle = handle.replace(/\s+/g, '_');
    const mentionText = `@${cleanHandle} `;
    setContent(prev => prev + mentionText);
    setShowMentionPicker(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  return (
    <div
      style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={16} style={{ color: 'var(--text-secondary)' }} />
          <h4
            style={{
              margin: 0,
              fontSize: '0.9rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Activity & Comments
          </h4>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-surface-elevated)',
              padding: '2px 6px',
              borderRadius: '10px',
            }}
          >
            {comments.length}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '12px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--color-danger, #ef4444)',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Comments List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: '320px',
          overflowY: 'auto',
          marginBottom: '16px',
          paddingRight: '4px',
        }}
      >
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '16px',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            No comments yet. Start the conversation!
          </div>
        ) : (
          comments.map(c => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                gap: '10px',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Avatar circle */}
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary, #3b82f6)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {(c.authorDisplayName || c.authorEmail || 'U').charAt(0).toUpperCase()}
              </div>

              {/* Body */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {c.authorDisplayName || c.authorEmail || 'Collaborator'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {formatTimestamp(c.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      title="Delete comment"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.45,
                  }}
                >
                  {renderCommentContent(c.content)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Comment Input */}
      <form onSubmit={handleSubmit}>
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write a comment... (use @name to mention)"
            rows={2}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />

          {/* Mention dropdown popup */}
          {showMentionPicker && eligibleMembers.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))',
                zIndex: 20,
                maxHeight: '160px',
                overflowY: 'auto',
                width: '240px',
                marginBottom: '4px',
              }}
            >
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                Mention Collaborator
              </div>
              {eligibleMembers.map(m => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => insertMention(m)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.backgroundColor = 'var(--bg-surface-elevated)')
                  }
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{ fontWeight: 500 }}>
                    {m.userDisplayName || m.userEmail?.split('@')[0]}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({m.role})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '8px',
          }}
        >
          {eligibleMembers.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowMentionPicker(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <AtSign size={13} />
              Mention
            </button>
          ) : (
            <div />
          )}

          <Button
            type="submit"
            size="sm"
            variant="primary"
            icon={Send}
            loading={submitting}
            disabled={!content.trim()}
          >
            Comment
          </Button>
        </div>
      </form>
    </div>
  );
}
