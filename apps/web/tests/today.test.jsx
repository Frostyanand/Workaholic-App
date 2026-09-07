// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { TodayPage } from '../src/pages/TodayPage.jsx';
import * as todayApi from '../src/services/today.api.js';
import * as tasksApi from '../src/services/tasks.api.js';
import * as calendarApi from '../src/services/calendar.api.js';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Today Command Center Page (Phase 9 - TM-TODAY-001..006 & TM-TASK-011)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
    vi.spyOn(calendarApi, 'fetchCalendars').mockResolvedValue([
      { id: 'cal-1', name: 'Primary Calendar', isDefault: true, color: '#3b82f6' },
    ]);
  });

  const baseCockpitData = {
    date: '2026-09-07',
    timezone: 'Asia/Kolkata',
    currentWork: null,
    nextWork: null,
    dueToday: [],
    overdue: [],
    important: [],
    unscheduled: [],
    calendarEvents: [],
    workBlocks: [],
    completedToday: [],
    counts: {
      dueToday: 0,
      overdue: 0,
      important: 0,
      unscheduled: 0,
      completedToday: 0,
      calendarEvents: 0,
      workBlocks: 0,
    },
  };

  it('TM-TODAY-001: Renders tasks due today under Due Today section', async () => {
    const mockData = {
      ...baseCockpitData,
      dueToday: [
        {
          id: 'task-due-1',
          title: 'Prepare budget proposal',
          status: 'TODO',
          priority: 'P1',
          dueAt: '2026-09-07T14:00:00.000Z',
          isOverdue: false,
        },
      ],
      counts: { ...baseCockpitData.counts, dueToday: 1 },
    };

    vi.spyOn(todayApi, 'fetchTodayCockpit').mockResolvedValue(mockData);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Today / Command Center');
    expect(container.textContent).toContain('Due Today (1)');
    expect(container.textContent).toContain('Prepare budget proposal');
    expect(container.textContent).toContain('P1 Urgent');
  });

  it('TM-TODAY-002: Renders overdue tasks with warning badge in Overdue section', async () => {
    const mockData = {
      ...baseCockpitData,
      overdue: [
        {
          id: 'task-overdue-1',
          title: 'Submit regulatory audit',
          status: 'TODO',
          priority: 'P0',
          dueAt: '2026-09-06T10:00:00.000Z',
          isOverdue: true,
        },
      ],
      counts: { ...baseCockpitData.counts, overdue: 1 },
    };

    vi.spyOn(todayApi, 'fetchTodayCockpit').mockResolvedValue(mockData);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Overdue Tasks (1)');
    expect(container.textContent).toContain('Submit regulatory audit');
    expect(container.textContent).toContain('P0 Critical');
    expect(container.textContent).toContain('Overdue');
  });

  it('TM-TODAY-003: Renders important P0/P1/P2 tasks under Important Work', async () => {
    const mockData = {
      ...baseCockpitData,
      important: [
        {
          id: 'task-imp-1',
          title: 'Core kernel performance tuning',
          status: 'TODO',
          priority: 'P0',
        },
        {
          id: 'task-imp-2',
          title: 'Database connection pool optimization',
          status: 'TODO',
          priority: 'P2',
        },
      ],
      counts: { ...baseCockpitData.counts, important: 2 },
    };

    vi.spyOn(todayApi, 'fetchTodayCockpit').mockResolvedValue(mockData);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Important Work (2)');
    expect(container.textContent).toContain('Core kernel performance tuning');
    expect(container.textContent).toContain('Database connection pool optimization');
  });

  it("TM-TODAY-004: Renders today's calendar events and all-day events in Schedule", async () => {
    const mockData = {
      ...baseCockpitData,
      calendarEvents: [
        {
          id: 'evt-all-day',
          title: 'SRM Institute Founder Holiday',
          isAllDay: true,
          calendarColor: '#f59e0b',
        },
        {
          id: 'evt-timed',
          title: 'Executive Architecture Review',
          isAllDay: false,
          startAt: '2026-09-07T04:30:00.000Z',
          endAt: '2026-09-07T05:30:00.000Z',
          calendarColor: '#3b82f6',
        },
      ],
      counts: { ...baseCockpitData.counts, calendarEvents: 2 },
    };

    vi.spyOn(todayApi, 'fetchTodayCockpit').mockResolvedValue(mockData);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain("Today's Schedule");
    expect(container.textContent).toContain('SRM Institute Founder Holiday');
    expect(container.textContent).toContain('Executive Architecture Review');
    expect(container.textContent).toContain('All-Day Events');
    expect(container.textContent).toContain('Event');
  });

  it('TM-TODAY-005: Renders unscheduled important work with "Schedule Block" button', async () => {
    const mockData = {
      ...baseCockpitData,
      unscheduled: [
        {
          id: 'task-unscheduled-1',
          title: 'Refactor auth middleware to token rotation',
          status: 'TODO',
          priority: 'P1',
        },
      ],
      counts: { ...baseCockpitData.counts, unscheduled: 1 },
    };

    vi.spyOn(todayApi, 'fetchTodayCockpit').mockResolvedValue(mockData);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Unscheduled Important Work (1)');
    expect(container.textContent).toContain('Refactor auth middleware to token rotation');

    const scheduleBtn = container.querySelector(
      'button[aria-label="Schedule block for Refactor auth middleware to token rotation"]',
    );
    expect(scheduleBtn).not.toBeNull();
    expect(scheduleBtn.textContent).toContain('Schedule Block');
  });

  it('TM-TODAY-006a: Displays honest standby indicators when currentWork and nextWork are null', async () => {
    vi.spyOn(todayApi, 'fetchTodayCockpit').mockResolvedValue(baseCockpitData);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('No scheduled work right now');
    expect(container.textContent).toContain('No further scheduled work today');
  });

  it('TM-TODAY-006b: Renders active Current Work and Next Up work in Now & Next Cockpit', async () => {
    const populatedData = {
      ...baseCockpitData,
      currentWork: {
        id: 'block-now',
        type: 'WORK_BLOCK',
        title: 'Work Block: Database Index Analysis',
        taskTitle: 'Database Index Analysis',
        startAt: '2026-09-07T05:00:00.000Z',
        endAt: '2026-09-07T06:00:00.000Z',
      },
      nextWork: {
        id: 'evt-next',
        type: 'EVENT',
        title: 'Team Sync Call',
        startAt: '2026-09-07T07:00:00.000Z',
        endAt: '2026-09-07T07:30:00.000Z',
      },
    };

    vi.spyOn(todayApi, 'fetchTodayCockpit').mockResolvedValue(populatedData);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Active Now');
    expect(container.textContent).toContain('Work Block: Database Index Analysis');
    expect(container.textContent).toContain('Next Up');
    expect(container.textContent).toContain('Team Sync Call');
  });

  it('TM-TASK-011: Completes and reopens a task from Today Command Center', async () => {
    const mockTask = {
      id: 'task-101',
      title: 'Deploy migration scripts to staging',
      status: 'TODO',
      priority: 'P1',
      dueAt: '2026-09-07T12:00:00.000Z',
      isOverdue: false,
    };

    const initialData = {
      ...baseCockpitData,
      dueToday: [mockTask],
      counts: { ...baseCockpitData.counts, dueToday: 1 },
    };

    const completedData = {
      ...baseCockpitData,
      dueToday: [],
      completedToday: [{ ...mockTask, status: 'COMPLETED' }],
      counts: { ...baseCockpitData.counts, dueToday: 0, completedToday: 1 },
    };

    const reopenedData = {
      ...baseCockpitData,
      dueToday: [mockTask],
      completedToday: [],
      counts: { ...baseCockpitData.counts, dueToday: 1, completedToday: 0 },
    };

    vi.spyOn(todayApi, 'fetchTodayCockpit')
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(completedData)
      .mockResolvedValueOnce(reopenedData);

    const mockComplete = vi.spyOn(tasksApi, 'completeTask').mockResolvedValue({
      ...mockTask,
      status: 'COMPLETED',
    });
    const mockReopen = vi.spyOn(tasksApi, 'reopenTask').mockResolvedValue({
      ...mockTask,
      status: 'TODO',
    });

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Deploy migration scripts to staging');

    // Complete task
    const completeBtn = container.querySelector(
      'button[aria-label="Complete Deploy migration scripts to staging"]',
    );
    expect(completeBtn).not.toBeNull();

    await act(async () => {
      completeBtn.click();
    });

    expect(mockComplete).toHaveBeenCalledWith('task-101', null);

    // After completion, Completed Today section is shown
    expect(container.textContent).toContain('Completed Today (1)');

    // Toggle completed list open
    const toggleCompletedBtn = container
      .querySelector('#completed-today-heading')
      .closest('button');
    await act(async () => {
      toggleCompletedBtn.click();
    });

    // Reopen task
    const reopenBtn = container.querySelector(
      'button[aria-label="Reopen Deploy migration scripts to staging"]',
    );
    expect(reopenBtn).not.toBeNull();

    await act(async () => {
      reopenBtn.click();
    });

    expect(mockReopen).toHaveBeenCalledWith('task-101', null);
  });
});
