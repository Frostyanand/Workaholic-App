import React from 'react';

export function PlaceholderPage({ title, phase, description }) {
  return (
    <div style={{ padding: '32px', maxWidth: '1000px', width: '100%', margin: '0 auto' }}>
      <header style={{ marginBottom: '24px' }}>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 8px 0',
          }}
        >
          {title}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', margin: 0 }}>
          {description}
        </p>
      </header>
      <div
        style={{
          padding: '24px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px dashed var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{phase}:</span> This
        domain module and interface will be established in its respective implementation phase
        according to the roadmap.
      </div>
    </div>
  );
}
