import { randomBytes } from 'node:crypto';
import { pool, withTransaction } from '../../core/db.js';
import { hashSessionToken, encryptCredentials, decryptCredentials } from '../../core/crypto.js';
import { NotFoundError, AppError } from '../../core/errors.js';
import { findCalendarById } from '../calendar/calendars.repository.js';
import { findEventsByRange } from '../calendar/events.repository.js';
import {
  createLink,
  getActiveLinkByCalendarId,
  getLinkById,
  getLinkByTokenHash,
  revokeLink,
  revokeActiveLinksByCalendarId,
  touchLastAccessed,
} from './public-calendar.repository.js';

export class PublicCalendarService {
  /**
   * Generates a cryptographically unpredictable bearer token.
   * Format: 'pcal_' + 48 hex characters (total 53 chars).
   */
  _generateRawToken() {
    return `pcal_${randomBytes(24).toString('hex')}`;
  }

  /**
   * Safe token decrypter wrapper with graceful fallback.
   */
  _decryptToken(encryptedToken) {
    if (!encryptedToken) return null;
    try {
      return decryptCredentials(encryptedToken);
    } catch {
      return null;
    }
  }

  /**
   * Enriches link domain object with reconstructed URLs and tokens.
   */
  _formatLinkResponse(link, rawToken = null) {
    if (!link) return null;

    const token = rawToken || this._decryptToken(link.tokenEncrypted);
    const url = token ? `/public/calendar/${token}` : null;

    return {
      id: link.id,
      calendarId: link.calendarId,
      workspaceId: link.workspaceId,
      userId: link.userId,
      token,
      tokenPrefix: link.tokenPrefix,
      url,
      status: link.status,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      revokedAt: link.revokedAt,
      lastAccessedAt: link.lastAccessedAt,
      ...(link.calendarName
        ? {
            calendar: {
              id: link.calendarId,
              name: link.calendarName,
              color: link.calendarColor,
              timezone: link.calendarTimezone,
              visibility: link.calendarVisibility,
            },
          }
        : {}),
    };
  }

  /**
   * Retrieves the currently active public link for a calendar, or null if none/expired.
   */
  async getActivePublicLink(workspaceId, user, calendarId, client = pool) {
    const calendar = await findCalendarById(calendarId, workspaceId, client);
    if (!calendar) {
      throw new NotFoundError('Calendar not found');
    }

    const activeLink = await getActiveLinkByCalendarId(calendarId, client);
    if (!activeLink) {
      return null;
    }

    // Check expiration and auto-revoke if expired
    if (activeLink.expiresAt && new Date() > new Date(activeLink.expiresAt)) {
      await revokeLink(activeLink.id, client);
      return null;
    }

    return this._formatLinkResponse(activeLink);
  }

  /**
   * Enables or retrieves a public calendar link.
   * If an unexpired active link already exists and forceNew is not requested, returns existing.
   * If forceNew is requested or link was expired/missing, atomically revokes old and creates new.
   */
  async createOrGetPublicLink(workspaceId, user, calendarId, options = {}, client = pool) {
    const calendar = await findCalendarById(calendarId, workspaceId, client);
    if (!calendar) {
      throw new NotFoundError('Calendar not found');
    }

    const activeLink = await getActiveLinkByCalendarId(calendarId, client);

    if (activeLink && !options.forceNew) {
      // Check expiration
      if (!activeLink.expiresAt || new Date() <= new Date(activeLink.expiresAt)) {
        return this._formatLinkResponse(activeLink);
      }
    }

    // Execute in transaction for atomic revocation and single-active guarantee
    return withTransaction(async txClient => {
      // Revoke any existing active links for this calendar
      await revokeActiveLinksByCalendarId(calendarId, txClient);

      const rawToken = this._generateRawToken();
      const tokenHash = hashSessionToken(rawToken);
      const tokenPrefix = rawToken.slice(0, 10);
      const tokenEncrypted = encryptCredentials(rawToken);

      const created = await createLink(
        {
          workspaceId,
          calendarId,
          userId: user.id,
          tokenHash,
          tokenEncrypted,
          tokenPrefix,
          status: 'ACTIVE',
          expiresAt: options.expiresAt || null,
        },
        txClient,
      );

      return this._formatLinkResponse(created, rawToken);
    });
  }

