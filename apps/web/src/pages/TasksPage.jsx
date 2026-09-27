import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Clock, RefreshCw, Inbox } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader.jsx';
import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import { TaskItem } from '../components/tasks/TaskItem.jsx';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal.jsx';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import * as tasksApi from '../services/tasks.api.js';

export function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  // Active workspace (defaults to current context)
  const [activeWorkspaceId] = useState(null);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filters = {
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
        overdue: overdueOnly ? true : undefined,
        search: searchQuery.trim() || undefined,
      };
      const data = await tasksApi.fetchTasks(activeWorkspaceId, filters);
      setTasks(data);
    } catch (err) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, statusFilter, priorityFilter, overdueOnly, searchQuery]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Listen to global quick task creation
  useEffect(() => {
    function handleGlobalTaskCreated(e) {
      const created = e.detail;
      if (created) {
        setTasks(prev => {
          if (prev.some(t => t.id === created.id)) return prev;
          return [created, ...prev];
        });
      }
    }
    window.addEventListener('workaholic:task-created', handleGlobalTaskCreated);
    return () => {
      window.removeEventListener('workaholic:task-created', handleGlobalTaskCreated);
    };
  }, []);

  // Optimistic Toggle Complete
  async function handleToggleComplete(task) {
    const originalStatus = task.status;
    const isCurrentlyComplete = originalStatus === 'COMPLETED';
    const isRecurring = Boolean(task.recurrenceRuleId || task.recurrence_rule_id);

    // If recurring and completing an occurrence
    if (isRecurring && !isCurrentlyComplete) {
      try {
        const occKey = task.dueAt || task.due_at || new Date().toISOString();
        await tasksApi.completeTaskOccurrence(task.id, occKey, activeWorkspaceId);
        toast.success('Occurrence completed.');
        await loadTasks();
        return;
      } catch (err) {
        toast.error(`Failed to complete recurring occurrence: ${err.message}`);
        return;
      }
    }

    const optimisticStatus = isCurrentlyComplete ? 'TODO' : 'COMPLETED';

    // Optimistic state update
    setTasks(prev =>
      prev.map(t =>
        t.id === task.id
          ? {
              ...t,
              status: optimisticStatus,
              isOverdue: optimisticStatus === 'COMPLETED' ? false : t.isOverdue,
            }
          : t,
      ),
    );

    try {
      const updated = isCurrentlyComplete
        ? await tasksApi.reopenTask(task.id, activeWorkspaceId)
        : await tasksApi.completeTask(task.id, activeWorkspaceId);

      setTasks(prev => prev.map(t => (t.id === task.id ? updated : t)));
      if (selectedTask && selectedTask.id === task.id) {
        setSelectedTask(updated);
      }
      toast.info(optimisticStatus === 'COMPLETED' ? 'Task completed' : 'Task reopened');
    } catch (err) {
      // Rollback on failure
      setTasks(prev =>
        prev.map(t =>
          t.id === task.id ? { ...t, status: originalStatus, isOverdue: task.isOverdue } : t,
        ),
      );
      toast.error(`Failed to update task: ${err.message}`);
      setError(`Failed to update task: ${err.message}`);
    }
  }

  // Handle task creation
  async function handleCreateTask(taskData) {
    try {
      const newTask = await tasksApi.createTask(activeWorkspaceId, taskData);
      setTasks(prev => [newTask, ...prev]);
      toast.success('Task created successfully');
    } catch (err) {
      toast.error(`Failed to create task: ${err.message}`);
      throw err;
    }
  }

  // Handle task deletion (soft delete)
  async function handleDeleteTask(task) {
    if (!window.confirm(`Are you sure you want to delete "${task.title}"?`)) return;
    try {
      await tasksApi.deleteTask(task.id, activeWorkspaceId);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      if (selectedTask?.id === task.id) {
        setIsDetailDrawerOpen(false);
        setSelectedTask(null);
      }
      toast.success(`Task "${task.title}" deleted`);
    } catch (err) {
      toast.error(`Failed to delete task: ${err.message}`);
    }
  }

  // Open task details
  async function handleSelectTask(task) {
    try {
      const fullTask = await tasksApi.fetchTaskById(task.id, activeWorkspaceId);
      setSelectedTask(fullTask);
      setIsDetailDrawerOpen(true);
    } catch {
      setSelectedTask(task);
      setIsDetailDrawerOpen(true);
    }
  }

  function handleTaskUpdated(updated) {
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
    setSelectedTask(updated);
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1000px', width: '100%', margin: '0 auto' }}>
      {/* Header Bar */}
      <PageHeader
        title="Tasks"
        subtitle="Task Management — Organize and track your personal priorities"
        breadcrumbs={[{ label: 'Workaholic', href: '/tasks' }, { label: 'Tasks' }]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button
              type="button"
              variant="secondary"
              icon={RefreshCw}
              onClick={loadTasks}
              aria-label="Refresh tasks"
            >
              Refresh
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={Plus}
              onClick={() => setIsCreateModalOpen(true)}
            >
              New Task
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <section
        aria-label="Task Filters"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Search & Priority row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              aria-label="Search tasks"
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
              }}
            />
          </div>

          {/* Priority dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              htmlFor="priority-filter-select"
              style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
            >
              Priority:
            </label>
            <select
              id="priority-filter-select"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              style={{
                padding: '7px 10px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Priorities</option>
              <option value="P0">P0 Critical</option>
              <option value="P1">P1 Urgent</option>
              <option value="P2">P2 High</option>
              <option value="P3">P3 Medium</option>
              <option value="P4">P4 Low</option>
            </select>
          </div>

          {/* Overdue filter toggle badge */}
          <button
            type="button"
            onClick={() => setOverdueOnly(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '9999px',
              fontSize: '0.825rem',
              fontWeight: 500,
              backgroundColor: overdueOnly ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-secondary)',
              color: overdueOnly ? 'var(--accent-danger)' : 'var(--text-secondary)',
              border: `1px solid ${overdueOnly ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)'}`,
              transition: 'all var(--transition-fast)',
            }}
          >
            <Clock size={13} />
            <span>Overdue Only</span>
          </button>
        </div>

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { id: 'ALL', label: 'All Tasks' },
            { id: 'TODO', label: 'To Do' },
            { id: 'IN_PROGRESS', label: 'In Progress' },
            { id: 'BLOCKED', label: 'Blocked' },
            { id: 'COMPLETED', label: 'Completed' },
          ].map(tab => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: active ? 600 : 400,
                  backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
                  color: active ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'background-color var(--transition-fast)',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <div style={{ marginBottom: '20px' }}>
          <ErrorBanner message={error} onRetry={loadTasks} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Task List Section */}
      <main aria-label="Task List">
        {loading ? (
          <LoadingSpinner message="Loading tasks..." />
        ) : tasks.length === 0 ? (
          /* Empty State */
          <EmptyState
            icon={Inbox}
            title="No tasks found"
            description={
              statusFilter !== 'ALL' || priorityFilter !== 'ALL' || overdueOnly || searchQuery
                ? 'No tasks match the active filter criteria. Try adjusting your filters.'
                : 'Your task list is empty. Capture your actionable work to stay productive.'
            }
            actionLabel="Create Task"
            onAction={() => setIsCreateModalOpen(true)}
          />
        ) : (
          /* Populated List */
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
                onSelectTask={handleSelectTask}
                onDeleteTask={handleDeleteTask}
              />
            ))}
          </ul>
        )}
      </main>

      {/* Modals & Drawers */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateTask={handleCreateTask}
      />

      <TaskDetailDrawer
        task={selectedTask}
        isOpen={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
        onTaskUpdated={handleTaskUpdated}
      />
    </div>
  );
}
