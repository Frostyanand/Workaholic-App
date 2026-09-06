import * as sessionsRepo from './sessions.repository.js';
import * as devicesRepo from './devices.repository.js';
import * as securityEventsRepo from './security-events.repository.js';
import { generateSessionToken, hashSessionToken } from '../../core/crypto.js';
import { AuthenticationRequiredError, NotFoundError } from '../../core/errors.js';

/**
 * Auth Service — domain logic for sessions, devices, token lifecycle, and authentication.
 * Conforms to docs/IMPLEMENTATION-PLAN.md Task 4.3, 4.4, 4.5 and docs/12.PRIVACY-SECURITY.md.
 */
export class AuthService {
  constructor(sessions = sessionsRepo, devices = devicesRepo, securityEvents = securityEventsRepo) {
    this.sessionsRepo = sessions;
    this.devicesRepo = devices;
    this.securityEventsRepo = securityEvents;
  }

  /**
   * Create a new cryptographic session for an authenticated user.
   * Generates a 256-bit secure raw token, stores only the SHA-256 hash in PostgreSQL,
   * and returns the raw token to the caller for transport to the client.
   *
   * @param {string} userId - User UUID
   * @param {Object} [options]
   * @param {string|null} [options.deviceId=null]
   * @param {'WEB'|'DESKTOP'|'MOBILE'|'API'} [options.sessionType='WEB']
   * @param {number} [options.ttlDays=30]
   * @param {string|null} [options.ipAddress=null]
   * @param {string|null} [options.userAgent=null]
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   * @returns {Promise<{ session: Object, rawToken: string }>}
   */
  async createSession(userId, options = {}, client = undefined) {
    if (!userId) {
      throw new TypeError('userId is required');
    }

    const rawToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(rawToken);

    const ttlDays = options.ttlDays || 30;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const session = await this.sessionsRepo.createSession(
      {
        userId,
        deviceId: options.deviceId || null,
        sessionTokenHash,
        sessionType: options.sessionType || 'WEB',
        expiresAt,
      },
      client,
    );

    // Record login security event
    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId,
            eventType: 'LOGIN_SUCCESS',
            ipAddress: options.ipAddress || null,
            userAgent: options.userAgent || null,
            deviceId: options.deviceId || null,
            metadata: {
              sessionId: session.id,
              sessionType: session.sessionType,
            },
          },
          client,
        )
        .catch(() => {});
    }

    return {
      session,
      rawToken,
    };
  }

  /**
   * Validate a raw bearer/cookie session token by hashing it and checking active state.
   *
   * @param {string} rawToken - Presented raw session token
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   */
  async validateRawToken(rawToken, client = undefined) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AuthenticationRequiredError('Session token required');
    }

    const tokenHash = hashSessionToken(rawToken.trim());
    return this.validateSession(tokenHash, client);
  }

  /**
   * Validate session token hash, verify active status, touch last_seen_at.
   */
  async validateSession(tokenHash, client = undefined) {
    if (!tokenHash) {
      throw new AuthenticationRequiredError('Session token required');
    }

    const session = await this.sessionsRepo.findActiveSessionByTokenHash(tokenHash, client);
    if (!session) {
      throw new AuthenticationRequiredError('Invalid or expired session');
    }

    // Touch last_seen_at for active session tracking
    await this.sessionsRepo.touchSession(session.id, client);

    return session;
  }

  /**
   * Revoke an active session.
   */
  async revokeSession(sessionId, client = undefined) {
    const revoked = await this.sessionsRepo.revokeSession(sessionId, client);
    if (!revoked) {
      throw new NotFoundError('Session not found or already revoked');
    }
    return revoked;
  }

  /**
   * Safe user-initiated logout for the current active session.
   */
  async logout(sessionId, userId, metadata = {}, client = undefined) {
    const session = await this.sessionsRepo.findSessionById(sessionId, client);
    if (!session || session.userId !== userId) {
      throw new NotFoundError('Session not found');
    }

    await this.sessionsRepo.revokeSession(sessionId, client);

    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId,
            eventType: 'LOGOUT',
            ipAddress: metadata.ipAddress || null,
            userAgent: metadata.userAgent || null,
            deviceId: session.deviceId || null,
            metadata: { sessionId },
          },
          client,
        )
        .catch(() => {});
    }

    return true;
  }

  /**
   * Revoke a specific session with user ownership verification (IDOR protection).
   */
  async revokeUserSession(sessionId, requestingUserId, metadata = {}, client = undefined) {
    const session = await this.sessionsRepo.findSessionById(sessionId, client);
    if (!session || session.userId !== requestingUserId) {
      throw new NotFoundError('Session not found');
    }

    const revoked = await this.sessionsRepo.revokeSession(sessionId, client);

    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId: requestingUserId,
            eventType: 'SESSION_REVOKED',
            ipAddress: metadata.ipAddress || null,
            userAgent: metadata.userAgent || null,
            deviceId: session.deviceId || null,
            metadata: { sessionId },
          },
          client,
        )
        .catch(() => {});
    }

    return revoked;
  }

  /**
   * Revoke all sessions for a user upon critical security events.
   */
  async revokeAllUserSessions(userId, metadata = {}, client = undefined) {
    const count = await this.sessionsRepo.revokeAllUserSessions(userId, client);

    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId,
            eventType: 'REVOKE_ALL_SESSIONS',
            ipAddress: metadata.ipAddress || null,
            userAgent: metadata.userAgent || null,
            metadata: { revokedCount: count },
          },
          client,
        )
        .catch(() => {});
    }

    return count;
  }

  /**
   * List active sessions for an authenticated user.
   */
  async getUserSessions(userId, client = undefined) {
    return this.sessionsRepo.findActiveSessionsForUser(userId, client);
  }

  /**
   * Register a user client device.
   */
  async registerDevice(userId, deviceData, client = undefined) {
    const device = await this.devicesRepo.registerDevice(
      {
        userId,
        ...deviceData,
      },
      client,
    );

    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId,
            deviceId: device.id,
            eventType: 'DEVICE_REGISTERED',
            metadata: { platform: device.platform, deviceName: device.deviceName },
          },
          client,
        )
        .catch(() => {});
    }

    return device;
  }

  /**
   * List registered devices for user.
   */
  async getUserDevices(userId, client = undefined) {
    return this.devicesRepo.findDevicesForUser(userId, client);
  }

  /**
   * Update device trust state.
   */
  async updateDeviceTrust(deviceId, trustState, userId = undefined, client = undefined) {
    if (userId) {
      const existing = await this.devicesRepo.findDeviceById(deviceId, client);
      if (!existing || existing.userId !== userId) {
        throw new NotFoundError('Device not found');
      }
    }

    const updated = await this.devicesRepo.updateDeviceTrustState(deviceId, trustState, client);
    if (!updated) {
      throw new NotFoundError('Device not found');
    }

    if (this.securityEventsRepo?.recordSecurityEvent && (userId || updated.userId)) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId: userId || updated.userId,
            deviceId,
            eventType: 'DEVICE_TRUST_UPDATED',
            metadata: { trustState },
          },
          client,
        )
        .catch(() => {});
    }

    return updated;
  }

  /**
   * Revoke a device and all active sessions attached to it.
   */
  async revokeDeviceAndSessions(deviceId, userId, metadata = {}, client = undefined) {
    const device = await this.devicesRepo.findDeviceById(deviceId, client);
    if (!device || device.userId !== userId) {
      throw new NotFoundError('Device not found');
    }

    await this.devicesRepo.updateDeviceTrustState(deviceId, 'REVOKED', client);
    await this.sessionsRepo.revokeSessionsByDeviceId(deviceId, client);

    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId,
            deviceId,
            eventType: 'DEVICE_REVOKED',
            ipAddress: metadata.ipAddress || null,
            userAgent: metadata.userAgent || null,
          },
          client,
        )
        .catch(() => {});
    }

    return true;
  }
}

export const authService = new AuthService();
