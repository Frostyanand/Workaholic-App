// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OnboardingPage } from '../src/pages/OnboardingPage.jsx';
import * as authApi from '../src/services/auth.api.js';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Onboarding & Google Workspace Connection (Phase 4 / Onboarding)', () => {
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

  it('renders onboarding screen with Calendar, Tasks, and Drive when integrations are not connected', async () => {
    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
      scopes: [],
      services: {
        calendar: false,
        tasks: false,
        drive: false,
      },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    // Verify title and container are rendered
    expect(container.querySelector('[data-testid="onboarding-title"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="onboarding-title"]').textContent).toContain(
      'Connect your Google Workspace',
    );

    // Verify all 3 service cards are displayed
    expect(container.querySelector('[data-testid="service-card-calendar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="service-card-tasks"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="service-card-drive"]')).not.toBeNull();

    // Verify action buttons
    const connectBtn = container.querySelector('[data-testid="connect-workspace-btn"]');
    const skipBtn = container.querySelector('[data-testid="skip-onboarding-btn"]');
    expect(connectBtn).not.toBeNull();
    expect(connectBtn.textContent).toContain('Connect Google Workspace');
    expect(skipBtn).not.toBeNull();
    expect(skipBtn.textContent).toContain('Skip for now');
  });

  it('automatically redirects to dashboard if Google integrations are already connected', async () => {
    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      services: {
        calendar: true,
        tasks: false,
        drive: false,
      },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    // Should immediately navigate to dashboard
    expect(container.querySelector('[data-testid="dashboard"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="onboarding-title"]')).toBeNull();
  });

  it('navigates to dashboard when user clicks "Skip for now"', async () => {
    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
      scopes: [],
      services: { calendar: false, tasks: false, drive: false },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const skipBtn = container.querySelector('[data-testid="skip-onboarding-btn"]');
    expect(skipBtn).not.toBeNull();

    await act(async () => {
      skipBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should land on dashboard without requiring Google OAuth
    expect(container.querySelector('[data-testid="dashboard"]')).not.toBeNull();
  });

  it('initiates Google OAuth for WORKSPACE scope when Connect button is clicked', async () => {
    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
      scopes: [],
      services: { calendar: false, tasks: false, drive: false },
    });

    const initiateSpy = vi.spyOn(authApi, 'initiateGoogleOAuth').mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
      state: 'mock_state_123',
      service: 'WORKSPACE',
    });

    // Mock window.open
    const mockPopup = { closed: false };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockPopup);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const connectBtn = container.querySelector('[data-testid="connect-workspace-btn"]');
    await act(async () => {
      connectBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(initiateSpy).toHaveBeenCalledWith('WORKSPACE');
    expect(openSpy).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
      'google_workspace_oauth',
      expect.stringContaining('width=600'),
    );
  });

  it('displays error banner gracefully when OAuth is denied or popup fails', async () => {
    vi.spyOn(authApi, 'getGoogleStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
      scopes: [],
      services: { calendar: false, tasks: false, drive: false },
    });

    vi.spyOn(authApi, 'initiateGoogleOAuth').mockRejectedValue(
      new Error('Popup blocked or network unavailable'),
    );

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const connectBtn = container.querySelector('[data-testid="connect-workspace-btn"]');
    await act(async () => {
      connectBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const errorBanner = container.querySelector('[data-testid="onboarding-error-banner"]');
    expect(errorBanner).not.toBeNull();
    expect(errorBanner.textContent).toContain('Popup blocked or network unavailable');
  });
});
