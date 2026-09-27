import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { getWindowOptions, ALLOWED_INVOKE_CHANNELS } from '../src/main.js';
import { setupDesktopBridge } from '../src/preload.js';

describe('Desktop Electron Foundation (Task 1.3)', () => {
  it('enforces strict webPreferences security invariants in BrowserWindow options', () => {
    const options = getWindowOptions();

    expect(options.webPreferences).toBeDefined();
    expect(options.webPreferences.contextIsolation).toBe(true);
    expect(options.webPreferences.nodeIntegration).toBe(false);
    expect(options.webPreferences.sandbox).toBe(true);
    expect(options.webPreferences.preload).toContain(path.join('desktop', 'src', 'preload.js'));
  });

  it('whitelists only expected desktop IPC channels', () => {
    expect(ALLOWED_INVOKE_CHANNELS).toEqual([
      'desktop:ping',
      'desktop:get-system-info',
      'desktop:window-minimize',
      'desktop:window-maximize',
      'desktop:window-close',
      'desktop:show-notification',
      'desktop:schedule-notification',
    ]);
  });

  it('exposes a secure, whitelisted bridge in the preload script', async () => {
    const exposedAPIs = {};
    const mockContextBridge = {
      exposeInMainWorld: vi.fn((key, api) => {
        exposedAPIs[key] = api;
      }),
    };

    const mockIpcRenderer = {
      invoke: vi.fn((channel, ...args) => {
        if (channel === 'desktop:ping') {
          return Promise.resolve({ pong: true });
        }
        return Promise.resolve({ channel, args });
      }),
    };

    const api = setupDesktopBridge(mockContextBridge, mockIpcRenderer);

    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'workaholicDesktop',
      expect.any(Object),
    );
    expect(api.isDesktop).toBe(true);
    expect(typeof api.ping).toBe('function');
    expect(typeof api.getSystemInfo).toBe('function');
    expect(typeof api.minimizeWindow).toBe('function');
    expect(typeof api.maximizeWindow).toBe('function');
    expect(typeof api.closeWindow).toBe('function');
    expect(typeof api.showNotification).toBe('function');
    expect(typeof api.scheduleNotification).toBe('function');

    // Test successful invoke for whitelisted channel
    const pingResult = await api.ping();
    expect(pingResult).toEqual({ pong: true });
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('desktop:ping');

    // Test rejection for unauthorized channel
    await expect(api.invoke('unauthorized:eval')).rejects.toThrow(
      'Unauthorized IPC channel: unauthorized:eval',
    );
  });
});
