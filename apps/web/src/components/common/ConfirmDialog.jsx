import React, { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';

/**
 * Standard accessible Confirmation Dialog for destructive/high-risk actions.
 * Conforms to docs/13.UX-SPECIFICATION.md Section 72.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  consequence = null,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDestructive = true,
  isLoading = false,
}) {
  const cancelRef = useRef(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onClose}
      title={title}
      maxWidth="460px"
      initialFocusRef={cancelRef}
      showCloseButton={!isLoading}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: isDestructive
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDestructive ? 'var(--accent-danger)' : 'var(--accent-warning)',
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <AlertTriangle size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: '0.9375rem',
                color: 'var(--text-primary)',
                margin: '0 0 8px 0',
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
            {consequence && (
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                  margin: 0,
                  lineHeight: 1.4,
                  backgroundColor: 'var(--bg-surface)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {consequence}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
