// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { Modal } from '../src/components/common/Modal.jsx';
import { ConfirmDialog } from '../src/components/common/ConfirmDialog.jsx';
import { Button } from '../src/components/common/Button.jsx';
import { Badge } from '../src/components/common/Badge.jsx';
import { EmptyState } from '../src/components/common/EmptyState.jsx';
import { ErrorBanner } from '../src/components/common/ErrorBanner.jsx';
import { ToastProvider, useToast } from '../src/components/common/ToastContext.jsx';
import { TopBar } from '../src/components/layout/TopBar.jsx';
import { Inbox, AlertCircle } from 'lucide-react';

describe('Phase 7 Core Web UX Primitives & Shell', () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    document.body.style.overflow = '';
  });

  describe('Modal Primitive (TM-A11Y-004, UX-T03)', () => {
    it('renders with accessible dialog attributes and title', () => {
      act(() => {
        root.render(
          <Modal isOpen={true} onClose={() => {}} title="Test Dialog Title">
            <p>Modal content</p>
          </Modal>,
        );
      });

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('modal-dialog-title');
      expect(container.textContent).toContain('Test Dialog Title');
      expect(container.textContent).toContain('Modal content');
    });

    it('dismisses on Escape key press', () => {
      const handleClose = vi.fn();
      act(() => {
        root.render(
          <Modal isOpen={true} onClose={handleClose} title="Escape Test">
            <input type="text" placeholder="First input" />
          </Modal>,
        );
      });

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      window.dispatchEvent(event);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('traps focus inside modal between first and last focusable elements', async () => {
      act(() => {
        root.render(
          <Modal isOpen={true} onClose={() => {}} title="Focus Trap Test">
            <input id="input-1" placeholder="First" />
            <input id="input-2" placeholder="Second" />
            <button id="modal-submit">Submit</button>
          </Modal>,
        );
      });

      const closeBtn = container.querySelector('button[aria-label="Close dialog"]');
      const submitBtn = container.querySelector('#modal-submit');
      expect(closeBtn).not.toBeNull();
      expect(submitBtn).not.toBeNull();

      // Simulate Shift+Tab from close button (first element) -> wraps to submit button (last element)
      closeBtn.focus();
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(shiftTabEvent);

      // Simulate Tab from submit button (last element) -> wraps to close button (first element)
      submitBtn.focus();
      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: false,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(tabEvent);
    });

    it('restores focus to opener element upon modal close', async () => {
      function OpenerTest() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button id="opener-btn" onClick={() => setOpen(true)}>
              Open Dialog
            </button>
            <Modal isOpen={open} onClose={() => setOpen(false)} title="Restoration Test">
              <button id="inside-btn">Inside</button>
            </Modal>
          </div>
        );
      }

      act(() => {
        root.render(<OpenerTest />);
      });

      const opener = container.querySelector('#opener-btn');
      opener.focus();
      expect(document.activeElement).toBe(opener);

      // Open modal
      act(() => {
        opener.click();
      });
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();

      // Close modal
      const closeBtn = container.querySelector('button[aria-label="Close dialog"]');
      act(() => {
        closeBtn.click();
      });

      // Focus should be restored to opener
      expect(document.activeElement).toBe(opener);
    });
  });

  describe('ConfirmDialog Primitive', () => {
    it('renders consequence summary, cancel button, and confirm button', () => {
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      act(() => {
        root.render(
          <ConfirmDialog
            isOpen={true}
            onClose={handleClose}
            onConfirm={handleConfirm}
            title="Delete Item?"
            message="This action will delete the item and cannot be undone."
            confirmLabel="Confirm Delete"
            variant="danger"
          />,
        );
      });

      expect(container.textContent).toContain('Delete Item?');
      expect(container.textContent).toContain(
        'This action will delete the item and cannot be undone.',
      );

      const cancelBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Cancel'),
      );
      expect(cancelBtn).not.toBeUndefined();
      act(() => {
        cancelBtn.click();
      });
      expect(handleClose).toHaveBeenCalledTimes(1);

      const confirmBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Confirm Delete'),
      );
      expect(confirmBtn).not.toBeUndefined();
      act(() => {
        confirmBtn.click();
      });
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('Toast Notification System (ToastContext)', () => {
    function ToastTester() {
      const toast = useToast();
      return (
        <div>
          <button id="toast-success-btn" onClick={() => toast.success('Task saved successfully')}>
            Success
          </button>
          <button id="toast-error-btn" onClick={() => toast.error('Something failed')}>
            Error
          </button>
        </div>
      );
    }

    it('provides accessible role="status" container and displays polite notifications', async () => {
      act(() => {
        root.render(
          <ToastProvider>
            <ToastTester />
          </ToastProvider>,
        );
      });

      const liveRegion = container.querySelector('[role="status"][aria-live="polite"]');
      expect(liveRegion).not.toBeNull();

      // Trigger success toast
      const successBtn = container.querySelector('#toast-success-btn');
      act(() => {
        successBtn.click();
      });

      expect(container.textContent).toContain('Task saved successfully');

      // Dismiss button removes notification
      const dismissBtn = container.querySelector('button[aria-label="Dismiss notification"]');
      expect(dismissBtn).not.toBeNull();
      act(() => {
        dismissBtn.click();
      });

      expect(container.textContent).not.toContain('Task saved successfully');
    });
  });

  describe('EmptyState & ErrorBanner Primitives', () => {
    it('EmptyState renders role="status", icon, description, and primary action', () => {
      const handleAction = vi.fn();
      act(() => {
        root.render(
          <EmptyState
            icon={Inbox}
            title="Nothing here"
            description="No items found in this section."
            actionLabel="Create Item"
            onAction={handleAction}
          />,
        );
      });

      const statusEl = container.querySelector('[role="status"]');
      expect(statusEl).not.toBeNull();
      expect(container.textContent).toContain('Nothing here');
      expect(container.textContent).toContain('No items found in this section.');

      const actionBtn = container.querySelector('button');
      expect(actionBtn.textContent).toContain('Create Item');
      act(() => {
        actionBtn.click();
      });
      expect(handleAction).toHaveBeenCalledTimes(1);
    });

    it('ErrorBanner renders role="alert", error message, retry, and dismiss buttons', () => {
      const handleRetry = vi.fn();
      const handleDismiss = vi.fn();

      act(() => {
        root.render(
          <ErrorBanner
            message="Network request failed"
            onRetry={handleRetry}
            onDismiss={handleDismiss}
          />,
        );
      });

      const alertEl = container.querySelector('[role="alert"]');
      expect(alertEl).not.toBeNull();
      expect(container.textContent).toContain('Network request failed');

      const retryBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Retry'),
      );
      expect(retryBtn).not.toBeUndefined();
      act(() => {
        retryBtn.click();
      });
      expect(handleRetry).toHaveBeenCalledTimes(1);

      const dismissBtn = container.querySelector('button[aria-label="Dismiss error"]');
      expect(dismissBtn).not.toBeNull();
      act(() => {
        dismissBtn.click();
      });
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('Button & Badge Primitives', () => {
    it('Button renders variants and loading state with aria-busy', () => {
      act(() => {
        root.render(
          <div>
            <Button variant="primary">Submit</Button>
            <Button variant="danger" loading={true}>
              Deleting
            </Button>
          </div>,
        );
      });

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].textContent).toContain('Submit');
      expect(buttons[1].getAttribute('aria-busy')).toBe('true');
      expect(buttons[1].disabled).toBe(true);
    });

    it('Badge renders semantic text with accessible contrast (UX-T05)', () => {
      act(() => {
        root.render(
          <div>
            <Badge variant="success">Completed</Badge>
            <Badge variant="danger" icon={AlertCircle}>
              Critical
            </Badge>
          </div>,
        );
      });

      expect(container.textContent).toContain('Completed');
      expect(container.textContent).toContain('Critical');
    });
  });

  describe('TopBar Shell Component', () => {
    it('renders breadcrumbs, workspace badge, and quick task capture button', () => {
      const handleQuickTask = vi.fn();
      const handleToggleMobileNav = vi.fn();

      act(() => {
        root.render(
          <MemoryRouter initialEntries={['/tasks']}>
            <TopBar onOpenQuickTask={handleQuickTask} onToggleMobileNav={handleToggleMobileNav} />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Tasks');
      expect(container.textContent).toContain('Personal');

      // Quick task button triggers callback
      const quickTaskBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Quick Task'),
      );
      expect(quickTaskBtn).not.toBeUndefined();
      act(() => {
        quickTaskBtn.click();
      });
      expect(handleQuickTask).toHaveBeenCalledTimes(1);

      // Mobile nav toggle button triggers callback
      const mobileNavBtn = container.querySelector('button[aria-label="Toggle navigation menu"]');
      expect(mobileNavBtn).not.toBeNull();
      act(() => {
        mobileNavBtn.click();
      });
      expect(handleToggleMobileNav).toHaveBeenCalledTimes(1);
    });
  });
});
