// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { GoogleSyncModal } from '../src/components/calendar/GoogleSyncModal.jsx';
import * as integrationsApi from '../src/services/integrations.api.js';

describe('GoogleSyncModal Component (Phase 13)', () => {
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
      root.render(<GoogleSyncModal isOpen={false} onClose={vi.fn()} workspaceId="ws_123" />);
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders disconnected state with connect button when not connected', async () => {
    vi.spyOn(integrationsApi, 'fetchGoogleCalendarStatus').mockResolvedValue({
      connected: false,
      status: 'DISCONNECTED',
    });

    await act(async () => {
      root.render(<GoogleSyncModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
    });

    expect(container.textContent).toContain('Google Calendar Integration');
    expect(container.textContent).toContain('Not connected');
    expect(container.textContent).toContain('Connect Google Calendar');
  });

  it('renders connected state with discovered calendars and sync controls', async () => {
    vi.spyOn(integrationsApi, 'fetchGoogleCalendarStatus').mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      accountName: 'test@example.com',
    });

    vi.spyOn(integrationsApi, 'fetchGoogleCalendars').mockResolvedValue([
      {
        id: 'cal_1',
        mappingId: 'map_1',
        summary: 'Personal Google Calendar',
        isPrimary: true,
        backgroundColor: '#4285F4',
      },
      {
        id: 'cal_2',
        mappingId: 'map_2',
        summary: 'Team Calendar',
        isPrimary: false,
        backgroundColor: '#0F9D58',
      },
    ]);

    await act(async () => {
      root.render(<GoogleSyncModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
    });

    expect(container.textContent).toContain('Connected');
    expect(container.textContent).toContain('Personal Google Calendar');
    expect(container.textContent).toContain('Team Calendar');
    expect(container.textContent).toContain('Sync Now');
    expect(container.textContent).toContain('Disconnect');
  });

  it('triggers sync when Sync Now is clicked', async () => {
    const onSyncComplete = vi.fn();
    vi.spyOn(integrationsApi, 'fetchGoogleCalendarStatus').mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
      accountName: 'test@example.com',
    });

    vi.spyOn(integrationsApi, 'fetchGoogleCalendars').mockResolvedValue([
      {
        id: 'cal_1',
        mappingId: 'map_1',
        summary: 'Personal Google Calendar',
        isPrimary: true,
      },
    ]);

    const syncSpy = vi.spyOn(integrationsApi, 'syncGoogleCalendar').mockResolvedValue({
      imported: 3,
      exported: 1,
    });

    await act(async () => {
      root.render(
        <GoogleSyncModal
          isOpen={true}
          onClose={vi.fn()}
          workspaceId="ws_123"
          onSyncComplete={onSyncComplete}
        />,
      );
    });

    const syncButton = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent.includes('Sync Now'),
    );
    expect(syncButton).toBeDefined();

    await act(async () => {
      syncButton.click();
    });

    expect(syncSpy).toHaveBeenCalledWith('ws_123');
    expect(onSyncComplete).toHaveBeenCalled();
  });
});
