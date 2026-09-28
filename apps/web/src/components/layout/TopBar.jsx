import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Plus, Shield, Bell, Users } from 'lucide-react';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { NotificationCenter } from '../notifications/NotificationCenter.jsx';
import { fetchUnreadCount } from '../../services/notifications.api.js';
import { TrustedUsersModal } from '../collaboration/TrustedUsersModal.jsx';
import { ShareCodeModal } from '../collaboration/ShareCodeModal.jsx';

/**
 * Canonical Application Top Bar.
 * Conforms to docs/13.UX-SPECIFICATION.md Section 4, 9, 85.
 */
export function TopBar({ onToggleMobileNav, isMobileNavOpen, onOpenQuickTask }) {
  const location = useLocation();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isTrustedModalOpen, setIsTrustedModalOpen] = useState(false);
  const [isShareCodeModalOpen, setIsShareCodeModalOpen] = useState(false);

  useEffect(() => {
    fetchUnreadCount()
      .then(setUnreadCount)
      .catch(() => {});
  }, []);

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

      {/* Right: Workspace Indicator, Notification Bell & Quick Task Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Workspace Context Badge (UX-SPECIFICATION Section 85) */}
        <div className="workspace-badge-container">
          <Badge variant="muted" size="sm" icon={Shield}>
            Personal
          </Badge>
        </div>

        {/* Notification Bell Button */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setIsNotificationOpen(prev => !prev)}
            aria-label="Notifications"
            style={{
              background: 'none',
              border: 'none',
              color: isNotificationOpen ? 'var(--color-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  backgroundColor: 'var(--color-danger, #ef4444)',
                  color: '#fff',
                  borderRadius: '10px',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  minWidth: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationCenter
            isOpen={isNotificationOpen}
            onClose={() => setIsNotificationOpen(false)}
            onUnreadCountChange={setUnreadCount}
          />
        </div>

        {/* Trusted Contacts & Sharing Button (Phase 21) */}
        <button
          type="button"
          onClick={() => setIsTrustedModalOpen(true)}
          aria-label="Trusted Contacts & Sharing"
          title="Trusted Contacts & Sharing"
          style={{
            background: 'none',
            border: 'none',
            color: isTrustedModalOpen ? 'var(--color-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Users size={18} />
        </button>

        <TrustedUsersModal
          isOpen={isTrustedModalOpen}
          onClose={() => setIsTrustedModalOpen(false)}
          onOpenShareCodeModal={() => setIsShareCodeModalOpen(true)}
        />

        <ShareCodeModal
          isOpen={isShareCodeModalOpen}
          onClose={() => setIsShareCodeModalOpen(false)}
          onRelationshipEstablished={() => {
            // Refreshes trusted modal if open
          }}
        />

        {/* Quick Task Capture (UX-SPECIFICATION Section 9, UX-T11) */}
        <Button size="sm" variant="primary" icon={Plus} onClick={onOpenQuickTask}>
          Quick Task
        </Button>
      </div>
    </header>
  );
}
