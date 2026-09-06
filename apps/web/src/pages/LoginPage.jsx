import React from 'react';
import { Link } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';

export function LoginPage() {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h2
          style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
        >
          Sign In
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
          Access your workspaces and synchronizations
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <button
          type="button"
          disabled
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'not-allowed',
            opacity: 0.8,
          }}
        >
          <LogIn size={16} />
          <span>Continue with Google (Phase 3)</span>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
          }}
        >
          <ShieldCheck size={18} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          <p
            style={{
              margin: 0,
              fontSize: '0.775rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            Firebase Authentication will be integrated in Phase 3. You can explore the application
            shell currently.
          </p>
        </div>

        <Link
          to="/"
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: '8px',
            fontSize: '0.85rem',
            color: 'var(--accent-primary)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Return to Today Cockpit →
        </Link>
      </div>
    </div>
  );
}
