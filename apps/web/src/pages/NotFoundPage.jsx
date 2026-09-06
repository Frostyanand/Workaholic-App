import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div
      role="region"
      aria-label="Not Found"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-warning)',
          marginBottom: '16px',
        }}
      >
        <AlertTriangle size={24} />
      </div>
      <h2
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 8px 0',
        }}
      >
        Page Not Found
      </h2>
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.925rem',
          maxWidth: '400px',
          lineHeight: 1.5,
          marginBottom: '24px',
        }}
      >
        The view you are looking for does not exist or has moved. Return to your command center to
        resume work.
      </p>
      <Link
        to="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--bg-primary)',
          borderRadius: 'var(--radius-md)',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}
      >
        <Home size={16} />
        <span>Return to Today</span>
      </Link>
    </div>
  );
}
