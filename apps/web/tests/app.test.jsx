// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary.jsx';
import { LoadingSpinner } from '../src/components/common/LoadingSpinner.jsx';

// ─── API Service Mocks (prevent real fetch calls in JSDOM) ───────────────────

vi.mock('../src/services/calendar.api.js', () => ({
  fetchCalendars: vi
    .fn()
    .mockResolvedValue([
      { id: 'cal-1', name: 'Personal', color: '#6366f1', isDefault: true, isVisible: true },
    ]),
  fetchCalendarEvents: vi.fn().mockResolvedValue({
    events: [],
    workBlocks: [],
    deadlines: [],
    meta: { total: 0 },
  }),
  createCalendar: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('../src/services/today.api.js', () => ({
  fetchTodaySummary: vi.fn().mockResolvedValue({ tasks: [], events: [], deadlines: [] }),
}));

vi.mock('../src/services/tasks.api.js', () => ({
  fetchTasks: vi.fn().mockResolvedValue([]),
  fetchTaskById: vi.fn().mockResolvedValue(null),
  createTask: vi.fn().mockResolvedValue({}),
  updateTask: vi.fn().mockResolvedValue({}),
  deleteTask: vi.fn().mockResolvedValue({}),
  fetchTaskDependencies: vi.fn().mockResolvedValue([]),
  addTaskDependency: vi.fn().mockResolvedValue({}),
  removeTaskDependency: vi.fn().mockResolvedValue({}),
  fetchRecurringTasks: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/projects.api.js', () => ({
  fetchProjects: vi.fn().mockResolvedValue([]),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('../src/services/boards.api.js', () => ({
  fetchBoards: vi.fn().mockResolvedValue([]),
  createBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
}));

vi.mock('../src/services/notes.api.js', () => ({
  fetchNotes: vi.fn().mockResolvedValue({ notes: [], pagination: { total: 0 } }),
  createNote: vi.fn(),
}));

vi.mock('../src/services/academic.api.js', () => ({
  fetchSemesters: vi.fn().mockResolvedValue([]),
  fetchAcademicDates: vi.fn().mockResolvedValue([]),
  fetchClassSchedules: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/booking.api.js', () => ({
  fetchBookingPages: vi.fn().mockResolvedValue([]),
  createBookingPage: vi.fn(),
}));

vi.mock('../src/services/collaboration.api.js', () => ({
  fetchTrustedRelationships: vi.fn().mockResolvedValue([]),
  fetchActivityFeed: vi.fn().mockResolvedValue({ entries: [] }),
  fetchEligibleCollaborators: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/workspaces.api.js', () => ({
  fetchWorkspaces: vi.fn().mockResolvedValue([]),
  fetchWorkspaceMembers: vi.fn().mockResolvedValue([]),
  createWorkspace: vi.fn(),
  addWorkspaceMember: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  fetchUserProfile: vi
    .fn()
    .mockResolvedValue({ displayName: 'Test User', email: 'test@example.com', timezone: 'UTC' }),
  updateUserProfile: vi.fn(),
  fetchActiveSessions: vi.fn().mockResolvedValue([]),
  revokeSession: vi.fn(),
  revokeAllSessions: vi.fn(),
  fetchUserDevices: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/notifications.api.js', () => ({
  fetchNotifications: vi.fn().mockResolvedValue([]),
  fetchUnreadCount: vi.fn().mockResolvedValue(0),
  markNotificationRead: vi.fn().mockResolvedValue({}),
  dismissNotification: vi.fn().mockResolvedValue({}),
  markAllNotificationsRead: vi.fn().mockResolvedValue({}),
  fetchNotificationPreferences: vi.fn().mockResolvedValue({}),
  updateNotificationPreferences: vi.fn().mockResolvedValue({}),
  registerPushToken: vi.fn().mockResolvedValue({}),
}));

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

    // Today Command Center view (Phase 9)
    expect(container.textContent).toContain('Today / Command Center');
    expect(container.textContent).toContain('Daily Cockpit');
    expect(container.textContent).toContain('Current Work');
    expect(container.textContent).toContain("Today's Schedule");
  });

  it('renders calendar interface at /calendar (Phase 8)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/calendar']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('+ Event');
    expect(container.textContent).toContain('Calendars');
  });

  it('renders academic interface at /academic (Phase 18)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/academic']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Academic');
  });

  it('renders placeholder views for remaining future shell routes (e.g. Settings)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/settings']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Settings & Workspaces');
    expect(container.textContent).toContain('Phase 4');
  });

  it('renders projects interface at /projects (Phase 6)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/projects']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Projects');
    expect(container.textContent).toContain('New Project');
  });

  it('renders boards interface at /boards (Phase 6)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/boards']}>
          <App />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Boards');
    expect(container.textContent).toContain('Create Board');
  });

  it('renders task management interface at /tasks (Task 5.21)', async () => {
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
    expect(container.textContent).toContain('New Task');
    expect(container.textContent).toContain('All Tasks');
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
    expect(container.textContent).toContain('Continue with Google');
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
