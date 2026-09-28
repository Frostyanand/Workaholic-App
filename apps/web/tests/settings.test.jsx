// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/components/common/ToastContext.jsx';
import { SettingsPage } from '../src/pages/SettingsPage.jsx';
import * as workspacesApi from '../src/services/workspaces.api.js';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Settings & Workspaces Web Component (Phase 4 / Audit)', () => {
  let container;
  let root;

  const mockWorkspaces = [
    {
      id: 'ws-111',
      name: 'Engineering Team',
      workspaceType: 'TEAM',
      membership: { role: 'OWNER', status: 'ACTIVE' },
    },
    {
      id: 'ws-222',
      name: 'Personal Space',
      workspaceType: 'PERSONAL',
      membership: { role: 'MEMBER', status: 'ACTIVE' },
    },
  ];

  const mockMembers = [
    {
      id: 'mem-1',
      userId: 'usr-1',
      displayName: 'Alice Owner',
      email: 'alice@example.com',
      role: 'OWNER',
      status: 'ACTIVE',
    },
    {
      id: 'mem-2',
      userId: 'usr-2',
      displayName: 'Bob Dev',
      email: 'bob@example.com',
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  ];

  const mockProfile = {
    id: 'usr-1',
    displayName: 'Alice Owner',
    email: 'alice@example.com',
    timezone: 'UTC',
  };

  const mockSessions = [
    {
      id: 'sess-12345678',
      sessionType: 'WEB',
      createdAt: new Date().toISOString(),
      isCurrent: true,
    },
    {
      id: 'sess-87654321',
      sessionType: 'MOBILE',
      createdAt: new Date().toISOString(),
      isCurrent: false,
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();

    vi.spyOn(workspacesApi, 'fetchWorkspaces').mockResolvedValue(mockWorkspaces);
    vi.spyOn(workspacesApi, 'fetchWorkspaceMembers').mockResolvedValue(mockMembers);
    vi.spyOn(workspacesApi, 'fetchUserProfile').mockResolvedValue(mockProfile);
    vi.spyOn(workspacesApi, 'fetchActiveSessions').mockResolvedValue(mockSessions);
    vi.spyOn(workspacesApi, 'fetchUserDevices').mockResolvedValue([]);
  });

  it('renders SettingsPage and displays active workspace and members', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Settings & Workspaces');
    expect(container.textContent).toContain('Engineering Team');
    expect(container.textContent).toContain('Alice Owner');
    expect(container.textContent).toContain('Bob Dev');
  });

  it('allows switching to Profile & Preferences tab', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </MemoryRouter>,
      );
    });

    const profileTabBtn = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent.includes('Profile & Preferences'),
    );
    expect(profileTabBtn).toBeDefined();

    await act(async () => {
      profileTabBtn.click();
    });

    expect(container.textContent).toContain('Personal Profile');
    expect(container.textContent).toContain('Email Address');
    expect(container.textContent).toContain('Timezone');
  });

  it('allows switching to Security & Sessions tab and displays sessions', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </MemoryRouter>,
      );
    });

    const securityTabBtn = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent.includes('Security & Sessions'),
    );
    expect(securityTabBtn).toBeDefined();

    await act(async () => {
      securityTabBtn.click();
    });

    expect(container.textContent).toContain('Active Sessions');
    expect(container.textContent).toContain('Current Browser Session');
    expect(container.textContent).toContain('Revoke All Other Sessions');
  });

  it('opens Create Workspace modal on click', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </MemoryRouter>,
      );
    });

    const newWsBtn = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent.includes('New Workspace'),
    );
    expect(newWsBtn).toBeDefined();

    await act(async () => {
      newWsBtn.click();
    });

    expect(document.body.textContent).toContain('Create New Workspace');
    expect(document.body.textContent).toContain('Workspace Name');
  });
});
