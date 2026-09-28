import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { AuthLayout } from './components/layout/AuthLayout.jsx';
import { TodayPage } from './pages/TodayPage.jsx';
import { TasksPage } from './pages/TasksPage.jsx';
import { ProjectsPage } from './pages/ProjectsPage.jsx';
import { ProjectDetailPage } from './pages/ProjectDetailPage.jsx';
import { BoardsPage } from './pages/BoardsPage.jsx';
import { BoardDetailPage } from './pages/BoardDetailPage.jsx';
import { CalendarPage } from './pages/CalendarPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { OnboardingPage } from './pages/OnboardingPage.jsx';
import { NotesPage } from './pages/NotesPage.jsx';
import { AcademicPage } from './pages/AcademicPage.jsx';
import { PublicCalendarPage } from './pages/PublicCalendarPage.jsx';
import { BookingPage } from './pages/BookingPage.jsx';
import { PublicBookingPage } from './pages/PublicBookingPage.jsx';
import { PublicBookingManagePage } from './pages/PublicBookingManagePage.jsx';
import { CollaborationPage } from './pages/CollaborationPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Authenticated Application Shell */}
        <Route path="/" element={<AppLayout />}>
          <Route index element={<TodayPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="boards" element={<BoardsPage />} />
          <Route path="boards/:id" element={<BoardDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="academic" element={<AcademicPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="booking" element={<BookingPage />} />
          <Route path="collaboration" element={<CollaborationPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* Catch-all 404 inside layout */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Unauthenticated / Onboarding Application Shells */}
        <Route path="/login" element={<AuthLayout />}>
          <Route index element={<LoginPage />} />
        </Route>
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Public Unauthenticated Calendar Shell */}
        <Route path="/public/calendar/:token" element={<PublicCalendarPage />} />
        <Route path="/p/:token" element={<PublicCalendarPage />} />

        {/* Public Unauthenticated Booking Shell */}
        <Route path="/book/:slug" element={<PublicBookingPage />} />
        <Route path="/booking-pages/:slug" element={<PublicBookingPage />} />
        <Route path="/book/manage/:token" element={<PublicBookingManagePage />} />
        <Route path="/public/bookings/:token" element={<PublicBookingManagePage />} />
      </Routes>
    </ErrorBoundary>
  );
}
