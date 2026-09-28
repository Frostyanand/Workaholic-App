import React, { useState, useEffect } from 'react';
import { KeyRound, Copy, Check, Trash2, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import {
  createShareCode,
  listShareCodes,
  revokeShareCode,
  redeemShareCode,
} from '../../services/collaboration.api.js';

/**
 * Modal to generate, manage, and redeem onboarding share codes.
 * Conforms to REQ-SHARE-001, REQ-SHARE-002, BR-SHARE-001, BR-SHARE-002, BR-SHARE-003.
 */
export function ShareCodeModal({ isOpen, onClose, onRelationshipEstablished }) {
  const [activeTab, setActiveTab] = useState('generate'); // 'generate' | 'redeem'
  const [shareCodes, setShareCodes] = useState([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [codeLabel, setCodeLabel] = useState('');
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadCodes();
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  async function loadCodes() {
    setLoadingCodes(true);
    try {
      const items = await listShareCodes();
      setShareCodes(items);
    } catch {
      // Non-blocking
    } finally {
      setLoadingCodes(false);
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await createShareCode({
        expiresInDays: Number(expiresInDays) || 7,
        metadata: codeLabel.trim() ? { label: codeLabel.trim() } : {},
      });
      setGeneratedCode(res.code);
      setCodeLabel('');
      await loadCodes();
    } catch (err) {
      setError(err.message || 'Failed to generate share code');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  async function handleRevoke(id) {
    try {
      await revokeShareCode(id);
      setShareCodes(prev => prev.filter(c => c.id !== id));
      if (generatedCode) {
        // If the revoked one was just generated, clear it
        setGeneratedCode(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to revoke code');
    }
  }

  async function handleRedeem(e) {
    e.preventDefault();
    const cleanCode = redeemInput.trim();
    if (!cleanCode) return;

    setRedeeming(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const relationship = await redeemShareCode(cleanCode);
      setSuccessMessage(
        `Successfully linked! You now have a trusted relationship with ${relationship.ownerName || 'the workspace owner'}.`,
      );
      setRedeemInput('');
      if (onRelationshipEstablished) {
        onRelationshipEstablished(relationship);
      }
    } catch (err) {
      setError(err.message || 'Failed to redeem share code');
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Trusted Sharing & Onboarding"
      titleId="share-code-modal-title"
      maxWidth="560px"
    >
      <div>
        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '18px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('generate');
              setError(null);
            }}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === 'generate' ? '2px solid var(--color-primary, #3b82f6)' : 'none',
              color: activeTab === 'generate' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Invite Trusted Collaborator
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('redeem');
              setError(null);
            }}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === 'redeem' ? '2px solid var(--color-primary, #3b82f6)' : 'none',
              color: activeTab === 'redeem' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Redeem an Invite Code
          </button>
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

        {successMessage && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: '14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              color: 'var(--color-success, #22c55e)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <ShieldCheck size={18} />
            {successMessage}
          </div>
        )}

        {activeTab === 'generate' ? (
          <div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: '0 0 16px 0',
              }}
            >
              Generate a single-use onboarding code to establish a trusted relationship with an
              assistant, colleague, or delegate.
            </p>

            {/* Code Generator Form */}
            <form onSubmit={handleGenerate} style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <div style={{ flex: 2 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Note / Recipient Label (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bob Executive Assistant"
                    value={codeLabel}
                    onChange={e => setCodeLabel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Expires In
                  </label>
                  <select
                    value={expiresInDays}
                    onChange={e => setExpiresInDays(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="1">1 Day</option>
                    <option value="3">3 Days</option>
                    <option value="7">7 Days</option>
                    <option value="14">14 Days</option>
                    <option value="30">30 Days</option>
                  </select>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                icon={KeyRound}
                loading={generating}
                style={{ width: '100%' }}
              >
                Generate Single-Use Code
              </Button>
            </form>

            {/* Generated Code Reveal Box */}
            {generatedCode && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--color-primary, #3b82f6)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <ShieldCheck size={16} style={{ color: 'var(--color-primary)' }} />
                  Your One-Time Share Code:
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--color-primary, #3b82f6)',
                      letterSpacing: '0.05em',
                      flex: 1,
                      wordBreak: 'break-all',
                    }}
                  >
                    {generatedCode}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={copied ? 'success' : 'secondary'}
                    icon={copied ? Check : Copy}
                    onClick={handleCopy}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    margin: '8px 0 0 0',
                  }}
                >
                  ⚠️ This code is only displayed once and will expire after use. Send it to your
                  trusted contact.
                </p>
              </div>
            )}

            {/* Active Codes List */}
            <div style={{ marginTop: '16px' }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                }}
              >
                Active Onboarding Codes
              </div>
              {loadingCodes ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading...</div>
              ) : shareCodes.length === 0 ? (
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  No active share codes.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shareCodes.map(code => (
                    <div
                      key={code.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {code.metadata?.label || 'Single-Use Share Code'}
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
                          <Clock size={12} />
                          Expires: {new Date(code.expiresAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevoke(code.id)}
                        title="Revoke code"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-danger, #ef4444)',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Redeem Code Tab */
          <div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: '0 0 16px 0',
              }}
            >
              Enter the onboarding code provided to you by a Workaholic workspace owner to establish
              a trusted connection.
            </p>

            <form onSubmit={handleRedeem}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '6px',
                  }}
                >
                  Share Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. WORK-XXXX-XXXX-XXXX"
                  value={redeemInput}
                  onChange={e => setRedeemInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                icon={ArrowRight}
                loading={redeeming}
                disabled={!redeemInput.trim()}
                style={{ width: '100%' }}
              >
                Redeem Code & Establish Trust
              </Button>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}
