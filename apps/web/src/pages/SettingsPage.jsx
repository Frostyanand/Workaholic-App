import React, { useState, useEffect, useCallback } from 'react';
import { Shield, User, Laptop, Plus, Trash2, LogOut, Save } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader.jsx';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { Modal } from '../components/common/Modal.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import {
  fetchWorkspaces,
  createWorkspace,
  fetchWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  fetchUserProfile,
  updateUserProfile,
  fetchActiveSessions,
  revokeSession,
  revokeAllSessions,
  fetchUserDevices,
} from '../services/workspaces.api.js';

export function SettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('workspaces'); // 'workspaces' | 'profile' | 'security'

  // Workspaces state
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsType, setNewWsType] = useState('TEAM');

  // Add Member state
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('MEMBER');
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Profile state
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security state
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await fetchWorkspaces();
      setWorkspaces(data);
      if (data.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(data[0]);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load workspaces');
    }
  }, [selectedWorkspace, toast]);

  const loadMembers = useCallback(
    async workspaceId => {
      try {
        const data = await fetchWorkspaceMembers(workspaceId);
        setMembers(data);
      } catch (err) {
        toast.error(err.message || 'Failed to load workspace members');
      }
    },
    [toast],
  );

  const loadProfile = useCallback(async () => {
    try {
      const data = await fetchUserProfile();
      if (data) {
        setProfile(data);
        setDisplayName(data.displayName || '');
        setTimezone(data.timezone || 'UTC');
      }
    } catch {
      // Profile can be populated lazily
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    try {
      const [sessData, devData] = await Promise.all([
        fetchActiveSessions().catch(() => []),
        fetchUserDevices().catch(() => []),
      ]);
      setSessions(sessData);
      setDevices(devData);
    } catch (err) {
      toast.error(err.message || 'Failed to load security details');
    }
  }, [toast]);

  // Load initial workspaces & profile
  useEffect(() => {
    loadWorkspaces();
    loadProfile();
  }, [loadWorkspaces, loadProfile]);

  // When selected workspace changes, load its members
  useEffect(() => {
    if (selectedWorkspace?.id) {
      loadMembers(selectedWorkspace.id);
    }
  }, [selectedWorkspace?.id, loadMembers]);

  // When switching to security tab, load sessions & devices
  useEffect(() => {
    if (activeTab === 'security') {
      loadSecurity();
    }
  }, [activeTab, loadSecurity]);

  async function handleCreateWorkspace(e) {
    e.preventDefault();
    if (!newWsName.trim()) return;

    try {
      const res = await createWorkspace({
        name: newWsName.trim(),
        workspaceType: newWsType,
      });
      toast.success('Workspace created successfully');
      setNewWsName('');
      setIsCreateModalOpen(false);
      await loadWorkspaces();
      if (res?.workspace) {
        setSelectedWorkspace(res.workspace);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to create workspace');
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!newMemberEmail.trim() || !selectedWorkspace) return;

    try {
      setIsAddingMember(true);
      await addWorkspaceMember(selectedWorkspace.id, {
        email: newMemberEmail.trim(),
        role: newMemberRole,
      });
      toast.success('Member added successfully');
      setNewMemberEmail('');
      loadMembers(selectedWorkspace.id);
    } catch (err) {
      toast.error(err.message || 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  }

  async function handleRoleChange(userId, newRole) {
    if (!selectedWorkspace) return;
    try {
      await updateWorkspaceMemberRole(selectedWorkspace.id, userId, newRole);
      toast.success('Role updated');
      loadMembers(selectedWorkspace.id);
    } catch (err) {
      toast.error(err.message || 'Failed to update member role');
    }
  }

  async function handleRemoveMember(userId, memberName) {
    if (!selectedWorkspace) return;
    if (!window.confirm(`Are you sure you want to remove ${memberName || 'this user'}?`)) return;

    try {
      await removeWorkspaceMember(selectedWorkspace.id, userId);
      toast.success('Member removed');
      loadMembers(selectedWorkspace.id);
    } catch (err) {
      toast.error(err.message || 'Failed to remove member');
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      await updateUserProfile({
        displayName: displayName.trim(),
        timezone,
      });
      toast.success('Profile saved successfully');
      loadProfile();
    } catch (err) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleRevokeSession(sessionId) {
    try {
      await revokeSession(sessionId);
      toast.success('Session revoked');
      loadSecurity();
    } catch (err) {
      toast.error(err.message || 'Failed to revoke session');
    }
  }

  async function handleRevokeAllSessions() {
    if (!window.confirm('Revoke all other active sessions across all devices?')) return;
    try {
      await revokeAllSessions();
      toast.success('All other sessions revoked');
      loadSecurity();
    } catch (err) {
      toast.error(err.message || 'Failed to revoke sessions');
    }
  }

  return (
    <div
      style={{
        padding: '24px 32px',
        maxWidth: '1100px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <PageHeader
        title="Settings & Workspaces"
        description="Manage your workspaces, team members, personal profile, and active security sessions."
        badge={<Badge variant="primary">Phase 4</Badge>}
      />

      {/* Tabs navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '24px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('workspaces')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom:
              activeTab === 'workspaces'
                ? '2px solid var(--color-primary)'
                : '2px solid transparent',
            background: 'none',
            color: activeTab === 'workspaces' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'workspaces' ? 600 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9375rem',
          }}
        >
          <Shield size={16} /> Workspaces & Members
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom:
              activeTab === 'profile' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'profile' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'profile' ? 600 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9375rem',
          }}
        >
          <User size={16} /> Profile & Preferences
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom:
              activeTab === 'security' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'security' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'security' ? 600 : 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9375rem',
          }}
        >
          <Laptop size={16} /> Security & Sessions
        </button>
      </div>

      {/* Tab 1: Workspaces & Members */}
      {activeTab === 'workspaces' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label
                htmlFor="workspace-select"
                style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                Active Workspace:
              </label>
              <select
                id="workspace-select"
                value={selectedWorkspace?.id || ''}
                onChange={e => {
                  const ws = workspaces.find(w => w.id === e.target.value);
                  if (ws) setSelectedWorkspace(ws);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.workspaceType})
                  </option>
                ))}
              </select>
            </div>

            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() => setIsCreateModalOpen(true)}
            >
              New Workspace
            </Button>
          </div>

          {selectedWorkspace && (
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '24px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    {selectedWorkspace.name}
                  </h2>
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-muted)',
                      margin: '4px 0 0 0',
                    }}
                  >
                    Type: {selectedWorkspace.workspaceType} | ID: {selectedWorkspace.id}
                  </p>
                </div>
                <Badge variant="primary">{selectedWorkspace.membership?.role || 'MEMBER'}</Badge>
              </div>

              {/* Members section */}
              <div style={{ marginTop: '24px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '14px',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    Team Members ({members.length})
                  </h3>
                </div>

                {/* Add member form */}
                <form
                  onSubmit={handleAddMember}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                    padding: '14px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <input
                    type="email"
                    placeholder="Enter member's email address..."
                    value={newMemberEmail}
                    onChange={e => setNewMemberEmail(e.target.value)}
                    required
                    style={{
                      flex: 1,
                      minWidth: '220px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                    }}
                  />
                  <select
                    value={newMemberRole}
                    onChange={e => setNewMemberRole(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <Button size="sm" variant="primary" type="submit" disabled={isAddingMember}>
                    {isAddingMember ? 'Adding...' : 'Add Member'}
                  </Button>
                </form>

                {/* Members list table */}
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          textAlign: 'left',
                        }}
                      >
                        <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>User</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Role</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Status</th>
                        <th
                          style={{
                            padding: '10px 12px',
                            color: 'var(--text-muted)',
                            textAlign: 'right',
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                              {m.displayName || 'User'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {m.email}
                            </div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            {m.role === 'OWNER' ? (
                              <Badge variant="primary">OWNER</Badge>
                            ) : (
                              <select
                                value={m.role}
                                onChange={e => handleRoleChange(m.userId, e.target.value)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--border-subtle)',
                                  backgroundColor: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.8125rem',
                                }}
                              >
                                <option value="ADMIN">ADMIN</option>
                                <option value="MEMBER">MEMBER</option>
                                <option value="VIEWER">VIEWER</option>
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <Badge variant={m.status === 'ACTIVE' ? 'success' : 'muted'}>
                              {m.status}
                            </Badge>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {m.role !== 'OWNER' && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveMember(m.userId, m.displayName || m.email)
                                }
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  color: 'var(--color-danger, #ef4444)',
                                  cursor: 'pointer',
                                  padding: '6px',
                                  borderRadius: 'var(--radius-sm)',
                                }}
                                title="Remove member"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Profile & Preferences */}
      {activeTab === 'profile' && (
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            maxWidth: '650px',
          }}
        >
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '16px',
            }}
          >
            Personal Profile
          </h2>

          <form
            onSubmit={handleSaveProfile}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Email Address
              </label>
              <input
                type="text"
                value={profile?.email || ''}
                disabled
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                  display: 'block',
                }}
              >
                Primary identity managed via Firebase Authentication
              </span>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Timezone
              </label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              >
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="America/New_York">America/New_York (Eastern Time)</option>
                <option value="America/Chicago">America/Chicago (Central Time)</option>
                <option value="America/Denver">America/Denver (Mountain Time)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              </select>
            </div>

            <div style={{ marginTop: '8px' }}>
              <Button type="submit" variant="primary" icon={Save} disabled={isSavingProfile}>
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Security & Sessions */}
      {activeTab === 'security' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Active Sessions
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Devices and browsers currently authenticated to your account.
              </p>
            </div>

            <Button size="sm" variant="secondary" icon={LogOut} onClick={handleRevokeAllSessions}>
              Revoke All Other Sessions
            </Button>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              marginBottom: '24px',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    textAlign: 'left',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <th style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                    Session / Device
                  </th>
                  <th style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>Type</th>
                  <th style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>Created</th>
                  <th
                    style={{ padding: '10px 14px', color: 'var(--text-muted)', textAlign: 'right' }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}
                    >
                      No active sessions found.
                    </td>
                  </tr>
                ) : (
                  sessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Laptop size={16} color="var(--text-secondary)" />
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            {s.isCurrent
                              ? 'Current Browser Session'
                              : `Session ${s.id.slice(0, 8)}...`}
                          </span>
                          {s.isCurrent && <Badge variant="success">Current</Badge>}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {s.sessionType}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          color: 'var(--text-muted)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {!s.isCurrent && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRevokeSession(s.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Registered Devices */}
          {devices.length > 0 && (
            <div>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '12px',
                }}
              >
                Known Devices ({devices.length})
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '14px',
                }}
              >
                {devices.map(d => (
                  <div
                    key={d.id}
                    style={{
                      padding: '14px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '6px',
                      }}
                    >
                      <Laptop size={16} color="var(--text-secondary)" />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {d.deviceName || 'Device'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Platform: {d.platform} | Trust: {d.trustState || 'UNTRUSTED'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Workspace Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Workspace"
      >
        <form
          onSubmit={handleCreateWorkspace}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Workspace Name
            </label>
            <input
              type="text"
              placeholder="e.g. Design Team, Academic Lab, Personal"
              value={newWsName}
              onChange={e => setNewWsName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Workspace Type
            </label>
            <select
              value={newWsType}
              onChange={e => setNewWsType(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            >
              <option value="TEAM">TEAM (Multiple collaborators)</option>
              <option value="PERSONAL">PERSONAL (Solo productivity)</option>
            </select>
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}
          >
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create Workspace
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
