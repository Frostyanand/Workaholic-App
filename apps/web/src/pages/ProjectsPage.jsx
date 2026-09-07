import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Plus,
  Search,
  Clock,
  Trash2,
  Edit2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { CreateProjectModal } from '../components/projects/CreateProjectModal.jsx';
import * as projectsApi from '../services/projects.api.js';

const STATUS_TABS = [
  { label: 'All Projects', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On Hold', value: 'ON_HOLD' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Archived', value: 'ARCHIVED' },
];

const STATUS_BADGES = {
  ACTIVE: { label: 'Active', bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  ON_HOLD: { label: 'On Hold', bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
  COMPLETED: { label: 'Completed', bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8' },
  ARCHIVED: { label: 'Archived', bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8' },
  CANCELLED: { label: 'Cancelled', bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await projectsApi.fetchProjects(null, {
        status: activeTab === 'ALL' ? undefined : activeTab,
        search: searchQuery.trim() || undefined,
      });
      setProjects(data);
    } catch (err) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function handleCreateOrUpdateProject(projectData) {
    if (editingProject) {
      const updated = await projectsApi.updateProject(editingProject.id, null, projectData);
      setProjects(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)));
    } else {
      const created = await projectsApi.createProject(null, projectData);
      setProjects(prev => [created, ...prev]);
    }
  }

  async function handleDeleteProject(id, e) {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    try {
      await projectsApi.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete project');
    }
  }

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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              margin: '0 0 6px 0',
            }}
          >
            Projects
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
            Higher-level bodies of work, deliverables, and organizational contexts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingProject(null);
            setIsCreateModalOpen(true);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all var(--transition-fast)',
          }}
        >
          <Plus size={18} />
          New Project
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Status Tabs */}
        <div
          role="tablist"
          aria-label="Filter projects by status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'var(--bg-secondary)',
            padding: '4px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.8125rem',
                fontWeight: activeTab === tab.value ? 600 : 500,
                color: activeTab === tab.value ? 'var(--text-primary)' : 'var(--text-muted)',
                backgroundColor: activeTab === tab.value ? 'var(--bg-surface)' : 'transparent',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '240px' }}>
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
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#ef4444',
            fontSize: '0.875rem',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadProjects}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
          <LoadingSpinner />
        </div>
      ) : projects.length === 0 ? (
        <div
          style={{
            padding: '64px 20px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            marginTop: '16px',
          }}
        >
          <FolderGit2 size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 8px 0',
            }}
          >
            No projects found
          </h3>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              maxWidth: '400px',
              margin: '0 auto 20px auto',
            }}
          >
            {searchQuery
              ? `No projects matched "${searchQuery}".`
              : 'Create projects to group tasks, track milestones, and organize workflows.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingProject(null);
              setIsCreateModalOpen(true);
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
            <Plus size={16} />
            Create Project
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {projects.map(project => {
            const badge = STATUS_BADGES[project.status] || STATUS_BADGES.ACTIVE;
            const taskCount = project.taskCount ?? 0;
            const completedCount = project.completedTaskCount ?? 0;
            const percentage = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;

            const dueFormatted = project.dueAt
              ? new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }).format(new Date(project.dueAt))
              : null;

            return (
              <div
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  boxShadow: 'var(--shadow-sm)',
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
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: badge.bg,
                        color: badge.text,
                      }}
                    >
                      {badge.label}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        aria-label={`Edit project "${project.name}"`}
                        onClick={e => {
                          e.stopPropagation();
                          setEditingProject(project);
                          setIsCreateModalOpen(true);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete project "${project.name}"`}
                        onClick={e => handleDeleteProject(project.id, e)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <h3
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: '0 0 8px 0',
                    }}
                  >
                    {project.name}
                  </h3>

                  {project.description && (
                    <p
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--text-secondary)',
                        margin: '0 0 16px 0',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {project.description}
                    </p>
                  )}
                </div>

                <div>
                  {/* Task Progress Bar */}
                  <div style={{ marginBottom: '16px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginBottom: '6px',
                      }}
                    >
                      <span>
                        Tasks: {completedCount} / {taskCount}
                      </span>
                      <span>{percentage}%</span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        width: '100%',
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

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      borderTop: '1px solid var(--border-subtle)',
                      paddingTop: '12px',
                    }}
                  >
                    {dueFormatted ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} />
                        Due {dueFormatted}
                      </span>
                    ) : (
                      <span>No due date</span>
                    )}

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--accent-primary)',
                        fontWeight: 500,
                      }}
                    >
                      View details <ExternalLink size={12} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingProject(null);
        }}
        onCreateProject={handleCreateOrUpdateProject}
        initialData={editingProject}
      />
    </main>
  );
}
