import React, { useState, useEffect } from 'react';
import { X, HardDrive, CheckCircle2, AlertCircle, Folder, Unlink } from 'lucide-react';
import * as integrationsApi from '../../services/integrations.api.js';

/**
 * GoogleDriveModal Component (Phase 15: Google Drive Integration)
 * Conforms to docs/14.DESIGN-SYSTEM.md Section 74 (Integration UI),
 * REQ-GDRIVE-001 through REQ-GDRIVE-006.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {string} props.workspaceId
 */
export function GoogleDriveModal({ isOpen, onClose, workspaceId }) {
  const [status, setStatus] = useState(null);
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadStatus() {
      try {
        setLoading(true);
        setError(null);
        const data = await integrationsApi.fetchGoogleDriveStatus();
        if (isMounted) {
          setStatus(data);
          if (data?.connected && workspaceId) {
            try {
              const folderData = await integrationsApi.getOrCreateGoogleDriveFolder(workspaceId);
              if (isMounted) setFolder(folderData);
            } catch {
              // Ignore folder fetch error if not yet mapped
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to fetch Google Drive status');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadStatus();

    return () => {
      isMounted = false;
    };
  }, [isOpen, workspaceId]);

  if (!isOpen) return null;

  async function handleConnect() {
    try {
      setActionLoading(true);
      setError(null);
      const redirectUri = `${window.location.origin}/integrations/google/drive/callback`;
      const authData = await integrationsApi.connectGoogleDrive(redirectUri);

      if (authData?.authorizationUrl) {
        window.location.href = authData.authorizationUrl;
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate Google Drive authorization');
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    try {
      setActionLoading(true);
      setError(null);
      await integrationsApi.disconnectGoogleDrive();
      setStatus({ connected: false, status: 'DISCONNECTED', scopes: [] });
      setFolder(null);
      setShowDisconnectConfirm(false);
    } catch (err) {
      setError(err.message || 'Failed to disconnect Google Drive');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-drive-modal-title"
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
          borderRadius: 'var(--radius-md, 8px)',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={18} color="var(--accent-primary, #4F46E5)" />
            <h3
              id="google-drive-modal-title"
              style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}
            >
              Google Drive Integration
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: '#EF4444',
                fontSize: '0.85rem',
                marginBottom: '16px',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
              Checking Google Drive connection...
            </div>
          ) : status?.connected ? (
            <div>
              {/* Connected Status Card */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} color="#10B981" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#10B981' }}>
                      Connected to Google Drive
                    </div>
                    {status.accountDisplayName && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {status.accountDisplayName}
                      </div>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    color: '#10B981',
                    fontWeight: 600,
                  }}
                >
                  ACTIVE
                </span>
              </div>

              {/* Dedicated Folder Info */}
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}
                >
                  <Folder size={14} color="var(--accent-primary)" />
                  <span
                    style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}
                  >
                    Dedicated Attachments Folder
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {folder?.name || 'Workaholic Attachments'}
                </div>
              </div>

              {/* Disconnect Action */}
              {!showDisconnectConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: '#EF4444',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <Unlink size={14} />
                  <span>Disconnect Google Drive</span>
                </button>
              ) : (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Disconnect Google Drive? Native task attachments and external Drive files will
                    remain preserved. Calendar and Tasks will stay connected.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowDisconnectConfirm(false)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleDisconnect}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#EF4444',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: '#FFFFFF',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      {actionLoading ? 'Disconnecting...' : 'Confirm Disconnect'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Connect your Google Drive account to store and attach files to tasks and projects.
                Files are kept in your personal Drive in a dedicated "Workaholic Attachments"
                folder.
              </p>

              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConnect}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: 'var(--accent-primary, #4F46E5)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: '#FFFFFF',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                }}
              >
                <HardDrive size={16} />
                <span>{actionLoading ? 'Connecting...' : 'Connect Google Drive'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
