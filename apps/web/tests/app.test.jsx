// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary.jsx';
import { LoadingSpinner } from '../src/components/common/LoadingSpinner.jsx';

describe('Web Application Shell (Task 1.1)', () => {
  it('renders the authenticated shell and Today cockpit at root path', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );
    });

    // Navigation branding & links
    expect(container.textContent).toContain('Workaholic');
    expect(container.textContent).toContain('Personal Productivity OS');
    expect(container.textContent).toContain('Today');
    expect(container.textContent).toContain('Tasks');
    expect(container.textContent).toContain('Boards');
    expect(container.textContent).toContain('Calendar');
    expect(container.textContent).toContain('Academic');
    expect(container.textContent).toContain('Notes');
    expect(container.textContent).toContain('Settings');

    // Today Cockpit view
    expect(container.textContent).toContain('Today Cockpit');
    expect(container.textContent).toContain('Phase 1 Shell Active');
    expect(container.textContent).toContain('Focus Task');
    expect(container.textContent).toContain('Work Blocks & Day Order');
  });

  it('renders placeholder views for shell routes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/tasks']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Task Management');
    expect(container.textContent).toContain('Phase 5');
  });

  it('renders unauthenticated shell and login view at /login', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Sign In');
    expect(container.textContent).toContain('Continue with Google (Phase 3)');
    expect(container.textContent).toContain('Return to Today Cockpit');
  });

  it('renders 404 NotFoundPage for unknown routes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/non-existent-route']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Page Not Found');
    expect(container.textContent).toContain('Return to Today');
  });

  it('ErrorBoundary catches errors and displays recovery UI without white-screening', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // Suppress expected React error logging during this test
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BrokenComponent() {
      throw new Error('Simulated UI crash in subview');
    }

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <BrokenComponent />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('Simulated UI crash in subview');
    expect(container.textContent).toContain('Try Again');

    consoleError.mockRestore();
  });

  it('LoadingSpinner renders with accessible status role', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LoadingSpinner message="Syncing workspace..." />);
    });

    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl.textContent).toContain('Syncing workspace...');
  });
});
