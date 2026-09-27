// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { GoogleDriveModal } from '../src/components/attachments/GoogleDriveModal.jsx';
import { TaskAttachments } from '../src/components/attachments/TaskAttachments.jsx';
import * as integrationsApi from '../src/services/integrations.api.js';
import * as attachmentsApi from '../src/services/attachments.api.js';

describe('Google Drive Web Components (Phase 15)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // -------------------------------------------------------------
  // GoogleDriveModal
  // -------------------------------------------------------------
  describe('GoogleDriveModal', () => {
    it('renders nothing when isOpen is false', async () => {
      await act(async () => {
        root.render(<GoogleDriveModal isOpen={false} onClose={vi.fn()} workspaceId="ws_123" />);
      });

      expect(container.innerHTML).toBe('');
    });

    it('renders disconnected state with connect button when not connected', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: false,
        status: 'DISCONNECTED',
        scopes: [],
      });

      await act(async () => {
        root.render(<GoogleDriveModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
      });

      expect(container.textContent).toContain('Google Drive Integration');
      expect(container.textContent).toContain('Connect Google Drive');
      expect(container.textContent).toContain('Workaholic Attachments');
    });

    it('renders connected state with account info and folder setup', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
        accountDisplayName: 'drive_user@example.com',
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      vi.spyOn(integrationsApi, 'getOrCreateGoogleDriveFolder').mockResolvedValue({
        folderId: 'mock_folder_123',
        name: 'Workaholic Attachments',
      });

      await act(async () => {
        root.render(<GoogleDriveModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
      });

      expect(container.textContent).toContain('Connected');
      expect(container.textContent).toContain('drive_user@example.com');
      expect(container.textContent).toContain('Workaholic Attachments');
      expect(container.textContent).toContain('Disconnect');
    });

    it('handles disconnect with confirmation dialog', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
        accountDisplayName: 'drive_user@example.com',
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      const disconnectSpy = vi.spyOn(integrationsApi, 'disconnectGoogleDrive').mockResolvedValue({
        disconnected: true,
      });

      await act(async () => {
        root.render(<GoogleDriveModal isOpen={true} onClose={vi.fn()} workspaceId="ws_123" />);
      });

      // Find and click Disconnect
      const disconnectBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Disconnect'),
      );
      expect(disconnectBtn).toBeDefined();

      await act(async () => {
        disconnectBtn.click();
      });

      // Verify confirmation warning mentions preserving native attachments and other services
      expect(container.textContent).toContain(
        'Native task attachments and external Drive files will remain preserved',
      );

      // Click Confirm Disconnect
      const confirmBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Confirm Disconnect'),
      );
      expect(confirmBtn).toBeDefined();

      await act(async () => {
        confirmBtn.click();
      });

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // TaskAttachments
  // -------------------------------------------------------------
  describe('TaskAttachments', () => {
    it('shows empty state when task has no attachments', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
      });
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([]);

      await act(async () => {
        root.render(<TaskAttachments taskId="task_123" workspaceId="ws_123" />);
      });

      expect(container.textContent).toContain('No files attached yet');
      expect(container.textContent).toContain('Attach File');
    });

    it('renders existing attachments with metadata and links', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
      });
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([
        {
          id: 'att_1',
          fileName: 'architecture_diagram.png',
          sizeBytes: 1024 * 50,
          uploadStatus: 'COMPLETED',
          webUrl: 'https://drive.google.com/file/d/drive_file_1/view',
          sourceType: 'GOOGLE_DRIVE',
          createdAt: new Date().toISOString(),
        },
      ]);

      await act(async () => {
        root.render(<TaskAttachments taskId="task_123" workspaceId="ws_123" />);
      });

      expect(container.textContent).toContain('architecture_diagram.png');
      expect(container.textContent).toContain('50 KB');
      const viewLink = container.querySelector(
        'a[href="https://drive.google.com/file/d/drive_file_1/view"]',
      );
      expect(viewLink).not.toBeNull();
    });

    it('detaches attachment without deleting Drive file upon confirmation (REQ-GDRIVE-004)', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
      });
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([
        {
          id: 'att_1',
          fileName: 'notes.pdf',
          sizeBytes: 2048,
          uploadStatus: 'COMPLETED',
          webUrl: 'https://drive.google.com/file/d/drive_file_notes/view',
          sourceType: 'GOOGLE_DRIVE',
        },
      ]);
      const detachSpy = vi.spyOn(attachmentsApi, 'detachAttachment').mockResolvedValue({
        detached: true,
        preservedExternalFile: true,
      });

      await act(async () => {
        root.render(<TaskAttachments taskId="task_123" workspaceId="ws_123" />);
      });

      // Find Detach button
      const detachBtn = container.querySelector('button[title*="Detach from task"]');
      expect(detachBtn).toBeDefined();

      await act(async () => {
        detachBtn.click();
      });

      // Detach modal confirmation should appear
      expect(container.textContent).toContain('Detach Attachment');
      expect(container.textContent).toContain(
        'The file will remain safely intact in your Google Drive',
      );

      // Click Confirm Detach (in dialog, it says "Detach")
      const dialogButtons = container.querySelectorAll('div[role="dialog"] button');
      const confirmDetachBtn = Array.from(dialogButtons).find(
        b => b.textContent.trim() === 'Detach',
      );
      expect(confirmDetachBtn).toBeDefined();

      await act(async () => {
        confirmDetachBtn.click();
      });

      expect(detachSpy).toHaveBeenCalledWith('ws_123', 'att_1');
    });

    it('explicitly deletes Google Drive file upon confirmation (REQ-GDRIVE-005)', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
      });
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([
        {
          id: 'att_2',
          fileName: 'scratch_data.csv',
          sizeBytes: 4096,
          uploadStatus: 'COMPLETED',
          webUrl: 'https://drive.google.com/file/d/drive_file_scratch/view',
          sourceType: 'GOOGLE_DRIVE',
        },
      ]);
      const deleteSpy = vi
        .spyOn(attachmentsApi, 'deleteAttachmentWithDriveFile')
        .mockResolvedValue({
          deleted: true,
          deletedDriveFile: true,
        });

      await act(async () => {
        root.render(<TaskAttachments taskId="task_123" workspaceId="ws_123" />);
      });

      // Find Delete button
      const deleteBtn = container.querySelector('button[title*="Delete from Google Drive"]');
      expect(deleteBtn).toBeDefined();

      await act(async () => {
        deleteBtn.click();
      });

      // Delete modal confirmation should appear
      expect(container.textContent).toContain('Delete from Google Drive');
      expect(container.textContent).toContain('permanently delete');
      expect(container.textContent).toContain('This is a destructive operation');

      // Click Confirm Delete
      const confirmDeleteBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Delete from Drive'),
      );
      expect(confirmDeleteBtn).toBeDefined();

      await act(async () => {
        confirmDeleteBtn.click();
      });

      expect(deleteSpy).toHaveBeenCalledWith('ws_123', 'att_2');
    });

    it('shows connect prompt when Google Drive is disconnected', async () => {
      vi.spyOn(integrationsApi, 'fetchGoogleDriveStatus').mockResolvedValue({
        connected: false,
        status: 'DISCONNECTED',
      });
      vi.spyOn(attachmentsApi, 'fetchAttachments').mockResolvedValue([]);

      await act(async () => {
        root.render(<TaskAttachments taskId="task_123" workspaceId="ws_123" />);
      });

      expect(container.textContent).toContain('Google Drive not connected');
    });
  });
});
