import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, ShieldCheck, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { signInWithGoogle, isFirebaseConfigured, createDemoIdToken } from '../services/firebase.js';
import { createSessionFromFirebase, getGoogleStatus } from '../services/auth.api.js';

export function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const configured = isFirebaseConfigured();

  async function routePostLogin() {
    try {
      const googleStatus = await getGoogleStatus();
      if (
        googleStatus?.connected &&
        (googleStatus.services?.calendar ||
          googleStatus.services?.tasks ||
          googleStatus.services?.drive)
      ) {
        // User already has Google integrations connected -> proceed to dashboard
        navigate('/', { replace: true });
      } else {
        // Prompt user to connect Google Workspace in onboarding flow
        navigate('/onboarding', { replace: true });
      }
    } catch {
      // In case of error querying status, default to dashboard
      navigate('/', { replace: true });
    }
  }

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 1. Authenticate with Google via Firebase Web SDK
      const { idToken } = await signInWithGoogle();

      // 2. Exchange Firebase ID token for native Workaholic session
      setSuccessMessage('Verifying identity with Workaholic...');
      await createSessionFromFirebase(idToken, {
        platform: 'WEB',
        deviceName: navigator.userAgent || 'Web Browser',
      });

      // 3. Intelligent Onboarding Routing
      await routePostLogin();
    } catch (err) {
      // Handle user cancellation gracefully
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setIsLoading(false);
        return;
      }
      setError(
        err.message || 'Authentication failed. Please check your credentials and try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDemoSignIn() {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Create local development demo token accepted by backend in dev/test mode
      const demoToken = createDemoIdToken('alex@example.com', 'Alex Chen (Demo)');
      setSuccessMessage('Starting demo session...');
      await createSessionFromFirebase(demoToken, {
        platform: 'WEB',
        deviceName: 'Demo Browser',
      });
      await routePostLogin();
    } catch (err) {
      setError(err.message || 'Failed to establish demo session.');
    } finally {
      setIsLoading(false);
    }
  }

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

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '16px',
            color: '#ef4444',
            fontSize: '0.8125rem',
            lineHeight: 1.4,
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{error}</div>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            marginBottom: '16px',
            color: '#10b981',
            fontSize: '0.8125rem',
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <div>{successMessage}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Real Firebase Google Sign-In */}
        <button
          type="button"
          data-testid="firebase-google-signin-btn"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: 'var(--accent-primary)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-md)',
            color: '#ffffff',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
            transition: 'all var(--transition-fast)',
          }}
        >
          <LogIn size={16} />
          <span>{isLoading ? 'Signing In...' : 'Continue with Google'}</span>
        </button>

        {/* Visual Separator */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0', gap: '10px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Development Shortcut
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
        </div>

        {/* Local Hackathon Quick Demo Login */}
        <button
          type="button"
          data-testid="demo-login-btn"
          onClick={handleDemoSignIn}
          disabled={isLoading}
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
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          <Sparkles size={16} color="var(--accent-primary)" />
          <span>Local Demo Login (Alex Chen)</span>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: configured ? 'rgba(56, 189, 248, 0.08)' : 'rgba(234, 179, 8, 0.08)',
            border: `1px solid ${configured ? 'rgba(56, 189, 248, 0.2)' : 'rgba(234, 179, 8, 0.2)'}`,
          }}
        >
          <ShieldCheck
            size={18}
            color={configured ? 'var(--accent-primary)' : '#eab308'}
            style={{ flexShrink: 0, marginTop: '2px' }}
          />
          <p
            style={{
              margin: 0,
              fontSize: '0.775rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            {configured
              ? 'Firebase Authentication active. Google credentials are authenticated directly with Google and verified via Firebase Admin SDK.'
              : 'No Firebase API key detected in .env. Use "Local Demo Login" for local testing, or configure VITE_FIREBASE_API_KEY to test real Google Authentication.'}
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
