import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FolderGit2, AlertCircle, LayoutDashboard } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { KanbanBoard } from '../components/boards/KanbanBoard.jsx';
import { CreateColumnModal } from '../components/boards/CreateColumnModal.jsx';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal.jsx';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer.jsx';
import * as boardsApi from '../services/boards.api.js';
import * as tasksApi from '../services/tasks.api.js';

export function BoardDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [targetColumnId, setTargetColumnId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadBoardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [boardData, tasksData] = await Promise.all([
        boardsApi.fetchBoardById(id),
        boardsApi.fetchBoardTasks(id),
      ]);
      setBoard(boardData);
      setColumns(boardData.columns || []);
      setTasks(tasksData);
    } catch (err) {
      setError(err.message || 'Failed to load board');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

  // Task movement handler (both drag/drop and accessible non-drag)
  async function handleMoveTask(taskId, destinationColumnId) {
    const destCol = columns.find(c => c.id === destinationColumnId);
    if (!destCol) return;

    // Optimistic UI update
    const previousTasks = [...tasks];
    setTasks(prev =>
      prev.map(t => {
        if (t.id === taskId) {
          const newStatus = destCol.statusMapping || t.status;
          return {
            ...t,
            boardColumnId: destinationColumnId,
            status: newStatus,
            completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null,
          };
        }
        return t;
      }),
    );

    try {
      const updated = await boardsApi.moveBoardTask(
        id,
        taskId,
        null,
        destinationColumnId,
        destCol.statusMapping || undefined,
      );
      setTasks(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)));
    } catch (err) {
      // Revert optimistic update
      setTasks(previousTasks);
      setError(`Failed to move task: ${err.message}`);
    }
  }

  async function handleToggleComplete(task) {
    const newStatus = task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    const updated = await tasksApi.updateTask(task.id, null, {
      status: newStatus,
      version: task.version,
    });
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  }

  async function handleDeleteTask(task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    await tasksApi.deleteTask(task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));
  }

  // Column operations
  async function handleSaveColumn(columnData) {
    if (editingColumn) {
      const updated = await boardsApi.updateColumn(id, editingColumn.id, null, columnData);
      setColumns(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    } else {
      const created = await boardsApi.createColumn(id, null, columnData);
      setColumns(prev => [...prev, created]);
    }
  }

  async function handleDeleteColumn(columnId) {
    if (!window.confirm('Delete this column? Tasks in this column will be unassigned.')) return;
    try {
      await boardsApi.deleteColumn(id, columnId);
      setColumns(prev => prev.filter(c => c.id !== columnId));
    } catch (err) {
      setError(`Failed to delete column: ${err.message}`);
    }
  }

  async function handleReorderColumns(newColumnIds) {
    // Optimistic update
    const prevCols = [...columns];
    const reordered = newColumnIds.map((colId, pos) => {
      const found = columns.find(c => c.id === colId);
      return { ...found, position: pos };
    });
    setColumns(reordered);

    try {
      const confirmed = await boardsApi.reorderColumns(id, null, newColumnIds);
      setColumns(confirmed);
    } catch (err) {
      setColumns(prevCols);
      setError(`Failed to reorder columns: ${err.message}`);
    }
  }

  async function handleCreateTask(taskData) {
    const created = await tasksApi.createTask(null, {
      ...taskData,
      boardId: id,
      boardColumnId: targetColumnId || columns[0]?.id || null,
      projectId: board.projectId || null,
    });
    setTasks(prev => [created, ...prev]);
  }

  function handleQuickAddTask(columnId) {
    setTargetColumnId(columnId);
    setIsCreateTaskModalOpen(true);
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          width: '100%',
        }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !board) {
    return (
      <main style={{ padding: '40px', color: 'var(--text-primary)' }}>
        <button
          type="button"
          onClick={() => navigate('/boards')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            marginBottom: '20px',
          }}
        >
          <ArrowLeft size={16} /> Back to Boards
        </button>
        <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      style={{
        flex: 1,
        padding: '24px 32px',
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary)',
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      {/* Board Header & Controls */}
      <div style={{ marginBottom: '20px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => navigate('/boards')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            padding: '2px 0',
            marginBottom: '10px',
          }}
        >
          <ArrowLeft size={14} /> Back to Boards
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              {board?.name}
            </h1>

            {board?.projectName && (
              <span
                onClick={() => navigate(`/projects/${board.projectId}`)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--accent-primary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <FolderGit2 size={12} /> {board.projectName}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                setTargetColumnId(columns[0]?.id || null);
                setIsCreateTaskModalOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} /> New Task
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert if any */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#ef4444',
            fontSize: '0.8125rem',
            marginBottom: '16px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Kanban Board Container (TM-BOARD-007: empty board handling) */}
      {columns.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '40px',
            textAlign: 'center',
          }}
        >
          <LayoutDashboard size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 8px 0',
            }}
          >
            Empty Board
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              maxWidth: '360px',
              margin: '0 0 20px 0',
            }}
          >
            This board has no columns configured yet. Add your first column to start organizing
            tasks.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingColumn(null);
              setIsColumnModalOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Add Column
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <KanbanBoard
            board={board}
            columns={columns}
            tasks={tasks}
            onSelectTask={task => setSelectedTask(task)}
            onMoveTask={handleMoveTask}
            onToggleComplete={handleToggleComplete}
            onDeleteTask={handleDeleteTask}
            onReorderColumns={handleReorderColumns}
            onAddColumnClick={() => {
              setEditingColumn(null);
              setIsColumnModalOpen(true);
            }}
            onEditColumn={col => {
              setEditingColumn(col);
              setIsColumnModalOpen(true);
            }}
            onDeleteColumn={handleDeleteColumn}
            onQuickAddTask={handleQuickAddTask}
          />
        </div>
      )}

      {/* Column Modal */}
      <CreateColumnModal
        isOpen={isColumnModalOpen}
        onClose={() => {
          setIsColumnModalOpen(false);
          setEditingColumn(null);
        }}
        onSaveColumn={handleSaveColumn}
        initialData={editingColumn}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        onCreateTask={handleCreateTask}
        initialProjectId={board?.projectId || null}
      />

      {/* Task Details Drawer */}
      <TaskDetailDrawer
        taskId={selectedTask?.id}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={updated => {
          setTasks(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)));
        }}
        onTaskDeleted={deletedId => {
          setTasks(prev => prev.filter(t => t.id !== deletedId));
          setSelectedTask(null);
        }}
      />
    </main>
  );
}
