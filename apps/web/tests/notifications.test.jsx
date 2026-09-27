// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter } from '../src/components/notifications/NotificationCenter.jsx';
import * as notifApi from '../src/services/notifications.api.js';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Notification Center Web UX (Phase 11: NOTIF-T08, NOTIF-T09)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  const sampleNotifications = [
    {
      id: 'notif-1',
      title: 'Task Due: Quarterly Budget',
      body: 'Review final figures before 5pm',
      notificationType: 'REMINDER',
      readAt: null,
      dismissedAt: null,
      createdAt: new Date().toISOString(),
      targetReference: { entityType: 'TASK', entityId: 'task-123' },
    },
    {
      id: 'notif-2',
      title: 'Calendar: Product Demo',
      body: 'Demo starting in 10 minutes',
      notificationType: 'REMINDER',
      readAt: '2026-09-27T10:00:00Z',
      dismissedAt: null,
      createdAt: new Date().toISOString(),
      targetReference: { entityType: 'EVENT', entityId: 'event-456' },
    },
  ];

  it('renders notifications list when open and displays unread indicator', async () => {
    vi.spyOn(notifApi, 'fetchNotifications').mockResolvedValue(sampleNotifications);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <NotificationCenter isOpen={true} onClose={() => {}} />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Notifications');
    expect(container.textContent).toContain('Task Due: Quarterly Budget');
    expect(container.textContent).toContain('Calendar: Product Demo');
  });

  it('handles mark as read on unread notification', async () => {
    vi.spyOn(notifApi, 'fetchNotifications').mockResolvedValue(sampleNotifications);
    const markReadSpy = vi.spyOn(notifApi, 'markNotificationRead').mockResolvedValue({
      id: 'notif-1',
      readAt: new Date().toISOString(),
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <NotificationCenter isOpen={true} onClose={() => {}} />
        </MemoryRouter>,
      );
    });

    const readBtn = container.querySelector('button[title="Mark as read"]');
    expect(readBtn).not.toBeNull();

    await act(async () => {
      readBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(markReadSpy).toHaveBeenCalledWith('notif-1');
  });

  it('handles dismiss action to remove notification from list', async () => {
    vi.spyOn(notifApi, 'fetchNotifications').mockResolvedValue(sampleNotifications);
    const dismissSpy = vi.spyOn(notifApi, 'dismissNotification').mockResolvedValue({
      id: 'notif-1',
      dismissedAt: new Date().toISOString(),
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <NotificationCenter isOpen={true} onClose={() => {}} />
        </MemoryRouter>,
      );
    });

    const dismissBtns = container.querySelectorAll('button[title="Dismiss"]');
    expect(dismissBtns.length).toBeGreaterThan(0);

    await act(async () => {
      dismissBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(dismissSpy).toHaveBeenCalledWith('notif-1');
    expect(container.textContent).not.toContain('Task Due: Quarterly Budget');
  });

  it('renders empty state when there are no notifications', async () => {
    vi.spyOn(notifApi, 'fetchNotifications').mockResolvedValue([]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <NotificationCenter isOpen={true} onClose={() => {}} />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('No notifications to display');
  });

  it('does not render when isOpen is false', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <NotificationCenter isOpen={false} onClose={() => {}} />
        </MemoryRouter>,
      );
    });

    expect(container.innerHTML).toBe('');
  });
});
