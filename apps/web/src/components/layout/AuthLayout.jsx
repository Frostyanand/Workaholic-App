import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ErrorBoundary } from '../common/ErrorBoundary.jsx';

export function AuthLayout() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        padding: '24px',
      }}
    >
      <header style={{ marginBottom: '32px', textAlign: 'center' }}>
        <Link
          to="/"
          style={{
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.025em',
              margin: 0,
            }}
          >
            Workaholic
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Personal Productivity OS
          </p>
        </Link>
      </header>

      <main
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '32px',
        }}
      >
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer style={{ marginTop: '32px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Workaholic • Local-First Architecture
      </footer>
    </div>
  );
}
