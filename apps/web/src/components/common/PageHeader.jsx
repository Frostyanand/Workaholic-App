import React from 'react';

/**
 * Standardized accessible PageHeader component.
 * Conforms to docs/14.DESIGN-SYSTEM.md and docs/13.UX-SPECIFICATION.md Section 4.
 */
export function PageHeader({
  title,
  subtitle = null,
  description = null,
  actions = null,
  badge = null,
  style = {},
}) {
  const descText = description || subtitle;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        ...style,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {title}
          </h1>
          {badge && <div>{badge}</div>}
        </div>
        {descText && (
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              margin: '6px 0 0 0',
              lineHeight: 1.4,
              maxWidth: '600px',
            }}
          >
            {descText}
          </p>
        )}
      </div>

      {actions && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
