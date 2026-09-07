import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Plus, Shield } from 'lucide-react';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';

/**
 * Canonical Application Top Bar.
 * Conforms to docs/13.UX-SPECIFICATION.md Section 4, 9, 85.
 */
export function TopBar({ onToggleMobileNav, isMobileNavOpen, onOpenQuickTask }) {
  const location = useLocation();

  function getBreadcrumb() {
    const path = location.pathname;
    if (path === '/') return 'Today';
    if (path.startsWith('/tasks')) return 'Tasks';
    if (path.startsWith('/projects/')) return 'Projects / Details';
    if (path.startsWith('/projects')) return 'Projects';
    if (path.startsWith('/boards/')) return 'Boards / Kanban';
    if (path.startsWith('/boards')) return 'Boards';
    if (path.startsWith('/calendar')) return 'Calendar';
    if (path.startsWith('/academic')) return 'Academic';
    if (path.startsWith('/notes')) return 'Notes';
    if (path.startsWith('/settings')) return 'Settings';
    return 'Workaholic';
  }

  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Mobile Menu Toggle & Title / Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileNavOpen}
          className="mobile-nav-toggle"
          style={{
            color: 'var(--text-secondary)',
            padding: '8px',
            borderRadius: 'var(--radius-sm)',
            display: 'none', // Shown via CSS media query
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <span
          style={{
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          {getBreadcrumb()}
        </span>
      </div>

      {/* Right: Workspace Indicator & Quick Task Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Workspace Context Badge (UX-SPECIFICATION Section 85) */}
        <div className="workspace-badge-container">
          <Badge variant="muted" size="sm" icon={Shield}>
            Personal
          </Badge>
        </div>

        {/* Quick Task Capture (UX-SPECIFICATION Section 9, UX-T11) */}
        <Button size="sm" variant="primary" icon={Plus} onClick={onOpenQuickTask}>
          Quick Task
        </Button>
      </div>
    </header>
  );
}
