import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Clock,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  RefreshCw,
  AlertTriangle,
  Plus,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  PlayCircle,
  CalendarClock,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader.jsx';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal.jsx';
import { ScheduleWorkBlockModal } from '../components/tasks/ScheduleWorkBlockModal.jsx';
import { CreateEventModal } from '../components/calendar/CreateEventModal.jsx';
import { EventDetailModal } from '../components/calendar/EventDetailModal.jsx';
import * as todayApi from '../services/today.api.js';
import * as tasksApi from '../services/tasks.api.js';
import * as calendarApi from '../services/calendar.api.js';

const PRIORITY_BADGES = {
  P0: {
    label: 'P0 Critical',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.3)',
  },
  P1: {
    label: 'P1 Urgent',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.3)',
  },
  P2: {
    label: 'P2 High',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.15)',
    border: 'rgba(234, 179, 8, 0.3)',
  },
  P3: {
    label: 'P3 Medium',
    color: '#818cf8',
    bg: 'rgba(99, 102, 241, 0.15)',
    border: 'rgba(99, 102, 241, 0.3)',
  },
  P4: {
    label: 'P4 Low',
    color: '#94a3b8',
    bg: 'rgba(100, 116, 139, 0.15)',
    border: 'rgba(100, 116, 139, 0.3)',
  },
};

