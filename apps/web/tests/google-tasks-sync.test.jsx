// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { GoogleTasksSyncModal } from '../src/components/tasks/GoogleTasksSyncModal.jsx';
import * as integrationsApi from '../src/services/integrations.api.js';

describe('GoogleTasksSyncModal Component (Phase 14)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('renders nothing when isOpen is false', async () => {
    await act(async () => {
      root.render(<GoogleTasksSyncModal isOpen={false} onClose={vi.fn()} workspaceId="ws_123" />);
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders disconnected state with connect button when not connected', async () => {
    vi.spyOn(integrationsApi, 'fetchGoogleTasksStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
    });

    await act(async () => {
      root.render(<GoogleTasksSyncModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
    });

    expect(container.textContent).toContain('Google Tasks Integration');
    expect(container.textContent).toContain('Not connected to Google Tasks');
    expect(container.textContent).toContain('Connect Google Tasks');
  });

  it('renders connected state with discovered task lists and sync controls', async () => {
    vi.spyOn(integrationsApi, 'fetchGoogleTasksStatus').mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      accountName: 'tasks_user@example.com',
    });

    vi.spyOn(integrationsApi, 'fetchGoogleTaskLists').mockResolvedValue([
      {
        id: 'list_1',
        mappingId: 'map_1',
        title: 'Work Sprint Tasks',
        isDefault: true,
      },
      {
        id: 'list_2',
        mappingId: 'map_2',
        title: 'Personal Errands',
        isDefault: false,
      },
    ]);

    await act(async () => {
      root.render(<GoogleTasksSyncModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
    });

    expect(container.textContent).toContain('Connected');
    expect(container.textContent).toContain('Work Sprint Tasks');
    expect(container.textContent).toContain('Personal Errands');
    expect(container.textContent).toContain('Sync Now');
    expect(container.textContent).toContain('Disconnect');
  });

  it('triggers sync when Sync Now is clicked', async () => {
    const onSyncComplete = vi.fn();
    vi.spyOn(integrationsApi, 'fetchGoogleTasksStatus').mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      accountName: 'tasks_user@example.com',
    });

    vi.spyOn(integrationsApi, 'fetchGoogleTaskLists').mockResolvedValue([
      {
        id: 'list_1',
        mappingId: 'map_1',
        title: 'Work Sprint Tasks',
        isDefault: true,
      },
    ]);

    const syncSpy = vi.spyOn(integrationsApi, 'syncGoogleTasks').mockResolvedValue({
      success: true,
      imported: 3,
      exported: 2,
      conflicts: 0,
    });

    await act(async () => {
      root.render(
        <GoogleTasksSyncModal
          isOpen={true}
          onClose={vi.fn()}
          workspaceId="ws_123"
          onSyncComplete={onSyncComplete}
        />,
      );
    });

    const syncButton = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent.includes('Sync Now'),
    );
    expect(syncButton).toBeDefined();

    await act(async () => {
      syncButton.click();
    });

    expect(syncSpy).toHaveBeenCalledWith('ws_123');
    expect(onSyncComplete).toHaveBeenCalled();
    expect(container.textContent).toContain('3 imported');
    expect(container.textContent).toContain('2 exported');
  });

  it('handles disconnect flow with confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(integrationsApi, 'fetchGoogleTasksStatus').mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      accountName: 'tasks_user@example.com',
    });

    vi.spyOn(integrationsApi, 'fetchGoogleTaskLists').mockResolvedValue([]);
    const disconnectSpy = vi.spyOn(integrationsApi, 'disconnectGoogleTasks').mockResolvedValue({
      disconnected: true,
    });

    await act(async () => {
      root.render(<GoogleTasksSyncModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
    });

    const disconnectBtn = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent.includes('Disconnect'),
    );
    expect(disconnectBtn).toBeDefined();

    await act(async () => {
      disconnectBtn.click();
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
