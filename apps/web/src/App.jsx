import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { AuthLayout } from './components/layout/AuthLayout.jsx';
import { TodayPage } from './pages/TodayPage.jsx';
import { TasksPage } from './pages/TasksPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Authenticated Application Shell */}
        <Route path="/" element={<AppLayout />}>
          <Route index element={<TodayPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route
            path="boards"
            element={
              <PlaceholderPage
                title="Projects & Boards"
                phase="Phase 6"
                description="Kanban boards, customizable columns, and visual project workflows."
              />
            }
          />
          <Route
            path="calendar"
            element={
              <PlaceholderPage
                title="Unified Calendar"
                phase="Phase 8"
                description="Multi-view scheduling, time-blocking, and two-way Google Calendar synchronization."
              />
            }
          />
          <Route
            path="academic"
            element={
              <PlaceholderPage
                title="Academic Scheduling"
                phase="Phase 18"
                description="Semester calendars, timetable management, and automated Day Order holiday shifts."
              />
            }
          />
          <Route
            path="notes"
            element={
              <PlaceholderPage
                title="Notes & Knowledge"
                phase="Phase 17"
                description="Linked knowledge base, checklists, and contextual references."
              />
            }
          />
          <Route
            path="settings"
            element={
              <PlaceholderPage
                title="Settings & Workspaces"
                phase="Phase 4"
                description="Workspace members, access control, profile, and integration settings."
              />
            }
          />
          {/* Catch-all 404 inside layout */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Unauthenticated Application Shell */}
        <Route path="/login" element={<AuthLayout />}>
          <Route index element={<LoginPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
