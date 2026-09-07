// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { TodayPage } from '../src/pages/TodayPage.jsx';
import * as tasksApi from '../src/services/tasks.api.js';

describe('Today Cockpit & Task Integration (TM-TASK-011)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  it('renders Focus Task from highest priority active task', async () => {
    const mockTasks = [
      {
        id: 'task-low',
        title: 'Low priority clean up',
        status: 'TODO',
        priority: 'P4',
      },
      {
        id: 'task-focus',
        title: 'Critical architecture review',
        status: 'TODO',
        priority: 'P0',
        dueAt: '2026-10-01T12:00:00.000Z',
        isOverdue: false,
      },
    ];

    vi.spyOn(tasksApi, 'fetchTasks').mockResolvedValue(mockTasks);

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Today Cockpit');
    expect(container.textContent).toContain('Critical architecture review');
    expect(container.textContent).toContain('P0 Critical');
    expect(container.textContent).toContain('Other Active Tasks (1)');
  });

  it('completes a task from Today view and handles completed representation (TM-TASK-011)', async () => {
    const mockTask = {
      id: 'task-1',
      title: 'Complete system audit',
      status: 'TODO',
      priority: 'P1',
      isOverdue: false,
    };

    vi.spyOn(tasksApi, 'fetchTasks').mockResolvedValue([mockTask]);
    const mockComplete = vi.spyOn(tasksApi, 'completeTask').mockResolvedValue({
      ...mockTask,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    });

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Complete system audit');
    expect(container.textContent).not.toContain('Completed Today');

    const completeBtn = container.querySelector(
      'button[aria-label="Complete Complete system audit"]',
    );
    expect(completeBtn).not.toBeNull();

    await act(async () => {
      completeBtn.click();
    });

    expect(mockComplete).toHaveBeenCalledWith('task-1');

    // After completion, task appears in Completed Today section
    expect(container.textContent).toContain('Completed Today (1)');
    expect(container.textContent).toContain('Completed');
    expect(container.textContent).toContain(
      'No active focus task. You are all caught up for today!',
    );
  });

  it('reopens a completed task from Today view (TM-TASK-011)', async () => {
    const completedTask = {
      id: 'task-reopen',
      title: 'Review dependency graph',
      status: 'COMPLETED',
      priority: 'P2',
      completedAt: '2026-09-01T10:00:00.000Z',
    };

    vi.spyOn(tasksApi, 'fetchTasks').mockResolvedValue([completedTask]);
    const mockReopen = vi.spyOn(tasksApi, 'reopenTask').mockResolvedValue({
      ...completedTask,
      status: 'TODO',
      completedAt: null,
    });

    await act(async () => {
      root.render(<TodayPage />);
    });

    expect(container.textContent).toContain('Completed Today (1)');
    expect(container.textContent).toContain('Review dependency graph');

    const reopenBtn = container.querySelector(
      'button[aria-label="Reopen Review dependency graph"]',
    );
    expect(reopenBtn).not.toBeNull();

    await act(async () => {
      reopenBtn.click();
    });

    expect(mockReopen).toHaveBeenCalledWith('task-reopen');

    // After reopen, task restores to active Focus Task
    expect(container.textContent).toContain('Focus Task');
    expect(container.textContent).toContain('Review dependency graph');
  });

  it('clears overdue state upon task completion and restores it on reopen', async () => {
    const overdueTask = {
      id: 'task-overdue',
      title: 'Submit quarterly report',
      status: 'TODO',
      priority: 'P0',
      dueAt: '2024-01-01T00:00:00.000Z',
      isOverdue: true,
    };

    vi.spyOn(tasksApi, 'fetchTasks').mockResolvedValue([overdueTask]);
    vi.spyOn(tasksApi, 'completeTask').mockResolvedValue({
      ...overdueTask,
      status: 'COMPLETED',
      isOverdue: false,
      completedAt: new Date().toISOString(),
    });
    vi.spyOn(tasksApi, 'reopenTask').mockResolvedValue({
      ...overdueTask,
      status: 'TODO',
      isOverdue: true,
    });

    await act(async () => {
      root.render(<TodayPage />);
    });

    // Incomplete past-due task shows Overdue
    expect(container.textContent).toContain('Overdue');

    // Complete it
    const completeBtn = container.querySelector(
      'button[aria-label="Complete Submit quarterly report"]',
    );
    await act(async () => {
      completeBtn.click();
    });

    // Completed task does NOT show Overdue
    expect(container.textContent).not.toContain('Overdue');
    expect(container.textContent).toContain('Completed Today (1)');

    // Reopen it
    const reopenBtn = container.querySelector(
      'button[aria-label="Reopen Submit quarterly report"]',
    );
    await act(async () => {
      reopenBtn.click();
    });

    // Restores Overdue badge
    expect(container.textContent).toContain('Overdue');
  });
});
