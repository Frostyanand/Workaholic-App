import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle,
  Clock,
  UserCheck,
  MessageSquare,
  Shield,
  FileEdit,
  FolderPlus,
  RefreshCw,
} from 'lucide-react';
import { listActivity } from '../../services/collaboration.api.js';

function getActivityIcon(activityType) {
  switch (activityType) {
    case 'TASK_CREATED':
      return FolderPlus;
    case 'TASK_ASSIGNED':
      return UserCheck;
    case 'TASK_STATUS_CHANGED':
      return CheckCircle;
    case 'COMMENT_ADDED':
      return MessageSquare;
    case 'RELATIONSHIP_CREATED':
    case 'PERMISSIONS_UPDATED':
      return Shield;
    default:
      return FileEdit;
  }
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Activity Feed Component.
 * Implements REQ-COLLAB-005, REQ-COLLAB-006, BR-COLLAB-005.
 */
export function ActivityFeed({ workspaceId, targetType, targetId, limit = 20 }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listActivity({ workspaceId, targetType, targetId, limit }, workspaceId);
      setActivities(items);
    } catch (err) {
      setError(err.message || 'Failed to load activity feed');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, targetType, targetId, limit]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        padding: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
          <h4
            style={{
              margin: 0,
              fontSize: '0.9rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Recent Activity
          </h4>
        </div>

        <button
          type="button"
          onClick={loadActivities}
          title="Refresh activity"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '10px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--color-danger, #ef4444)',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: '20px',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
          }}
        >
          Loading activity log...
        </div>
      ) : activities.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '24px',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
          }}
        >
          No recent activity found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activities.map(item => {
            const Icon = getActivityIcon(item.activityType);
            const actorName = item.actorDisplayName || item.actorEmail || 'Someone';

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8125rem',
                }}
              >
                <div
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--color-primary, #3b82f6)',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <Icon size={14} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>{actorName}</span>{' '}
                    <span>{item.activityType.replace(/_/g, ' ').toLowerCase()}</span>
                    {item.metadata?.targetTitle && (
                      <span style={{ fontStyle: 'italic' }}> "{item.metadata.targetTitle}"</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '2px',
                    }}
                  >
                    <Clock size={11} />
                    {formatRelativeTime(item.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
