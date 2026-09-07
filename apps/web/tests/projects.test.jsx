// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectsPage } from '../src/pages/ProjectsPage.jsx';
import { ProjectDetailPage } from '../src/pages/ProjectDetailPage.jsx';
import { CreateProjectModal } from '../src/components/projects/CreateProjectModal.jsx';
import * as projectsApi from '../src/services/projects.api.js';
import * as tasksApi from '../src/services/tasks.api.js';
import * as boardsApi from '../src/services/boards.api.js';

describe('Projects UI Components & Pages (Phase 6)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  describe('CreateProjectModal', () => {
    it('does not render when isOpen is false', async () => {
      await act(async () => {
        root.render(
          <CreateProjectModal isOpen={false} onClose={() => {}} onCreateProject={() => {}} />,
        );
      });

      expect(container.textContent).toBe('');
    });

    it('renders form and validates required project name', async () => {
      const onCreateProject = vi.fn();

      await act(async () => {
        root.render(
          <CreateProjectModal isOpen={true} onClose={() => {}} onCreateProject={onCreateProject} />,
        );
      });

      expect(container.textContent).toContain('Create New Project');

      const submitBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        submitBtn.click();
      });

      expect(container.textContent).toContain('Project name cannot be empty');
      expect(onCreateProject).not.toHaveBeenCalled();
    });

    it('submits form with valid payload', async () => {
      const onCreateProject = vi.fn().mockResolvedValue({ id: 'p-1', name: 'Q4 Product Launch' });
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <CreateProjectModal isOpen={true} onClose={onClose} onCreateProject={onCreateProject} />,
        );
      });

      const nameInput = container.querySelector('#project-name-input');
      const descInput = container.querySelector('#project-description-input');

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeSetter.call(nameInput, 'Q4 Product Launch');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        ).set;
        nativeTextareaSetter.call(descInput, 'Launch marketing campaign and MVP');
        descInput.dispatchEvent(new Event('input', { bubbles: true }));

        const submitBtn = container.querySelector('button[type="submit"]');
        submitBtn.click();
      });

      expect(onCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Q4 Product Launch',
          description: 'Launch marketing campaign and MVP',
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('ProjectsPage', () => {
    it('renders empty state when no projects exist', async () => {
      vi.spyOn(projectsApi, 'fetchProjects').mockResolvedValue([]);

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ProjectsPage />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('No projects found');
      expect(container.textContent).toContain('Create projects to group tasks');
    });

    it('renders list of project cards with progress and task counts', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Core Infrastructure',
          description: 'Database and auth scaling',
          status: 'ACTIVE',
          color: '#4f46e5',
          taskCount: 10,
          completedTaskCount: 7,
          progressPercentage: 70,
        },
        {
          id: 'proj-2',
          name: 'Mobile App Beta',
          description: 'Android build preparation',
          status: 'ON_HOLD',
          color: '#06b6d4',
          taskCount: 4,
          completedTaskCount: 0,
          progressPercentage: 0,
        },
      ];

      vi.spyOn(projectsApi, 'fetchProjects').mockResolvedValue(mockProjects);

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ProjectsPage />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Core Infrastructure');
      expect(container.textContent).toContain('Database and auth scaling');
      expect(container.textContent).toContain('Tasks: 7 / 10');
      expect(container.textContent).toContain('70%');
      expect(container.textContent).toContain('Mobile App Beta');
      expect(container.textContent).toContain('On Hold');
    });
  });

  describe('ProjectDetailPage', () => {
    it('renders project header, tabs, and tasks for project', async () => {
      const mockProject = {
        id: 'proj-1',
        name: 'Core Infrastructure',
        description: 'Database and auth scaling',
        status: 'ACTIVE',
        color: '#4f46e5',
        taskCount: 2,
        completedTaskCount: 1,
        progressPercentage: 50,
      };

      const mockTasks = [
        {
          id: 'task-1',
          title: 'Setup PostgreSQL migrations',
          status: 'COMPLETED',
          priority: 'P1',
        },
        {
          id: 'task-2',
          title: 'Implement board reordering',
          status: 'TODO',
          priority: 'P2',
        },
      ];

      vi.spyOn(projectsApi, 'fetchProjectById').mockResolvedValue(mockProject);
      vi.spyOn(tasksApi, 'fetchTasks').mockResolvedValue(mockTasks);
      vi.spyOn(boardsApi, 'fetchBoards').mockResolvedValue([]);
      vi.spyOn(projectsApi, 'fetchProjectMembers').mockResolvedValue([]);

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/projects/proj-1']}>
            <Routes>
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Core Infrastructure');
      expect(container.textContent).toContain('Database and auth scaling');
      expect(container.textContent).toContain('50%');
      expect(container.textContent).toContain('Setup PostgreSQL migrations');
      expect(container.textContent).toContain('Implement board reordering');
    });
  });
});
