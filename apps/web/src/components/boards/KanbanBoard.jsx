import React from 'react';
import { Plus } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn.jsx';

export function KanbanBoard({
  _board,
  columns = [],
  tasks = [],
  onSelectTask,
  onMoveTask,
  onToggleComplete,
  onDeleteTask,
  onReorderColumns,
  onAddColumnClick,
  onEditColumn,
  onDeleteColumn,
  onQuickAddTask,
}) {
  function handleMoveColumnLeft(columnId) {
    const idx = columns.findIndex(c => c.id === columnId);
    if (idx <= 0) return;
    const newCols = [...columns];
    const temp = newCols[idx - 1];
    newCols[idx - 1] = newCols[idx];
    newCols[idx] = temp;
    onReorderColumns(newCols.map(c => c.id));
  }

  function handleMoveColumnRight(columnId) {
    const idx = columns.findIndex(c => c.id === columnId);
    if (idx < 0 || idx >= columns.length - 1) return;
    const newCols = [...columns];
    const temp = newCols[idx + 1];
    newCols[idx + 1] = newCols[idx];
    newCols[idx] = temp;
    onReorderColumns(newCols.map(c => c.id));
  }

  // Group tasks by column
  // If task has no boardColumnId, place in first column or ignore
  const tasksByColumn = new Map();
  columns.forEach(col => tasksByColumn.set(col.id, []));

  tasks.forEach(task => {
    const colId = task.boardColumnId || task.board_column_id;
    if (colId && tasksByColumn.has(colId)) {
      tasksByColumn.get(colId).push(task);
    } else if (columns.length > 0) {
      // Fallback: place in first column
      tasksByColumn.get(columns[0].id).push(task);
    }
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        overflowX: 'auto',
        paddingBottom: '20px',
        minHeight: '400px',
      }}
    >
      {columns.map((col, idx) => (
        <KanbanColumn
          key={col.id}
          column={col}
          columns={columns}
          tasks={tasksByColumn.get(col.id) || []}
          columnIndex={idx}
          totalColumns={columns.length}
          onSelectTask={onSelectTask}
          onMoveTask={onMoveTask}
          onToggleComplete={onToggleComplete}
          onDeleteTask={onDeleteTask}
          onMoveColumnLeft={handleMoveColumnLeft}
          onMoveColumnRight={handleMoveColumnRight}
          onEditColumn={onEditColumn}
          onDeleteColumn={onDeleteColumn}
          onQuickAddTask={onQuickAddTask}
        />
      ))}

      {/* Add Column Button */}
      <button
        type="button"
        onClick={onAddColumnClick}
        style={{
          width: '260px',
          minWidth: '260px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          backgroundColor: 'transparent',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        <Plus size={16} />
        Add Column
      </button>
    </div>
  );
}
