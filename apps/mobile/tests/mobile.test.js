import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TABS } from '../src/navigation/tabs.js';
import { apiClient } from '../src/services/api.js';
import { ENV } from '../src/config/env.js';

describe('Mobile Application Foundation (Task 1.4)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('defines the core navigation tabs for the mobile shell', () => {
    const tabIds = TABS.map(tab => tab.id);
    expect(tabIds).toEqual(['today', 'tasks', 'calendar', 'notes', 'settings']);
  });

  it('provides baseline environment configuration', () => {
    expect(ENV.apiUrl).toBeDefined();
    expect(typeof ENV.apiUrl).toBe('string');
  });

  it('apiClient executes requests with proper headers and returns success envelope', async () => {
    const mockData = { status: 'ok', version: '0.1.0' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: mockData }),
    });

    const result = await apiClient('/health');

    expect(global.fetch).toHaveBeenCalledWith(
      `${ENV.apiUrl}/health`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
      }),
    );
    expect(result).toEqual({ data: mockData });
  });

  it('apiClient normalizes endpoints without leading slashes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    await apiClient('tasks');

    expect(global.fetch).toHaveBeenCalledWith(`${ENV.apiUrl}/tasks`, expect.any(Object));
  });

  it('apiClient formats HTTP errors to standard error envelope', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
        },
      }),
    });

    const result = await apiClient('/users/me');

    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('apiClient catches network exceptions and returns NETWORK_ERROR envelope', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));

    const result = await apiClient('/health');

    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('NETWORK_ERROR');
    expect(result.error.message).toBe('Connection timed out');
  });
});
