import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  Kanban,
  Calendar,
  GraduationCap,
  FileText,
} from 'lucide-react';

function Navigation() {
  const links = [
    { to: '/', label: 'Today', icon: LayoutDashboard },
    { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    { to: '/boards', label: 'Boards', icon: Kanban },
    { to: '/calendar', label: 'Calendar', icon: Calendar },
    { to: '/academic', label: 'Academic', icon: GraduationCap },
    { to: '/notes', label: 'Notes', icon: FileText },
  ];

  return (
    <nav
      style={{
        width: '240px',
        borderRight: '1px solid var(--border-subtle)',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      <div style={{ marginBottom: '24px', paddingLeft: '8px' }}>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Workaholic
        </h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Personal Productivity OS
        </p>
      </div>

      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
            transition: 'all var(--transition-fast)',
          })}
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function TodayView() {
  return (
    <div style={{ padding: '32px', maxWidth: '1000px', width: '100%' }}>
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Today Cockpit
          </h2>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '4px 10px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--accent-success)',
              fontWeight: 600,
            }}
          >
            Phase 0 Foundation Ready
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
          Your daily command center for scheduled work, deadlines, and academic priorities.
        </p>
      </header>

      <div
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>
          System Architecture Verified
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Pure JavaScript monorepo, Fastify REST backend, PostgreSQL authoritative store, and shared
          validation schemas are operational.
        </p>
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Focus Task</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Quick Capture</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Local First</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ flex: 1, backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<TodayView />} />
          <Route
            path="*"
            element={
              <div style={{ padding: '32px' }}>
                <h3>View under development</h3>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
