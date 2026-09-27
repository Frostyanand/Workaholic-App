import crypto from 'node:crypto';
import { SYNC_DIAGNOSTIC_STATUS, SYNC_RETRY_STATE } from '@workaholic/shared';
import * as syncDiagRepo from './sync-diagnostics.repository.js';
import * as integrationsRepo from '../auth/integrations.repository.js';
import { classifySyncError } from './sync-error-classifier.js';
import { isSyncStale } from './sync-state-machine.js';

// In-flight active sync locks by key: `${userId}:${service}:${targetId || 'all'}`
const activeSyncLocks = new Map();

/**
 * Synchronization Coordinator
 * Handles concurrency locks, timing, error classification, diagnostics, and recovery.
 * Conforms to docs/8.SYNC-SPECIFICATION.md Section 81-86,
 * and docs/21.COST-ARCHITECTURE.md Section 30-31.
 */
export class SyncCoordinator {
  /**
   * Generates a unique correlation ID for a sync run.
   */
  generateCorrelationId(userId, service) {
    const rand = crypto.randomBytes(4).toString('hex');
    return `sync_${service.toLowerCase()}_${userId.slice(0, 8)}_${Date.now()}_${rand}`;
  }

  /**
   * Attempts to acquire an in-flight sync lock.
   * Throws 409 Conflict if an active sync is already running.
   */
  acquireLock(userId, service, targetId = 'all') {
    const key = `${userId}:${service}:${targetId}`;
    const existing = activeSyncLocks.get(key);

    if (existing) {
      // Check if stale (e.g. process hung or died)
      if (isSyncStale(existing.startedAt)) {
        activeSyncLocks.delete(key);
      } else {
        const err = new Error(
          `Synchronization is already in progress for ${service} (lock acquired at ${new Date(existing.startedAt).toISOString()})`,
        );
        err.code = 'SYNC_IN_PROGRESS';
        err.statusCode = 409;
        throw err;
      }
    }

    const lockData = {
      startedAt: Date.now(),
      correlationId: this.generateCorrelationId(userId, service),
    };
    activeSyncLocks.set(key, lockData);
    return lockData;
  }

  /**
   * Releases an in-flight sync lock.
   */
  releaseLock(userId, service, targetId = 'all') {
    const key = `${userId}:${service}:${targetId}`;
    activeSyncLocks.delete(key);
  }

