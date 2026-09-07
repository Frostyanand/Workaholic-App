import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import * as tasksApi from '../services/tasks.api.js';

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

const PRIORITY_BADGES = {
  P0: { label: 'P0 Critical', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  P1: { label: 'P1 Urgent', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  P2: { label: 'P2 High', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },
  P3: { label: 'P3 Medium', color: '#818cf8', bg: 'rgba(99, 102, 241, 0.15)' },
  P4: { label: 'P4 Low', color: '#94a3b8', bg: 'rgba(100, 116, 139, 0.15)' },
};

export function TodayPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const todayDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await tasksApi.fetchTasks(null, { limit: 50 });
      setTasks(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load tasks for Today view');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Handle completion toggle directly from Today view (TM-TASK-011)
  async function handleToggleComplete(task) {
    const isCompleted = task.status === 'COMPLETED';
    const optimisticStatus = isCompleted ? 'TODO' : 'COMPLETED';

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
      const updated = isCompleted
        ? await tasksApi.reopenTask(task.id)
        : await tasksApi.completeTask(task.id);
      setTasks(prev => prev.map(t => (t.id === task.id ? updated : t)));
    } catch (err) {
      setTasks(prev =>
        prev.map(t =>
          t.id === task.id ? { ...t, status: task.status, isOverdue: task.isOverdue } : t,
        ),
      );
      setError(`Failed to update task: ${err.message}`);
    }
  }

  // Active tasks sorted by priority (P0 first)
  const activeTasks = tasks
    .filter(t => t.status !== 'COMPLETED')
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
  const focusTask = activeTasks[0] || null;

  return (
    <div style={{ padding: '32px', maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
      {/* Header Bar */}
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
              }}
            >
              <Calendar size={15} />
              <span>{todayDate}</span>
            </div>
            <h2
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.025em',
                margin: '6px 0',
              }}
            >
              Today Cockpit
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={loadTasks}
              aria-label="Refresh Today view"
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8125rem',
              }}
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                color: 'var(--accent-primary)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              <Sparkles size={14} />
              <span>Phase 1 Shell Active</span>
            </div>
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', margin: '4px 0 0 0' }}>
          Daily command center consolidating your scheduled tasks, academic Day Order, and focus
          priorities.
        </p>
      </header>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent-danger)',
            fontSize: '0.875rem',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Grid of Cockpit Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Focus Task Card */}
        <section
          aria-labelledby="focus-task-heading"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <CheckCircle2 size={18} color="var(--accent-success)" />
            <h3 id="focus-task-heading" style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Focus Task
            </h3>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Loading focus task...
            </p>
          ) : focusTask ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked="false"
                  onClick={() => handleToggleComplete(focusTask)}
                  aria-label={`Complete ${focusTask.title}`}
                  style={{
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px',
                    borderRadius: '50%',
                  }}
                >
                  <Circle size={20} />
                </button>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {focusTask.title}
                    </span>
                    {focusTask.priority && (
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '9999px',
                          backgroundColor:
                            PRIORITY_BADGES[focusTask.priority]?.bg || 'rgba(99, 102, 241, 0.15)',
                          color: PRIORITY_BADGES[focusTask.priority]?.color || '#818cf8',
                        }}
                      >
                        {PRIORITY_BADGES[focusTask.priority]?.label || focusTask.priority}
                      </span>
                    )}
                    {focusTask.isOverdue && (
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '9999px',
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          color: 'var(--accent-danger)',
                        }}
                      >
                        Overdue
                      </span>
                    )}
                  </div>
                  {focusTask.dueAt && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                        marginTop: '4px',
                      }}
                    >
                      Due: {new Date(focusTask.dueAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              No active focus task. You are all caught up for today!
            </p>
          )}

          {/* Actionable Tasks List */}
          {activeTasks.length > 1 && (
            <div style={{ marginTop: '20px' }}>
              <h4
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '10px',
                }}
              >
                Other Active Tasks ({activeTasks.length - 1})
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {activeTasks.slice(1, 5).map(task => (
                  <li
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: '6px',
                      fontSize: '0.875rem',
                    }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked="false"
                      onClick={() => handleToggleComplete(task)}
                      aria-label={`Complete ${task.title}`}
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Circle size={16} />
                    </button>
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{task.title}</span>
                    {task.isOverdue && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--accent-danger)',
                          fontWeight: 600,
                        }}
                      >
                        Overdue
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Completed Tasks in Today View (TM-TASK-011) */}
          {completedTasks.length > 0 && (
            <div
              style={{
                marginTop: '20px',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '16px',
              }}
            >
              <h4
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '10px',
                }}
              >
                Completed Today ({completedTasks.length})
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {completedTasks.slice(0, 5).map(task => (
                  <li
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: '6px',
                      fontSize: '0.875rem',
                      opacity: 0.75,
                    }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked="true"
                      onClick={() => handleToggleComplete(task)}
                      aria-label={`Reopen ${task.title}`}
                      style={{ color: 'var(--accent-success)' }}
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <span
                      style={{
                        flex: 1,
                        textDecoration: 'line-through',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {task.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--accent-success)',
                        fontWeight: 500,
                      }}
                    >
                      Completed
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Schedule & Time Blocks */}
        <section
          aria-labelledby="schedule-heading"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Clock size={18} color="var(--accent-primary)" />
            <h3 id="schedule-heading" style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Work Blocks & Day Order
            </h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Unified schedule view combining local calendar events, Google Sync, and academic Day
            Order.
          </p>
        </section>
      </div>
    </div>
  );
}
