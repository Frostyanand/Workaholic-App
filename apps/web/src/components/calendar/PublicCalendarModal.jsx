import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../common/Button.jsx';
import { LoadingSpinner } from '../common/LoadingSpinner.jsx';
import {
  getActivePublicLink,
  createPublicLink,
  revokePublicLink,
  regeneratePublicLink,
} from '../../services/public-calendar.api.js';

export function PublicCalendarModal({ isOpen, onClose, calendar, workspaceId, onLinkUpdated }) {
  const [link, setLink] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'revoke' | 'regenerate' | null
  const [expirationOption, setExpirationOption] = useState('never');

  const loadLink = useCallback(async () => {
    if (!calendar?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const activeLink = await getActivePublicLink(workspaceId, calendar.id);
      setLink(activeLink);
    } catch (err) {
      setError(err.message || 'Failed to load public link details');
    } finally {
      setIsLoading(false);
    }
  }, [calendar?.id, workspaceId]);

  useEffect(() => {
    if (isOpen && calendar?.id) {
      setConfirmAction(null);
      setCopied(false);
      loadLink();
    }
  }, [isOpen, calendar?.id, loadLink]);

  if (!isOpen || !calendar) return null;

  const calculateExpiresAt = option => {
    if (option === 'never') return null;
    const now = new Date();
    if (option === '7d') now.setDate(now.getDate() + 7);
    else if (option === '30d') now.setDate(now.getDate() + 30);
    else if (option === '90d') now.setDate(now.getDate() + 90);
    return now.toISOString();
  };

  const handleEnable = async () => {
    setIsActionLoading(true);
    setError(null);
    try {
      const expiresAt = calculateExpiresAt(expirationOption);
      const newLink = await createPublicLink(workspaceId, calendar.id, { expiresAt });
      setLink(newLink);
      if (onLinkUpdated) onLinkUpdated(newLink);
    } catch (err) {
      setError(err.message || 'Failed to enable public link');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRevoke = async () => {
    setIsActionLoading(true);
    setError(null);
    try {
      await revokePublicLink(workspaceId, calendar.id);
      setLink(null);
      setConfirmAction(null);
      if (onLinkUpdated) onLinkUpdated(null);
    } catch (err) {
      setError(err.message || 'Failed to revoke public link');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setIsActionLoading(true);
    setError(null);
    try {
      const expiresAt = calculateExpiresAt(expirationOption);
      const regenerated = await regeneratePublicLink(workspaceId, calendar.id, { expiresAt });
      setLink(regenerated);
      setConfirmAction(null);
      if (onLinkUpdated) onLinkUpdated(regenerated);
    } catch (err) {
      setError(err.message || 'Failed to regenerate public link');
    } finally {
      setIsActionLoading(false);
    }
  };

  const fullUrl = link?.url
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${link.url}`
    : '';

  const handleCopy = async () => {
    if (!fullUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        const input = document.createElement('input');
        input.value = fullUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard write permissions are restricted
      try {
        const input = document.createElement('input');
        input.value = fullUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setError('Unable to copy automatically to clipboard');
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#1E293B',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '560px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          border: '1px solid #334155',
          color: '#F8FAFC',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>🔗</span> Share Calendar & Public Link
            </h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: calendar.color || '#3B82F6',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '0.875rem', color: '#94A3B8' }}>{calendar.name}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Privacy Shield Banner */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: '#0F172A',
            border: '1px solid #1E3A8A',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.8125rem',
            color: '#93C5FD',
            lineHeight: 1.5,
          }}
        >
          <strong>🛡️ Strict Privacy Protection:</strong> All private events will appear to visitors
          strictly as <em>Busy</em> time blocks. Event titles, descriptions, notes, locations, and
          attendee lists are completely masked.
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#450A0A',
              border: '1px solid #991B1B',
              borderRadius: '8px',
              color: '#FCA5A5',
              fontSize: '0.875rem',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <LoadingSpinner size="large" />
            <p style={{ marginTop: '12px', color: '#94A3B8', fontSize: '0.875rem' }}>
              Loading public link status...
            </p>
          </div>
        ) : link && link.status === 'ACTIVE' ? (
          <div>
            {/* Active Link Status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontSize: '0.875rem', color: '#94A3B8' }}>Sharing Status:</span>
              <span
                style={{
                  backgroundColor: '#064E3B',
                  color: '#6EE7B7',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: '1px solid #047857',
                }}
              >
                ● Active & Public
              </span>
            </div>

            {/* URL Display with Copy */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  color: '#94A3B8',
                  marginBottom: '6px',
                }}
              >
                Public Link URL
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={fullUrl}
                  style={{
                    flex: 1,
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#F8FAFC',
                    fontSize: '0.875rem',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                  onClick={e => e.target.select()}
                />
                <Button
                  variant={copied ? 'success' : 'primary'}
                  onClick={handleCopy}
                  disabled={isActionLoading}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Link Metadata Info */}
            <div
              style={{
                backgroundColor: '#0F172A',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '0.8125rem',
                color: '#94A3B8',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
              }}
            >
              <div>
                <span style={{ color: '#64748B' }}>Created: </span>
                {new Date(link.createdAt).toLocaleDateString()}
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Expires: </span>
                {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'}
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748B' }}>Last Accessed: </span>
                {link.lastAccessedAt ? new Date(link.lastAccessedAt).toLocaleString() : 'Never'}
              </div>
            </div>

            {/* Confirmation Alert Box */}
            {confirmAction === 'revoke' && (
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#450A0A',
                  border: '1px solid #991B1B',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ color: '#FCA5A5', fontSize: '0.875rem', marginBottom: '12px' }}>
                  <strong>Revoke public link?</strong> Visitors using this link will immediately
                  lose access to your calendar feed.
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setConfirmAction(null)}
                    disabled={isActionLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    onClick={handleRevoke}
                    disabled={isActionLoading}
                  >
                    {isActionLoading ? 'Revoking...' : 'Confirm Revoke'}
                  </Button>
                </div>
              </div>
            )}

            {confirmAction === 'regenerate' && (
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#422006',
                  border: '1px solid #B45309',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ color: '#FDE68A', fontSize: '0.875rem', marginBottom: '12px' }}>
                  <strong>Regenerate public link?</strong> The existing link will be immediately
                  invalidated, and a brand new link will be created.
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setConfirmAction(null)}
                    disabled={isActionLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="warning"
                    size="small"
                    onClick={handleRegenerate}
                    disabled={isActionLoading}
                  >
                    {isActionLoading ? 'Regenerating...' : 'Confirm Regenerate'}
                  </Button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!confirmAction && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '8px',
                  borderTop: '1px solid #334155',
                }}
              >
                <a
                  href={fullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60A5FA',
                    fontSize: '0.875rem',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ↗ Preview Public View
                </a>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setConfirmAction('regenerate')}
                    disabled={isActionLoading}
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => setConfirmAction('revoke')}
                    disabled={isActionLoading}
                  >
                    Revoke Link
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Inactive State */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontSize: '0.875rem', color: '#94A3B8' }}>Sharing Status:</span>
              <span
                style={{
                  backgroundColor: '#334155',
                  color: '#94A3B8',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                ○ Inactive / Not Shared
              </span>
            </div>

            <p
              style={{
                fontSize: '0.875rem',
                color: '#CBD5E1',
                lineHeight: 1.5,
                marginBottom: '16px',
              }}
            >
              Enable a public calendar link to share your availability with anyone. Anyone with the
              secret link will be able to view your schedule without needing a Workaholic account.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  color: '#94A3B8',
                  marginBottom: '6px',
                }}
              >
                Link Expiration
              </label>
              <select
                value={expirationOption}
                onChange={e => setExpirationOption(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#F8FAFC',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              >
                <option value="never">Never (Link remains active until manually revoked)</option>
                <option value="7d">Expire after 7 days</option>
                <option value="30d">Expire after 30 days</option>
                <option value="90d">Expire after 90 days</option>
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                paddingTop: '8px',
                borderTop: '1px solid #334155',
              }}
            >
              <Button variant="secondary" onClick={onClose} disabled={isActionLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleEnable} disabled={isActionLoading}>
                {isActionLoading ? 'Enabling...' : 'Enable Public Link'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