  /**
   * Executes a synchronized operation with full hardening lifecycle:
   * concurrency guard, diagnostic timing, error classification, and state transitions.
   *
   * @param {Object} context
   * @param {string} context.userId
   * @param {string} context.workspaceId
   * @param {string} context.service 'CALENDAR' | 'TASKS' | 'DRIVE'
   * @param {string} [context.targetId='all']
   * @param {string} [context.direction='BIDIRECTIONAL']
   * @param {string} [context.operationType='INCREMENTAL']
   * @param {Function} syncFn Async callback executing the sync logic
   * @returns {Promise<Object>} The sync result with diagnostic metadata
   */
  async runWithHardening(context, syncFn) {
    const {
      userId,
      workspaceId,
      service,
      targetId = 'all',
      direction = 'BIDIRECTIONAL',
      operationType = 'INCREMENTAL',
    } = context;

    const lock = this.acquireLock(userId, service, targetId);
    const startedAt = new Date(lock.startedAt);
    const correlationId = lock.correlationId;

    let integration;
    try {
      integration = await integrationsRepo.findIntegration(userId, 'GOOGLE');
      if (integration) {
        await integrationsRepo.updateIntegrationStatus(integration.id, 'SYNCING');
      }
    } catch {
      // Non-fatal if lookup fails
    }

    try {
      // Execute inner synchronization logic
      const result = await syncFn({ correlationId, startedAt });

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Determine status: check if partial failure or conflicts occurred
      const conflicts = Number(result?.conflicts || result?.recordsConflicted || 0);
      const errors = Number(result?.errors || 0);
      const isPartial = conflicts > 0 || errors > 0;
      const status = isPartial
        ? SYNC_DIAGNOSTIC_STATUS.PARTIAL_SUCCESS
        : SYNC_DIAGNOSTIC_STATUS.SUCCESS;

      // Restore integration status to CONNECTED
      if (integration) {
        await integrationsRepo.updateIntegrationStatus(integration.id, 'CONNECTED');
      }

      // Record diagnostic entry
      await syncDiagRepo.recordSyncDiagnostic({
        userId,
        workspaceId,
        provider: 'GOOGLE',
        integrationService: service,
        syncDirection: direction,
        syncOperationType: operationType,
        status,
        recordsExamined:
          Number(result?.examined || result?.imported || 0) + Number(result?.exported || 0),
        recordsCreated: Number(result?.created || 0),
        recordsUpdated: Number(result?.updated || 0),
        recordsDeleted: Number(result?.deleted || 0),
        recordsConflicted: conflicts,
        startedAt,
        completedAt,
        durationMs,
        retryCount: 0,
        retryState: SYNC_RETRY_STATE.NONE,
        correlationId,
        metadata: {
          calendarId: result?.calendarId,
          googleCalendarId: result?.googleCalendarId,
          imported: result?.imported,
          exported: result?.exported,
          conflicts: result?.conflicts,
        },
      });

      return {
        ...result,
        correlationId,
        status,
        durationMs,
        syncedAt: completedAt.toISOString(),
      };
    } catch (err) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const classified = classifySyncError(err);

      // Update integration status based on error classification
      if (integration) {
        if (classified.shouldReauth) {
          await integrationsRepo.updateIntegrationStatus(integration.id, 'REAUTH_REQUIRED');
        } else if (classified.category === 'TRANSIENT') {
          await integrationsRepo.updateIntegrationStatus(integration.id, 'UNAVAILABLE');
        } else {
          await integrationsRepo.updateIntegrationStatus(integration.id, 'ERROR');
        }
      }

      // Record diagnostic failure entry
      try {
        await syncDiagRepo.recordSyncDiagnostic({
          userId,
          workspaceId,
          provider: 'GOOGLE',
          integrationService: service,
          syncDirection: direction,
          syncOperationType: operationType,
          status: SYNC_DIAGNOSTIC_STATUS.FAILED,
          failureCategory: classified.category,
          failureReason: classified.reason,
          errorCode: String(err.code || classified.category),
          errorMessage: classified.message,
          startedAt,
          completedAt,
          durationMs,
          retryCount: 0,
          retryState: classified.isRetryable ? SYNC_RETRY_STATE.SCHEDULED : SYNC_RETRY_STATE.NONE,
          correlationId,
          metadata: {
            isRetryable: classified.isRetryable,
            shouldReauth: classified.shouldReauth,
            httpStatus: classified.httpStatus,
          },
        });
      } catch {
        // Logging failure should not mask original error
      }

      err.correlationId = correlationId;
      err.classifiedError = classified;
      throw err;
    } finally {
      this.releaseLock(userId, service, targetId);
    }
  }

  /**
   * Recovers a user's integration from stale sync state.
   *
   * @param {string} userId
   */
  async recoverStaleSync(userId) {
    // 1. Clear any active in-flight locks for this user
    for (const [key] of activeSyncLocks.entries()) {
      if (key.startsWith(`${userId}:`)) {
        activeSyncLocks.delete(key);
      }
    }

    // 2. Check and reset integration status if it was left in SYNCING
    const integration = await integrationsRepo.findIntegration(userId, 'GOOGLE');
    if (integration && integration.status === 'SYNCING') {
      await integrationsRepo.updateIntegrationStatus(integration.id, 'CONNECTED');
      return { recovered: true, previousStatus: 'SYNCING', currentStatus: 'CONNECTED' };
    }

    return { recovered: true, currentStatus: integration?.status || 'DISCONNECTED' };
  }
}

export const syncCoordinator = new SyncCoordinator();
