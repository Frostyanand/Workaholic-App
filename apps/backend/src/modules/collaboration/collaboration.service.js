import crypto from 'node:crypto';
import { withTransaction, pool } from '../../core/db.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../../core/errors.js';
import * as collabRepo from './collaboration.repository.js';
import * as workspacesRepo from '../workspaces/workspaces.repository.js';
import * as tasksRepo from '../tasks/tasks.repository.js';
import * as projectsRepo from '../projects/projects.repository.js';
import * as notesRepo from '../notes/notes.repository.js';
import * as remindersRepo from '../reminders/reminders.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import {
  NOTIFICATION_TYPE,
  TRUSTED_PERMISSION,
  ACTIVITY_TYPE,
  COLLAB_TARGET_TYPE,
} from '@workaholic/shared';

export class CollaborationService {
  constructor(repo = collabRepo) {
    this.repo = repo;
  }

  // ==========================================
  // 1. Share Codes (Onboarding)
  // ==========================================

  /**
   * Generates a secure, temporary, single-use share code for onboarding a trusted contact.
   */
  async createShareCode(ownerUserId, options = {}, client = pool) {
    if (!ownerUserId) throw new TypeError('ownerUserId is required');

    const expiresInMinutes = options.expiresInMinutes || 60;
    const defaultPermissions = options.defaultPermissions || [
      TRUSTED_PERMISSION.VIEW_CALENDAR,
      TRUSTED_PERMISSION.RECEIVE_REMINDERS,
      TRUSTED_PERMISSION.VIEW_TASKS,
    ];

    // High entropy 8-character uppercase code with WORK- prefix: e.g. WORK-8F2B1C9D
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const code = `WORK-${randomHex}`;
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

    const record = await this.repo.createShareCode(
      {
        ownerUserId,
        codeHash,
        expiresAt,
        metadata: {
          defaultPermissions,
        },
      },
      client,
    );

    return {
      id: record.id,
      code, // Raw code returned once to the owner for transmission
      ownerUserId,
      expiresAt,
      defaultPermissions,
      createdAt: record.createdAt,
    };
  }

  /**
   * Redeems a share code, establishing an authenticated trusted relationship.
   */
  async redeemShareCode(trustedUserId, rawCode, client = pool) {
    if (!trustedUserId) throw new TypeError('trustedUserId is required');
    if (!rawCode) throw new ValidationError('Share code is required');

    const normalizedCode = rawCode.trim().toUpperCase();
    const codeHash = crypto.createHash('sha256').update(normalizedCode).digest('hex');

    const shareCode = await this.repo.findShareCodeByHash(codeHash, client);
    if (!shareCode) {
      throw new ValidationError('Invalid or expired share code');
    }

    if (shareCode.usedAt) {
      throw new ConflictError('Share code has already been redeemed');
    }

    if (shareCode.revokedAt) {
      throw new ValidationError('Share code has been revoked by owner');
    }

    if (new Date(shareCode.expiresAt) < new Date()) {
      throw new ValidationError('Share code has expired');
    }

    if (shareCode.ownerUserId === trustedUserId) {
      throw new ValidationError('A user cannot redeem their own share code');
    }

    const permissions = shareCode.metadata?.defaultPermissions || [
      TRUSTED_PERMISSION.VIEW_CALENDAR,
      TRUSTED_PERMISSION.RECEIVE_REMINDERS,
      TRUSTED_PERMISSION.VIEW_TASKS,
    ];

    return withTransaction(async txClient => {
      // 1. Mark code used
      const marked = await this.repo.markShareCodeUsed(shareCode.id, txClient);
      if (!marked) {
        throw new ConflictError('Share code was redeemed concurrently');
      }

      // 2. Establish trusted relationship
      const relationship = await this.repo.createTrustedRelationship(
        shareCode.ownerUserId,
        trustedUserId,
        permissions,
        txClient,
      );

      // 3. Notify owner
      try {
        await notificationsService.sendNotification(
          {
            recipientUserId: shareCode.ownerUserId,
            notificationType: NOTIFICATION_TYPE.COLLABORATION,
            title: 'New Trusted Contact Added',
            body: 'A user successfully redeemed your share code and established a trusted connection.',
            targetReference: {
              relationshipId: relationship.id,
              trustedUserId,
            },
          },
          txClient,
        );
      } catch {
        // Notification hook failure should not abort transaction
      }

      return relationship;
    }, client);
  }

  async listShareCodes(ownerUserId, client = pool) {
    return this.repo.listShareCodesByOwner(ownerUserId, client);
  }

