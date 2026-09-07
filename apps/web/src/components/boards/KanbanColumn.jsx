import React, { useState } from 'react';
import { Plus, ArrowLeft, ArrowRight, Trash2, Edit2 } from 'lucide-react';
import { KanbanCard } from './KanbanCard.jsx';

export function KanbanColumn({
  column,
  columns = [],
  tasks = [],
  columnIndex,
  totalColumns,
  onSelectTask,
  onMoveTask,
  onToggleComplete,
  onDeleteTask,
  onMoveColumnLeft,
  onMoveColumnRight,
  onEditColumn,
  onDeleteColumn,
  onQuickAddTask,
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  }

  function handleDragLeave(e) {
    // Only turn off if leaving the column itself
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      onMoveTask(taskId, column.id);
    }
  }

  return (
    <div
      data-column-id={column.id}
      style={{
        width: '300px',
        minWidth: '300px',
        maxWidth: '300px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary)',
        border: isDragOver ? '2px dashed var(--accent-primary)' : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        maxHeight: 'calc(100vh - 180px)',
        overflow: 'hidden',
        transition: 'border var(--transition-fast)',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {column.name}
          </h3>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
            }}
          >
            {tasks.length}
          </span>
        </div>

        {/* Column Actions: Reordering, Edit, Delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {columnIndex > 0 && onMoveColumnLeft && (
            <button
              type="button"
              onClick={() => onMoveColumnLeft(column.id)}
              aria-label={`Move column "${column.name}" left`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <ArrowLeft size={14} />
            </button>
          )}

          {columnIndex < totalColumns - 1 && onMoveColumnRight && (
            <button
              type="button"
              onClick={() => onMoveColumnRight(column.id)}
              aria-label={`Move column "${column.name}" right`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <ArrowRight size={14} />
            </button>
          )}

          {onEditColumn && (
            <button
              type="button"
              onClick={() => onEditColumn(column)}
              aria-label={`Edit column "${column.name}"`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Edit2 size={13} />
            </button>
          )}

          {onDeleteColumn && totalColumns > 1 && (
            <button
              type="button"
              onClick={() => onDeleteColumn(column.id)}
              aria-label={`Delete column "${column.name}"`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Cards Container */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          minHeight: '120px',
        }}
      >
        {tasks.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.8125rem',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              margin: '8px 0',
            }}
          >
            No tasks in this column
          </div>
        ) : (
          tasks.map(task => (
            <KanbanCard
              key={task.id}
              task={task}
              columns={columns}
              currentColumnId={column.id}
              onSelectTask={onSelectTask}
              onMoveToColumn={onMoveTask}
              onToggleComplete={onToggleComplete}
              onDeleteTask={onDeleteTask}
            />
          ))
        )}
      </div>

      {/* Column Footer: Quick Add Task */}
      {onQuickAddTask && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => onQuickAddTask(column.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              backgroundColor: 'transparent',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Plus size={14} />
            Add Task
          </button>
        </div>
      )}
    </div>
  );
}
