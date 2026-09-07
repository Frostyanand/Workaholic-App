import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Kanban,
  CheckSquare,
  Users,
  AlertCircle,
} from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { CreateProjectModal } from '../components/projects/CreateProjectModal.jsx';
import { CreateBoardModal } from '../components/boards/CreateBoardModal.jsx';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal.jsx';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer.jsx';
import { TaskItem } from '../components/tasks/TaskItem.jsx';
import * as projectsApi from '../services/projects.api.js';
import * as boardsApi from '../services/boards.api.js';
import * as tasksApi from '../services/tasks.api.js';

export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [boards, setBoards] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' | 'boards' | 'members'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadProjectData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [projData, boardsData, tasksData] = await Promise.all([
        projectsApi.fetchProjectById(id),
        boardsApi.fetchBoards(null, { projectId: id }),
        tasksApi.fetchTasks(null, { projectId: id }),
      ]);
      setProject(projData);
      setBoards(boardsData);
      setTasks(tasksData);
    } catch (err) {
      setError(err.message || 'Failed to load project details');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  async function handleUpdateProject(updates) {
    const updated = await projectsApi.updateProject(id, null, updates);
    setProject(prev => ({ ...prev, ...updated }));
  }

  async function handleDeleteProject() {
    if (
      !window.confirm(
        `Delete project "${project.name}"? Tasks associated with this project will be preserved.`,
      )
    )
      return;
    try {
      await projectsApi.deleteProject(id);
      navigate('/projects');
    } catch (err) {
      setError(`Failed to delete project: ${err.message}`);
    }
  }

  async function handleCreateBoard(boardData) {
    const created = await boardsApi.createBoard(null, { ...boardData, projectId: id });
    setBoards(prev => [created, ...prev]);
    navigate(`/boards/${created.id}`);
  }

  async function handleCreateTask(taskData) {
    const created = await tasksApi.createTask(null, { ...taskData, projectId: id });
    setTasks(prev => [created, ...prev]);
  }

  async function handleToggleTaskComplete(task) {
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

  if (error || !project) {
    return (
      <main style={{ padding: '40px', color: 'var(--text-primary)' }}>
        <button
          type="button"
          onClick={() => navigate('/projects')}
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
          <ArrowLeft size={16} /> Back to Projects
        </button>
        <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} />
          <span>{error || 'Project not found'}</span>
        </div>
      </main>
    );
  }

  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;
  const percentage = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <main
      id="main-content"
      style={{
        flex: 1,
        padding: '32px 40px',
        overflowY: 'auto',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Back Button */}
      <button
        type="button"
        onClick={() => navigate('/projects')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
          cursor: 'pointer',
          padding: '4px 0',
          marginBottom: '20px',
        }}
      >
        <ArrowLeft size={16} /> Back to Projects
      </button>

      {/* Project Header */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}
            >
              <h1
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                {project.name}
              </h1>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--accent-primary)',
                }}
              >
                {project.status}
              </span>
            </div>

            {project.description && (
              <p
                style={{
                  fontSize: '0.9375rem',
                  color: 'var(--text-secondary)',
                  margin: '0 0 16px 0',
                  lineHeight: 1.6,
                  maxWidth: '720px',
                }}
              >
                {project.description}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
              }}
            >
              {project.dueAt && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} /> Due:{' '}
                  {new Intl.DateTimeFormat('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }).format(new Date(project.dueAt))}
                </span>
              )}
              {project.ownerDisplayName && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} /> Owner: {project.ownerDisplayName}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Edit2 size={14} /> Edit Project
            </button>
            <button
              type="button"
              onClick={handleDeleteProject}
              aria-label="Delete project"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent-danger, #ef4444)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              marginBottom: '8px',
            }}
          >
            <span>
              Overall Progress ({completedCount} of {tasks.length} tasks completed)
            </span>
            <span>{percentage}%</span>
          </div>
          <div
            style={{
              height: '8px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${percentage}%`,
                backgroundColor: percentage === 100 ? '#22c55e' : 'var(--accent-primary)',
                borderRadius: '999px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '24px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: activeTab === 'tasks' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom:
              activeTab === 'tasks' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <CheckSquare size={16} /> Tasks ({tasks.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('boards')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: activeTab === 'boards' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom:
              activeTab === 'boards' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <Kanban size={16} /> Boards ({boards.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('members')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: activeTab === 'members' ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom:
              activeTab === 'members' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <Users size={16} /> Members ({project.members?.length || 0})
        </button>
      </div>

      {/* Tab Content: Tasks */}
      {activeTab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setIsCreateTaskModalOpen(true)}
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
              <Plus size={16} /> Add Task to Project
            </button>
          </div>

          {tasks.length === 0 ? (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
              }}
            >
              No tasks assigned to this project yet.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {tasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggleComplete={handleToggleTaskComplete}
                  onSelectTask={t => setSelectedTask(t)}
                  onDeleteTask={handleDeleteTask}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tab Content: Boards */}
      {activeTab === 'boards' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setIsCreateBoardModalOpen(true)}
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
              <Plus size={16} /> Create Board for Project
            </button>
          </div>

          {boards.length === 0 ? (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
              }}
            >
              No boards created for this project yet.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
              }}
            >
              {boards.map(b => (
                <div
                  key={b.id}
                  onClick={() => navigate(`/boards/${b.id}`)}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '20px',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                    }}
                  >
                    <Kanban size={18} style={{ color: 'var(--accent-primary)' }} />
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        margin: 0,
                      }}
                    >
                      {b.name}
                    </h3>
                  </div>
                  {b.description && (
                    <p
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--text-muted)',
                        margin: '0 0 12px 0',
                      }}
                    >
                      {b.description}
                    </p>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {b.columnCount ?? 3} columns · {b.taskCount ?? 0} tasks
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Members */}
      {activeTab === 'members' && (
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
          }}
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {(project.members || []).map(m => (
              <li
                key={m.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div
                    style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}
                  >
                    {m.displayName || m.email}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email}</div>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modals */}
      <CreateProjectModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onCreateProject={handleUpdateProject}
        initialData={project}
      />

      <CreateBoardModal
        isOpen={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
        onCreateBoard={handleCreateBoard}
        projects={[project]}
        initialProjectId={project.id}
      />

      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        onCreateTask={handleCreateTask}
        initialProjectId={project.id}
      />

      <TaskDetailDrawer
        taskId={selectedTask?.id}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={updated => {
          setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
        }}
        onTaskDeleted={deletedId => {
          setTasks(prev => prev.filter(t => t.id !== deletedId));
          setSelectedTask(null);
        }}
      />
    </main>
  );
}