  async revokeShareCode(id, ownerUserId, client = pool) {
    const revoked = await this.repo.revokeShareCode(id, ownerUserId, client);
    if (!revoked) {
      throw new NotFoundError('Share code not found or already revoked');
    }
    return { revoked: true };
  }

  // ==========================================
  // 2. Trusted Relationships & Permissions
  // ==========================================

  async listRelationships(userId, client = pool) {
    return this.repo.listTrustedRelationshipsForUser(userId, client);
  }

  async getRelationship(id, userId, client = pool) {
    const relationship = await this.repo.findTrustedRelationshipById(id, client);
    if (!relationship) {
      throw new NotFoundError('Trusted relationship not found');
    }
    if (relationship.ownerUserId !== userId && relationship.trustedUserId !== userId) {
      throw new ForbiddenError('You do not have access to this relationship');
    }
    return relationship;
  }

  async updatePermissions(id, ownerUserId, permissions, client = pool) {
    const relationship = await this.repo.findTrustedRelationshipById(id, client);
    if (!relationship) {
      throw new NotFoundError('Trusted relationship not found');
    }
    if (relationship.ownerUserId !== ownerUserId) {
      throw new ForbiddenError('Only the relationship owner can modify permissions');
    }
    if (relationship.status !== 'ACTIVE') {
      throw new ConflictError('Cannot update permissions on a revoked relationship');
    }

    const updatedPermissions = await this.repo.updateTrustedPermissions(id, permissions, client);

    try {
      await notificationsService.sendNotification(
        {
          recipientUserId: relationship.trustedUserId,
          notificationType: NOTIFICATION_TYPE.COLLABORATION,
          title: 'Trusted Permissions Updated',
          body: 'Your permissions for this trusted connection have been updated by the owner.',
          targetReference: { relationshipId: id },
        },
        client,
      );
    } catch {
      // Non-blocking
    }

    return {
      ...relationship,
      permissions: updatedPermissions,
    };
  }

  async revokeRelationship(id, userId, client = pool) {
    const relationship = await this.repo.findTrustedRelationshipById(id, client);
    if (!relationship) {
      throw new NotFoundError('Trusted relationship not found');
    }
    if (relationship.ownerUserId !== userId && relationship.trustedUserId !== userId) {
      throw new ForbiddenError('You do not have permission to revoke this relationship');
    }

    const revoked = await this.repo.revokeTrustedRelationship(id, userId, client);
    if (!revoked) {
      throw new ConflictError('Relationship is already revoked');
    }

    // Notify the other party
    const otherUserId =
      relationship.ownerUserId === userId ? relationship.trustedUserId : relationship.ownerUserId;

    try {
      await notificationsService.sendNotification(
        {
          recipientUserId: otherUserId,
          notificationType: NOTIFICATION_TYPE.COLLABORATION,
          title: 'Trusted Relationship Revoked',
          body: 'The trusted relationship has been revoked.',
          targetReference: { relationshipId: id },
        },
        client,
      );
    } catch {
      // Non-blocking
    }

    return {
      ...relationship,
      status: 'REVOKED',
      revokedAt: revoked.revoked_at,
    };
  }

  // ==========================================
  // 3. Comments & Mentions
  // ==========================================

  async createComment(authorUserId, data, client = pool) {
    const { workspaceId, targetType, targetId, content, mentionedUserIds = [] } = data;

    // 1. Authorize workspace participation
    const membership = await workspacesRepo.findMembership(workspaceId, authorUserId, client);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('You are not an active member of this workspace');
    }

    // 2. Authorize parent target resource
    if (targetType === COLLAB_TARGET_TYPE.TASK) {
      const task = await tasksRepo.findTaskById(
        targetId,
        workspaceId,
        { includeDeleted: false },
        client,
      );
      if (!task) {
        throw new NotFoundError('Target task not found in this workspace');
      }
    } else if (targetType === COLLAB_TARGET_TYPE.PROJECT) {
      const project = await projectsRepo.findProjectById(targetId, workspaceId, client);
      if (!project) {
        throw new NotFoundError('Target project not found in this workspace');
      }
    } else if (targetType === COLLAB_TARGET_TYPE.NOTE) {
      const note = await notesRepo.findNoteById(targetId, workspaceId, client);
      if (!note) {
        throw new NotFoundError('Target note not found in this workspace');
      }
    }

    // 3. Extract and resolve mentions
    // Mentions must resolve only to authorized workspace participants (BR-COLLAB-005)
    const workspaceMembers = await workspacesRepo.findWorkspaceMemberships(workspaceId, client);
    const validMemberIds = new Set(
      workspaceMembers.filter(m => m.status === 'ACTIVE').map(m => m.userId),
    );

