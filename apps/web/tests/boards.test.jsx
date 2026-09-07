// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BoardsPage } from '../src/pages/BoardsPage.jsx';
import { BoardDetailPage } from '../src/pages/BoardDetailPage.jsx';
import { KanbanBoard } from '../src/components/boards/KanbanBoard.jsx';
import { KanbanCard } from '../src/components/boards/KanbanCard.jsx';
import { CreateBoardModal } from '../src/components/boards/CreateBoardModal.jsx';
import { CreateColumnModal } from '../src/components/boards/CreateColumnModal.jsx';
import * as boardsApi from '../src/services/boards.api.js';
import * as projectsApi from '../src/services/projects.api.js';

describe('Boards & Kanban UI Components & Pages (Phase 6)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  describe('CreateBoardModal', () => {
    it('validates required board name and calls onCreateBoard', async () => {
      const onCreateBoard = vi.fn().mockResolvedValue({ id: 'b-1', name: 'Sprint Board' });
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <CreateBoardModal
            isOpen={true}
            onClose={onClose}
            onCreateBoard={onCreateBoard}
            projects={[{ id: 'p-1', name: 'Project Alpha' }]}
          />,
        );
      });

      expect(container.textContent).toContain('Create New Board');

      const submitBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        submitBtn.click();
      });

      expect(container.textContent).toContain('Board name cannot be empty');
      expect(onCreateBoard).not.toHaveBeenCalled();

      const nameInput = container.querySelector('#board-name-input');
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeSetter.call(nameInput, 'Sprint Board');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        const submitBtn = container.querySelector('button[type="submit"]');
        submitBtn.click();
      });

      expect(onCreateBoard).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sprint Board',
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('CreateColumnModal', () => {
    it('validates column name and maps status correctly', async () => {
      const onSaveColumn = vi.fn().mockResolvedValue({ id: 'col-1', name: 'In Review' });
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <CreateColumnModal isOpen={true} onClose={onClose} onSaveColumn={onSaveColumn} />,
        );
      });

      const nameInput = container.querySelector('#column-name-input');
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeSetter.call(nameInput, 'In Review');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        const submitBtn = container.querySelector('button[type="submit"]');
        submitBtn.click();
      });

      expect(onSaveColumn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'In Review',
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('KanbanCard (Accessible move alternative TM-BOARD-003, UX-T09)', () => {
    it('renders task card and allows moving to another column via select dropdown', async () => {
      const onMoveToColumn = vi.fn();
      const onSelectTask = vi.fn();

      const task = {
        id: 'task-1',
        title: 'Design database schema',
        status: 'TODO',
        priority: 'P1',
        boardColumnId: 'col-1',
      };

      const columns = [
        { id: 'col-1', name: 'To Do' },
        { id: 'col-2', name: 'In Progress' },
        { id: 'col-3', name: 'Done' },
      ];

      await act(async () => {
        root.render(
          <KanbanCard
            task={task}
            columns={columns}
            currentColumnId="col-1"
            onMoveToColumn={onMoveToColumn}
            onSelectTask={onSelectTask}
          />,
        );
      });

      expect(container.textContent).toContain('Design database schema');
      expect(container.textContent).toContain('P1 Urgent');

      // Click the accessible "Move column" button
      const moveBtn = container.querySelector(
        'button[aria-label="Move task \\"Design database schema\\" to another column"]',
      );
      expect(moveBtn).not.toBeNull();

      await act(async () => {
        moveBtn.click();
      });

      // Accessible select dropdown is now visible
      const select = container.querySelector('#move-task-task-1');
      expect(select).not.toBeNull();

      await act(async () => {
        select.value = 'col-2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(onMoveToColumn).toHaveBeenCalledWith('task-1', 'col-2');
    });
  });

  describe('KanbanBoard & Empty Board State (TM-BOARD-007)', () => {
    it('renders Add Column button when board has no columns', async () => {
      await act(async () => {
        root.render(
          <KanbanBoard
            board={{ id: 'b-empty', name: 'Empty Board' }}
            columns={[]}
            tasks={[]}
            onMoveTask={() => {}}
            onReorderColumns={() => {}}
            onAddColumnClick={() => {}}
            onAddTask={() => {}}
            onSelectTask={() => {}}
          />,
        );
      });

      expect(container.textContent).toContain('Add Column');
    });

    it('renders columns and empty column drop targets when columns have 0 tasks', async () => {
      const columns = [
        { id: 'col-1', name: 'Backlog', position: 0 },
        { id: 'col-2', name: 'In Progress', position: 1 },
      ];

      await act(async () => {
        root.render(
          <KanbanBoard
            board={{ id: 'b-1', name: 'Team Board' }}
            columns={columns}
            tasks={[]}
            onMoveTask={() => {}}
            onReorderColumns={() => {}}
            onAddColumnClick={() => {}}
            onAddTask={() => {}}
            onSelectTask={() => {}}
          />,
        );
      });

      expect(container.textContent).toContain('Backlog');
      expect(container.textContent).toContain('In Progress');
      expect(container.textContent).toContain('No tasks in this column');
    });
  });

  describe('BoardsPage', () => {
    it('renders empty state when no boards exist', async () => {
      vi.spyOn(boardsApi, 'fetchBoards').mockResolvedValue([]);
      vi.spyOn(projectsApi, 'fetchProjects').mockResolvedValue([]);

      await act(async () => {
        root.render(
          <MemoryRouter>
            <BoardsPage />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('No boards found');
      expect(container.textContent).toContain('Create Board');
    });
  });

  describe('BoardDetailPage', () => {
    it('renders empty board view when board has no columns (TM-BOARD-007)', async () => {
      const mockBoard = {
        id: 'b-empty',
        name: 'Empty Sprint Board',
        description: 'New board without columns',
        columns: [],
      };

      vi.spyOn(boardsApi, 'fetchBoardById').mockResolvedValue(mockBoard);
      vi.spyOn(boardsApi, 'fetchBoardTasks').mockResolvedValue([]);

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/boards/b-empty']}>
            <Routes>
              <Route path="/boards/:id" element={<BoardDetailPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Empty Sprint Board');
      expect(container.textContent).toContain('Empty Board');
      expect(container.textContent).toContain('This board has no columns configured yet');
    });

    it('renders board header, columns, and tasks', async () => {
      const mockColumns = [
        { id: 'col-1', name: 'To Do', position: 0, statusMapping: 'TODO' },
        { id: 'col-2', name: 'Done', position: 1, statusMapping: 'COMPLETED' },
      ];

      const mockBoard = {
        id: 'b-1',
        name: 'Sprint Alpha Board',
        description: 'Development pipeline',
        projectId: 'p-1',
        columns: mockColumns,
      };

      const mockTasks = [
        {
          id: 't-1',
          title: 'Implement Kanban drag-and-drop',
          status: 'TODO',
          priority: 'P1',
          boardId: 'b-1',
          boardColumnId: 'col-1',
        },
      ];

      vi.spyOn(boardsApi, 'fetchBoardById').mockResolvedValue(mockBoard);
      vi.spyOn(boardsApi, 'fetchBoardTasks').mockResolvedValue(mockTasks);

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/boards/b-1']}>
            <Routes>
              <Route path="/boards/:id" element={<BoardDetailPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Sprint Alpha Board');
      expect(container.textContent).toContain('To Do');
      expect(container.textContent).toContain('Done');
      expect(container.textContent).toContain('Implement Kanban drag-and-drop');
    });
  });
});
