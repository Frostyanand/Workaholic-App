// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { TaskItem } from '../src/components/tasks/TaskItem.jsx';
import { CreateTaskModal } from '../src/components/tasks/CreateTaskModal.jsx';
import { TaskDetailDrawer } from '../src/components/tasks/TaskDetailDrawer.jsx';
import { TasksPage } from '../src/pages/TasksPage.jsx';
import * as tasksApi from '../src/services/tasks.api.js';

describe('Task UI Components (Task 5.21)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  describe('TaskItem component', () => {
    it('renders task details, priority badge, and subtask count', async () => {
      const task = {
        id: 'task-1',
        title: 'Complete Phase 5 implementation',
        status: 'TODO',
        priority: 'P1',
        subtaskCount: 3,
        dueAt: '2026-10-15T12:00:00.000Z',
      };

      await act(async () => {
        root.render(
          <TaskItem
            task={task}
            onToggleComplete={() => {}}
            onSelectTask={() => {}}
            onDeleteTask={() => {}}
          />,
        );
      });

      expect(container.textContent).toContain('Complete Phase 5 implementation');
      expect(container.textContent).toContain('P1 Urgent');
      expect(container.textContent).toContain('3 subtasks');
    });

    it('displays Overdue badge when task is marked overdue', async () => {
      const overdueTask = {
        id: 'task-overdue',
        title: 'Submit quarterly taxes',
        status: 'TODO',
        priority: 'P0',
        dueAt: '2024-01-01T00:00:00.000Z',
        isOverdue: true,
      };

      await act(async () => {
        root.render(
          <TaskItem
            task={overdueTask}
            onToggleComplete={() => {}}
            onSelectTask={() => {}}
            onDeleteTask={() => {}}
          />,
        );
      });

      expect(container.textContent).toContain('Overdue');
      expect(container.textContent).toContain('P0 Critical');
    });

    it('renders attached label badges (TM-TASK-007)', async () => {
      const taskWithLabels = {
        id: 'task-labels',
        title: 'Document architecture invariants',
        status: 'TODO',
        priority: 'P1',
        labels: [
          { id: 'lbl-1', name: 'Architecture', color: '#4F46E5' },
          { id: 'lbl-2', name: 'Security', color: '#EF4444' },
        ],
      };

      await act(async () => {
        root.render(
          <TaskItem
            task={taskWithLabels}
            onToggleComplete={() => {}}
            onSelectTask={() => {}}
            onDeleteTask={() => {}}
          />,
        );
      });

      expect(container.textContent).toContain('Architecture');
      expect(container.textContent).toContain('Security');
    });

    it('triggers onToggleComplete when checkbox button is clicked', async () => {
      const task = {
        id: 'task-toggle',
        title: 'Check email',
        status: 'TODO',
        priority: 'P3',
      };

      const handleToggle = vi.fn();

      await act(async () => {
        root.render(
          <TaskItem
            task={task}
            onToggleComplete={handleToggle}
            onSelectTask={() => {}}
            onDeleteTask={() => {}}
          />,
        );
      });

      const checkboxBtn = container.querySelector('[role="checkbox"]');
      expect(checkboxBtn).not.toBeNull();
      expect(checkboxBtn.getAttribute('aria-checked')).toBe('false');

      await act(async () => {
        checkboxBtn.click();
      });

      expect(handleToggle).toHaveBeenCalledWith(task);
    });

    it('triggers onSelectTask when task title is clicked', async () => {
      const task = {
        id: 'task-select',
        title: 'Inspect database logs',
        status: 'IN_PROGRESS',
        priority: 'P2',
      };

      const handleSelect = vi.fn();

      await act(async () => {
        root.render(
          <TaskItem
            task={task}
            onToggleComplete={() => {}}
            onSelectTask={handleSelect}
            onDeleteTask={() => {}}
          />,
        );
      });

      const titleEl = container.querySelector('.task-item-title');
      expect(titleEl).not.toBeNull();

      await act(async () => {
        titleEl.click();
      });

      expect(handleSelect).toHaveBeenCalledWith(task);
    });

    it('triggers onDeleteTask when delete button is clicked', async () => {
      const task = {
        id: 'task-delete',
        title: 'Deprecated draft',
        status: 'TODO',
        priority: 'P4',
      };

      const handleDelete = vi.fn();

      await act(async () => {
        root.render(
          <TaskItem
            task={task}
            onToggleComplete={() => {}}
            onSelectTask={() => {}}
            onDeleteTask={handleDelete}
          />,
        );
      });

      const deleteBtn = container.querySelector('button[aria-label="Delete Deprecated draft"]');
      expect(deleteBtn).not.toBeNull();

      await act(async () => {
        deleteBtn.click();
      });

      expect(handleDelete).toHaveBeenCalledWith(task);
    });
  });

  describe('CreateTaskModal component', () => {
    it('validates empty title and submits valid task form data', async () => {
      const handleCreate = vi.fn().mockResolvedValue({});
      const handleClose = vi.fn();

      await act(async () => {
        root.render(
          <CreateTaskModal isOpen={true} onClose={handleClose} onCreateTask={handleCreate} />,
        );
      });

      expect(container.textContent).toContain('Create New Task');

      // Attempt to submit empty form
      const submitBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        submitBtn.click();
      });

      expect(container.textContent).toContain('Task title is required');
      expect(handleCreate).not.toHaveBeenCalled();

      // Fill in title using native setter to trigger React synthetic onChange
      const titleInput = container.querySelector('#task-title-input');
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeSetter.call(titleInput, 'My New Test Task');
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Submit valid form
      await act(async () => {
        submitBtn.click();
      });

      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My New Test Task',
          priority: 'P3',
        }),
      );
    });

    it('does not render when isOpen is false', async () => {
      await act(async () => {
        root.render(<CreateTaskModal isOpen={false} onClose={() => {}} onCreateTask={() => {}} />);
      });

      expect(container.textContent).toBe('');
    });
  });

  describe('TaskDetailDrawer component', () => {
    it('renders task details and manages subtask creation and toggle', async () => {
      const task = {
        id: 'parent-1',
        title: 'Parent Task Architecture',
        description: 'System specification details',
        status: 'IN_PROGRESS',
        priority: 'P1',
        estimatedDuration: 60,
        subtasks: [
          { id: 'sub-1', title: 'Subtask Alpha', status: 'COMPLETED' },
          { id: 'sub-2', title: 'Subtask Beta', status: 'TODO' },
        ],
      };

      const mockCreateSubtask = vi.spyOn(tasksApi, 'createSubtask').mockResolvedValue({
        id: 'sub-3',
        title: 'Subtask Gamma',
        status: 'TODO',
      });
      const mockCompleteSubtask = vi.spyOn(tasksApi, 'completeTask').mockResolvedValue({
        id: 'sub-2',
        title: 'Subtask Beta',
        status: 'COMPLETED',
      });

      await act(async () => {
        root.render(
          <TaskDetailDrawer
            task={task}
            isOpen={true}
            onClose={() => {}}
            onTaskUpdated={() => {}}
          />,
        );
      });

      const titleInput = container.querySelector('input[value="Parent Task Architecture"]');
      expect(titleInput).not.toBeNull();
      expect(container.textContent).toContain('System specification details');
      expect(container.textContent).toContain('Subtask Alpha');
      expect(container.textContent).toContain('Subtask Beta');

      // Add a subtask
      const subtaskInput = container.querySelector('input[placeholder="Add a subtask..."]');
      const addSubtaskBtn = subtaskInput.closest('form').querySelector('button[type="submit"]');

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeSetter.call(subtaskInput, 'Subtask Gamma');
        subtaskInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        addSubtaskBtn.click();
      });

      expect(mockCreateSubtask).toHaveBeenCalledWith('parent-1', undefined, {
        title: 'Subtask Gamma',
        priority: 'P3',
      });

      // Toggle subtask completion
      const subtaskButtons = Array.from(container.querySelectorAll('li button'));
      expect(subtaskButtons.length).toBeGreaterThanOrEqual(2);

      await act(async () => {
        subtaskButtons[1].click();
      });

      expect(mockCompleteSubtask).toHaveBeenCalledWith('sub-2', undefined);
    });

    it('renders attached labels and allows assigning a new label (TM-TASK-007)', async () => {
      const task = {
        id: 'task-detail-label',
        title: 'Task with Labels',
        status: 'TODO',
        priority: 'P2',
        labels: [{ id: 'lbl-1', name: 'Compliance', color: '#6366F1' }],
      };

      const mockCreateLabel = vi.spyOn(tasksApi, 'createLabel').mockResolvedValue({
        id: 'lbl-2',
        name: 'Urgent Review',
        color: '#4F46E5',
      });
      const mockAssignLabel = vi.spyOn(tasksApi, 'assignLabel').mockResolvedValue({
        taskId: 'task-detail-label',
        labelId: 'lbl-2',
      });
      const onTaskUpdated = vi.fn();

      await act(async () => {
        root.render(
          <TaskDetailDrawer
            task={task}
            isOpen={true}
            onClose={() => {}}
            onTaskUpdated={onTaskUpdated}
          />,
        );
      });

      expect(container.textContent).toContain('Compliance');

      const labelInput = container.querySelector('input[placeholder="Add label name..."]');
      const assignBtn = labelInput.closest('form').querySelector('button[type="submit"]');

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeSetter.call(labelInput, 'Urgent Review');
        labelInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        assignBtn.click();
      });

      expect(mockCreateLabel).toHaveBeenCalledWith(undefined, {
        name: 'Urgent Review',
        color: '#4F46E5',
      });
      expect(mockAssignLabel).toHaveBeenCalledWith('task-detail-label', undefined, 'lbl-2');
      expect(onTaskUpdated).toHaveBeenCalled();
    });
  });

  describe('TasksPage full view', () => {
    it('fetches tasks on load, renders list, and supports status filtering', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Design API Specs',
          status: 'TODO',
          priority: 'P0',
          dueAt: '2026-12-01T00:00:00.000Z',
          isOverdue: false,
        },
        {
          id: 'task-2',
          title: 'Implement Database Migrations',
          status: 'COMPLETED',
          priority: 'P2',
          completedAt: '2026-09-01T00:00:00.000Z',
        },
      ];

      vi.spyOn(tasksApi, 'fetchTasks').mockResolvedValue(mockTasks);

      await act(async () => {
        root.render(<TasksPage />);
      });

      expect(container.textContent).toContain('Task Management');
      expect(container.textContent).toContain('Design API Specs');
      expect(container.textContent).toContain('Implement Database Migrations');

      // Filter by Completed tab
      const completedTabBtn = Array.from(container.querySelectorAll('section button')).find(
        el => el.textContent === 'Completed',
      );
      expect(completedTabBtn).not.toBeUndefined();

      await act(async () => {
        completedTabBtn.click();
      });

      expect(tasksApi.fetchTasks).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ status: 'COMPLETED' }),
      );
    });

    it('renders empty state when no tasks match filter', async () => {
      vi.spyOn(tasksApi, 'fetchTasks').mockResolvedValue([]);

      await act(async () => {
        root.render(<TasksPage />);
      });

      expect(container.textContent).toContain('No tasks found');
      expect(container.textContent).toContain('Your task list is empty');
    });
  });
});
