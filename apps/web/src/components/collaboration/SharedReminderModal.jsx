import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Clock, CheckCircle2 } from 'lucide-react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import {
  listReminderRecipients,
  shareReminder,
  snoozeReminderRecipient,
  dismissReminderRecipient,
  listEligibleMembers,
} from '../../services/collaboration.api.js';

/**
 * Shared Reminder Multi-Recipient Delivery Modal.
 * Implements REQ-SREM-001, REQ-SREM-002, REQ-SREM-003, BR-SHARE-005.
 */
export function SharedReminderModal({ isOpen, onClose, reminderId, workspaceId }) {
  const [recipients, setRecipients] = useState([]);
  const [eligibleMembers, setEligibleMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recs, members] = await Promise.all([
        listReminderRecipients(reminderId),
        workspaceId ? listEligibleMembers(workspaceId) : Promise.resolve([]),
      ]);
      setRecipients(recs);
      setEligibleMembers(members);
    } catch (err) {
      setError(err.message || 'Failed to load recipients');
    } finally {
      setLoading(false);
    }
  }, [reminderId, workspaceId]);

  useEffect(() => {
    if (isOpen && reminderId) {
      loadData();
    }
  }, [isOpen, reminderId, loadData]);

  async function handleAddRecipient(e) {
    e.preventDefault();
    if (!selectedUserId) return;

    setAdding(true);
    setError(null);
    try {
      await shareReminder(reminderId, selectedUserId);
      setSelectedUserId('');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to share reminder');
    } finally {
      setAdding(false);
    }
  }

  async function handleSnooze(minutes = 15) {
    setActionInProgress(true);
    setError(null);
    try {
      await snoozeReminderRecipient(reminderId, minutes);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to snooze reminder');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleDismiss() {
    setActionInProgress(true);
    setError(null);
    try {
      await dismissReminderRecipient(reminderId);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to dismiss reminder');
    } finally {
      setActionInProgress(false);
    }
  }

  const existingUserIds = new Set(recipients.map(r => r.userId));
  const availableMembers = eligibleMembers.filter(m => !existingUserIds.has(m.userId));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Shared Reminder Recipients"
      titleId="shared-reminder-modal-title"
      maxWidth="520px"
    >
      <div>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            margin: '0 0 16px 0',
            lineHeight: 1.5,
          }}
        >
          Share this reminder with workspace members or trusted delegates. Each recipient can snooze
          or dismiss the reminder independently without affecting others.
        </p>

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

        {/* Add Recipient Form */}
        <form onSubmit={handleAddRecipient} style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Add Trusted Recipient
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              disabled={adding || availableMembers.length === 0}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="">
                {availableMembers.length === 0
                  ? 'No additional eligible contacts'
                  : 'Select contact...'}
              </option>
              {availableMembers.map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.userDisplayName || m.userEmail} ({m.role})
                </option>
              ))}
            </select>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              icon={UserPlus}
              loading={adding}
              disabled={!selectedUserId}
            >
              Add
            </Button>
          </div>
        </form>

        {/* Recipients List */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '8px',
            }}
          >
            Designated Recipients ({recipients.length})
          </div>

          {loading ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading recipients...
            </div>
          ) : recipients.length === 0 ? (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
              }}
            >
              No additional recipients added. Only the reminder creator will be notified.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recipients.map(r => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.825rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-primary, #3b82f6)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    >
                      {(r.displayName || r.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {r.displayName || r.email}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {r.snoozedUntil
                          ? `Snoozed until ${new Date(r.snoozedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : r.dismissedAt
                            ? `Dismissed at ${new Date(r.dismissedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Awaiting trigger'}
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant={
                      r.status === 'DISMISSED'
                        ? 'muted'
                        : r.status === 'SNOOZED'
                          ? 'warning'
                          : 'primary'
                    }
                    size="sm"
                  >
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Individual Response Controls */}
        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--bg-surface-elevated)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '8px',
            }}
          >
            Your Individual Response:
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={Clock}
              loading={actionInProgress}
              onClick={() => handleSnooze(15)}
            >
              Snooze 15m
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={CheckCircle2}
              loading={actionInProgress}
              onClick={handleDismiss}
            >
              Dismiss for Me
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