  /**
   * Revokes an existing public calendar link by link ID or calendar ID.
   */
  async revokePublicLink(workspaceId, user, identifier, client = pool) {
    // Check if identifier is a link ID
    const link = await getLinkById(identifier, client);
    if (link) {
      if (link.workspaceId !== workspaceId) {
        throw new NotFoundError('Public calendar link not found');
      }
      const revoked = await revokeLink(link.id, client);
      return { revoked: true, id: revoked.id };
    }

    // Otherwise check if identifier is a calendar ID
    const calendar = await findCalendarById(identifier, workspaceId, client);
    if (!calendar) {
      throw new NotFoundError('Calendar or public link not found');
    }

    const revokedList = await revokeActiveLinksByCalendarId(calendar.id, client);
    return {
      revoked: true,
      calendarId: calendar.id,
      count: revokedList.length,
    };
  }

  /**
   * Atomically revokes existing link and generates a fresh new one.
   */
  async regeneratePublicLink(workspaceId, user, identifier, options = {}, client = pool) {
    let calendarId = identifier;

    const link = await getLinkById(identifier, client);
    if (link) {
      if (link.workspaceId !== workspaceId) {
        throw new NotFoundError('Public calendar link not found');
      }
      calendarId = link.calendarId;
    }

    return this.createOrGetPublicLink(
      workspaceId,
      user,
      calendarId,
      { ...options, forceNew: true },
      client,
    );
  }

  /**
   * Public anonymous read-only access with strict privacy projection.
   * Conforms to BR-PUBCAL-001, BR-PUBCAL-002, BR-PUBCAL-003, and CALENDAR-SPECIFICATION Section 42.
   */
  async getPublicCalendarProjection(rawToken, query = {}, client = pool) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new NotFoundError('Public calendar link not found or invalid');
    }

    const tokenHash = hashSessionToken(rawToken);
    const link = await getLinkByTokenHash(tokenHash, client);

    if (!link) {
      throw new NotFoundError('Public calendar link not found or invalid');
    }

    if (link.status === 'REVOKED') {
      throw new AppError('RESOURCE_REVOKED', 'This public calendar link has been revoked', 410);
    }

    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      // Async fire-and-forget revocation
      revokeLink(link.id, pool).catch(() => {});
      throw new AppError('LINK_EXPIRED', 'This public calendar link has expired', 410);
    }

    // Update last_accessed_at in the background
    touchLastAccessed(link.id, pool).catch(() => {});

    // Compute temporal bounds
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();

    const start = query.start || defaultStart;
    const end = query.end || defaultEnd;

    // Fetch calendar events in range (recurrences expanded)
    const rawEvents = await findEventsByRange(
      link.workspaceId,
      {
        start,
        end,
        calendarIds: [link.calendarId],
      },
      client,
    );

    // Apply strict privacy projection (BR-PUBCAL-002, BR-PUBCAL-003)
    const projectedEvents = (rawEvents || [])
      .filter(event => event.status !== 'CANCELLED')
      .map(event => {
        const isPublic = event.visibility === 'PUBLIC';

        return {
          id: event.id,
          title: isPublic ? event.title : 'Busy',
          start: event.startAt,
          end: event.endAt,
          isAllDay: Boolean(event.isAllDay),
          busy: true,
          ...(event.startDate ? { startDate: event.startDate } : {}),
          ...(event.endDate ? { endDate: event.endDate } : {}),
        };
      });

    return {
      calendar: {
        name: link.calendarName,
        color: link.calendarColor,
        timezone: link.calendarTimezone,
      },
      events: projectedEvents,
    };
  }
}

export const publicCalendarService = new PublicCalendarService();
