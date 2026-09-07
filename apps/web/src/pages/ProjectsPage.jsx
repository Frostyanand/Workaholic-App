import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderGit2, Plus, Search, Clock, Trash2, Edit2, ExternalLink } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { PageHeader } from '../components/common/PageHeader.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import { CreateProjectModal } from '../components/projects/CreateProjectModal.jsx';
import * as projectsApi from '../services/projects.api.js';

const STATUS_TABS = [
  { label: 'All Projects', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On Hold', value: 'ON_HOLD' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Archived', value: 'ARCHIVED' },
];

const STATUS_VARIANTS = {
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'primary',
  ARCHIVED: 'muted',
  CANCELLED: 'danger',
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      toast.success('Project updated successfully');
    } else {
      const created = await projectsApi.createProject(null, projectData);
      setProjects(prev => [created, ...prev]);
      toast.success('Project created successfully');
    }
  }

  async function handleConfirmDelete() {
    if (!projectToDelete) return;
    try {
      setIsDeleting(true);
      await projectsApi.deleteProject(projectToDelete.id);
      setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
      toast.success('Project deleted successfully');
      setProjectToDelete(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        padding: '24px 28px',
        overflowY: 'auto',
        backgroundColor: 'var(--bg-primary)',
        boxSizing: 'border-box',
      }}
    >
      {/* Standardized PageHeader */}
      <PageHeader
        title="Projects"
        description="Higher-level bodies of work, deliverables, and organizational contexts."
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setEditingProject(null);
              setIsCreateModalOpen(true);
            }}
          >
            New Project
          </Button>
        }
      />

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
                minHeight: '32px',
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
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            aria-label="Search projects"
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
      <ErrorBanner message={error} onRetry={loadProjects} />

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
          <LoadingSpinner />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No projects found"
          description={
            searchQuery
              ? `No projects matched "${searchQuery}".`
              : 'Create projects to group tasks, track milestones, and organize workflows.'
          }
          actionLabel="Create Project"
          onAction={() => {
            setEditingProject(null);
            setIsCreateModalOpen(true);
          }}
          actionIcon={Plus}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {projects.map(project => {
            const variant = STATUS_VARIANTS[project.status] || 'muted';
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
                    <Badge variant={variant} size="sm">
                      {project.status.replace('_', ' ')}
                    </Badge>

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
                          padding: '6px',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <Edit2 size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete project "${project.name}"`}
                        onClick={e => {
                          e.stopPropagation();
                          setProjectToDelete(project);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
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
                        <Clock size={13} aria-hidden="true" />
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
                      View details <ExternalLink size={12} aria-hidden="true" />
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

      {/* Standard Accessible Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Project"
        message={
          projectToDelete ? `Are you sure you want to delete "${projectToDelete.name}"?` : ''
        }
        consequence="Tasks belonging to this project will be unlinked, but will not be deleted (per BR-PROJECT-001)."
        confirmLabel="Delete Project"
        isLoading={isDeleting}
      />
    </div>
  );
}
