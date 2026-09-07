import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Kanban, Plus, Search, FolderGit2, Trash2, AlertCircle, ExternalLink } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { CreateBoardModal } from '../components/boards/CreateBoardModal.jsx';
import * as boardsApi from '../services/boards.api.js';
import * as projectsApi from '../services/projects.api.js';

export function BoardsPage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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
    const created = await boardsApi.createBoard(null, boardData);
    setBoards(prev => [created, ...prev]);
    navigate(`/boards/${created.id}`);
  }

  async function handleDeleteBoard(id, e) {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this board?')) return;
    try {
      await boardsApi.deleteBoard(id);
      setBoards(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete board');
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
            Boards
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
            Visual Kanban boards, customizable workflow columns, and progress tracking.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
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
          Create Board
        </button>
      </div>

      {/* Controls: Search and Project Filter */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          {/* Project Filter */}
          <select
            aria-label="Filter boards by project"
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            style={{
              padding: '8px 14px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '360px' }}>
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
              placeholder="Search boards..."
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
            onClick={loadData}
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
      ) : boards.length === 0 ? (
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
          <Kanban size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 8px 0',
            }}
          >
            No boards found
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
              ? `No boards matched "${searchQuery}".`
              : 'Create Kanban boards to visually organize tasks across customizable columns.'}
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
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
            Create Board
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {boards.map(board => (
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
                boxShadow: 'var(--shadow-sm)',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Kanban size={18} style={{ color: 'var(--accent-primary)' }} />
                    <h3
                      style={{
                        fontSize: '1.0625rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        margin: 0,
                      }}
                    >
                      {board.name}
                    </h3>
                  </div>

                  <button
                    type="button"
                    aria-label={`Delete board "${board.name}"`}
                    onClick={e => handleDeleteBoard(board.id, e)}
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

                {board.projectName && (
                  <div style={{ marginBottom: '12px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--accent-primary)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <FolderGit2 size={12} /> {board.projectName}
                    </span>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '14px',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span>
                  {board.columnCount ?? 3} columns · {board.taskCount ?? 0} tasks
                </span>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--accent-primary)',
                    fontWeight: 500,
                  }}
                >
                  Open board <ExternalLink size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Board Modal */}
      <CreateBoardModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateBoard={handleCreateBoard}
        projects={projects}
      />
    </main>
  );
}
