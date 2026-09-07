import React, { useState } from 'react';
import {
  Clock,
  AlertCircle,
  GitBranch,
  ArrowRightLeft,
  Trash2,
  CheckCircle2,
  Circle,
} from 'lucide-react';

const PRIORITY_THEMES = {
  P0: { label: 'P0 Critical', bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  P1: { label: 'P1 Urgent', bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316' },
  P2: { label: 'P2 High', bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
  P3: { label: 'P3 Medium', bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8' },
  P4: { label: 'P4 Low', bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8' },
};

export function KanbanCard({
  task,
  columns = [],
  currentColumnId,
  onSelectTask,
  onMoveToColumn,
  onToggleComplete,
  onDeleteTask,
}) {
  const [isMoving, setIsMoving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isCompleted = task.status === 'COMPLETED';
  const priorityTheme = PRIORITY_THEMES[task.priority] || PRIORITY_THEMES.P3;
  const isOverdue = (task.isOverdue || task.is_overdue) && !isCompleted;
  const subtaskCount = task.subtaskCount ?? task.subtasks_count ?? 0;
  const dueAt = task.dueAt || task.due_at;

  const formattedDueDate = dueAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(new Date(dueAt))
    : null;

  function handleDragStart(e) {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setIsDragging(false);
  }

  const otherColumns = columns.filter(c => c.id !== currentColumnId);

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        marginBottom: '10px',
        boxShadow: isDragging ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        transition: 'all var(--transition-fast)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1 }}>
          <button
            type="button"
            role="checkbox"
            aria-checked={isCompleted}
            aria-label={
              isCompleted ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`
            }
            onClick={e => {
              e.stopPropagation();
              onToggleComplete?.(task);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: isCompleted ? 'var(--accent-primary)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              marginTop: '2px',
            }}
          >
            {isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
          </button>

          <span
            onClick={() => onSelectTask?.(task)}
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecoration: isCompleted ? 'line-through' : 'none',
              cursor: 'pointer',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {task.title}
          </span>
        </div>

        {onDeleteTask && (
          <button
            type="button"
            aria-label={`Delete ${task.title}`}
            onClick={e => {
              e.stopPropagation();
              onDeleteTask(task);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: 'var(--radius-sm)',
              opacity: 0.6,
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          marginTop: '10px',
        }}
      >
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: priorityTheme.bg,
            color: priorityTheme.text,
          }}
        >
          {priorityTheme.label}
        </span>

        {formattedDueDate && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              color: isOverdue ? '#ef4444' : 'var(--text-muted)',
              fontWeight: isOverdue ? 600 : 400,
            }}
          >
            {isOverdue ? <AlertCircle size={12} /> : <Clock size={12} />}
            {formattedDueDate}
          </span>
        )}

        {subtaskCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            <GitBranch size={12} />
            {subtaskCount}
          </span>
        )}
      </div>

      {/* Accessible Non-Drag Column Movement Control (UX-T09) */}
      {otherColumns.length > 0 && (
        <div
          style={{
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px dashed var(--border-subtle)',
          }}
        >
          {isMoving ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                htmlFor={`move-task-${task.id}`}
                style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 500 }}
              >
                Move to column:
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  id={`move-task-${task.id}`}
                  defaultValue=""
                  onChange={e => {
                    if (e.target.value) {
                      onMoveToColumn(task.id, e.target.value);
                      setIsMoving(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="" disabled>
                    Select destination...
                  </option>
                  {otherColumns.map(col => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsMoving(false)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsMoving(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
              aria-label={`Move task "${task.title}" to another column`}
            >
              <ArrowRightLeft size={10} />
              Move column
            </button>
          )}
        </div>
      )}
    </div>
  );
}