function formatTimeOnly(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

export function TodayPage() {
  const context = useOutletContext() || {};
  const currentWorkspace = context.currentWorkspace;
  const workspaceId = currentWorkspace?.id || null;
  const toast = useToast();

  const [cockpitData, setCockpitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals & Drawers
  const [isQuickTaskOpen, setIsQuickTaskOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedulingTask, setSchedulingTask] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);

  // Fetch Cockpit data
  const loadCockpit = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const data = await todayApi.fetchTodayCockpit(workspaceId, { timezone: tz });
      setCockpitData(data);
    } catch (err) {
      setError(err.message || 'Failed to load Today Command Center data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Load calendars for CreateEventModal
  const loadCalendars = useCallback(async () => {
    try {
      const cals = await calendarApi.fetchCalendars(workspaceId);
      setCalendars(cals || []);
    } catch {
      // Non-blocking
    }
  }, [workspaceId]);

  useEffect(() => {
    loadCockpit();
    loadCalendars();
  }, [loadCockpit, loadCalendars]);

  // Global event listeners (tasks and events)
  useEffect(() => {
    function handleGlobalRefresh() {
      loadCockpit();
    }
    window.addEventListener('workaholic:task-created', handleGlobalRefresh);
    window.addEventListener('workaholic:event-created', handleGlobalRefresh);
    return () => {
      window.removeEventListener('workaholic:task-created', handleGlobalRefresh);
      window.removeEventListener('workaholic:event-created', handleGlobalRefresh);
    };
  }, [loadCockpit]);

  // Handle completion toggle
  async function handleToggleComplete(task) {
    const isCompleted = task.status === 'COMPLETED';
    const optimisticStatus = isCompleted ? 'TODO' : 'COMPLETED';

    // Optimistic UI updates
    setCockpitData(prev => {
      if (!prev) return prev;
      const updateTaskInList = list =>
        list.map(t =>
          t.id === task.id
            ? {
                ...t,
                status: optimisticStatus,
                isOverdue: optimisticStatus === 'COMPLETED' ? false : t.isOverdue,
              }
            : t,
        );
      return {
        ...prev,
        dueToday: updateTaskInList(prev.dueToday || []),
        overdue: updateTaskInList(prev.overdue || []),
        important: updateTaskInList(prev.important || []),
        unscheduled: updateTaskInList(prev.unscheduled || []),
        completedToday: isCompleted
          ? (prev.completedToday || []).filter(t => t.id !== task.id)
          : [...(prev.completedToday || []), { ...task, status: 'COMPLETED' }],
      };
    });

    try {
      if (isCompleted) {
        await tasksApi.reopenTask(task.id, workspaceId);
        toast.info('Task reopened');
      } else {
        await tasksApi.completeTask(task.id, workspaceId);
        toast.success('Task completed');
      }
      loadCockpit();
    } catch (err) {
      toast.error(`Failed to update task: ${err.message}`);
      loadCockpit();
    }
  }

  // Quick Task Submit
  async function handleCreateQuickTask(taskData) {
    try {
      const created = await tasksApi.createTask(workspaceId, taskData);
      toast.success('Task created');
      window.dispatchEvent(new CustomEvent('workaholic:task-created', { detail: created }));
      setIsQuickTaskOpen(false);
      loadCockpit();
    } catch (err) {
      toast.error(err.message || 'Failed to create task');
      throw err;
    }
  }

  // Create Event Submit
  async function handleCreateEvent(eventData) {
    try {
      const created = await calendarApi.createEvent(workspaceId, eventData);
      toast.success('Event scheduled');
      window.dispatchEvent(new CustomEvent('workaholic:event-created', { detail: created }));
      setIsCreateEventOpen(false);
      loadCockpit();
    } catch (err) {
      toast.error(err.message || 'Failed to schedule event');
      throw err;
    }
  }

  // Schedule Work Block Submit
  async function handleScheduleWorkBlock(blockData) {
    if (!schedulingTask) return;
    try {
      await tasksApi.createWorkBlock(schedulingTask.id, workspaceId, blockData);
      toast.success(`Work block scheduled for "${schedulingTask.title}"`);
      setIsScheduleModalOpen(false);
      setSchedulingTask(null);
      loadCockpit();
    } catch (err) {
      toast.error(err.message || 'Failed to schedule work block');
      throw err;
    }
  }

  // Merged timeline: timed calendar events + work blocks sorted startAt ASC
  const timelineItems = useMemo(() => {
    if (!cockpitData) return [];
    const events = (cockpitData.calendarEvents || [])
      .filter(e => !e.isAllDay && e.startAt)
      .map(e => ({
        id: e.id,
        title: e.title,
        startAt: e.startAt,
        endAt: e.endAt,
        type: 'EVENT',
        rawEvent: e,
        color: e.calendarColor || '#3b82f6',
      }));

    const blocks = (cockpitData.workBlocks || []).map(b => ({
      id: b.id,
      title: b.taskTitle || 'Work Block',
      startAt: b.startAt,
      endAt: b.endAt,
      type: 'WORK_BLOCK',
      taskId: b.taskId,
      color: '#10b981',
    }));

    return [...events, ...blocks].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [cockpitData]);

  const allDayEvents = useMemo(() => {
    if (!cockpitData) return [];
    return (cockpitData.calendarEvents || []).filter(e => e.isAllDay);
  }, [cockpitData]);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  }, []);

  const currentWork = cockpitData?.currentWork || null;
  const nextWork = cockpitData?.nextWork || null;
  const dueTodayTasks = cockpitData?.dueToday || [];
  const overdueTasks = cockpitData?.overdue || [];
  const importantTasks = cockpitData?.important || [];
  const unscheduledTasks = cockpitData?.unscheduled || [];
  const completedTodayTasks = cockpitData?.completedToday || [];

  return (
    <div
      style={{
        padding: '24px 32px',
        maxWidth: '1360px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Bar */}
      <PageHeader
        title="Today / Command Center"
        badge={<Badge variant="primary">Daily Cockpit</Badge>}
        subtitle={`${formattedDate} (${cockpitData?.timezone || 'Local'}) — Daily focus, active schedule, and real-time execution priorities.`}
        breadcrumbs={[{ label: 'Workaholic', href: '/' }, { label: 'Today' }]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              icon={Plus}
              onClick={() => setIsQuickTaskOpen(true)}
              aria-label="Create Quick Task"
            >
              Quick Task
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={CalendarIcon}
              onClick={() => setIsCreateEventOpen(true)}
              aria-label="New Event"
            >
              New Event
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={RefreshCw}
              onClick={loadCockpit}
              aria-label="Refresh Today Command Center"
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Error Alert */}
      {error && (
        <div style={{ marginBottom: '20px' }}>
          <ErrorBanner message={error} onRetry={loadCockpit} onDismiss={() => setError(null)} />
        </div>
      )}

      {loading && !cockpitData ? (
        <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* ========================================================= */}
          {/* NOW & NEXT COCKPIT (Section 13) */}
          {/* ========================================================= */}
          <section
            aria-labelledby="now-next-heading"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            <h2 id="now-next-heading" className="sr-only" style={{ display: 'none' }}>
              Current and Next Scheduled Work
            </h2>

            {/* CURRENT WORK CARD */}
            <div
              data-testid="current-work-card"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: currentWork
                  ? '1px solid rgba(16, 185, 129, 0.4)'
                  : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                boxShadow: currentWork ? '0 0 20px -5px rgba(16, 185, 129, 0.15)' : 'none',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PlayCircle
                      size={18}
                      color={currentWork ? 'var(--accent-success)' : 'var(--text-muted)'}
                    />
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Current Work
                    </span>
                  </div>
                  {currentWork ? (
                    <Badge variant="success">Active Now</Badge>
                  ) : (
                    <Badge variant="muted">Standby</Badge>
                  )}
                </div>

                {currentWork ? (
                  <div>
                    <h3
                      data-testid="current-work-title"
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        margin: '0 0 6px 0',
                        lineHeight: 1.3,
                      }}
                    >
                      {currentWork.title}
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: 'var(--accent-success)',
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        {formatTimeOnly(currentWork.startAt)} – {formatTimeOnly(currentWork.endAt)}
                      </span>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {currentWork.type === 'WORK_BLOCK' ? 'Task Work Block' : 'Calendar Event'}
                      </span>
                    </div>
                    {currentWork.taskTitle && currentWork.type === 'WORK_BLOCK' && (
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Task: <strong>{currentWork.taskTitle}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h3
                      data-testid="no-current-work"
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        margin: '0 0 4px 0',
                      }}
                    >
                      No scheduled work right now
                    </h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                      No active task work block or event scheduled for this exact moment.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* NEXT WORK CARD */}
            <div
              data-testid="next-work-card"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: nextWork
                  ? '1px solid rgba(99, 102, 241, 0.4)'
                  : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ArrowRight
                      size={18}
                      color={nextWork ? 'var(--accent-primary)' : 'var(--text-muted)'}
                    />
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Next Work
                    </span>
                  </div>
                  {nextWork ? (
                    <Badge variant="primary">Next Up</Badge>
                  ) : (
                    <Badge variant="muted">Schedule Clear</Badge>
                  )}
                </div>

                {nextWork ? (
                  <div>
                    <h3
                      data-testid="next-work-title"
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        margin: '0 0 6px 0',
                        lineHeight: 1.3,
                      }}
                    >
                      {nextWork.title}
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: 'var(--accent-primary)',
                          backgroundColor: 'rgba(99, 102, 241, 0.12)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        Starts at {formatTimeOnly(nextWork.startAt)}
                      </span>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {nextWork.type === 'WORK_BLOCK' ? 'Task Work Block' : 'Calendar Event'}
                      </span>
                    </div>
                    {nextWork.taskTitle && nextWork.type === 'WORK_BLOCK' && (
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Task: <strong>{nextWork.taskTitle}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h3
                      data-testid="no-next-work"
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        margin: '0 0 4px 0',
                      }}
                    >
                      No further scheduled work today
                    </h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                      No remaining scheduled items on your calendar for the rest of today.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ========================================================= */}
          {/* TWO-COLUMN COMMAND GRID (Tasks on Left, Schedule on Right) */}
          {/* ========================================================= */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* ------------------------------------------------------- */}
            {/* LEFT COLUMN: TASKS COCKPIT (Overdue, Due Today, Important) */}
            {/* ------------------------------------------------------- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* OVERDUE WORK SECTION (If any overdue tasks exist) */}
              {overdueTasks.length > 0 && (
                <section
                  aria-labelledby="overdue-tasks-heading"
                  data-testid="overdue-tasks-section"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={18} color="var(--accent-danger)" />
                      <h3
                        id="overdue-tasks-heading"
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--accent-danger)',
                          margin: 0,
                        }}
                      >
                        Overdue Tasks ({overdueTasks.length})
                      </h3>
                    </div>
                    <Badge variant="danger">Action Required</Badge>
                  </div>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {overdueTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onToggle={() => handleToggleComplete(task)}
                        forceOverdue
                      />
                    ))}
                  </ul>
                </section>
              )}

              {/* DUE TODAY SECTION */}
              <section
                aria-labelledby="due-today-heading"
                data-testid="due-today-section"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} color="var(--accent-primary)" />
                    <h3
                      id="due-today-heading"
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        margin: 0,
                      }}
                    >
                      Due Today ({dueTodayTasks.length})
                    </h3>
                  </div>
                </div>

                {dueTodayTasks.length === 0 ? (
                  <p
                    data-testid="no-due-today"
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-muted)',
                      margin: 0,
                      padding: '12px 0',
                    }}
                  >
                    No tasks due today. All deadlines met!
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {dueTodayTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onToggle={() => handleToggleComplete(task)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {/* IMPORTANT WORK SECTION (P0, P1, P2) */}
              <section
                aria-labelledby="important-work-heading"
                data-testid="important-work-section"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={18} color="var(--accent-warning)" />
                    <h3
                      id="important-work-heading"
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        margin: 0,
                      }}
                    >
                      Important Work ({importantTasks.length})
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    P0 · P1 · P2
                  </span>
                </div>

                {importantTasks.length === 0 ? (
                  <p
                    data-testid="no-important"
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-muted)',
                      margin: 0,
                      padding: '12px 0',
                    }}
                  >
                    No critical or urgent tasks pending.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {importantTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onToggle={() => handleToggleComplete(task)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {/* COMPLETED TODAY SECTION */}
              {completedTodayTasks.length > 0 && (
                <section
                  aria-labelledby="completed-today-heading"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px 20px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowCompleted(prev => !prev)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: 'var(--text-secondary)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} color="var(--accent-success)" />
                      <span id="completed-today-heading">
                        Completed Today ({completedTodayTasks.length})
                      </span>
                    </div>
                    {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {showCompleted && (
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '14px 0 0 0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {completedTodayTasks.map(task => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onToggle={() => handleToggleComplete(task)}
                          completed
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>

            {/* ------------------------------------------------------- */}
            {/* RIGHT COLUMN: TODAY'S SCHEDULE TIMELINE */}
            {/* ------------------------------------------------------- */}
            <section
              aria-labelledby="schedule-heading"
              data-testid="today-schedule-section"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CalendarClock size={18} color="var(--accent-primary)" />
                  <h3
                    id="schedule-heading"
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    Today's Schedule
                  </h3>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Plus}
                  onClick={() => setIsCreateEventOpen(true)}
                >
                  Event
                </Button>
              </div>

              {/* ALL DAY EVENTS BANNER */}
              {allDayEvents.length > 0 && (
                <div
                  style={{
                    marginBottom: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    All-Day Events
                  </span>
                  {allDayEvents.map(event => (
                    <div
                      key={event.id}
                      onClick={() => {
                        setSelectedEvent(event);
                        setIsDetailModalOpen(true);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedEvent(event);
                          setIsDetailModalOpen(true);
                        }
                      }}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderLeft: `4px solid ${event.calendarColor || 'var(--accent-primary)'}`,
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{event.title}</span>
                      <Badge variant="primary">All-Day</Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* TIMELINE ITEMS */}
              {timelineItems.length === 0 && allDayEvents.length === 0 ? (
                <p
                  data-testid="no-schedule"
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                    margin: 0,
                    padding: '24px 0',
                    textAlign: 'center',
                  }}
                >
                  No events or work blocks scheduled for today.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {timelineItems.map(item => (
                    <div
                      key={item.id}
                      data-testid={`timeline-item-${item.id}`}
                      onClick={() => {
                        if (item.rawEvent) {
                          setSelectedEvent(item.rawEvent);
                          setIsDetailModalOpen(true);
                        }
                      }}
                      role={item.rawEvent ? 'button' : undefined}
                      tabIndex={item.rawEvent ? 0 : undefined}
                      onKeyDown={e => {
                        if (item.rawEvent && (e.key === 'Enter' || e.key === ' ')) {
                          setSelectedEvent(item.rawEvent);
                          setIsDetailModalOpen(true);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: `4px solid ${item.color}`,
                        borderRadius: 'var(--radius-md)',
                        cursor: item.rawEvent ? 'pointer' : 'default',
                        transition: 'background var(--transition-fast)',
                      }}
                    >
                      <div
                        style={{
                          minWidth: '90px',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {formatTimeOnly(item.startAt)} – {formatTimeOnly(item.endAt)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.title}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor:
                            item.type === 'WORK_BLOCK'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(59, 130, 246, 0.15)',
                          color: item.type === 'WORK_BLOCK' ? '#10b981' : '#60a5fa',
                        }}
                      >
                        {item.type === 'WORK_BLOCK' ? 'Work Block' : 'Event'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ========================================================= */}
          {/* UNSCHEDULED IMPORTANT WORK SECTION (Section 16) */}
          {/* ========================================================= */}
          <section
            aria-labelledby="unscheduled-heading"
            data-testid="unscheduled-section"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} color="var(--accent-warning)" />
                  <h3
                    id="unscheduled-heading"
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    Unscheduled Important Work ({unscheduledTasks.length})
                  </h3>
                </div>
                <p
                  style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}
                >
                  Active high-priority (P0/P1/P2) or due tasks that do not yet have scheduled work
                  blocks.
                </p>
              </div>
            </div>

            {unscheduledTasks.length === 0 ? (
              <p
                data-testid="no-unscheduled"
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  margin: 0,
                  padding: '12px 0',
                }}
              >
                All high-priority tasks are scheduled or complete.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {unscheduledTasks.map(task => {
                  const pBadge = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.P3;
                  return (
                    <div
                      key={task.id}
                      data-testid={`unscheduled-card-${task.id}`}
                      style={{
                        padding: '14px 16px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '6px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.725rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 'var(--radius-full)',
                              backgroundColor: pBadge.bg,
                              color: pBadge.color,
                            }}
                          >
                            {pBadge.label}
                          </span>
                          {task.dueAt && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Due {new Date(task.dueAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <h4
                          style={{
                            fontSize: '0.925rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            margin: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {task.title}
                        </h4>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Clock}
                          onClick={() => {
                            setSchedulingTask(task);
                            setIsScheduleModalOpen(true);
                          }}
                          aria-label={`Schedule block for ${task.title}`}
                        >
                          Schedule Block
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Quick Task Modal */}
      <CreateTaskModal
        isOpen={isQuickTaskOpen}
        onClose={() => setIsQuickTaskOpen(false)}
        onCreateTask={handleCreateQuickTask}
      />

      {/* Create Event Modal */}
      <CreateEventModal
        isOpen={isCreateEventOpen}
        onClose={() => setIsCreateEventOpen(false)}
        onSubmit={handleCreateEvent}
        calendars={calendars}
      />

      {/* Event Detail Modal */}
      <EventDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
      />

      {/* Schedule Work Block Modal */}
      <ScheduleWorkBlockModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setSchedulingTask(null);
        }}
        task={schedulingTask}
        onSubmit={handleScheduleWorkBlock}
      />
    </div>
  );
}

function TaskRow({ task, onToggle, forceOverdue = false, completed = false }) {
  const pBadge = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.P3;
  const isOverdue =
    forceOverdue ||
    ((task.isOverdue || (task.dueAt && new Date(task.dueAt) < new Date())) && !completed);

  return (
    <li
      data-testid={`task-row-${task.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        opacity: completed ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          onClick={onToggle}
          aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
          style={{
            color: completed ? 'var(--accent-success)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px',
            flexShrink: 0,
          }}
        >
          {completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>

        <span
          style={{
            fontSize: '0.875rem',
            color: completed ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: completed ? 'line-through' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 500,
          }}
        >
          {task.title}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
          marginLeft: '8px',
        }}
      >
        {task.priority && !completed && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: pBadge.bg,
              color: pBadge.color,
            }}
          >
            {pBadge.label}
          </span>
        )}
        {isOverdue && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: 'var(--accent-danger)',
            }}
          >
            Overdue
          </span>
        )}
      </div>
    </li>
  );
}
