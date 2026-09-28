import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  FolderGit2,
  Kanban,
  Calendar,
  GraduationCap,
  FileText,
  CalendarClock,
  Settings,
  Users,
  LogOut,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary.jsx';
import { ToastProvider, useToast } from '../common/ToastContext.jsx';
import { TopBar } from './TopBar.jsx';
import { CreateTaskModal } from '../tasks/CreateTaskModal.jsx';
import { createTask } from '../../services/tasks.api.js';

const navItems = [
  { to: '/', label: 'Today', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/projects', label: 'Projects', icon: FolderGit2 },
  { to: '/boards', label: 'Boards', icon: Kanban },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/academic', label: 'Academic', icon: GraduationCap },
  { to: '/notes', label: 'Notes', icon: FileText },
  { to: '/booking', label: 'Booking', icon: CalendarClock },
  { to: '/collaboration', label: 'Collaboration', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function AppLayoutContent() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isQuickTaskOpen, setIsQuickTaskOpen] = useState(false);
  const location = useLocation();
  const { toast } = useToast();

  // Close mobile drawer on route transition
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen]);

  async function handleCreateQuickTask(payload) {
    try {
      const created = await createTask(null, payload);
      toast.success('Task created successfully');
      // Dispatch global event so task views can refresh seamlessly
      window.dispatchEvent(new CustomEvent('workaholic:task-created', { detail: created }));
      setIsQuickTaskOpen(false);
    } catch (err) {
      toast.error(err.message || 'Failed to create task');
      throw err;
    }
  }

  const renderNavContent = (isMobile = false) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        padding: '20px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div>
        {/* Brand Header */}
        <div
          style={{
            marginBottom: '24px',
            paddingLeft: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
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
          {isMobile && (
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(false)}
              aria-label="Close navigation menu"
              style={{
                color: 'var(--text-muted)',
                padding: '6px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Nav Links */}
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
                minHeight: '40px',
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
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="skip-link"
        style={{
          position: 'absolute',
          top: '-40px',
          left: '16px',
          backgroundColor: 'var(--accent-primary)',
          color: '#ffffff',
          padding: '8px 16px',
          borderRadius: 'var(--radius-sm)',
          zIndex: 1200,
          fontWeight: 600,
          transition: 'top 0.2s',
        }}
        onClick={e => {
          e.preventDefault();
          const target = document.getElementById('main-content');
          if (target) {
            target.focus();
            target.scrollIntoView();
          }
        }}
        onFocus={e => (e.currentTarget.style.top = '16px')}
        onBlur={e => (e.currentTarget.style.top = '-40px')}
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar (hidden on mobile via CSS) */}
      <nav
        aria-label="Main Navigation"
        className="desktop-only"
        style={{
          width: 'var(--sidebar-width)',
          borderRight: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        {renderNavContent(false)}
      </nav>

      {/* Mobile Off-Canvas Drawer Backdrop & Container */}
      {isMobileNavOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          className="mobile-nav-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1050,
            display: 'flex',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setIsMobileNavOpen(false);
          }}
        >
          <nav
            style={{
              width: '280px',
              maxWidth: '85vw',
              backgroundColor: 'var(--bg-secondary)',
              height: '100%',
              boxShadow: 'var(--shadow-xl)',
              animation: 'drawerSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {renderNavContent(true)}
          </nav>
        </div>
      )}

      {/* Main View Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: '100vh',
        }}
      >
        {/* Canonical TopBar */}
        <TopBar
          onToggleMobileNav={() => setIsMobileNavOpen(prev => !prev)}
          isMobileNavOpen={isMobileNavOpen}
          onOpenQuickTask={() => setIsQuickTaskOpen(true)}
        />

        {/* Main Content with Error Boundary */}
        <main
          id="main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            outline: 'none',
          }}
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Quick Task Capture Modal (UX-T11, UX-SPECIFICATION Section 9) */}
      <CreateTaskModal
        isOpen={isQuickTaskOpen}
        onClose={() => setIsQuickTaskOpen(false)}
        onCreateTask={handleCreateQuickTask}
      />
    </div>
  );
}

export function AppLayout() {
  return (
    <ToastProvider>
      <AppLayoutContent />
    </ToastProvider>
  );
}
