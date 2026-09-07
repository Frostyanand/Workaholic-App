import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Kanban, Plus, Search, FolderGit2, Trash2, ExternalLink } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { PageHeader } from '../components/common/PageHeader.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import { CreateBoardModal } from '../components/boards/CreateBoardModal.jsx';
import * as boardsApi from '../services/boards.api.js';
import * as projectsApi from '../services/projects.api.js';

export function BoardsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [boards, setBoards] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [boardsData, projectsData] = await Promise.all([
        boardsApi.fetchBoards(null, {
          projectId: selectedProjectId || undefined,
          search: searchQuery.trim() || undefined,
        }),
        projectsApi.fetchProjects(null),
      ]);
      setBoards(boardsData);
      setProjects(projectsData);
    } catch (err) {
      setError(err.message || 'Failed to load boards');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateBoard(boardData) {
    try {
      const created = await boardsApi.createBoard(null, boardData);
      setBoards(prev => [created, ...prev]);
      toast.success('Board created successfully');
      navigate(`/boards/${created.id}`);
    } catch (err) {
      toast.error(err.message || 'Failed to create board');
      throw err;
    }
  }

  async function handleConfirmDelete() {
    if (!boardToDelete) return;
    try {
      setIsDeleting(true);
      await boardsApi.deleteBoard(boardToDelete.id);
      setBoards(prev => prev.filter(b => b.id !== boardToDelete.id));
      toast.success('Board deleted successfully');
      setBoardToDelete(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete board');
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
        title="Boards"
        description="Visual Kanban boards, customizable workflow columns, and progress tracking."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setIsCreateModalOpen(true)}>
            Create Board
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
        {/* Project Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label
            htmlFor="boards-project-filter"
            style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}
          >
            Project:
          </label>
          <select
            id="boards-project-filter"
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            style={{
              padding: '7px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">All Boards (Workspace-wide)</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
            placeholder="Search boards..."
            aria-label="Search boards"
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
      <ErrorBanner message={error} onRetry={loadData} />

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
          <LoadingSpinner />
        </div>
      ) : boards.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title="No boards found"
          description={
            searchQuery || selectedProjectId
              ? 'No boards matched your filter criteria.'
              : 'Create Kanban boards to visualize tasks, manage columns, and streamline team or personal workflows.'
          }
          actionLabel="Create Board"
          onAction={() => setIsCreateModalOpen(true)}
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
          {boards.map(board => {
            const project = projects.find(p => p.id === board.projectId);

            return (
              <div
                key={board.id}
                onClick={() => navigate(`/boards/${board.id}`)}
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
                    {project ? (
                      <Badge variant="primary" size="sm" icon={FolderGit2}>
                        {project.name}
                      </Badge>
                    ) : (
                      <Badge variant="muted" size="sm">
                        General Board
                      </Badge>
                    )}

                    <button
                      type="button"
                      aria-label={`Delete board "${board.name}"`}
                      onClick={e => {
                        e.stopPropagation();
                        setBoardToDelete(board);
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

                  <h3
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: '0 0 8px 0',
                    }}
                  >
                    {board.name}
                  </h3>

                  {board.description && (
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
                      {board.description}
                    </p>
                  )}
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
                    marginTop: '16px',
                  }}
                >
                  <span>Kanban Workflow</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--accent-primary)',
                      fontWeight: 500,
                    }}
                  >
                    Open board <ExternalLink size={12} aria-hidden="true" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Board Modal */}
      <CreateBoardModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateBoard={handleCreateBoard}
        projects={projects}
        initialProjectId={selectedProjectId}
      />

      {/* Standard Accessible Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!boardToDelete}
        onClose={() => setBoardToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Board"
        message={
          boardToDelete ? `Are you sure you want to delete board "${boardToDelete.name}"?` : ''
        }
        consequence="Tasks associated with this board will have their board reference unlinked, but will not be deleted."
        confirmLabel="Delete Board"
        isLoading={isDeleting}
      />
    </div>
  );
}
