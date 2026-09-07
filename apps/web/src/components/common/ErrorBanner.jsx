import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button } from './Button.jsx';

/**
 * Accessible ErrorBanner component with role="alert" and optional retry action.
 * Conforms to docs/13.UX-SPECIFICATION.md Section 73.
 */
export function ErrorBanner({ message, onRetry = null, onDismiss = null, style = {}, ...props }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 'var(--radius-md)',
        color: '#fca5a5',
        fontSize: '0.875rem',
        margin: '0 0 16px 0',
        ...style,
      }}
      {...props}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <AlertCircle
          size={18}
          style={{ flexShrink: 0, color: 'var(--accent-danger)' }}
          aria-hidden="true"
        />
        <span style={{ fontWeight: 500 }}>{message}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onRetry && (
          <Button
            size="sm"
            variant="danger"
            icon={RefreshCw}
            onClick={onRetry}
            style={{ padding: '4px 10px', fontSize: '0.75rem', minHeight: '28px' }}
          >
            Retry
          </Button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            style={{
              color: '#fca5a5',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