    const resolvedMentionIds = new Set();

    // From explicit mentionedUserIds
    for (const uid of mentionedUserIds) {
      if (validMemberIds.has(uid) && uid !== authorUserId) {
        resolvedMentionIds.add(uid);
      }
    }

    // From @username or @email patterns in content
    const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionToken = match[1].toLowerCase();
      const matchedMember = workspaceMembers.find(
        m =>
          (m.userDisplayName && m.userDisplayName.toLowerCase() === mentionToken) ||
          (m.userEmail && m.userEmail.toLowerCase().startsWith(mentionToken)),
      );
      if (
        matchedMember &&
        validMemberIds.has(matchedMember.userId) &&
        matchedMember.userId !== authorUserId
      ) {
        resolvedMentionIds.add(matchedMember.userId);
      }
    }

    return withTransaction(async txClient => {
      // Insert comment
      const comment = await this.repo.createComment(
        {
          workspaceId,
          authorUserId,
          targetType,
          targetId,
          content,
        },
        txClient,
      );

      // Insert mentions
      const mentionList = Array.from(resolvedMentionIds);
      if (mentionList.length > 0) {
        await this.repo.createMentions(comment.id, mentionList, txClient);

        // Send notification to mentioned members
        for (const mentionedUid of mentionList) {
          try {
            await notificationsService.sendNotification(
              {
                recipientUserId: mentionedUid,
                notificationType: NOTIFICATION_TYPE.COLLABORATION,
                title: 'You were mentioned in a comment',
                body: `${membership.userDisplayName || 'A collaborator'} mentioned you: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"`,
                targetReference: {
                  commentId: comment.id,
                  targetType,
                  targetId,
                  workspaceId,
                },
              },
              txClient,
            );
          } catch {
            // Non-blocking
          }
        }
      }

      // Record activity entry
      await this.repo.createActivityEntry(
        {
          workspaceId,
          actorUserId: authorUserId,
          targetType,
          targetId,
          activityType: ACTIVITY_TYPE.COMMENT_CREATED,
          metadata: {
            commentId: comment.id,
            snippet: content.slice(0, 80),
          },
        },
        txClient,
      );

      return {
        ...comment,
        authorName: membership.userDisplayName,
        authorEmail: membership.userEmail,
        mentions: mentionList.map(uid => ({ id: uid })),
      };
    }, client);
  }

  async listComments(userId, params, client = pool) {
    const { workspaceId, targetType, targetId } = params;

    // Check workspace membership or trusted access
    const membership = await workspacesRepo.findMembership(workspaceId, userId, client);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('You do not have access to this workspace');
    }

    return this.repo.findCommentsByTarget(workspaceId, targetType, targetId, client);
  }

  async deleteComment(commentId, userId, client = pool) {
    const comment = await this.repo.findCommentById(commentId, client);
    if (!comment || comment.deletedAt) {
      throw new NotFoundError('Comment not found');
    }

    // Must be author or workspace OWNER/ADMIN
    if (comment.authorUserId !== userId) {
      const membership = await workspacesRepo.findMembership(comment.workspaceId, userId, client);
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        throw new ForbiddenError('Only the author or workspace admins can delete this comment');
      }
    }

    const deleted = await this.repo.deleteComment(commentId, client);
    if (deleted) {
      await this.repo.createActivityEntry(
        {
          workspaceId: comment.workspaceId,
          actorUserId: userId,
          targetType: comment.targetType,
          targetId: comment.targetId,
          activityType: ACTIVITY_TYPE.COMMENT_DELETED,
          metadata: { commentId },
        },
        client,
      );
    }

    return { deleted: true };
  }

  // ==========================================
  // 4. Activity Feed
  // ==========================================

  async listActivity(userId, params, client = pool) {
    const { workspaceId, targetType, targetId, limit = 20 } = params;

    const membership = await workspacesRepo.findMembership(workspaceId, userId, client);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('You do not have access to this workspace activity feed');
    }

    return this.repo.listActivityEntries({ workspaceId, targetType, targetId, limit }, client);
  }

  // ==========================================
  // 5. Shared Reminders (Recipients)
  // ==========================================

  /**
   * Shares a reminder with an explicit recipient.
   * Enforces that recipient is an active workspace member or an active trusted contact
   * with 'trusted.reminders.receive' permission (BR-SHARE-007, REQ-SREM-001).
   */
  async shareReminder(reminderId, recipientUserId, requestingUser, workspaceId, client = pool) {
    const reminder = await remindersRepo.findReminderById(reminderId, client);
    if (!reminder || reminder.workspaceId !== workspaceId) {
      throw new NotFoundError('Reminder not found in this workspace');
    }

    // Must be reminder creator or workspace owner/admin
    if (reminder.createdBy !== requestingUser.id) {
      const membership = await workspacesRepo.findMembership(
        workspaceId,
        requestingUser.id,
        client,
      );
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        throw new ForbiddenError(
          'Only the reminder creator or workspace admins can share this reminder',
        );
      }
    }

    // Verify recipient eligibility
    const recipientMembership = await workspacesRepo.findMembership(
      workspaceId,
      recipientUserId,
      client,
    );
    const hasWorkspaceAccess = recipientMembership && recipientMembership.status === 'ACTIVE';

    if (!hasWorkspaceAccess) {
      // Must have active trusted relationship granting trusted.reminders.receive
      const hasTrustPerm =
        (await this.repo.hasTrustedPermission(
          requestingUser.id,
          recipientUserId,
          TRUSTED_PERMISSION.RECEIVE_REMINDERS,
          client,
        )) ||
        (await this.repo.hasTrustedPermission(
          recipientUserId,
          requestingUser.id,
          TRUSTED_PERMISSION.RECEIVE_REMINDERS,
          client,
        ));

      if (!hasTrustPerm) {
        throw new ForbiddenError(
          'Recipient is not a workspace member and does not have an active trusted relationship for shared reminders',
        );
      }
    }

    // Add recipient record
    const recipient = await this.repo.createReminderRecipient(
      reminderId,
      recipientUserId,
      reminder.triggerAt,
      client,
    );

    // Record activity entry
    await this.repo.createActivityEntry(
      {
        workspaceId,
        actorUserId: requestingUser.id,
        targetType: 'REMINDER',
        targetId: reminderId,
        activityType: ACTIVITY_TYPE.REMINDER_SHARED,
        metadata: {
          recipientUserId,
        },
      },
      client,
    );

    // Notify recipient
    try {
      await notificationsService.sendNotification(
        {
          recipientUserId,
          reminderRecipientId: recipient.id,
          notificationType: NOTIFICATION_TYPE.REMINDER,
          title: 'Shared Reminder',
          body: `${requestingUser.displayName || 'A user'} shared a reminder with you: "${reminder.title || 'Untitled'}"`,
          targetReference: { reminderId, workspaceId },
        },
        client,
      );
    } catch {
      // Non-blocking
    }

    return recipient;
  }

  async listReminderRecipients(reminderId, userId, workspaceId, client = pool) {
    const reminder = await remindersRepo.findReminderById(reminderId, client);
    if (!reminder || reminder.workspaceId !== workspaceId) {
      throw new NotFoundError('Reminder not found');
    }

    // Must be creator or existing recipient
    const recipients = await this.repo.listReminderRecipients(reminderId, client);
    const isParticipant =
      reminder.createdBy === userId || recipients.some(r => r.userId === userId);

    if (!isParticipant) {
      const membership = await workspacesRepo.findMembership(workspaceId, userId, client);
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        throw new ForbiddenError('You do not have permission to view recipients for this reminder');
      }
    }

    return recipients;
  }

  /**
   * Recipient-specific independent snooze (REQ-SREM-002, REQ-SREM-003).
   * Does NOT alter the underlying owner reminder or other recipients.
   */
  async snoozeReminderRecipient(reminderId, userId, options = {}, client = pool) {
    const existing = await this.repo.findReminderRecipient(reminderId, userId, client);
    if (!existing) {
      throw new NotFoundError('You are not a recipient of this shared reminder');
    }

    const snoozeMinutes = options.snoozeMinutes || 15;
    const snoozedUntil =
      options.snoozedUntil || new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();

    const updated = await this.repo.snoozeRecipient(reminderId, userId, snoozedUntil, client);
    return {
      ...updated,
      message: `Reminder snoozed until ${snoozedUntil}`,
    };
  }

  /**
   * Recipient-specific independent dismissal (REQ-SREM-002, REQ-SREM-003).
   * Does NOT alter the underlying owner reminder or other recipients.
   */
  async dismissReminderRecipient(reminderId, userId, client = pool) {
    const existing = await this.repo.findReminderRecipient(reminderId, userId, client);
    if (!existing) {
      throw new NotFoundError('You are not a recipient of this shared reminder');
    }

    const updated = await this.repo.dismissRecipient(reminderId, userId, client);
    return {
      ...updated,
      dismissed: true,
    };
  }
}

export const collaborationService = new CollaborationService();
