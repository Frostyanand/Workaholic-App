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
 * TaskAttachments Component
 * Conforms to docs/14.DESIGN-SYSTEM.md Section 73 (Attachments UX),
 * REQ-GDRIVE-002 through REQ-GDRIVE-006.
 *
 * @param {Object} props
 * @param {string} props.taskId
 * @param {string} props.workspaceId
 */
export function TaskAttachments({ taskId, workspaceId }) {
  const [attachments, setAttachments] = useState([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  // Modals for confirmation
  const [detachTarget, setDetachTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!taskId) return;
      try {
        setLoading(true);
        setError(null);

        // Check Drive status
        try {
          const driveStatus = await integrationsApi.fetchGoogleDriveStatus();
          if (isMounted) {
            setDriveConnected(Boolean(driveStatus?.connected));
          }
        } catch {
          if (isMounted) setDriveConnected(false);
        }

        // Fetch attachments
        const data = await attachmentsApi.fetchAttachments(workspaceId, 'TASK', taskId);
        if (isMounted) {
          setAttachments(data || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load attachments');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [taskId, workspaceId]);

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      setStatusMessage('Uploading to Google Drive...');

      // Convert file to base64 content
      const reader = new FileReader();
      const contentPromise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1] || reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
      });
      reader.readAsDataURL(file);
      const content = await contentPromise;

      const created = await attachmentsApi.uploadDriveAttachment(workspaceId, {
        targetType: 'TASK',
        targetId: taskId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        content,
      });

      setAttachments(prev => [...prev, created]);
      setStatusMessage('File attached successfully.');
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
      setStatusMessage('Attachment detached from task (Drive file preserved).');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to detach attachment');
    } finally {
      setDetachTarget(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      setError(null);
      await attachmentsApi.deleteAttachmentWithDriveFile(workspaceId, deleteTarget.id);
      setAttachments(prev => prev.filter(a => a.id !== deleteTarget.id));
      setStatusMessage('File permanently deleted from Google Drive.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete file from Google Drive');
    } finally {
      setDeleteTarget(null);
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
    <div style={{ marginBottom: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Paperclip size={15} color="var(--accent-primary)" />
          <h4
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Attachments ({attachments.length})
          </h4>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            style={{ display: 'none' }}
            id={`file-input-${taskId}`}
          />
          <label
            htmlFor={`file-input-${taskId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.7 : 1,
            }}
          >
            <Upload size={13} />
            <span>{uploading ? 'Uploading...' : 'Attach File'}</span>
          </label>
        </div>
      </div>

      {/* Drive Status Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.75rem',
          color: driveConnected ? 'var(--text-muted)' : 'var(--warning-text, #F59E0B)',
          marginBottom: '10px',
        }}
      >
        <HardDrive size={12} />
        <span>
          {driveConnected
            ? 'Google Drive attached storage is enabled.'
            : 'Google Drive not connected. Connect in Settings or Integrations.'}
        </span>
      </div>

      {/* Status or Error alerts */}
      {statusMessage && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: '#10B981',
            fontSize: '0.8rem',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <CheckCircle2 size={14} />
          <span>{statusMessage}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: '#EF4444',
            fontSize: '0.8rem',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Attachments List */}
      {loading ? (
        <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
          Loading attachments...
        </div>
      ) : attachments.length === 0 ? (
        <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
          No files attached yet. Click "Attach File" to upload to Google Drive.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {attachments.map(att => (
            <li
              key={att.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}
              >
                <FileText size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div
                    style={{
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {att.fileName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {formatBytes(att.sizeBytes)} • {att.mimeType || 'file'}
                    {att.uploadStatus === 'FAILED' && (
                      <span style={{ color: '#EF4444', marginLeft: '6px' }}>• Unavailable</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {att.webUrl && (
                  <a
                    href={att.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Google Drive"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      color: 'var(--text-muted)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <ExternalLink size={14} />
                  </a>
                )}

                {/* Detach Action (REQ-GDRIVE-004) */}
                <button
                  type="button"
                  onClick={() => setDetachTarget(att)}
                  title="Detach from task (Drive file preserved)"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Detach
                </button>

                {/* Delete from Drive Action (REQ-GDRIVE-005) */}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(att)}
                  title="Delete from Google Drive"
                  style={{
                    padding: '4px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: '#EF4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Detach Confirmation Modal */}
      {detachTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detach-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface-elevated, #1F2937)',
              padding: '20px',
              borderRadius: 'var(--radius-md, 8px)',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
          >
            <h3
              id="detach-modal-title"
              style={{ margin: '0 0 10px 0', fontSize: '1rem', color: 'var(--text-primary)' }}
            >
              Detach Attachment
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Are you sure you want to remove <strong>{detachTarget.fileName}</strong> from this
              task?
              <br />
              <br />
              <span style={{ color: '#10B981' }}>
                Note: The file will remain safely intact in your Google Drive.
              </span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDetachTarget(null)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDetachConfirm}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--accent-primary, #4F46E5)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Detach
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Delete from Drive Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-drive-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface-elevated, #1F2937)',
              padding: '20px',
              borderRadius: 'var(--radius-md, 8px)',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
          >
            <h3
              id="delete-drive-modal-title"
              style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#EF4444' }}
            >
              Delete from Google Drive
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Are you sure you want to permanently delete <strong>{deleteTarget.fileName}</strong>{' '}
              from Google Drive?
              <br />
              <br />
              <strong style={{ color: '#EF4444' }}>
                This is a destructive operation and cannot be undone.
              </strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#EF4444',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Delete from Drive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
