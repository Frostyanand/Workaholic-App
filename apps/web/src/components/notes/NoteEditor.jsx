import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Pin,
  Star,
  Archive,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Table as TableIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  Plus,
  X,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from 'lucide-react';
import * as notesApi from '../../services/notes.api.js';
import { ConvertTaskModal } from './ConvertTaskModal.jsx';
import { AddRelationshipModal } from './AddRelationshipModal.jsx';
import { NoteAttachments } from '../attachments/NoteAttachments.jsx';

/**
 * Generate a random short UUID/ID for new nodes.
 */
function uid() {
  return 'node_' + Math.random().toString(36).substring(2, 9);
}

/**
 * NoteEditor Component
 * Rich note editor/viewer with structured content, interactive checklist-to-task conversion,
 * debounced autosave, tags, relationships, backlinks, and attachments.
 */
export function NoteEditor({ note, workspaceId, onNoteUpdated, onNoteDeleted, onSelectNote }) {
  const [title, setTitle] = useState(note?.title || 'Untitled Note');
  const [content, setContent] = useState(Array.isArray(note?.content) ? note.content : []);
  const [category, setCategory] = useState(note?.category || '');
  const [isPinned, setIsPinned] = useState(Boolean(note?.isPinned));
  const [isFavorite, setIsFavorite] = useState(Boolean(note?.isFavorite));
  const [isArchived, setIsArchived] = useState(Boolean(note?.isArchived));
  const [tags, setTags] = useState(Array.isArray(note?.tags) ? note.tags : []);
  const [newTagInput, setNewTagInput] = useState('');
  const [relationships, setRelationships] = useState(note?.relationships || []);
  const [backlinks, setBacklinks] = useState(note?.backlinks || []);

  // Autosave status: 'saved' | 'saving' | 'unsaved' | 'error'
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState(null);

  // Modals
  const [convertModalItem, setConvertModalItem] = useState(null);
  const [isAddRelModalOpen, setIsAddRelModalOpen] = useState(false);

  // Ref tracking dirty state and debounce timer
  const isDirtyRef = useRef(false);
  const timerRef = useRef(null);
  const latestDataRef = useRef({
    title,
    content,
    category,
    isPinned,
    isFavorite,
    isArchived,
    tags,
  });

  // Sync state when active note changes
  useEffect(() => {
    setTitle(note?.title || 'Untitled Note');
    setContent(Array.isArray(note?.content) ? note.content : []);
    setCategory(note?.category || '');
    setIsPinned(Boolean(note?.isPinned));
    setIsFavorite(Boolean(note?.isFavorite));
    setIsArchived(Boolean(note?.isArchived));
    setTags(Array.isArray(note?.tags) ? note.tags : []);
    setRelationships(note?.relationships || []);
    setBacklinks(note?.backlinks || []);
    setSaveStatus('saved');
    setSaveError(null);
    isDirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Keep latestDataRef synchronized
  useEffect(() => {
    latestDataRef.current = { title, content, category, isPinned, isFavorite, isArchived, tags };
  }, [title, content, category, isPinned, isFavorite, isArchived, tags]);

  // Perform actual save
  const performSave = useCallback(
    async (overrideData = null) => {
      if (!note?.id) return;
      const dataToSave = overrideData || latestDataRef.current;
      try {
        setSaveStatus('saving');
        setSaveError(null);
        const updated = await notesApi.updateNote(workspaceId, note.id, {
          title: dataToSave.title,
          content: dataToSave.content,
          category: dataToSave.category || null,
          isPinned: dataToSave.isPinned,
          isFavorite: dataToSave.isFavorite,
          isArchived: dataToSave.isArchived,
          tags: dataToSave.tags,
        });

        isDirtyRef.current = false;
        setSaveStatus('saved');
        if (onNoteUpdated) {
          onNoteUpdated(updated);
        }
      } catch (err) {
        setSaveStatus('error');
        setSaveError(err.message || 'Failed to save note');
      }
    },
    [note?.id, workspaceId, onNoteUpdated],
  );

  // Trigger debounced autosave
  const triggerAutosave = useCallback(
    (delay = 800) => {
      isDirtyRef.current = true;
      setSaveStatus('unsaved');
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        performSave();
      }, delay);
    },
    [performSave],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Update handlers
  function handleTitleChange(val) {
    setTitle(val);
    latestDataRef.current.title = val;
    triggerAutosave();
  }

  function handleCategoryChange(val) {
    setCategory(val);
    latestDataRef.current.category = val;
    triggerAutosave();
  }

  function togglePinned() {
    const nextVal = !isPinned;
    setIsPinned(nextVal);
    performSave({ ...latestDataRef.current, isPinned: nextVal });
  }

  function toggleFavorite() {
    const nextVal = !isFavorite;
    setIsFavorite(nextVal);
    performSave({ ...latestDataRef.current, isFavorite: nextVal });
  }

  function toggleArchived() {
    const nextVal = !isArchived;
    setIsArchived(nextVal);
    performSave({ ...latestDataRef.current, isArchived: nextVal });
  }

  async function handleDeleteNote() {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await notesApi.deleteNote(workspaceId, note.id);
      if (onNoteDeleted) {
        onNoteDeleted(note.id);
      }
    } catch (err) {
      alert(err.message || 'Failed to delete note');
    }
  }

  // Tag handlers
  function handleAddTag(e) {
    if (e) e.preventDefault();
    const clean = newTagInput.trim();
    if (!clean) return;
    if (!tags.includes(clean)) {
      const nextTags = [...tags, clean];
      setTags(nextTags);
      setNewTagInput('');
      performSave({ ...latestDataRef.current, tags: nextTags });
    } else {
      setNewTagInput('');
    }
  }

  function handleRemoveTag(tagToRemove) {
    const nextTags = tags.filter(t => t !== tagToRemove);
    setTags(nextTags);
    performSave({ ...latestDataRef.current, tags: nextTags });
  }

  // Node manipulation
  function addNode(nodeType, extra = {}) {
    let newNode = null;
    switch (nodeType) {
      case 'heading':
        newNode = { id: uid(), type: 'heading', level: extra.level || 1, text: '' };
        break;
      case 'paragraph':
        newNode = { id: uid(), type: 'paragraph', text: '' };
        break;
      case 'list':
        newNode = { id: uid(), type: 'list', listType: extra.listType || 'bullet', items: [''] };
        break;
      case 'checklist':
        newNode = {
          id: uid(),
          type: 'checklist',
          items: [{ id: uid(), text: '', checked: false, convertedTaskId: null }],
        };
        break;
      case 'code':
        newNode = { id: uid(), type: 'code', language: 'javascript', code: '' };
        break;
      case 'table':
        newNode = {
          id: uid(),
          type: 'table',
          rows: [
            ['Header 1', 'Header 2'],
            ['Row 1, Cell 1', 'Row 1, Cell 2'],
          ],
        };
        break;
      case 'link':
        newNode = { id: uid(), type: 'link', url: 'https://', text: 'Link Text' };
        break;
      case 'image':
        newNode = { id: uid(), type: 'image', url: 'https://', caption: 'Image caption' };
        break;
      default:
        newNode = { id: uid(), type: 'paragraph', text: '' };
    }

    const nextContent = [...content, newNode];
    setContent(nextContent);
    latestDataRef.current.content = nextContent;
    triggerAutosave(400);
  }

  function updateNode(nodeId, updater) {
    const nextContent = content.map(node => {
      if (node.id === nodeId) {
        return typeof updater === 'function' ? updater(node) : { ...node, ...updater };
      }
      return node;
    });
    setContent(nextContent);
    triggerAutosave();
  }

  function removeNode(nodeId) {
    const nextContent = content.filter(node => node.id !== nodeId);
    setContent(nextContent);
    triggerAutosave(400);
  }

  function moveNode(index, direction) {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= content.length) return;
    const next = [...content];
    const temp = next[index];
    next[index] = next[newIdx];
    next[newIdx] = temp;
    setContent(next);
    triggerAutosave(400);
  }

  // Checklist Item handling
  function toggleChecklistItem(nodeId, itemId) {
    updateNode(nodeId, node => {
      const items = (node.items || []).map(item => {
        if (item.id === itemId) {
          return { ...item, checked: !item.checked };
        }
        return item;
      });
      return { ...node, items };
    });
  }

  function updateChecklistItemText(nodeId, itemId, text) {
    updateNode(nodeId, node => {
      const items = (node.items || []).map(item => {
        if (item.id === itemId) {
          return { ...item, text };
        }
        return item;
      });
      return { ...node, items };
    });
  }

  function addChecklistItem(nodeId) {
    updateNode(nodeId, node => {
      const items = [
        ...(node.items || []),
        { id: uid(), text: '', checked: false, convertedTaskId: null },
      ];
      return { ...node, items };
    });
  }

  function removeChecklistItem(nodeId, itemId) {
    updateNode(nodeId, node => {
      const items = (node.items || []).filter(item => item.id !== itemId);
      return { ...node, items };
    });
  }

  // Callback when checklist item is converted to task via modal
  function handleChecklistConverted(result) {
    const { task } = result;
    if (convertModalItem && task) {
      // Update checklist item state with convertedTaskId
      const nextContent = content.map(node => {
        if (node.type === 'checklist' && Array.isArray(node.items)) {
          const items = node.items.map(it => {
            if (it.id === convertModalItem.id) {
              return { ...it, convertedTaskId: task.id };
            }
            return it;
          });
          return { ...node, items };
        }
        return node;
      });
      setContent(nextContent);
      performSave({ ...latestDataRef.current, content: nextContent });

      // Refresh relationships
      notesApi.fetchNote(workspaceId, note.id).then(freshNote => {
        if (freshNote) {
          setRelationships(freshNote.relationships || []);
        }
      });
    }
  }

  // Relationship removal
  async function handleRemoveRelationship(relId) {
    try {
      await notesApi.removeNoteRelationship(workspaceId, note.id, relId);
      setRelationships(prev => prev.filter(r => r.id !== relId));
    } catch (err) {
      alert(err.message || 'Failed to remove relationship');
    }
  }

  return (
    <div
      className="note-editor-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        padding: '1.5rem',
        background: 'var(--bg-primary, #0a0d14)',
        color: 'var(--text-primary, #f1f5f9)',
      }}
      data-testid="note-editor"
    >
      {/* Top Header Actions Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid var(--border-subtle, #232b40)',
          paddingBottom: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flex: 1,
            minWidth: '240px',
          }}
        >
          <input
            type="text"
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Note title..."
            data-testid="note-title-input"
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary, #f1f5f9)',
              width: '100%',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Save Status Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              marginRight: '0.5rem',
              color:
                saveStatus === 'saved'
                  ? 'var(--accent-success, #10b981)'
                  : saveStatus === 'saving'
                    ? 'var(--accent-primary, #6366f1)'
                    : saveStatus === 'error'
                      ? 'var(--accent-danger, #ef4444)'
                      : 'var(--accent-warning, #f59e0b)',
            }}
            data-testid="save-status-indicator"
          >
            {saveStatus === 'saved' && <CheckCircle size={14} />}
            {saveStatus === 'saving' && <RefreshCw size={14} className="spin" />}
            {saveStatus === 'unsaved' && <Clock size={14} />}
            {saveStatus === 'error' && <AlertCircle size={14} />}
            <span title={saveError || 'Save status'}>
              {saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'saving'
                  ? 'Saving...'
                  : saveStatus === 'error'
                    ? `Save error: ${saveError || 'Unknown'}`
                    : 'Unsaved'}
            </span>
            {saveStatus === 'error' && (
              <button
                type="button"
                onClick={() => performSave()}
                style={{
                  background: 'none',
                  border: '1px solid currentColor',
                  color: 'inherit',
                  borderRadius: '3px',
                  padding: '0.1rem 0.3rem',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  marginLeft: '0.2rem',
                }}
              >
                Retry
              </button>
            )}
          </div>

          {/* Pin toggle */}
          <button
            type="button"
            onClick={togglePinned}
            data-testid="toggle-pin-btn"
            title={isPinned ? 'Unpin note' : 'Pin note'}
            style={{
              background: isPinned ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: isPinned ? '#6366F1' : 'var(--text-muted, #64748b)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '6px',
              padding: '0.4rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Pin size={16} />
          </button>

          {/* Favorite toggle */}
          <button
            type="button"
            onClick={toggleFavorite}
            data-testid="toggle-favorite-btn"
            title={isFavorite ? 'Remove favorite' : 'Add to favorites'}
            style={{
              background: isFavorite ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: isFavorite ? '#F59E0B' : 'var(--text-muted, #64748b)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '6px',
              padding: '0.4rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Star size={16} />
          </button>

          {/* Archive toggle */}
          <button
            type="button"
            onClick={toggleArchived}
            data-testid="toggle-archive-btn"
            title={isArchived ? 'Unarchive note' : 'Archive note'}
            style={{
              background: isArchived ? 'rgba(156, 163, 175, 0.2)' : 'transparent',
              color: isArchived ? '#9CA3AF' : 'var(--text-muted, #64748b)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '6px',
              padding: '0.4rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Archive size={16} />
          </button>

          {/* Delete note */}
          <button
            type="button"
            onClick={handleDeleteNote}
            data-testid="delete-note-btn"
            title="Delete note"
            style={{
              background: 'transparent',
              color: 'var(--accent-danger, #ef4444)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '6px',
              padding: '0.4rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Meta Bar: Category & Tags */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
          fontSize: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ color: 'var(--text-muted, #64748b)' }}>Category:</span>
          <input
            type="text"
            value={category}
            onChange={e => handleCategoryChange(e.target.value)}
            placeholder="e.g. Work, Ideas, Meeting"
            data-testid="note-category-input"
            style={{
              background: 'var(--bg-secondary, #101522)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              color: 'var(--text-primary, #f1f5f9)',
              fontSize: '0.8rem',
            }}
          />
        </div>

        {/* Tags list */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
          <span style={{ color: 'var(--text-muted, #64748b)' }}>Tags:</span>
          {tags.map(t => (
            <span
              key={t}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818CF8',
                padding: '0.15rem 0.4rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
              }}
            >
              #{t}
              <button
                type="button"
                onClick={() => handleRemoveTag(t)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}

          {/* Add Tag Form */}
          <form
            onSubmit={handleAddTag}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <input
              type="text"
              value={newTagInput}
              onChange={e => setNewTagInput(e.target.value)}
              placeholder="+ Add Tag"
              data-testid="add-tag-input"
              style={{
                background: 'transparent',
                border: '1px dashed var(--border-strong, #333f5c)',
                borderRadius: '9999px',
                padding: '0.15rem 0.5rem',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '0.75rem',
                width: '80px',
              }}
            />
          </form>
        </div>
      </div>

      {/* Rich Formatting Toolbar */}
      <div
        className="note-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.35rem',
          background: 'var(--bg-surface, #161c2e)',
          border: '1px solid var(--border-subtle, #232b40)',
          borderRadius: '8px',
          padding: '0.4rem',
          marginBottom: '1.25rem',
        }}
        data-testid="note-toolbar"
      >
        <button
          type="button"
          onClick={() => addNode('heading', { level: 1 })}
          title="Heading 1"
          style={toolbarBtnStyle}
        >
          <Heading1 size={16} />
        </button>
        <button
          type="button"
          onClick={() => addNode('heading', { level: 2 })}
          title="Heading 2"
          style={toolbarBtnStyle}
        >
          <Heading2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => addNode('heading', { level: 3 })}
          title="Heading 3"
          style={toolbarBtnStyle}
        >
          <Heading3 size={16} />
        </button>
        <span style={toolbarDividerStyle} />
        <button
          type="button"
          onClick={() => addNode('paragraph')}
          title="Paragraph"
          style={toolbarBtnStyle}
        >
          <AlignLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => addNode('list', { listType: 'bullet' })}
          title="Bullet List"
          style={toolbarBtnStyle}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => addNode('list', { listType: 'ordered' })}
          title="Numbered List"
          style={toolbarBtnStyle}
        >
          <ListOrdered size={16} />
        </button>
        <button
          type="button"
          onClick={() => addNode('checklist')}
          title="Checklist"
          data-testid="toolbar-add-checklist-btn"
          style={{ ...toolbarBtnStyle, color: '#6366F1' }}
        >
          <CheckSquare size={16} />
        </button>
        <span style={toolbarDividerStyle} />
        <button
          type="button"
          onClick={() => addNode('code')}
          title="Code Block"
          style={toolbarBtnStyle}
        >
          <Code size={16} />
        </button>
        <button
          type="button"
          onClick={() => addNode('table')}
          title="Table"
          style={toolbarBtnStyle}
        >
          <TableIcon size={16} />
        </button>
        <button type="button" onClick={() => addNode('link')} title="Link" style={toolbarBtnStyle}>
          <LinkIcon size={16} />
        </button>
        <button
          type="button"
          onClick={() => addNode('image')}
          title="Image"
          style={toolbarBtnStyle}
        >
          <ImageIcon size={16} />
        </button>
      </div>

      {/* Main Content Area (Structured Nodes) */}
      <div
        className="note-nodes-list"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1 }}
      >
        {content.length === 0 && (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--text-muted, #64748b)',
              border: '1px dashed var(--border-subtle, #232b40)',
              borderRadius: '8px',
            }}
          >
            <p style={{ margin: '0 0 0.5rem 0' }}>This note is empty.</p>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              Use the toolbar above to add paragraphs, headings, checklists, code blocks, tables,
              and more.
            </p>
          </div>
        )}

        {content.map((node, idx) => (
          <div
            key={node.id || idx}
            className="note-node-block"
            style={{
              position: 'relative',
              borderRadius: '6px',
              padding: '0.5rem',
              background: 'var(--bg-secondary, #101522)',
              border: '1px solid var(--border-subtle, #232b40)',
            }}
            data-testid={`note-node-${node.type}`}
          >
            {/* Node action controls (move / delete) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                position: 'absolute',
                top: '0.4rem',
                right: '0.4rem',
                opacity: 0.7,
              }}
            >
              <button
                type="button"
                onClick={() => moveNode(idx, -1)}
                disabled={idx === 0}
                style={nodeControlBtnStyle}
                title="Move up"
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => moveNode(idx, 1)}
                disabled={idx === content.length - 1}
                style={nodeControlBtnStyle}
                title="Move down"
              >
                <ArrowDown size={12} />
              </button>
              <button
                type="button"
                onClick={() => removeNode(node.id)}
                style={{ ...nodeControlBtnStyle, color: '#EF4444' }}
                title="Remove block"
              >
                <X size={12} />
              </button>
            </div>

            {/* Paragraph Node */}
            {node.type === 'paragraph' && (
              <textarea
                value={node.text || ''}
                onChange={e => updateNode(node.id, { text: e.target.value })}
                placeholder="Write text here..."
                rows={2}
                style={nodeTextareaStyle}
              />
            )}

            {/* Heading Node */}
            {node.type === 'heading' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  paddingRight: '4rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: 700 }}>
                  H{node.level || 1}
                </span>
                <input
                  type="text"
                  value={node.text || ''}
                  onChange={e => updateNode(node.id, { text: e.target.value })}
                  placeholder={`Heading ${node.level || 1}...`}
                  style={{
                    ...nodeInputStyle,
                    fontSize: node.level === 1 ? '1.3rem' : node.level === 2 ? '1.15rem' : '1rem',
                    fontWeight: 600,
                  }}
                />
              </div>
            )}

            {/* List Node (Bullet or Ordered) */}
            {node.type === 'list' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  paddingRight: '4rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                  {node.listType === 'ordered' ? 'Numbered List' : 'Bullet List'}
                </span>
                {(node.items || []).map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <span
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-muted, #64748b)',
                        width: '20px',
                      }}
                    >
                      {node.listType === 'ordered' ? `${itemIdx + 1}.` : '•'}
                    </span>
                    <input
                      type="text"
                      value={item}
                      onChange={e => {
                        const items = [...node.items];
                        items[itemIdx] = e.target.value;
                        updateNode(node.id, { items });
                      }}
                      placeholder="List item..."
                      style={nodeInputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const items = node.items.filter((_, i) => i !== itemIdx);
                        updateNode(node.id, { items });
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateNode(node.id, { items: [...(node.items || []), ''] })}
                  style={addItemBtnStyle}
                >
                  <Plus size={12} /> Add item
                </button>
              </div>
            )}

            {/* Checklist Node (BR-NOTE-001 & BR-NOTE-002: Checklists are NOT tasks until explicit conversion) */}
            {node.type === 'checklist' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  paddingRight: '4rem',
                }}
                data-testid="checklist-node-block"
              >
                <span style={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: 600 }}>
                  Checklist
                </span>
                {(node.items || []).map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'var(--bg-surface, #161c2e)',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '4px',
                    }}
                    data-testid={`checklist-item-${item.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(item.checked)}
                      onChange={() => toggleChecklistItem(node.id, item.id)}
                      data-testid={`checkbox-${item.id}`}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <input
                      type="text"
                      value={item.text || ''}
                      onChange={e => updateChecklistItemText(node.id, item.id, e.target.value)}
                      placeholder="Checklist task..."
                      data-testid={`checklist-input-${item.id}`}
                      style={{
                        ...nodeInputStyle,
                        textDecoration: item.checked ? 'line-through' : 'none',
                        color: item.checked ? 'var(--text-muted, #64748b)' : 'inherit',
                      }}
                    />

                    {/* Explicit Convert to Task Action */}
                    {item.convertedTaskId ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontSize: '0.7rem',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10B981',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                        }}
                        data-testid={`converted-task-badge-${item.id}`}
                      >
                        <CheckCircle size={10} /> Task Created
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConvertModalItem(item)}
                        data-testid={`convert-to-task-btn-${item.id}`}
                        title="Explicitly convert to Workaholic Task"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          background: 'rgba(99, 102, 241, 0.1)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          color: '#818CF8',
                          borderRadius: '4px',
                          padding: '0.2rem 0.45rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Convert to Task
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => removeChecklistItem(node.id, item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addChecklistItem(node.id)}
                  data-testid="add-checklist-item-btn"
                  style={addItemBtnStyle}
                >
                  <Plus size={12} /> Add checklist item
                </button>
              </div>
            )}

            {/* Code Block Node */}
            {node.type === 'code' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  paddingRight: '4rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6366F1' }}>Code</span>
                  <input
                    type="text"
                    value={node.language || 'javascript'}
                    onChange={e => updateNode(node.id, { language: e.target.value })}
                    placeholder="language (e.g. js, sql)"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle, #232b40)',
                      borderRadius: '4px',
                      color: 'var(--text-muted, #64748b)',
                      padding: '0.1rem 0.4rem',
                      fontSize: '0.75rem',
                      width: '100px',
                    }}
                  />
                </div>
                <textarea
                  value={node.code || ''}
                  onChange={e => updateNode(node.id, { code: e.target.value })}
                  placeholder="// Paste or write code..."
                  rows={4}
                  style={{
                    ...nodeTextareaStyle,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.85rem',
                    background: '#0a0d14',
                  }}
                />
              </div>
            )}

            {/* Table Node */}
            {node.type === 'table' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  paddingRight: '4rem',
                  overflowX: 'auto',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: '#6366F1' }}>Table</span>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <tbody>
                    {(node.rows || []).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            style={{
                              border: '1px solid var(--border-subtle, #232b40)',
                              padding: '0.3rem',
                              background: rIdx === 0 ? 'var(--bg-surface, #161c2e)' : 'transparent',
                            }}
                          >
                            <input
                              type="text"
                              value={cell}
                              onChange={e => {
                                const rows = node.rows.map((r, ri) =>
                                  ri === rIdx
                                    ? r.map((c, ci) => (ci === cIdx ? e.target.value : c))
                                    : r,
                                );
                                updateNode(node.id, { rows });
                              }}
                              style={{ ...nodeInputStyle, fontWeight: rIdx === 0 ? 600 : 400 }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const colCount = node.rows?.[0]?.length || 2;
                      const newRow = Array(colCount).fill('');
                      updateNode(node.id, { rows: [...(node.rows || []), newRow] });
                    }}
                    style={addItemBtnStyle}
                  >
                    <Plus size={12} /> Add row
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const rows = (node.rows || []).map(r => [...r, '']);
                      updateNode(node.id, { rows });
                    }}
                    style={addItemBtnStyle}
                  >
                    <Plus size={12} /> Add column
                  </button>
                </div>
              </div>
            )}

            {/* Link Node */}
            {node.type === 'link' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  paddingRight: '4rem',
                }}
              >
                <LinkIcon size={14} color="#6366F1" />
                <input
                  type="text"
                  value={node.text || ''}
                  onChange={e => updateNode(node.id, { text: e.target.value })}
                  placeholder="Link text..."
                  style={{ ...nodeInputStyle, width: '40%' }}
                />
                <input
                  type="url"
                  value={node.url || ''}
                  onChange={e => updateNode(node.id, { url: e.target.value })}
                  placeholder="https://..."
                  style={{ ...nodeInputStyle, width: '50%', color: '#818CF8' }}
                />
                {node.url && (
                  <a
                    href={node.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#6366F1' }}
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )}

            {/* Image Node */}
            {node.type === 'image' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  paddingRight: '4rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ImageIcon size={14} color="#6366F1" />
                  <input
                    type="url"
                    value={node.url || ''}
                    onChange={e => updateNode(node.id, { url: e.target.value })}
                    placeholder="Image URL..."
                    style={nodeInputStyle}
                  />
                  <input
                    type="text"
                    value={node.caption || ''}
                    onChange={e => updateNode(node.id, { caption: e.target.value })}
                    placeholder="Caption..."
                    style={{ ...nodeInputStyle, width: '40%' }}
                  />
                </div>
                {node.url && (
                  <div style={{ marginTop: '0.4rem', textAlign: 'center' }}>
                    <img
                      src={node.url}
                      alt={node.caption || 'Note image'}
                      style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px' }}
                      onError={e => {
                        e.target.style.display = 'none';
                      }}
                    />
                    {node.caption && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted, #64748b)',
                          marginTop: '0.2rem',
                        }}
                      >
                        {node.caption}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Relationships & Backlinks Section (REQ-NOTE-005 & REQ-NOTE-006) */}
      <div
        className="note-relationships-section"
        style={{
          marginTop: '2rem',
          borderTop: '1px solid var(--border-subtle, #232b40)',
          paddingTop: '1.25rem',
        }}
        data-testid="note-relationships-section"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
            Relationships ({relationships.length})
          </h4>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsAddRelModalOpen(true)}
            data-testid="open-add-relationship-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle, #232b40)',
              background: 'var(--bg-surface, #161c2e)',
              color: 'inherit',
            }}
          >
            <Plus size={14} /> Link Resource
          </button>
        </div>

        {relationships.length === 0 ? (
          <div
            style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', fontStyle: 'italic' }}
          >
            No explicit relationships linked yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {relationships.map(rel => (
              <div
                key={rel.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  background: 'var(--bg-secondary, #101522)',
                  border: '1px solid var(--border-subtle, #232b40)',
                  fontSize: '0.85rem',
                }}
                data-testid={`relationship-item-${rel.id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '0.1rem 0.35rem',
                      borderRadius: '3px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#818CF8',
                    }}
                  >
                    {rel.targetType}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>
                    {rel.relationshipType}: {rel.targetId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveRelationship(rel.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#EF4444',
                    cursor: 'pointer',
                  }}
                  title="Remove link"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Backlinks Discovery */}
        <div style={{ marginTop: '1.25rem' }}>
          <h5
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.85rem',
              color: 'var(--text-secondary, #94a3b8)',
            }}
          >
            Backlinks ({backlinks.length})
          </h5>
          {backlinks.length === 0 ? (
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted, #64748b)',
                fontStyle: 'italic',
              }}
            >
              No other notes reference this note.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {backlinks.map(bl => (
                <button
                  key={bl.relationshipId || bl.noteId}
                  type="button"
                  onClick={() => onSelectNote && onSelectNote(bl.noteId)}
                  style={{
                    background: 'var(--bg-secondary, #101522)',
                    border: '1px solid var(--border-subtle, #232b40)',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    color: '#818CF8',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <LinkIcon size={12} /> {bl.title || 'Untitled Note'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Attachments Section (REQ-NOTE-004) */}
      <NoteAttachments noteId={note.id} workspaceId={workspaceId} />

      {/* Convert Checklist to Task Modal */}
      {convertModalItem && (
        <ConvertTaskModal
          noteId={note.id}
          workspaceId={workspaceId}
          item={convertModalItem}
          onClose={() => setConvertModalItem(null)}
          onSuccess={handleChecklistConverted}
        />
      )}

      {/* Add Relationship Modal */}
      {isAddRelModalOpen && (
        <AddRelationshipModal
          noteId={note.id}
          workspaceId={workspaceId}
          onClose={() => setIsAddRelModalOpen(false)}
          onSuccess={newRel => {
            setRelationships(prev => [...prev, newRel]);
          }}
        />
      )}
    </div>
  );
}

const toolbarBtnStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '4px',
  color: 'var(--text-secondary, #94a3b8)',
  padding: '0.3rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const toolbarDividerStyle = {
  width: '1px',
  height: '16px',
  background: 'var(--border-subtle, #232b40)',
  margin: '0 0.2rem',
};

const nodeControlBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted, #64748b)',
  cursor: 'pointer',
  padding: '0.2rem',
  display: 'flex',
  alignItems: 'center',
};

const nodeInputStyle = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'inherit',
  fontSize: '0.9rem',
  width: '100%',
};

const nodeTextareaStyle = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'inherit',
  fontSize: '0.9rem',
  width: '100%',
  resize: 'vertical',
  lineHeight: 1.5,
};

const addItemBtnStyle = {
  background: 'none',
  border: '1px dashed var(--border-subtle, #232b40)',
  color: 'var(--text-muted, #64748b)',
  borderRadius: '4px',
  padding: '0.25rem 0.5rem',
  fontSize: '0.75rem',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  alignSelf: 'flex-start',
  marginTop: '0.2rem',
};
