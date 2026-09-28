import React, { useState, useEffect, useRef } from 'react';
import {
  Paperclip,
  Upload,
  Trash2,
  ExternalLink,
  AlertCircle,
  FileText,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';
import * as attachmentsApi from '../../services/attachments.api.js';
import * as integrationsApi from '../../services/integrations.api.js';

/**
 * NoteAttachments Component
 * Manages attachments for Notes using Google Drive and Workaholic Attachments subsystem.
 * Conforms to REQ-NOTE-004 and REQ-GDRIVE-004 (detaching preserves Drive file).
 *
 * @param {Object} props
 * @param {string} props.noteId
 * @param {string} [props.workspaceId]
 */
export function NoteAttachments({ noteId, workspaceId }) {
  const [attachments, setAttachments] = useState([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [detachTarget, setDetachTarget] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!noteId) return;
      try {
        setLoading(true);
        setError(null);

        // Check Drive integration status
        try {
          const driveStatus = await integrationsApi.fetchGoogleDriveStatus();
          if (isMounted) {
            setDriveConnected(Boolean(driveStatus?.connected));
          }
        } catch {
          if (isMounted) setDriveConnected(false);
        }

        // Fetch note attachments
        const data = await attachmentsApi.fetchAttachments(workspaceId, 'NOTE', noteId);
        if (isMounted) {
          setAttachments(data || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load note attachments');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [noteId, workspaceId]);

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      setStatusMessage('Uploading attachment...');

      const reader = new FileReader();
      const contentPromise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1] || reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
      });
      reader.readAsDataURL(file);
      const content = await contentPromise;

      const created = await attachmentsApi.uploadDriveAttachment(workspaceId, {
        targetType: 'NOTE',
        targetId: noteId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        content,
      });

      setAttachments(prev => [...prev, created]);
      setStatusMessage('File attached to note.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to upload attachment');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleDetachConfirm() {
    if (!detachTarget) return;
    try {
      setError(null);
      await attachmentsApi.detachAttachment(workspaceId, detachTarget.id);
      setAttachments(prev => prev.filter(a => a.id !== detachTarget.id));
      setStatusMessage('Attachment detached from note (Google Drive file preserved).');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to detach attachment');
    } finally {
      setDetachTarget(null);
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return (
    <div
      className="note-attachments"
      style={{
        marginTop: '1.5rem',
        borderTop: '1px solid var(--border, #374151)',
        paddingTop: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <h4
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
        >
          <Paperclip size={16} /> Attachments ({attachments.length})
          {driveConnected && (
            <span
              style={{
                fontSize: '0.7rem',
                color: '#10B981',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontWeight: 400,
              }}
            >
              <HardDrive size={12} /> Drive Active
            </span>
          )}
        </h4>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileSelected}
            disabled={uploading}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.3rem 0.6rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={14} /> {uploading ? 'Attaching...' : 'Attach File'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '0.5rem',
            marginBottom: '0.5rem',
            borderRadius: '4px',
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#10B981',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <CheckCircle2 size={14} /> {statusMessage}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '0.5rem',
            marginBottom: '0.5rem',
            borderRadius: '4px',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#EF4444',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div
          style={{ fontSize: '0.8rem', color: 'var(--text-muted, #9CA3AF)', padding: '0.5rem 0' }}
        >
          Loading attachments...
        </div>
      ) : attachments.length === 0 ? (
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted, #9CA3AF)',
            fontStyle: 'italic',
            padding: '0.25rem 0',
          }}
        >
          No files attached to this note.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {attachments.map(att => (
            <div
              key={att.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: 'var(--bg-secondary, #1F2937)',
                border: '1px solid var(--border, #374151)',
                fontSize: '0.85rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <FileText size={16} color="#6366F1" />
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {att.fileName}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #9CA3AF)' }}>
                  ({formatBytes(att.sizeBytes)})
                </span>
                {att.googleDriveFileId && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      fontSize: '0.7rem',
                      color: '#10B981',
                      background: 'rgba(16, 185, 129, 0.1)',
                      padding: '0.1rem 0.3rem',
                      borderRadius: '3px',
                    }}
                  >
                    <HardDrive size={10} /> Drive
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {att.webViewLink && (
                  <a
                    href={att.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#6366F1',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.2rem',
                    }}
                    title="Open in Google Drive"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#EF4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.2rem',
                  }}
                  onClick={() => setDetachTarget(att)}
                  title="Detach from note (Drive file preserved)"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation modal for detaching */}
      {detachTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary, #111827)',
              border: '1px solid var(--border, #374151)',
              borderRadius: '8px',
              padding: '1.25rem',
              maxWidth: '400px',
              width: '90%',
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Detach Attachment?</h4>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-muted, #9CA3AF)',
                margin: '0 0 1rem 0',
              }}
            >
              Are you sure you want to detach <strong>{detachTarget.fileName}</strong> from this
              note? The underlying file on Google Drive will <strong>not</strong> be deleted.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDetachTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{
                  background: '#EF4444',
                  color: '#fff',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={handleDetachConfirm}
              >
                Detach
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
