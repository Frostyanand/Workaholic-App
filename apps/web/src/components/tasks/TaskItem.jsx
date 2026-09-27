import React from 'react';
import { CheckCircle2, Circle, AlertCircle, Clock, GitBranch, Trash2, Edit3 } from 'lucide-react';

const PRIORITY_THEMES = {
  P0: {
    label: 'P0 Critical',
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#ef4444',
    border: 'rgba(239, 68, 68, 0.3)',
  },
  P1: {
    label: 'P1 Urgent',
    bg: 'rgba(249, 115, 22, 0.15)',
    text: '#f97316',
    border: 'rgba(249, 115, 22, 0.3)',
  },
  P2: {
    label: 'P2 High',
    bg: 'rgba(234, 179, 8, 0.15)',
    text: '#eab308',
    border: 'rgba(234, 179, 8, 0.3)',
  },
  P3: {
    label: 'P3 Medium',
    bg: 'rgba(99, 102, 241, 0.15)',
    text: '#818cf8',
    border: 'rgba(99, 102, 241, 0.3)',
  },
  P4: {
    label: 'P4 Low',
    bg: 'rgba(100, 116, 139, 0.15)',
    text: '#94a3b8',
    border: 'rgba(100, 116, 139, 0.3)',
  },
};

export function TaskItem({ task, onToggleComplete, onSelectTask, onDeleteTask }) {
  const isCompleted = task.status === 'COMPLETED';
  const priorityTheme = PRIORITY_THEMES[task.priority] || PRIORITY_THEMES.P3;
  const isOverdue = (task.isOverdue || task.is_overdue) && !isCompleted;
  const subtaskCount = task.subtaskCount ?? task.subtasks_count ?? 0;
  const dueAt = task.dueAt || task.due_at;
  const estimatedDuration = task.estimatedDuration || task.estimated_duration;

  const formattedDueDate = dueAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(dueAt))
    : null;

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '10px',
        transition: 'all var(--transition-fast)',
        opacity: isCompleted ? 0.7 : 1,
      }}
      className="task-item-card"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
        {/* Toggle Complete Button */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isCompleted ? 'true' : 'false'}
          onClick={() => onToggleComplete(task)}
          aria-label={isCompleted ? `Mark ${task.title} as incomplete` : `Complete ${task.title}`}
          style={{
            color: isCompleted ? 'var(--accent-success)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px',
            borderRadius: '50%',
            transition: 'transform var(--transition-fast)',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleComplete(task);
            }
          }}
        >
          {isCompleted ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>

        {/* Task Title & Meta Info */}
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => onSelectTask && onSelectTask(task)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              className="task-item-title"
              style={{
                fontSize: '0.95rem',
                fontWeight: 500,
                color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                textDecoration: isCompleted ? 'line-through' : 'none',
                wordBreak: 'break-word',
              }}
            >
              {task.title}
            </span>

            {/* Priority Badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: priorityTheme.bg,
                color: priorityTheme.text,
                border: `1px solid ${priorityTheme.border}`,
              }}
            >
              {priorityTheme.label}
            </span>

            {/* Label Badges (TM-TASK-007) */}
            {task.labels &&
              task.labels.map(label => (
                <span
                  key={label.id}
                  className="task-label-badge"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: (label.color || '#4F46E5') + '26',
                    color: label.color || '#4F46E5',
                    border: `1px solid ${label.color || '#4F46E5'}4D`,
                  }}
                >
                  {label.name}
                </span>
              ))}

            {/* Overdue Badge */}
            {isOverdue && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  color: 'var(--accent-danger)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                }}
              >
                <AlertCircle size={12} />
                <span>Overdue</span>
              </span>
            )}

            {/* Recurring Badge */}
            {(task.recurrenceRuleId || task.recurrence_rule_id || task.recurrenceRule) && (
              <span
                className="task-recurrence-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                }}
              >
                <span>🔄</span>
                <span>Recurring</span>
              </span>
            )}
          </div>

          {/* Subtitle Details: Due date, estimated duration, subtask count */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginTop: '4px',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              flexWrap: 'wrap',
            }}
          >
            {formattedDueDate && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} />
                <span>{formattedDueDate}</span>
              </span>
            )}

            {estimatedDuration && <span>{estimatedDuration} min</span>}

            {subtaskCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <GitBranch size={12} />
                <span>
                  {subtaskCount} subtask{subtaskCount > 1 ? 's' : ''}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
        <button
          type="button"
          onClick={() => onSelectTask(task)}
          aria-label={`Edit ${task.title}`}
          style={{
            color: 'var(--text-muted)',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Edit Task Details"
        >
          <Edit3 size={16} />
        </button>
        <button
          type="button"
          onClick={() => onDeleteTask(task)}
          aria-label={`Delete ${task.title}`}
          style={{
            color: 'var(--text-muted)',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Delete Task"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}
