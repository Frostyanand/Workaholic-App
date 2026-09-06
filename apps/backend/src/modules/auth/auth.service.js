import * as sessionsRepo from './sessions.repository.js';
import * as devicesRepo from './devices.repository.js';
import { AuthenticationRequiredError, NotFoundError } from '../../core/errors.js';

/**
 * Auth Service — domain logic for sessions, devices, and token validation.
 * Conforms to docs/6.SYSTEM-ARCHITECTURE.md Section 14 & Section 40
 */
export class AuthService {
  constructor(sessions = sessionsRepo, devices = devicesRepo) {
    this.sessionsRepo = sessions;
    this.devicesRepo = devices;
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
   * Revoke all sessions for a user upon critical security events.
   */
  async revokeAllUserSessions(userId, client = undefined) {
    return this.sessionsRepo.revokeAllUserSessions(userId, client);
  }

  /**
   * Register a user client device.
   */
  async registerDevice(userId, deviceData, client = undefined) {
    return this.devicesRepo.registerDevice(
      {
        userId,
        ...deviceData,
      },
      client,
    );
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
  async updateDeviceTrust(deviceId, trustState, client = undefined) {
    const updated = await this.devicesRepo.updateDeviceTrustState(deviceId, trustState, client);
    if (!updated) {
      throw new NotFoundError('Device not found');
    }
    return updated;
  }
}

export const authService = new AuthService();
