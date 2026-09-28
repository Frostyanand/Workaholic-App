import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  Calendar,
  Bell,
  CheckSquare,
  Edit,
  Eye,
  Trash2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import {
  listRelationships,
  updatePermissions,
  revokeRelationship,
} from '../../services/collaboration.api.js';

const ALL_PERMISSIONS = [
  {
    key: 'trusted.calendar.view',
    label: 'View Calendar',
    desc: 'Can view your calendar events and schedule',
    icon: Calendar,
  },
  {
    key: 'trusted.reminders.receive',
    label: 'Receive Reminders',
    desc: 'Can be designated as a recipient on shared reminders',
    icon: Bell,
  },
  {
    key: 'trusted.tasks.view',
    label: 'View Tasks',
    desc: 'Can view tasks and projects shared with them',
    icon: CheckSquare,
  },
  {
    key: 'trusted.tasks.edit',
    label: 'Edit Tasks',
    desc: 'Can update task status, details, and mark tasks complete',
    icon: Edit,
  },
  {
    key: 'trusted.availability.view',
    label: 'View Availability',
    desc: 'Can view free/busy booking slots and availability status',
    icon: Eye,
  },
];

/**
 * Manage trusted relationships and granular permissions.
 * Implements REQ-SHARE-003, REQ-SHARE-004, REQ-SHARE-005, BR-SHARE-004, BR-SHARE-005.
 */
export function TrustedUsersModal({ isOpen, onClose, onOpenShareCodeModal }) {
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadRelationships();
    }
  }, [isOpen]);

  async function loadRelationships() {
    setLoading(true);
    setError(null);
    try {
      const items = await listRelationships();
      setRelationships(items);
    } catch (err) {
      setError(err.message || 'Failed to load trusted contacts');
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePermission(rel, permKey) {
    if (!rel.isOwner) return; // Only owner can modify permissions
    const currentPerms = rel.permissions || [];
    const newPerms = currentPerms.includes(permKey)
      ? currentPerms.filter(p => p !== permKey)
      : [...currentPerms, permKey];

    setSavingId(rel.id);
    try {
      await updatePermissions(rel.id, newPerms);
      setRelationships(prev =>
        prev.map(r => (r.id === rel.id ? { ...r, permissions: newPerms } : r)),
      );
    } catch (err) {
      setError(err.message || 'Failed to update permissions');
    } finally {
      setSavingId(null);
    }
  }

  async function handleRevoke(relId) {
    if (!window.confirm('Are you sure you want to revoke this trusted relationship?')) {
      return;
    }
    try {
      await revokeRelationship(relId);
      await loadRelationships();
    } catch (err) {
      setError(err.message || 'Failed to revoke relationship');
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Trusted Collaborators & Delegation"
      titleId="trusted-users-modal-title"
      maxWidth="680px"
    >
      <div>
        {/* Header action bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Manage delegates and contacts with access to your calendar, tasks, and reminders.
          </p>

          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={() => {
              if (onOpenShareCodeModal) {
                onOpenShareCodeModal();
              }
            }}
          >
            Invite Collaborator
          </Button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: '14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--color-danger, #ef4444)',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '30px',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
            }}
          >
            <RefreshCw size={20} className="spin" style={{ marginBottom: '8px' }} />
            <div>Loading trusted contacts...</div>
          </div>
        ) : relationships.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '36px 20px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-subtle)',
            }}
          >
            <Users size={32} style={{ color: 'var(--text-muted)', marginBottom: '10px' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              No Trusted Contacts Yet
            </div>
            <p
              style={{
                fontSize: '0.825rem',
                color: 'var(--text-muted)',
                maxWidth: '380px',
                margin: '0 auto 16px auto',
              }}
            >
              Collaborate securely with colleagues, assistants, or team members by generating a
              single-use onboarding code.
            </p>
            <Button
              size="sm"
              variant="primary"
              icon={Plus}
              onClick={() => {
                if (onOpenShareCodeModal) onOpenShareCodeModal();
              }}
            >
              Generate Invite Code
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {relationships.map(rel => {
              const displayName = rel.isOwner ? rel.trustedName : rel.ownerName;
              const displayEmail = rel.isOwner ? rel.trustedEmail : rel.ownerEmail;
              const roleDesc = rel.isOwner
                ? 'Delegated to Collaborator'
                : 'Owner (Delegated to you)';
              const isRevoked = rel.status === 'REVOKED';

              return (
                <div
                  key={rel.id}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px',
                    opacity: isRevoked ? 0.6 : 1,
                  }}
                >
                  {/* Top row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: isRevoked
                            ? 'var(--text-muted)'
                            : 'var(--color-primary, #3b82f6)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                        }}
                      >
                        {(displayName || displayEmail || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {displayName || displayEmail}
                          </span>
                          <Badge variant={isRevoked ? 'danger' : 'success'} size="sm">
                            {rel.status}
                          </Badge>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {displayEmail} • {roleDesc}
                        </div>
                      </div>
                    </div>

                    {!isRevoked && (
                      <Button
                        size="xs"
                        variant="danger"
                        icon={Trash2}
                        onClick={() => handleRevoke(rel.id)}
                      >
                        Revoke Trust
                      </Button>
                    )}
                  </div>

                  {/* Granular Permissions Matrix */}
                  <div
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Shield size={13} />
                      Granular Delegated Permissions:
                      {!rel.isOwner && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                          (Controlled by owner)
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '8px',
                      }}
                    >
                      {ALL_PERMISSIONS.map(perm => {
                        const Icon = perm.icon;
                        const isGranted = (rel.permissions || []).includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                              padding: '6px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: isGranted
                                ? 'rgba(59, 130, 246, 0.08)'
                                : 'transparent',
                              cursor: rel.isOwner && !isRevoked ? 'pointer' : 'default',
                              fontSize: '0.78rem',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isGranted}
                              disabled={!rel.isOwner || isRevoked || savingId === rel.id}
                              onChange={() => handleTogglePermission(rel, perm.key)}
                              style={{ marginTop: '2px' }}
                            />
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontWeight: 500,
                                  color: isGranted ? 'var(--text-primary)' : 'var(--text-muted)',
                                }}
                              >
                                <Icon size={12} />
                                {perm.label}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {perm.desc}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
