import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FolderGit2, LayoutDashboard } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import { KanbanBoard } from '../components/boards/KanbanBoard.jsx';
import { CreateColumnModal } from '../components/boards/CreateColumnModal.jsx';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal.jsx';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer.jsx';
import * as boardsApi from '../services/boards.api.js';
import * as tasksApi from '../services/tasks.api.js';

export function BoardDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

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

  // Confirm dialogs state
  const [columnToDelete, setColumnToDelete] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  // Listen to global quick task creation
  useEffect(() => {
    function handleGlobalTaskCreated(e) {
      const created = e.detail;
      if (
        created &&
        (created.boardId === id || (!created.boardId && created.projectId === board?.projectId))
      ) {
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
  }, [id, board]);

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
      toast.error(`Failed to move task: ${err.message}`);
      setError(`Failed to move task: ${err.message}`);
    }
  }

  async function handleToggleComplete(task) {
    const newStatus = task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    try {
      const updated = await tasksApi.updateTask(task.id, null, {
        status: newStatus,
        version: task.version,
      });
      setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      toast.info(newStatus === 'COMPLETED' ? 'Task completed' : 'Task reopened');
    } catch (err) {
      toast.error(`Failed to update task: ${err.message}`);
    }
  }

  async function handleConfirmDeleteTask() {
    if (!taskToDelete) return;
    try {
      setActionLoading(true);
      await tasksApi.deleteTask(taskToDelete.id);
      setTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
      toast.success(`Task "${taskToDelete.title}" deleted`);
    } catch (err) {
      toast.error(`Failed to delete task: ${err.message}`);
    } finally {
      setActionLoading(false);
      setTaskToDelete(null);
    }
  }

  // Column operations
  async function handleSaveColumn(columnData) {
    try {
      if (editingColumn) {
        const updated = await boardsApi.updateColumn(id, editingColumn.id, null, columnData);
        setColumns(prev => prev.map(c => (c.id === updated.id ? updated : c)));
        toast.success(`Column "${updated.name}" updated`);
      } else {
        const created = await boardsApi.createColumn(id, null, columnData);
        setColumns(prev => [...prev, created]);
        toast.success(`Column "${created.name}" created`);
      }
    } catch (err) {
      toast.error(`Failed to save column: ${err.message}`);
      throw err;
    }
  }

  async function handleConfirmDeleteColumn() {
    if (!columnToDelete) return;
    try {
      setActionLoading(true);
      await boardsApi.deleteColumn(id, columnToDelete);
      setColumns(prev => prev.filter(c => c.id !== columnToDelete));
      toast.success('Column deleted');
    } catch (err) {
      toast.error(`Failed to delete column: ${err.message}`);
      setError(`Failed to delete column: ${err.message}`);
    } finally {
      setActionLoading(false);
      setColumnToDelete(null);
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
        <ErrorBanner message={error} />
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
            <Button
              type="button"
              variant="primary"
              icon={Plus}
              onClick={() => {
                setTargetColumnId(columns[0]?.id || null);
                setIsCreateTaskModalOpen(true);
              }}
            >
              New Task
            </Button>
          </div>
        </div>
      </div>

      {/* Error Alert if any */}
      {error && (
        <div style={{ marginBottom: '16px', flexShrink: 0 }}>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Kanban Board Container (TM-BOARD-007: empty board handling) */}
      {columns.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Empty Board"
          description="This board has no columns configured yet. Add your first column to start organizing tasks."
          actionLabel="Add Column"
          onAction={() => {
            setEditingColumn(null);
            setIsColumnModalOpen(true);
          }}
        />
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <KanbanBoard
            board={board}
            columns={columns}
            tasks={tasks}
            onSelectTask={task => setSelectedTask(task)}
            onMoveTask={handleMoveTask}
            onToggleComplete={handleToggleComplete}
            onDeleteTask={task => setTaskToDelete(task)}
            onReorderColumns={handleReorderColumns}
            onAddColumnClick={() => {
              setEditingColumn(null);
              setIsColumnModalOpen(true);
            }}
            onEditColumn={col => {
              setEditingColumn(col);
              setIsColumnModalOpen(true);
            }}
            onDeleteColumn={colId => setColumnToDelete(colId)}
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
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={updated => {
          setTasks(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)));
        }}
      />

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={Boolean(columnToDelete)}
        onClose={() => setColumnToDelete(null)}
        onConfirm={handleConfirmDeleteColumn}
        title="Delete this column?"
        message="Tasks in this column will become unassigned from the board column. You can reassign them anytime."
        confirmLabel="Delete Column"
        variant="danger"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={Boolean(taskToDelete)}
        onClose={() => setTaskToDelete(null)}
        onConfirm={handleConfirmDeleteTask}
        title={`Delete task "${taskToDelete?.title}"?`}
        message="This task will be moved to trash. You can restore it later if needed."
        confirmLabel="Delete Task"
        variant="danger"
        loading={actionLoading}
      />
    </main>
  );
}
