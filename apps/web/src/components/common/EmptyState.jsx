import React from 'react';
import { Button } from './Button.jsx';

/**
 * Reusable accessible EmptyState component.
 * Conforms to docs/13.UX-SPECIFICATION.md Section 84.
 */
export function EmptyState({
  icon: Icon = null,
  title,
  description,
  actionLabel = null,
  onAction = null,
  actionIcon = null,
  style = {},
  ...props
}) {
  return (
    <div
      role="status"
      aria-label={title}
      style={{
        textAlign: 'center',
        padding: '56px 20px',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--border-strong)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '560px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      {Icon && (
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--bg-surface-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            marginBottom: '16px',
          }}
          aria-hidden="true"
        >
          <Icon size={28} />
        </div>
      )}
      <h3
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 8px 0',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
            margin: '0 0 20px 0',
            maxWidth: '380px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} icon={actionIcon} variant="primary" size="md">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
