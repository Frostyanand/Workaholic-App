import React, { useState } from 'react';
import { Users, Shield, KeyRound, Plus, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader.jsx';
import { Button } from '../components/common/Button.jsx';
import { TrustedUsersModal } from '../components/collaboration/TrustedUsersModal.jsx';
import { ShareCodeModal } from '../components/collaboration/ShareCodeModal.jsx';
import { ActivityFeed } from '../components/collaboration/ActivityFeed.jsx';

/**
 * Collaboration & Trusted Sharing Management Page.
 * Conforms to REQ-SHARE-001..006, REQ-COLLAB-001..006.
 */
export function CollaborationPage() {
  const [isTrustedModalOpen, setIsTrustedModalOpen] = useState(false);
  const [isShareCodeModalOpen, setIsShareCodeModalOpen] = useState(false);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Trusted Sharing & Collaboration"
        subtitle="Manage delegates, access permissions, onboarding share codes, and workspace activity."
        actions={
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              variant="secondary"
              icon={KeyRound}
              onClick={() => setIsShareCodeModalOpen(true)}
            >
              Share Codes
            </Button>
            <Button variant="primary" icon={Users} onClick={() => setIsTrustedModalOpen(true)}>
              Trusted Contacts
            </Button>
          </div>
        }
      />

      {/* Grid of quick cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
          marginBottom: '28px',
        }}
      >
        {/* Card 1: Trusted Contacts & Permissions */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  color: 'var(--color-primary, #3b82f6)',
                }}
              >
                <Shield size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Trusted Contacts & Delegates
              </h3>
            </div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: '0 0 16px 0',
              }}
            >
              Grant granular access to your calendar, tasks, availability, and shared reminders.
              Revoke trust at any moment.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={ArrowRight}
            onClick={() => setIsTrustedModalOpen(true)}
          >
            Manage Permissions
          </Button>
        </div>

        {/* Card 2: Onboarding Share Codes */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: 'var(--color-success, #10b981)',
                }}
              >
                <KeyRound size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Onboarding Share Codes
              </h3>
            </div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: '0 0 16px 0',
              }}
            >
              Generate single-use hashed invite codes to onboard assistants or colleagues, or redeem
              an invite code you received.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={() => setIsShareCodeModalOpen(true)}
          >
            Generate / Redeem Code
          </Button>
        </div>
      </div>

      {/* Activity Timeline */}
      <div>
        <h3
          style={{
            fontSize: '1.05rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '12px',
          }}
        >
          Workspace Collaboration Timeline
        </h3>
        <ActivityFeed limit={25} />
      </div>

      {/* Modals */}
      <TrustedUsersModal
        isOpen={isTrustedModalOpen}
        onClose={() => setIsTrustedModalOpen(false)}
        onOpenShareCodeModal={() => setIsShareCodeModalOpen(true)}
      />

      <ShareCodeModal
        isOpen={isShareCodeModalOpen}
        onClose={() => setIsShareCodeModalOpen(false)}
      />
    </div>
  );
}
