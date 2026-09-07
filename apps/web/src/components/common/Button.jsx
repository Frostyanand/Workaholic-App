import React from 'react';

/**
 * Accessible Button primitive supporting variants, sizes, loading states, and touch targets.
 * Conforms to docs/14.DESIGN-SYSTEM.md and docs/13.UX-SPECIFICATION.md Section 77.
 */
export const Button = React.forwardRef(function Button(
  {
    children,
    type = 'button',
    variant = 'primary',
    size = 'md',
    loading = false,
    isLoading = false,
    disabled = false,
    icon: Icon = null,
    onClick,
    style = {},
    className = '',
    'aria-label': ariaLabel,
    ...props
  },
  ref,
) {
  const isBusy = Boolean(loading || isLoading);
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.6 : 1,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    boxSizing: 'border-box',
    textDecoration: 'none',
    border: '1px solid transparent',
  };

  const sizeStyles =
    {
      sm: {
        padding: '6px 12px',
        fontSize: '0.8125rem',
        minHeight: '36px',
      },
      md: {
        padding: '10px 16px',
        fontSize: '0.875rem',
        minHeight: '40px',
      },
      lg: {
        padding: '12px 20px',
        fontSize: '1rem',
        minHeight: '48px',
      },
    }[size] || sizeStyles.md;

  const variantStyles =
    {
      primary: {
        backgroundColor: 'var(--accent-primary)',
        color: '#ffffff',
        borderColor: 'var(--accent-primary)',
      },
      secondary: {
        backgroundColor: 'var(--bg-surface-elevated)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-subtle)',
      },
      danger: {
        backgroundColor: 'var(--accent-danger)',
        color: '#ffffff',
        borderColor: 'var(--accent-danger)',
      },
      ghost: {
        backgroundColor: 'transparent',
        color: 'var(--text-secondary)',
        borderColor: 'transparent',
      },
    }[variant] || variantStyles.primary;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isBusy}
      aria-busy={isBusy ? 'true' : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        ...baseStyles,
        ...sizeStyles,
        ...variantStyles,
        ...style,
      }}
      className={className}
      {...props}
    >
      {isBusy ? (
        <span
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
            display: 'inline-block',
          }}
          aria-hidden="true"
        />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
});
