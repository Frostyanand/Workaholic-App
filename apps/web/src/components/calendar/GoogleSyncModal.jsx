import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../common/Button.jsx';
import { LoadingSpinner } from '../common/LoadingSpinner.jsx';
import {
  fetchGoogleCalendarStatus,
  connectGoogleCalendar,
  fetchGoogleCalendars,
  syncGoogleCalendar,
  disconnectGoogleCalendar,
} from '../../services/integrations.api.js';

export function GoogleSyncModal({ isOpen, onClose, workspaceId, onSyncComplete }) {
  const [status, setStatus] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await fetchGoogleCalendarStatus();
      setStatus(s);
      if (s.connected) {
        const cals = await fetchGoogleCalendars(workspaceId);
        setCalendars(cals);
      }
    } catch (err) {
      setError(err.message || 'Failed to load Google Calendar integration status');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      setSyncResult(null);
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const auth = await connectGoogleCalendar();
      if (auth?.authorizationUrl) {
        try {
          if (typeof window !== 'undefined' && window.open) {
            window.open(auth.authorizationUrl, '_blank', 'width=600,height=700');
          }
        } catch {
          // Popup blocked or not supported
        }
      }
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Failed to initiate Google authorization');
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await syncGoogleCalendar(workspaceId);
      setSyncResult(res);
      await loadStatus();
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      setError(err.message || 'Synchronization failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !window.confirm('Disconnect Google Calendar? Your existing native events will be preserved.')
    ) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await disconnectGoogleCalendar();
      await loadStatus();
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      setError(err.message || 'Failed to disconnect');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-sync-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-md)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          width: '100%',
          maxWidth: '540px',
          padding: 'var(--space-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-lg)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <span style={{ fontSize: '1.5rem' }}>📅</span>
            <h2 id="google-sync-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              Google Calendar Integration
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--color-danger-subtle, rgba(239, 68, 68, 0.1))',
              color: 'var(--color-danger, #ef4444)',
              padding: 'var(--space-sm) var(--space-md)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Sync Success notification */}
        {syncResult && (
          <div
            role="status"
            style={{
              backgroundColor: 'var(--color-success-subtle, rgba(16, 185, 129, 0.1))',
              color: 'var(--color-success, #10b981)',
              padding: 'var(--space-sm) var(--space-md)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
            }}
          >
            ✅ Sync completed successfully: {syncResult.imported || 0} imported,{' '}
            {syncResult.exported || 0} exported.
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {/* Status section */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-md)',
                backgroundColor: 'var(--bg-subtle, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Connection Status</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {status?.connected
                    ? `Connected as ${status.accountDisplayName || 'Google Account'}`
                    : 'Not connected to Google Calendar'}
                </div>
              </div>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: status?.connected
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(156, 163, 175, 0.15)',
                  color: status?.connected ? '#10b981' : 'var(--text-muted)',
                }}
              >
                {status?.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>

            {/* Disconnected state prompt */}
            {!status?.connected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                  Connect your Google account to automatically import and synchronize calendar
                  events with Workaholic. Your native Workaholic calendar data remains completely
                  independent and safe.
                </p>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <Button variant="primary" onClick={handleConnect} style={{ width: '100%' }}>
                    Connect Google Calendar
                  </Button>
                </div>
              </div>
            )}

            {/* Connected state details */}
            {status?.connected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      marginBottom: 'var(--space-xs)',
                    }}
                  >
                    Mapped Google Calendars ({calendars.length})
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      maxHeight: '160px',
                      overflowY: 'auto',
                    }}
                  >
                    {calendars.length === 0 ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        No calendars discovered yet. Click Sync to discover calendars.
                      </div>
                    ) : (
                      calendars.map(cal => (
                        <div
                          key={cal.mappingId || cal.googleCalendarId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: cal.color || '#4285F4',
                              }}
                            />
                            <span>{cal.name || cal.summary}</span>
                            {(cal.primary || cal.isPrimary) && (
                              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                (Primary)
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.6875rem', color: '#10b981' }}>
                            {cal.syncState || 'SYNCED'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div
                  style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}
                >
                  <Button
                    variant="primary"
                    onClick={handleSync}
                    disabled={isSyncing}
                    style={{ flex: 1 }}
                  >
                    {isSyncing ? 'Synchronizing...' : 'Sync Now'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleDisconnect}
                    disabled={isSyncing}
                    style={{ color: 'var(--color-danger, #ef4444)' }}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
