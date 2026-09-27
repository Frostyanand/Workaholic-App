import { pool, withTransaction } from '../../../core/db.js';
import * as extMappingsRepo from '../external-mappings.repository.js';
import * as attachmentsRepo from '../../attachments/attachments.repository.js';
import * as tasksRepo from '../../tasks/tasks.repository.js';
import { oauthBoundaryService, GOOGLE_API_SCOPES } from '../../auth/oauth-boundary.service.js';
import * as integrationsRepo from '../../auth/integrations.repository.js';
import { defaultGoogleDriveAdapter } from './google-drive.adapter.js';
import { NotFoundError, ValidationError } from '../../../core/errors.js';
import { SYNC_STATE } from '@workaholic/shared';
import { syncCoordinator } from '../sync-coordinator.js';

/**
 * Google Drive Synchronization Service
 * Conforms to docs/8.SYNC-SPECIFICATION.md Section 61-63,
 * docs/19.INTEGRATION-SPECIFICATION.md Section 25-29,
 * and REQ-GDRIVE-001 through REQ-GDRIVE-006.
 */
export class GoogleDriveSyncService {
  constructor(adapter = defaultGoogleDriveAdapter) {
    this.adapter = adapter;
  }

  /**
   * Helper to retrieve valid decrypted OAuth credentials for Google Drive
   */
  async _getValidCredentials(userId, client = pool) {
    const integration = await integrationsRepo.findIntegration(userId, 'GOOGLE', client);
    if (!integration || integration.status === 'DISCONNECTED') {
      const err = new Error('Google Drive is not connected');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    if (integration.status === 'REAUTH_REQUIRED') {
      const err = new Error(
        'Google Drive authorization expired or revoked; reauthorization required',
      );
      err.code = 'REAUTH_REQUIRED';
      err.statusCode = 401;
      throw err;
    }

    const account = await integrationsRepo.findExternalAccount(integration.id, 'GOOGLE', client);
    if (!account) {
      const err = new Error('No external Google account found for integration');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    // Verify Drive scope is authorized
    const scopes = account.scopes || [];
    const driveScope = GOOGLE_API_SCOPES.DRIVE[0];
    const hasDriveScope = scopes.includes(driveScope);

    if (!hasDriveScope) {
      const err = new Error('Google Drive is not authorized. Please connect Google Drive.');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    const credentials = await oauthBoundaryService.getInternalCredentials(userId, client);
    if (!credentials?.accessToken) {
      const err = new Error('Unable to decrypt valid Google Drive credentials');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    return {
      integration,
      account,
      credentials,
      accessToken: credentials.accessToken,
    };
  }

  /**
   * Discovers or creates the dedicated Workaholic folder in Google Drive.
   * Conforms to REQ-GDRIVE-006.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {Object} [adapterOverride]
   * @returns {Promise<{ folderId: string, name: string }>}
   */
  async getOrCreateWorkaholicFolder(userId, workspaceId, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const { account, accessToken } = await this._getValidCredentials(userId);

    // 1. Check if folder mapping already exists in external_object_mappings
    const existingMappings = await extMappingsRepo.findMappingsByUser(userId, 'GOOGLE');
    const folderMapping = existingMappings.find(
      m => m.externalObjectType === 'FOLDER' && m.syncState !== 'DETACHED',
    );

    if (folderMapping) {
      // Verify folder still exists in Drive
      try {
        const driveFolder = await adapter.getFile(accessToken, folderMapping.externalObjectId);
        if (driveFolder && !driveFolder.trashed) {
          return {
            folderId: folderMapping.externalObjectId,
            name: driveFolder.name || 'Workaholic Attachments',
          };
        }
      } catch (err) {
        if (err.reauthRequired) throw err;
        // If file missing or error, proceed to create/find a new one
      }
      // If folder is missing or trashed, clean up stale mapping
      await extMappingsRepo.deleteMapping(folderMapping.id);
    }

    // 2. Discover or create folder via adapter
    const folder = await adapter.findOrCreateFolder(accessToken, 'Workaholic Attachments');

    // 3. Persist folder mapping idempotently
    await extMappingsRepo.upsertMapping({
      userId,
      workspaceId,
      provider: 'GOOGLE',
      externalAccountId: account.externalAccountId,
      externalContainerId: folder.id,
      externalObjectType: 'FOLDER',
      externalObjectId: folder.id,
      nativeObjectType: 'WORKSPACE',
      nativeObjectId: workspaceId,
      syncState: SYNC_STATE.SYNCED,
      metadata: {
        name: folder.name,
      },
    });

    return {
      folderId: folder.id,
      name: folder.name,
    };
  }

  /**
   * Uploads an attachment to Google Drive and creates the native attachment relationship.
   * Conforms to REQ-GDRIVE-002 and REQ-GDRIVE-003.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {Object} uploadData
   * @param {Object} [adapterOverride]
   */
  async uploadAttachment(userId, workspaceId, uploadData, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const { targetType, targetId, fileName, mimeType, content, sizeBytes, description } =
      uploadData;

    if (!fileName || !targetType || !targetId) {
      throw new ValidationError('fileName, targetType, and targetId are required');
    }

    // Verify target existence in workspace
    if (targetType === 'TASK') {
      const task = await tasksRepo.findTaskById(targetId, workspaceId);
      if (!task) {
        throw new NotFoundError(`Task ${targetId} not found in workspace`);
      }
    }

    // 1. Get credentials & dedicated folder
    const { account, accessToken } = await this._getValidCredentials(userId);
    const folder = await this.getOrCreateWorkaholicFolder(userId, workspaceId, adapter);

    // 2. Upload file to Google Drive
    const driveFile = await adapter.uploadFile(accessToken, {
      name: fileName,
      mimeType: mimeType || 'application/octet-stream',
      content,
      sizeBytes,
      parentFolderId: folder.folderId,
      description,
    });

    // 3. Persist external_files, attachments, and external_object_mappings atomically
    return withTransaction(async txClient => {
      // Upsert external_files record
      await attachmentsRepo.upsertExternalFile(
        {
          provider: 'GOOGLE',
          externalFileId: driveFile.id,
          externalAccountId: account.externalAccountId,
          name: driveFile.name,
          mimeType: driveFile.mimeType,
          sizeBytes: Number(driveFile.size || sizeBytes || 0),
          webUrl: driveFile.webViewLink,
        },
        txClient,
      );

      // Create native attachment record
      const attachment = await attachmentsRepo.createAttachment(
        {
          workspaceId,
          ownerUserId: userId,
          targetType,
          targetId,
          fileName: driveFile.name,
          mimeType: driveFile.mimeType,
          sizeBytes: Number(driveFile.size || sizeBytes || 0),
          sourceType: 'GOOGLE_DRIVE',
          externalFileId: driveFile.id,
          uploadStatus: 'COMPLETED',
          webUrl: driveFile.webViewLink,
        },
        txClient,
      );

      // Create external object mapping
      await extMappingsRepo.upsertMapping(
        {
          userId,
          workspaceId,
          provider: 'GOOGLE',
          externalAccountId: account.externalAccountId,
          externalContainerId: folder.folderId,
          externalObjectType: 'FILE',
          externalObjectId: driveFile.id,
          nativeObjectType: 'ATTACHMENT',
          nativeObjectId: attachment.id,
          syncState: SYNC_STATE.SYNCED,
          metadata: {
            webViewLink: driveFile.webViewLink,
            webContentLink: driveFile.webContentLink,
          },
        },
        txClient,
      );

      return attachment;
    });
  }

  /**
   * Detaches an attachment relationship from Workaholic without deleting the Google Drive file.
   * Conforms to REQ-GDRIVE-004 and docs/19 Section 26.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} attachmentId
   */
  async detachAttachment(userId, workspaceId, attachmentId) {
    const attachment = await attachmentsRepo.findAttachmentById(attachmentId, workspaceId);
    if (!attachment) {
      throw new NotFoundError(`Attachment ${attachmentId} not found`);
    }

    // Verify permission (owner or workspace membership)
    if (attachment.ownerUserId !== userId) {
      // Permitted if user is member of workspace; findAttachmentById already validated workspaceId
    }

    // 1. Soft-delete attachment relationship in Workaholic
    await attachmentsRepo.deleteAttachment(attachmentId, workspaceId);

    // 2. Mark mapping as DETACHED
    const mappings = await extMappingsRepo.findMappingsByUser(userId, 'GOOGLE');
    const mapping = mappings.find(
      m => m.nativeObjectType === 'ATTACHMENT' && m.nativeObjectId === attachmentId,
    );

    if (mapping) {
      await extMappingsRepo.updateMapping(mapping.id, { syncState: SYNC_STATE.DETACHED });
    }

    // CRITICAL: DO NOT call adapter.deleteFile! Google Drive file remains intact.
    return {
      detached: true,
      attachmentId,
      externalFileId: attachment.externalFileId,
      preservedExternalFile: true,
    };
  }

  /**
   * Explicitly deletes the underlying Google Drive file.
   * Conforms to REQ-GDRIVE-005 and docs/19 Section 27.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {Object} options
   * @param {string} [options.attachmentId]
   * @param {string} [options.externalFileId]
   * @param {Object} [adapterOverride]
   */
  async explicitDeleteDriveFile(userId, workspaceId, options, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const { attachmentId, externalFileId: providedFileId } = options;

    let targetFileId = providedFileId;

    if (attachmentId) {
      const attachment = await attachmentsRepo.findAttachmentById(attachmentId, workspaceId);
      if (attachment) {
        targetFileId = targetFileId || attachment.externalFileId;
        // Soft delete the native attachment
        await attachmentsRepo.deleteAttachment(attachmentId, workspaceId);
      }
    }

    if (!targetFileId) {
      throw new ValidationError(
        'attachmentId or externalFileId is required for Drive file deletion',
      );
    }

    // 1. Get credentials
    const { accessToken } = await this._getValidCredentials(userId);

    // 2. Call adapter to delete file from Google Drive
    const deleteResult = await adapter.deleteFile(accessToken, targetFileId);

    // 3. Mark or remove external mapping
    const mappings = await extMappingsRepo.findMappingsByUser(userId, 'GOOGLE');
    const mapping = mappings.find(
      m => m.externalObjectType === 'FILE' && m.externalObjectId === targetFileId,
    );

    if (mapping) {
      await extMappingsRepo.updateMapping(mapping.id, { syncState: SYNC_STATE.DELETED_EXTERNALLY });
    }

    return {
      deleted: true,
      externalFileId: targetFileId,
      notFound: Boolean(deleteResult?.notFound),
    };
  }

  /**
   * Synchronizes / reconciles an attachment's state with Google Drive.
   * Handles missing, moved, or externally deleted files.
   * Conforms to docs/8.SYNC-SPECIFICATION.md Section 62.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} attachmentId
   * @param {Object} [adapterOverride]
   */
  async syncAttachmentStatus(userId, workspaceId, attachmentId, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const attachment = await attachmentsRepo.findAttachmentById(attachmentId, workspaceId);
    if (!attachment) {
      throw new NotFoundError(`Attachment ${attachmentId} not found`);
    }

    if (!attachment.externalFileId) {
      return { attachment, status: 'NOT_EXTERNAL' };
    }

    const { accessToken } = await this._getValidCredentials(userId);

    return syncCoordinator.runWithHardening(
      {
        userId,
        workspaceId,
        service: 'DRIVE',
        targetId: attachmentId,
        direction: 'INCOMING',
        operationType: 'RECONCILE',
      },
      async () => {
        let driveFile = null;
        try {
          driveFile = await adapter.getFile(accessToken, attachment.externalFileId);
        } catch (err) {
          if (err.reauthRequired) throw err;
          if (err.status === 404 || err.statusCode === 404 || err.code === 'NOT_FOUND') {
            driveFile = null; // Triggers missing file branch
          } else {
            throw err;
          }
        }

        const mappings = await extMappingsRepo.findMappingsByUser(userId, 'GOOGLE');
        const mapping = mappings.find(
          m => m.nativeObjectType === 'ATTACHMENT' && m.nativeObjectId === attachmentId,
        );

        // File missing or trashed externally
        if (!driveFile || driveFile.trashed) {
          if (mapping) {
            await extMappingsRepo.updateMapping(mapping.id, {
              syncState: SYNC_STATE.DELETED_EXTERNALLY,
            });
          }
          await attachmentsRepo.updateAttachment(attachmentId, workspaceId, {
            uploadStatus: 'FAILED',
          });
          return {
            attachmentId,
            available: false,
            reason: 'FILE_UNAVAILABLE_OR_TRASHED',
            deleted: 1,
          };
        }

        // File moved between folders: update container mapping
        if (mapping && driveFile.parents && driveFile.parents.length > 0) {
          const primaryParent = driveFile.parents[0];
          if (mapping.externalContainerId !== primaryParent) {
            await extMappingsRepo.upsertMapping({
              ...mapping,
              externalContainerId: primaryParent,
              lastExternalModifiedAt: new Date(driveFile.modifiedTime || Date.now()),
              lastSyncedAt: new Date(),
            });
          }
        }

        return {
          attachmentId,
          available: true,
          driveFile,
          updated: 1,
        };
      },
    );
  }

  /**
   * Disconnects Google Drive integration without destroying native Workaholic attachments
   * or affecting Google Calendar or Google Tasks.
   * Conforms to REQ-GDRIVE-004 and scope lifecycle invariants.
   *
   * @param {string} userId
   */
  async disconnect(userId) {
    const integration = await integrationsRepo.findIntegration(userId, 'GOOGLE');
    if (!integration || integration.status === 'DISCONNECTED') {
      return { disconnected: true, preservedData: true };
    }

    const account = await integrationsRepo.findExternalAccount(integration.id, 'GOOGLE');
    if (!account) {
      return { disconnected: true, preservedData: true };
    }

    // 1. Mark Drive FILE and FOLDER mappings as DETACHED
    const sql = `
      UPDATE external_object_mappings
      SET sync_state = 'DETACHED', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND provider = 'GOOGLE' AND (native_object_type = 'ATTACHMENT' OR external_object_type IN ('FILE', 'FOLDER'));
    `;
    await pool.query(sql, [userId]);

    // 2. Filter DRIVE scope out of external account
    const remainingScopes = (account.scopes || []).filter(
      s => !GOOGLE_API_SCOPES.DRIVE.includes(s),
    );

    if (remainingScopes.length === 0) {
      // If no other scopes remain, fully disconnect integration record
      await oauthBoundaryService.disconnectGoogleIntegration(userId);
    } else {
      // Otherwise keep Calendar and/or Tasks active
      await integrationsRepo.upsertExternalAccount({
        integrationId: integration.id,
        provider: 'GOOGLE',
        externalAccountId: account.externalAccountId,
        displayName: account.displayName,
        scopes: remainingScopes,
        encryptedCredentials: account.encryptedCredentials,
      });
    }

    return {
      disconnected: true,
      preservedData: true,
    };
  }
}

export const googleDriveSyncService = new GoogleDriveSyncService();
