// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../src/pages/LoginPage.jsx';
import * as firebaseService from '../src/services/firebase.js';
import * as authApi from '../src/services/auth.api.js';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('LoginPage & Authentication Flow (Phase 4 / Onboarding)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders login view with primary Google login and separate local demo shortcut', () => {
    vi.spyOn(firebaseService, 'isFirebaseConfigured').mockReturnValue(true);

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>,
      );
    });

    const googleBtn = container.querySelector('[data-testid="firebase-google-signin-btn"]');
    const demoBtn = container.querySelector('[data-testid="demo-login-btn"]');

    expect(googleBtn).not.toBeNull();
    expect(googleBtn.textContent).toContain('Continue with Google');
    expect(demoBtn).not.toBeNull();
    expect(demoBtn.textContent).toContain('Local Demo Login (Alex Chen)');
    expect(container.textContent).toContain('Development Shortcut');
  });

  it('navigates to /onboarding after Google sign-in when Google Workspace is not yet connected', async () => {
    vi.spyOn(firebaseService, 'signInWithGoogle').mockResolvedValue({
      idToken: 'mock_firebase_id_token_123',
    });

    vi.spyOn(authApi, 'createSessionFromFirebase').mockResolvedValue({
      token: 'session_token_123',
      user: { id: 'u-1', email: 'test@example.com' },
    });

    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
      services: { calendar: false, tasks: false, drive: false },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/onboarding"
              element={<div data-testid="onboarding-view">Onboarding</div>}
            />
            <Route path="/" element={<div data-testid="dashboard-view">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const googleBtn = container.querySelector('[data-testid="firebase-google-signin-btn"]');
    await act(async () => {
      googleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="onboarding-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dashboard-view"]')).toBeNull();
  });

  it('navigates directly to dashboard (/) after Google sign-in if Google Workspace is already connected', async () => {
    vi.spyOn(firebaseService, 'signInWithGoogle').mockResolvedValue({
      idToken: 'mock_firebase_id_token_already_connected',
    });

    vi.spyOn(authApi, 'createSessionFromFirebase').mockResolvedValue({
      token: 'session_token_connected',
      user: { id: 'u-1', email: 'connected@example.com' },
    });

    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      services: { calendar: true, tasks: false, drive: false },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/onboarding"
              element={<div data-testid="onboarding-view">Onboarding</div>}
            />
            <Route path="/" element={<div data-testid="dashboard-view">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const googleBtn = container.querySelector('[data-testid="firebase-google-signin-btn"]');
    await act(async () => {
      googleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should skip onboarding and land directly on dashboard
    expect(container.querySelector('[data-testid="dashboard-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="onboarding-view"]')).toBeNull();
  });

  it('handles user cancellation of popup gracefully without showing an error', async () => {
    const cancelErr = new Error('Popup closed by user');
    cancelErr.code = 'auth/popup-closed-by-user';
    vi.spyOn(firebaseService, 'signInWithGoogle').mockRejectedValue(cancelErr);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>,
      );
    });

    const googleBtn = container.querySelector('[data-testid="firebase-google-signin-btn"]');
    await act(async () => {
      googleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should NOT display error banner
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('displays error message when sign in fails with an unexpected error', async () => {
    vi.spyOn(firebaseService, 'signInWithGoogle').mockRejectedValue(
      new Error('Network error during Google auth'),
    );

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>,
      );
    });

    const googleBtn = container.querySelector('[data-testid="firebase-google-signin-btn"]');
    await act(async () => {
      googleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const errorAlert = container.querySelector('[role="alert"]');
    expect(errorAlert).not.toBeNull();
    expect(errorAlert.textContent).toContain('Network error during Google auth');
  });

  it('supports Local Demo Login shortcut with intelligent onboarding detection', async () => {
    vi.spyOn(authApi, 'createSessionFromFirebase').mockResolvedValue({
      token: 'demo_session_token',
      user: { id: 'u-demo', email: 'alex@example.com' },
    });

    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
      services: { calendar: false, tasks: false, drive: false },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/onboarding"
              element={<div data-testid="onboarding-view">Onboarding</div>}
            />
            <Route path="/" element={<div data-testid="dashboard-view">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const demoBtn = container.querySelector('[data-testid="demo-login-btn"]');
    await act(async () => {
      demoBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="onboarding-view"]')).not.toBeNull();
  });
});
