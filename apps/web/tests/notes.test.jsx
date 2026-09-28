// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { NotesPage } from '../src/pages/NotesPage.jsx';
import { NoteEditor } from '../src/components/notes/NoteEditor.jsx';
import { NoteList } from '../src/components/notes/NoteList.jsx';
import { ConvertTaskModal } from '../src/components/notes/ConvertTaskModal.jsx';
import { NoteAttachments } from '../src/components/attachments/NoteAttachments.jsx';
import * as notesApi from '../src/services/notes.api.js';
import * as attachmentsApi from '../src/services/attachments.api.js';
import * as integrationsApi from '../src/services/integrations.api.js';

describe('Notes Workspace UI Components & Pages (Phase 17)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  const mockNote1 = {
    id: 'note-101',
    workspaceId: 'ws-1',
    title: 'Distributed Systems Principles',
    category: 'Engineering',
    contentText: 'CAP theorem and consensus protocols.',
    isPinned: true,
    isFavorite: false,
    isArchived: false,
    tags: ['distributed', 'systems'],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T12:00:00Z',
    content: [
      { id: 'p1', type: 'paragraph', text: 'CAP theorem and consensus protocols.' },
      {
        id: 'chk1',
        type: 'checklist',
        items: [
          { id: 'item_1', text: 'Study Raft algorithm', checked: false, convertedTaskId: null },
          { id: 'item_2', text: 'Read Paxos paper', checked: true, convertedTaskId: 'task-777' },
        ],
      },
    ],
    relationships: [
      {
        id: 'rel-1',
        targetType: 'TASK',
        targetId: 'task-777',
        relationshipType: 'CONVERTED_FROM',
      },
    ],
    backlinks: [
      {
        noteId: 'note-202',
        title: 'System Design Overview',
        relationshipType: 'REFERENCES',
      },
    ],
  };

  describe('NoteList', () => {
    it('renders note cards with category, tags, and pin flags', async () => {
      await act(async () => {
        root.render(
          <NoteList notes={[mockNote1]} activeNoteId={mockNote1.id} onSelectNote={() => {}} />,
        );
      });

      expect(container.textContent).toContain('Distributed Systems Principles');
      expect(container.textContent).toContain('Engineering');
      expect(container.textContent).toContain('#distributed');
      expect(container.textContent).toContain('#systems');
      expect(container.querySelector('[title="Pinned"]')).not.toBeNull();
    });

    it('renders empty state when notes list is empty', async () => {
      await act(async () => {
        root.render(<NoteList notes={[]} activeNoteId={null} onSelectNote={() => {}} />);
      });

      expect(container.textContent).toContain('No notes found');
    });
  });

  describe('ConvertTaskModal (BR-NOTE-001, BR-NOTE-002, REQ-NOTE-008)', () => {
    it('renders form pre-filled with checklist item text and submits conversion payload', async () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const convertSpy = vi.spyOn(notesApi, 'convertChecklistItemToTask').mockResolvedValue({
        task: { id: 'task-888', title: 'Study Raft algorithm', priority: 'P1' },
        noteId: 'note-101',
        alreadyConverted: false,
      });

      await act(async () => {
        root.render(
          <ConvertTaskModal
            noteId="note-101"
            workspaceId="ws-1"
            item={{ id: 'item_1', text: 'Study Raft algorithm', checked: false }}
            onClose={onClose}
            onSuccess={onSuccess}
          />,
        );
      });

      expect(container.textContent).toContain('Convert Checklist Item to Task');
      const input = container.querySelector('[data-testid="convert-task-title-input"]');
      expect(input.value).toBe('Study Raft algorithm');

      // Change priority to P1
      const select = container.querySelector('[data-testid="convert-task-priority-select"]');
      await act(async () => {
        select.value = 'P1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Submit
      const form = container.querySelector('form');
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(convertSpy).toHaveBeenCalledWith('ws-1', 'note-101', {
        itemId: 'item_1',
        title: 'Study Raft algorithm',
        priority: 'P1',
        description: undefined,
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('NoteEditor', () => {
    it('renders rich content toolbar, interactive checklist, and relationships', async () => {
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([]);
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({ connected: true });

      await act(async () => {
        root.render(
          <NoteEditor
            note={mockNote1}
            workspaceId="ws-1"
            onNoteUpdated={() => {}}
            onNoteDeleted={() => {}}
          />,
        );
      });

      expect(container.querySelector('[data-testid="note-title-input"]').value).toBe(
        'Distributed Systems Principles',
      );
      expect(container.querySelector('[data-testid="note-toolbar"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="checklist-input-item_1"]').value).toBe(
        'Study Raft algorithm',
      );

      // Item 1 has Convert to Task button
      expect(container.querySelector('[data-testid="convert-to-task-btn-item_1"]')).not.toBeNull();

      // Item 2 was already converted and displays Task Created badge
      expect(container.querySelector('[data-testid="converted-task-badge-item_2"]')).not.toBeNull();

      // Relationships & Backlinks
      expect(container.textContent).toContain('Relationships (1)');
      expect(container.textContent).toContain('CONVERTED_FROM: task-777');
      expect(container.textContent).toContain('Backlinks (1)');
      expect(container.textContent).toContain('System Design Overview');
    });

    it('toggling checkbox updates item checked state without creating a task', async () => {
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([]);
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({ connected: false });
      vi.spyOn(notesApi, 'updateNote').mockResolvedValue(mockNote1);

      await act(async () => {
        root.render(
          <NoteEditor
            note={mockNote1}
            workspaceId="ws-1"
            onNoteUpdated={() => {}}
            onNoteDeleted={() => {}}
          />,
        );
      });

      const checkbox = container.querySelector('[data-testid="checkbox-item_1"]');
      expect(checkbox.checked).toBe(false);

      await act(async () => {
        checkbox.click();
      });

      expect(checkbox.checked).toBe(true);
      // Ensure convertChecklistItemToTask was NOT called
      expect(vi.spyOn(notesApi, 'convertChecklistItemToTask')).not.toHaveBeenCalled();
    });
  });

  describe('NoteAttachments Component', () => {
    it('loads and renders attachments with Google Drive status and detach action', async () => {
      const mockAtt = {
        id: 'att-1',
        fileName: 'spec.pdf',
        sizeBytes: 2048,
        externalFileId: 'drive-999',
        googleDriveFileId: 'drive-999',
        webViewLink: 'https://drive.google.com/file/d/drive-999',
      };

      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([mockAtt]);
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({ connected: true });
      const detachSpy = vi
        .spyOn(attachmentsApi, 'detachAttachment')
        .mockResolvedValue({ success: true });

      await act(async () => {
        root.render(<NoteAttachments noteId="note-101" workspaceId="ws-1" />);
      });

      expect(container.textContent).toContain('Attachments (1)');
      expect(container.textContent).toContain('spec.pdf');
      expect(container.textContent).toContain('Drive');

      // Click detach button
      const deleteBtn = container.querySelector('button[title*="Detach from note"]');
      expect(deleteBtn).not.toBeNull();
      await act(async () => {
        deleteBtn.click();
      });

      // Confirm modal appears
      expect(container.textContent).toContain('Detach Attachment?');
      const confirmDetachBtn = container.querySelector('button.btn-danger');
      await act(async () => {
        confirmDetachBtn.click();
      });

      expect(detachSpy).toHaveBeenCalledWith('ws-1', 'att-1');
    });
  });

  describe('NotesPage Full Workspace', () => {
    it('mounts NotesPage, loads metadata, list, and auto-selects first note', async () => {
      vi.spyOn(notesApi, 'fetchCategories').mockResolvedValue([
        { category: 'Engineering', noteCount: 1 },
      ]);
      vi.spyOn(notesApi, 'fetchTags').mockResolvedValue([
        { id: 'tag-1', name: 'distributed', noteCount: 1 },
      ]);
      vi.spyOn(notesApi, 'fetchNotes').mockResolvedValue({
        notes: [mockNote1],
        pagination: { limit: 50, offset: 0, total: 1 },
      });
      vi.spyOn(notesApi, 'fetchNote').mockResolvedValue(mockNote1);
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([]);
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({ connected: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <NotesPage />
          </MemoryRouter>,
        );
      });

      // Header and search
      expect(container.textContent).toContain('Notes & Knowledge');
      expect(container.querySelector('[data-testid="notes-search-input"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="create-note-btn"]')).not.toBeNull();

      // Filters
      expect(container.textContent).toContain('Engineering (1)');
      expect(container.textContent).toContain('#distributed');

      // List & Editor
      expect(container.textContent).toContain('Distributed Systems Principles');
      expect(container.querySelector('[data-testid="note-editor"]')).not.toBeNull();
    });
  });
});
