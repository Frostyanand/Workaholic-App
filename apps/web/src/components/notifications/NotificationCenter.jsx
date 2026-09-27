import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  Clock,
  CheckCheck,
  X,
  Calendar,
  CheckSquare,
  AlertCircle,
} from 'lucide-react';
import {
  fetchNotifications,
  markNotificationRead,
  dismissNotification,
  markAllNotificationsRead,
} from '../../services/notifications.api.js';
import { snoozeReminder } from '../../services/reminders.api.js';

export function NotificationCenter({ isOpen, onClose, onUnreadCountChange }) {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'UNREAD' | 'REMINDER'
  const [loading, setLoading] = useState(false);
  const [snoozeOpenId, setSnoozeOpenId] = useState(null);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications({
        unreadOnly: filter === 'UNREAD',
        type: filter === 'REMINDER' ? 'REMINDER' : undefined,
      });
      setNotifications(data);
      const unreadCount = data.filter(n => !n.readAt && !n.dismissedAt).length;
      if (onUnreadCountChange) onUnreadCountChange(unreadCount);
    } catch {
      // Ignore load error in background
    } finally {
      setLoading(false);
    }
  }, [filter, onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  if (!isOpen) return null;

  const handleMarkRead = async (id, e) => {
    e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      if (onUnreadCountChange) {
        onUnreadCountChange(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleDismiss = async (id, e) => {
    e.stopPropagation();
    try {
      await dismissNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (onUnreadCountChange) {
        onUnreadCountChange(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, readAt: new Date().toISOString() })));
      if (onUnreadCountChange) onUnreadCountChange(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleSnooze = async (notification, minutes, e) => {
    e.stopPropagation();
    const reminderId = notification.targetReference?.entityId || notification.id;
    try {
      await snoozeReminder(reminderId, { durationMinutes: minutes });
      await handleDismiss(notification.id, e);
      setSnoozeOpenId(null);
    } catch (err) {
      console.error('Failed to snooze reminder:', err);
    }
  };

  const handleNotificationClick = notification => {
    if (!notification.readAt) {
      markNotificationRead(notification.id).catch(() => {});
    }

    const { entityType } = notification.targetReference || {};
    if (entityType === 'TASK') {
      navigate('/tasks');
    } else if (entityType === 'EVENT') {
      navigate('/calendar');
    }
    onClose();
  };

  const getNotificationIcon = type => {
    switch (type) {
      case 'REMINDER':
        return <Clock size={16} style={{ color: 'var(--color-primary)' }} />;
      case 'TASK_ASSIGNED':
        return <CheckSquare size={16} style={{ color: 'var(--color-success)' }} />;
      case 'CALENDAR_EVENT':
        return <Calendar size={16} style={{ color: 'var(--color-info)' }} />;
      default:
        return <AlertCircle size={16} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Notification Center"
      className="notification-center-dropdown"
      style={{
        position: 'absolute',
        top: 'calc(var(--topbar-height) + 8px)',
        right: '16px',
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '520px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-tertiary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={18} style={{ color: 'var(--text-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
            Notifications
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={handleMarkAllRead}
            title="Mark all as read"
            aria-label="Mark all as read"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CheckCheck size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          padding: '0 8px',
        }}
      >
        {['ALL', 'UNREAD', 'REMINDER'].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            style={{
              padding: '8px 12px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              borderBottom:
                filter === t ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: filter === t ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t.toLowerCase()}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div
        style={{
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Bell size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <p style={{ margin: 0, fontSize: '0.875rem' }}>No notifications to display</p>
          </div>
        ) : (
          notifications.map(n => {
            const isUnread = !n.readAt;
            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                role="button"
                tabIndex={0}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: isUnread ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ marginTop: '2px' }}>{getNotificationIcon(n.notificationType)}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: isUnread ? 600 : 500,
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {n.title}
                    </span>
                    {isUnread && (
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-primary)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>

                  <p
                    style={{
                      margin: '4px 0 0 0',
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {n.body}
                  </p>

                  {/* Actions Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '8px',
                    }}
                  >
                    {n.notificationType === 'REMINDER' && (
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setSnoozeOpenId(snoozeOpenId === n.id ? null : n.id);
                          }}
                          style={{
                            fontSize: '0.75rem',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          Snooze
                        </button>

                        {snoozeOpenId === n.id && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '24px',
                              left: 0,
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                              zIndex: 10,
                              display: 'flex',
                              flexDirection: 'column',
                              width: '100px',
                            }}
                          >
                            {[
                              { label: '15 min', min: 15 },
                              { label: '1 hour', min: 60 },
                              { label: 'Tomorrow', min: 1440 },
                            ].map(opt => (
                              <button
                                key={opt.min}
                                type="button"
                                onClick={e => handleSnooze(n, opt.min, e)}
                                style={{
                                  padding: '6px 8px',
                                  fontSize: '0.75rem',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--text-primary)',
                                  cursor: 'pointer',
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isUnread && (
                      <button
                        type="button"
                        onClick={e => handleMarkRead(n.id, e)}
                        title="Mark as read"
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          background: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <Check size={12} /> Read
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={e => handleDismiss(n.id, e)}
                      title="Dismiss"
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        marginLeft: 'auto',
                      }}
                    >
                      <X size={12} /> Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
