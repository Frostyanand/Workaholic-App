import React from 'react';

/**
 * Accessible Badge primitive for status, priority, and metadata labels.
 * Ensures text + color hierarchy per docs/13.UX-SPECIFICATION.md Section 90 (UX-T05).
 */
export function Badge({
  children,
  variant = 'muted',
  size = 'md',
  icon: Icon = null,
  style = {},
  ...props
}) {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: 600,
    borderRadius: 'var(--radius-full)',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  };

  const sizeStyles =
    {
      sm: {
        padding: '3px 8px',
        fontSize: '0.6875rem',
      },
      md: {
        padding: '4px 10px',
        fontSize: '0.75rem',
      },
      lg: {
        padding: '6px 12px',
        fontSize: '0.8125rem',
      },
    }[size] || sizeStyles.md;

  const variantStyles =
    {
      primary: {
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        color: '#818cf8',
        border: '1px solid rgba(99, 102, 241, 0.3)',
      },
      success: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        color: '#34d399',
        border: '1px solid rgba(16, 185, 129, 0.3)',
      },
      warning: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        color: '#fbbf24',
        border: '1px solid rgba(245, 158, 11, 0.3)',
      },
      danger: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.3)',
      },
      muted: {
        backgroundColor: 'var(--bg-surface-elevated)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
      },
    }[variant] || variantStyles.muted;

  return (
    <span
      style={{
        ...baseStyles,
        ...sizeStyles,
        ...variantStyles,
        ...style,
      }}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 10 : 12} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
