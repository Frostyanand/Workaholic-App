import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Search,
  Pin,
  Star,
  Archive,
  Tag as TagIcon,
  Folder,
  X,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import * as notesApi from '../services/notes.api.js';
import { NoteList } from '../components/notes/NoteList.jsx';
import { NoteEditor } from '../components/notes/NoteEditor.jsx';

/**
 * NotesPage Component (Phase 17: Notes / Knowledge Workspace)
 * Conforms to docs/13.UX-SPECIFICATION.md Section 45, docs/14.DESIGN-SYSTEM.md,
 * and REQ-NOTE-001 through REQ-NOTE-008.
 */
export function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingNote, setLoadingNote] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'PINNED' | 'FAVORITES' | 'ARCHIVED'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);

  // Aggregations
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);

  // Load categories and tags
  const loadMetadata = useCallback(async () => {
    try {
      const [cats, tgs] = await Promise.all([notesApi.fetchCategories(), notesApi.fetchTags()]);
      setCategories(cats || []);
      setTags(tgs || []);
    } catch {
      // Non-fatal
    }
  }, []);

  // Load notes list matching current filters
  const loadNotes = useCallback(
    async (selectFirst = false) => {
      try {
        setLoading(true);
        setError(null);

        const filterParams = {
          q: searchQuery.trim() || undefined,
          category: selectedCategory || undefined,
          tag: selectedTag || undefined,
          isArchived: activeFilter === 'ARCHIVED',
          isPinned: activeFilter === 'PINNED' ? true : undefined,
          isFavorite: activeFilter === 'FAVORITES' ? true : undefined,
        };

        const result = await notesApi.fetchNotes(null, filterParams);
        const fetchedNotes = result.notes || [];
        setNotes(fetchedNotes);

        // Auto-select first note if requested or if current selection is not in list
        if (selectFirst && fetchedNotes.length > 0) {
          setSelectedNoteId(fetchedNotes[0].id);
        } else if (fetchedNotes.length === 0) {
          setSelectedNote(null);
          setSelectedNoteId(null);
        }
      } catch (err) {
        setError(err.message || 'Failed to load notes');
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, activeFilter, selectedCategory, selectedTag],
  );

  // Initial load
  useEffect(() => {
    loadMetadata();
    loadNotes(true);
  }, [loadMetadata, loadNotes]);

  // Load active note details whenever selectedNoteId changes
  useEffect(() => {
    if (!selectedNoteId) {
      setSelectedNote(null);
      return;
    }

    if (selectedNote?.id === selectedNoteId) {
      return;
    }

    let isMounted = true;
    async function loadActiveNote() {
      try {
        setLoadingNote(true);
        const noteData = await notesApi.fetchNote(null, selectedNoteId);
        if (isMounted) {
          setSelectedNote(noteData);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load note details', err);
        }
      } finally {
        if (isMounted) setLoadingNote(false);
      }
    }

    loadActiveNote();
    return () => {
      isMounted = false;
    };
  }, [selectedNoteId, selectedNote?.id]);

  // Create New Note
  async function handleCreateNote() {
    try {
      const newNote = await notesApi.createNote(null, {
        title: 'Untitled Note',
        content: [{ id: 'p_1', type: 'paragraph', text: '' }],
        category: selectedCategory || null,
        tags: selectedTag ? [selectedTag] : [],
      });

      setNotes(prev => [newNote, ...prev]);
      setSelectedNoteId(newNote.id);
      setSelectedNote(newNote);
      loadMetadata();
    } catch (err) {
      alert(err.message || 'Failed to create note');
    }
  }

  // Update note in state when editor saves
  function handleNoteUpdated(updatedNote) {
    setSelectedNote(prev => (prev?.id === updatedNote.id ? { ...prev, ...updatedNote } : prev));
    setNotes(prev => prev.map(n => (n.id === updatedNote.id ? { ...n, ...updatedNote } : n)));
    loadMetadata();
  }

  // Delete note handler
  function handleNoteDeleted(deletedId) {
    setNotes(prev => {
      const filtered = prev.filter(n => n.id !== deletedId);
      if (filtered.length > 0) {
        setSelectedNoteId(filtered[0].id);
      } else {
        setSelectedNoteId(null);
        setSelectedNote(null);
      }
      return filtered;
    });
    loadMetadata();
  }

  return (
    <div
      className="notes-workspace-container"
      style={{
        display: 'flex',
        height: 'calc(100vh - var(--topbar-height, 56px))',
        background: 'var(--bg-primary, #0a0d14)',
        color: 'var(--text-primary, #f1f5f9)',
        overflow: 'hidden',
      }}
      data-testid="notes-workspace"
    >
      {/* Left Sidebar: Filter, Search, and Note List */}
      <div
        className="notes-sidebar-panel"
        style={{
          width: '360px',
          minWidth: '300px',
          maxWidth: '420px',
          borderRight: '1px solid var(--border-subtle, #232b40)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary, #101522)',
          height: '100%',
        }}
      >
        {/* Workspace Title & Create Button */}
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid var(--border-subtle, #232b40)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} color="#6366F1" />
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Notes & Knowledge</h2>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateNote}
            data-testid="create-note-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.35rem 0.75rem',
              background: '#6366F1',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> New Note
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '0.75rem 1rem 0.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-surface, #161c2e)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '6px',
              padding: '0.4rem 0.6rem',
            }}
          >
            <Search size={15} color="var(--text-muted, #64748b)" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              data-testid="notes-search-input"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'inherit',
                fontSize: '0.85rem',
                width: '100%',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0 1rem 0.5rem',
            borderBottom: '1px solid var(--border-subtle, #232b40)',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'ALL', label: 'All' },
            { id: 'PINNED', label: 'Pinned', icon: Pin },
            { id: 'FAVORITES', label: 'Favorites', icon: Star },
            { id: 'ARCHIVED', label: 'Archive', icon: Archive },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              data-testid={`filter-tab-${tab.id.toLowerCase()}`}
              style={{
                background:
                  activeFilter === tab.id ? 'var(--bg-surface-elevated, #1e263c)' : 'transparent',
                color: activeFilter === tab.id ? '#fff' : 'var(--text-secondary, #94a3b8)',
                border: 'none',
                borderRadius: '4px',
                padding: '0.3rem 0.5rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: activeFilter === tab.id ? 600 : 400,
              }}
            >
              {tab.icon && <tab.icon size={12} />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Categories & Tags Chips Bar */}
        {(categories.length > 0 || tags.length > 0) && (
          <div
            style={{
              padding: '0.5rem 1rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              borderBottom: '1px solid var(--border-subtle, #232b40)',
              fontSize: '0.75rem',
              maxHeight: '80px',
              overflowY: 'auto',
            }}
          >
            {categories.map(cat => {
              const isSelected = selectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => setSelectedCategory(isSelected ? null : cat.category)}
                  data-testid={`category-filter-${cat.category}`}
                  style={{
                    background: isSelected ? '#6366F1' : 'var(--bg-surface, #161c2e)',
                    color: isSelected ? '#fff' : 'var(--text-secondary, #94a3b8)',
                    border: '1px solid var(--border-subtle, #232b40)',
                    borderRadius: '4px',
                    padding: '0.15rem 0.4rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                  }}
                >
                  <Folder size={10} />
                  {cat.category} ({cat.noteCount})
                </button>
              );
            })}

            {tags.map(t => {
              const isSelected = selectedTag === t.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelectedTag(isSelected ? null : t.name)}
                  data-testid={`tag-filter-${t.name}`}
                  style={{
                    background: isSelected ? '#818CF8' : 'rgba(99, 102, 241, 0.1)',
                    color: isSelected ? '#fff' : '#818CF8',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '0.15rem 0.4rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                  }}
                >
                  <TagIcon size={10} />#{t.name}
                </button>
              );
            })}

            {(selectedCategory || selectedTag) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedTag(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-danger, #ef4444)',
                  cursor: 'pointer',
                  padding: '0.15rem 0.3rem',
                  fontSize: '0.75rem',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* Scrollable Note List Items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div
              style={{
                padding: '0.75rem',
                margin: '0.5rem',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                borderRadius: '4px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {loading ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '0.85rem',
              }}
            >
              <RefreshCw size={18} className="spin" style={{ marginBottom: '0.5rem' }} />
              <div>Loading notes...</div>
            </div>
          ) : (
            <NoteList
              notes={notes}
              activeNoteId={selectedNoteId}
              onSelectNote={id => setSelectedNoteId(id)}
            />
          )}
        </div>
      </div>

      {/* Right Panel: Note Editor / Viewer */}
      <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        {loadingNote ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted, #64748b)',
            }}
          >
            <RefreshCw size={24} className="spin" />
          </div>
        ) : selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            workspaceId={selectedNote.workspaceId}
            onNoteUpdated={handleNoteUpdated}
            onNoteDeleted={handleNoteDeleted}
            onSelectNote={id => setSelectedNoteId(id)}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted, #64748b)',
              gap: '1rem',
            }}
            data-testid="no-note-selected"
          >
            <FileText size={48} style={{ opacity: 0.3 }} />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
              Select a note or create a new one
            </h3>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateNote}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.5rem 1rem',
                background: '#6366F1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <Plus size={16} /> Create Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
