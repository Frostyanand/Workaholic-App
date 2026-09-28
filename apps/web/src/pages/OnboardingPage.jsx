import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckSquare,
  HardDrive,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { getGoogleStatus, initiateGoogleOAuth } from '../services/auth.api.js';

export function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Check if user already has Google integrations connected
  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      try {
        const status = await getGoogleStatus();
        if (mounted) {
          // If already connected to Google services, skip onboarding directly to dashboard
          if (
            status?.connected &&
            (status.services?.calendar || status.services?.tasks || status.services?.drive)
          ) {
            navigate('/', { replace: true });
            return;
          }
        }
      } catch {
        // If not authenticated or status check fails, proceed with onboarding view
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    checkStatus();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Handle Google Workspace OAuth connection
  async function handleConnectWorkspace() {
    setConnecting(true);
    setError(null);

    try {
      // 1. Obtain authorization URL for WORKSPACE scope combination
      const { authorizationUrl } = await initiateGoogleOAuth('WORKSPACE');

      // 2. Open Google OAuth consent popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authorizationUrl,
        'google_workspace_oauth',
        `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`,
      );

      if (!popup) {
        throw new Error('Popup was blocked by your browser. Please allow popups for this site.');
      }

      // 3. Listen for postMessage from Fastify /api/v1/auth/google/callback
      const messagePromise = new Promise((resolve, reject) => {
        function handleMessage(event) {
          if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
            window.removeEventListener('message', handleMessage);
            resolve(event.data);
          } else if (event.data?.type === 'GOOGLE_AUTH_ERROR') {
            window.removeEventListener('message', handleMessage);
            reject(new Error(event.data.error || 'Authorization cancelled or denied by Google'));
          }
        }
        window.addEventListener('message', handleMessage);

        // Fallback polling for popup closure
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            // Verify if status became connected before failing
            getGoogleStatus()
              .then(status => {
                if (status?.connected) {
                  resolve(status);
                } else {
                  reject(new Error('Google authorization was cancelled or closed.'));
                }
              })
              .catch(() => reject(new Error('Google authorization was cancelled.')));
          }
        }, 1000);
      });

      await messagePromise;

      setSuccess(true);
      setConnecting(false);

      // Transition to dashboard
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
    } catch (err) {
      setConnecting(false);
      setError(
        err.message || 'Failed to connect Google Workspace. You can skip and connect later.',
      );
    }
  }

  function handleSkip() {
    navigate('/', { replace: true });
  }

  if (loading) {
    return (
      <div
        data-testid="onboarding-loading"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary, #090d16)',
          color: 'var(--text-secondary, #94a3b8)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <span>Checking workspace status...</span>
      </div>
    );
  }

  return (
    <div
      data-testid="onboarding-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-primary, #090d16)',
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.12), transparent 50%)',
        fontFamily: 'system-ui, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: 'var(--bg-secondary, #0f172a)',
          border: '1px solid var(--border-default, #1e293b)',
          borderRadius: '16px',
          padding: '36px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: 'var(--accent-primary, #38bdf8)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            <Sparkles size={14} />
            <span>Welcome to Workaholic</span>
          </div>

          <h1
            data-testid="onboarding-title"
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--text-primary, #f8fafc)',
              margin: '0 0 8px 0',
              letterSpacing: '-0.02em',
            }}
          >
            Connect your Google Workspace
          </h1>

          <p
            style={{
              fontSize: '0.925rem',
              color: 'var(--text-secondary, #94a3b8)',
              margin: '0 auto',
              maxWidth: '520px',
              lineHeight: 1.5,
            }}
          >
            Workaholic integrates directly with your Google services to keep your daily focus,
            calendar schedules, and project files synchronized.
          </p>
        </div>

        {/* Notifications & Banners */}
        {error && (
          <div
            data-testid="onboarding-error-banner"
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              marginBottom: '20px',
              color: '#ef4444',
              fontSize: '0.85rem',
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div
            data-testid="onboarding-success-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '14px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              marginBottom: '20px',
              color: '#10b981',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
            <div>Google Workspace connected successfully! Redirecting to dashboard...</div>
          </div>
        )}

        {/* 3 Service Feature Cards */}
        <div
          data-testid="onboarding-services-list"
          style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}
        >
          {/* Card 1: Google Calendar */}
          <div
            data-testid="service-card-calendar"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-tertiary, #1e293b)',
              border: '1px solid var(--border-subtle, #334155)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--accent-primary, #38bdf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Calendar size={20} />
            </div>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: 'var(--text-primary, #f8fafc)',
                  marginBottom: '4px',
                }}
              >
                Google Calendar
              </div>
              <div
                style={{
                  fontSize: '0.825rem',
                  color: 'var(--text-secondary, #94a3b8)',
                  lineHeight: 1.4,
                }}
              >
                Two-way event sync, smart conflict prevention, and seamless integration with Day
                Order academic schedules.
              </div>
            </div>
          </div>

          {/* Card 2: Google Tasks */}
          <div
            data-testid="service-card-tasks"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-tertiary, #1e293b)',
              border: '1px solid var(--border-subtle, #334155)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                color: '#eab308',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckSquare size={20} />
            </div>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: 'var(--text-primary, #f8fafc)',
                  marginBottom: '4px',
                }}
              >
                Google Tasks
              </div>
              <div
                style={{
                  fontSize: '0.825rem',
                  color: 'var(--text-secondary, #94a3b8)',
                  lineHeight: 1.4,
                }}
              >
                Discover task lists, import existing items, and sync statuses bidirectionally with
                Workaholic priorities.
              </div>
            </div>
          </div>

          {/* Card 3: Google Drive */}
          <div
            data-testid="service-card-drive"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-tertiary, #1e293b)',
              border: '1px solid var(--border-subtle, #334155)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <HardDrive size={20} />
            </div>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: 'var(--text-primary, #f8fafc)',
                  marginBottom: '4px',
                }}
              >
                Google Drive
              </div>
              <div
                style={{
                  fontSize: '0.825rem',
                  color: 'var(--text-secondary, #94a3b8)',
                  lineHeight: 1.4,
                }}
              >
                Attach files and documentation to tasks and projects. Detaching files keeps them
                safe in your Drive.
              </div>
            </div>
          </div>
        </div>

        {/* Security & Scopes Privacy Guarantee */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: 'rgba(56, 189, 248, 0.05)',
            border: '1px solid rgba(56, 189, 248, 0.15)',
            marginBottom: '28px',
          }}
        >
          <ShieldCheck size={16} color="var(--accent-primary, #38bdf8)" style={{ flexShrink: 0 }} />
          <div
            style={{
              fontSize: '0.775rem',
              color: 'var(--text-secondary, #94a3b8)',
              lineHeight: 1.35,
            }}
          >
            Workaholic only requests the narrowest scoped permissions (calendar.events, tasks, and
            drive.file). Your credentials are AES-256-GCM encrypted.
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Primary Action: Connect Google Workspace */}
          <button
            type="button"
            data-testid="connect-workspace-btn"
            onClick={handleConnectWorkspace}
            disabled={connecting || success}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '13px 20px',
              backgroundColor: 'var(--accent-primary, #38bdf8)',
              border: 'none',
              borderRadius: '8px',
              color: '#090d16',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: connecting || success ? 'not-allowed' : 'pointer',
              opacity: connecting || success ? 0.75 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <span>{connecting ? 'Connecting...' : 'Connect Google Workspace'}</span>
            {!connecting && <ArrowRight size={16} />}
          </button>

          {/* Secondary Action: Skip for now */}
          <button
            type="button"
            data-testid="skip-onboarding-btn"
            onClick={handleSkip}
            disabled={connecting || success}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '11px 16px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-default, #334155)',
              borderRadius: '8px',
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: connecting || success ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Skip for now (I'll connect later)
          </button>
        </div>
      </div>
    </div>
  );
}
