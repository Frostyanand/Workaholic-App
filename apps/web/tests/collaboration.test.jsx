// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { CommentSection } from '../src/components/collaboration/CommentSection.jsx';
import { ShareCodeModal } from '../src/components/collaboration/ShareCodeModal.jsx';
import { TrustedUsersModal } from '../src/components/collaboration/TrustedUsersModal.jsx';
import { SharedReminderModal } from '../src/components/collaboration/SharedReminderModal.jsx';
import * as collabApi from '../src/services/collaboration.api.js';

global.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input, val) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  nativeSetter.call(input, val);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setTextareaValue(textarea, val) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  ).set;
  nativeSetter.call(textarea, val);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Collaboration & Trusted Sharing Web Components (Phase 21)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------
  // CommentSection Tests
  // ----------------------------------------------------
  describe('CommentSection Component', () => {
    const sampleComments = [
      {
        id: 'c-1',
        workspaceId: 'ws-1',
        authorUserId: 'u-1',
        authorDisplayName: 'Alice Architect',
        authorEmail: 'alice@example.com',
        targetType: 'TASK',
        targetId: 't-100',
        content: 'Hey @Bob_Builder please review this design block!',
        createdAt: new Date().toISOString(),
      },
    ];

    it('renders comment thread with author, relative time, and highlighted mentions', async () => {
      vi.spyOn(collabApi, 'listComments').mockResolvedValue(sampleComments);
      vi.spyOn(collabApi, 'listEligibleMembers').mockResolvedValue([
        {
          userId: 'u-2',
          userDisplayName: 'Bob Builder',
          userEmail: 'bob@example.com',
          role: 'MEMBER',
        },
      ]);

      await act(async () => {
        root.render(
          <MemoryRouter>
            <CommentSection targetType="TASK" targetId="t-100" workspaceId="ws-1" />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Activity & Comments');
      expect(container.textContent).toContain('Alice Architect');
      expect(container.textContent).toContain('@Bob_Builder');
    });

    it('submits a new comment and appends to the thread', async () => {
      vi.spyOn(collabApi, 'listComments').mockResolvedValue([]);
      vi.spyOn(collabApi, 'listEligibleMembers').mockResolvedValue([]);
      const newComment = {
        id: 'c-2',
        workspaceId: 'ws-1',
        authorUserId: 'u-1',
        authorDisplayName: 'Alice',
        targetType: 'TASK',
        targetId: 't-100',
        content: 'Work block scheduled for tomorrow morning.',
        createdAt: new Date().toISOString(),
      };
      const createSpy = vi.spyOn(collabApi, 'createComment').mockResolvedValue(newComment);

      await act(async () => {
        root.render(
          <MemoryRouter>
            <CommentSection targetType="TASK" targetId="t-100" workspaceId="ws-1" />
          </MemoryRouter>,
        );
      });

      const textarea = container.querySelector('textarea');
      expect(textarea).toBeTruthy();

      await act(async () => {
        setTextareaValue(textarea, 'Work block scheduled for tomorrow morning.');
      });

      const submitButton = container.querySelector('button[type="submit"]');
      expect(submitButton).toBeTruthy();

      await act(async () => {
        submitButton.click();
      });

      expect(createSpy).toHaveBeenCalledWith(
        {
          targetType: 'TASK',
          targetId: 't-100',
          content: 'Work block scheduled for tomorrow morning.',
        },
        'ws-1',
      );
      expect(container.textContent).toContain('Work block scheduled for tomorrow morning.');
    });

    it('deletes comment when delete button is clicked', async () => {
      vi.spyOn(collabApi, 'listComments').mockResolvedValue(sampleComments);
      vi.spyOn(collabApi, 'listEligibleMembers').mockResolvedValue([]);
      const deleteSpy = vi.spyOn(collabApi, 'deleteComment').mockResolvedValue({ success: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <CommentSection targetType="TASK" targetId="t-100" workspaceId="ws-1" />
          </MemoryRouter>,
        );
      });

      const deleteBtn = container.querySelector('button[title="Delete comment"]');
      expect(deleteBtn).toBeTruthy();

      await act(async () => {
        deleteBtn.click();
      });

      expect(deleteSpy).toHaveBeenCalledWith('c-1');
    });
  });

  // ----------------------------------------------------
  // ShareCodeModal Tests
  // ----------------------------------------------------
  describe('ShareCodeModal Component', () => {
    it('generates a new share code and displays code box', async () => {
      vi.spyOn(collabApi, 'listShareCodes').mockResolvedValue([]);
      const createCodeSpy = vi.spyOn(collabApi, 'createShareCode').mockResolvedValue({
        code: 'WORK-SECRET-ABCD-1234',
        id: 'sc-1',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ShareCodeModal isOpen={true} onClose={() => {}} />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Trusted Sharing & Onboarding');
      expect(container.textContent).toContain('Generate Single-Use Code');

      const generateBtn = container.querySelector('button[type="submit"]');
      await act(async () => {
        generateBtn.click();
      });

      expect(createCodeSpy).toHaveBeenCalled();
      expect(container.textContent).toContain('WORK-SECRET-ABCD-1234');
      expect(container.textContent).toContain('Copy');
    });

    it('redeems share code and displays success confirmation', async () => {
      vi.spyOn(collabApi, 'listShareCodes').mockResolvedValue([]);
      const redeemSpy = vi.spyOn(collabApi, 'redeemShareCode').mockResolvedValue({
        id: 'rel-1',
        ownerUserId: 'u-owner',
        ownerName: 'Dr. Jane Doe',
        status: 'ACTIVE',
      });
      const onEstablished = vi.fn();

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ShareCodeModal
              isOpen={true}
              onClose={() => {}}
              onRelationshipEstablished={onEstablished}
            />
          </MemoryRouter>,
        );
      });

      // Switch to redeem tab
      const redeemTabBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Redeem an Invite Code'),
      );
      expect(redeemTabBtn).toBeTruthy();

      await act(async () => {
        redeemTabBtn.click();
      });

      const codeInput = container.querySelector('input[placeholder="e.g. WORK-XXXX-XXXX-XXXX"]');
      expect(codeInput).toBeTruthy();

      await act(async () => {
        setInputValue(codeInput, 'WORK-VALID-CODE-1234');
      });

      const redeemSubmit = container.querySelector('button[type="submit"]');
      await act(async () => {
        redeemSubmit.click();
      });

      expect(redeemSpy).toHaveBeenCalledWith('WORK-VALID-CODE-1234');
      expect(onEstablished).toHaveBeenCalled();
      expect(container.textContent).toContain(
        'Successfully linked! You now have a trusted relationship with Dr. Jane Doe.',
      );
    });
  });

  // ----------------------------------------------------
  // TrustedUsersModal Tests
  // ----------------------------------------------------
  describe('TrustedUsersModal Component', () => {
    const sampleRelationships = [
      {
        id: 'rel-10',
        ownerUserId: 'u-me',
        trustedUserId: 'u-assistant',
        trustedName: 'Bob Assistant',
        trustedEmail: 'bob@assistant.org',
        status: 'ACTIVE',
        isOwner: true,
        permissions: ['trusted.calendar.view', 'trusted.tasks.view'],
      },
    ];

    it('renders relationships and granular permissions matrix', async () => {
      vi.spyOn(collabApi, 'listRelationships').mockResolvedValue(sampleRelationships);

      await act(async () => {
        root.render(
          <MemoryRouter>
            <TrustedUsersModal isOpen={true} onClose={() => {}} />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Trusted Collaborators & Delegation');
      expect(container.textContent).toContain('Bob Assistant');
      expect(container.textContent).toContain('bob@assistant.org');
      expect(container.textContent).toContain('View Calendar');
      expect(container.textContent).toContain('Receive Reminders');
      expect(container.textContent).toContain('View Tasks');
    });

    it('toggles granular permissions when checkbox clicked', async () => {
      vi.spyOn(collabApi, 'listRelationships').mockResolvedValue(sampleRelationships);
      const updatePermsSpy = vi.spyOn(collabApi, 'updatePermissions').mockResolvedValue({
        id: 'rel-10',
        permissions: ['trusted.calendar.view', 'trusted.tasks.view', 'trusted.reminders.receive'],
      });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <TrustedUsersModal isOpen={true} onClose={() => {}} />
          </MemoryRouter>,
        );
      });

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      // The second checkbox corresponds to 'Receive Reminders'
      const receiveRemindersCb = checkboxes[1];
      expect(receiveRemindersCb).toBeTruthy();
      expect(receiveRemindersCb.checked).toBe(false);

      await act(async () => {
        receiveRemindersCb.click();
      });

      expect(updatePermsSpy).toHaveBeenCalledWith(
        'rel-10',
        expect.arrayContaining(['trusted.reminders.receive']),
      );
    });
  });

  // ----------------------------------------------------
  // SharedReminderModal Tests
  // ----------------------------------------------------
  describe('SharedReminderModal Component', () => {
    const sampleRecipients = [
      {
        id: 'rec-1',
        userId: 'u-2',
        displayName: 'Bob Builder',
        email: 'bob@example.com',
        status: 'PENDING',
        snoozedUntil: null,
        dismissedAt: null,
      },
    ];

    it('renders recipients and triggers independent snooze and dismiss', async () => {
      vi.spyOn(collabApi, 'listReminderRecipients').mockResolvedValue(sampleRecipients);
      vi.spyOn(collabApi, 'listEligibleMembers').mockResolvedValue([]);
      const snoozeSpy = vi
        .spyOn(collabApi, 'snoozeReminderRecipient')
        .mockResolvedValue({ success: true });
      const dismissSpy = vi
        .spyOn(collabApi, 'dismissReminderRecipient')
        .mockResolvedValue({ success: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <SharedReminderModal
              isOpen={true}
              onClose={() => {}}
              reminderId="rem-99"
              workspaceId="ws-1"
            />
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Shared Reminder Recipients');
      expect(container.textContent).toContain('Bob Builder');
      expect(container.textContent).toContain('PENDING');

      // Click Snooze
      const snoozeBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Snooze 15m'),
      );
      expect(snoozeBtn).toBeTruthy();

      await act(async () => {
        snoozeBtn.click();
      });
      expect(snoozeSpy).toHaveBeenCalledWith('rem-99', 15);

      // Click Dismiss
      const dismissBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Dismiss for Me'),
      );
      expect(dismissBtn).toBeTruthy();

      await act(async () => {
        dismissBtn.click();
      });
      expect(dismissSpy).toHaveBeenCalledWith('rem-99');
    });
  });
});
