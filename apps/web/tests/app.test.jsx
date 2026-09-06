// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';

describe('Web App Shell', () => {
  it('renders the Workaholic shell with header and navigation', async () => {
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

    expect(container.textContent).toContain('Workaholic');
    expect(container.textContent).toContain('Local First');
    expect(container.textContent).toContain('Today Cockpit');
    expect(container.textContent).toContain('Focus Task');
    expect(container.textContent).toContain('Quick Capture');
  });

  it('renders fallback view for unhandled routes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/unknown-route']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('View under development');
  });
});
