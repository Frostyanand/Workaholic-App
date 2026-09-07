import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  FolderGit2,
  Kanban,
  Calendar,
  GraduationCap,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary.jsx';

const navItems = [
  { to: '/', label: 'Today', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/projects', label: 'Projects', icon: FolderGit2 },
  { to: '/boards', label: 'Boards', icon: Kanban },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/academic', label: 'Academic', icon: GraduationCap },
  { to: '/notes', label: 'Notes', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          top: '-40px',
          left: '16px',
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--bg-primary)',
          padding: '8px 16px',
          borderRadius: 'var(--radius-sm)',
          zIndex: 100,
          fontWeight: 600,
          transition: 'top 0.2s',
        }}
        onFocus={e => (e.currentTarget.style.top = '16px')}
        onBlur={e => (e.currentTarget.style.top = '-40px')}
      >
        Skip to main content
      </a>

      {/* Primary Navigation Sidebar */}
      <nav
        aria-label="Primary Navigation"
        style={{
          width: '240px',
          borderRight: '1px solid var(--border-subtle)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ marginBottom: '28px', paddingLeft: '8px' }}>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Workaholic
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Personal Productivity OS
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map(({ to, label, icon: Icon }) => (
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
                  textDecoration: 'none',
                  transition: 'all var(--transition-fast)',
                })}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        {/* User Account / Session Footer */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '16px',
            paddingLeft: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-surface-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--accent-primary)',
              }}
            >
              W
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Personal
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Local First</div>
            </div>
          </div>
          <NavLink
            to="/login"
            title="Switch Session"
            aria-label="Switch Session"
            style={{
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <LogOut size={16} />
          </NavLink>
        </div>
      </nav>

      {/* Main View Area with Error Boundary */}
      <main
        id="main-content"
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
