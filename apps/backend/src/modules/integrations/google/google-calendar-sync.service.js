import { pool, withTransaction } from '../../../core/db.js';
import { NotFoundError, ValidationError } from '../../../core/errors.js';
import * as extMappingsRepo from '../external-mappings.repository.js';
import * as calendarsRepo from '../../calendar/calendars.repository.js';
import * as eventsRepo from '../../calendar/events.repository.js';
import * as recurrenceRepo from '../../recurrence/recurrence.repository.js';
import { oauthBoundaryService } from '../../auth/oauth-boundary.service.js';
import * as integrationsRepo from '../../auth/integrations.repository.js';
import { defaultGoogleCalendarAdapter } from './google-calendar.adapter.js';
import { toWorkaholicEvent, toGoogleEvent } from './google-calendar.mapper.js';
import { SYNC_STATE } from '@workaholic/shared';

/**
 * Google Calendar Synchronization Service
 * Conforms to docs/8.SYNC-SPECIFICATION.md Sections 51-58,
 * docs/9.CALENDAR-SPECIFICATION.md Sections 37-41,
 * and docs/19.INTEGRATION-SPECIFICATION.md.
 */
export class GoogleCalendarSyncService {
  constructor(adapter = defaultGoogleCalendarAdapter) {
    this.adapter = adapter;
  }

  /**
   * Helper to retrieve valid decrypted OAuth credentials
   */
  async _getValidCredentials(userId, client = pool) {
    const integration = await integrationsRepo.findIntegration(userId, 'GOOGLE', client);
    if (!integration || integration.status === 'DISCONNECTED') {
      const err = new Error('Google Calendar is not connected');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    if (integration.status === 'REAUTH_REQUIRED') {
      const err = new Error(
        'Google Calendar authorization expired or revoked; reauthorization required',
      );
      err.code = 'REAUTH_REQUIRED';
      err.statusCode = 401;
      throw err;
    }

    const account = await integrationsRepo.findExternalAccount(integration.id, 'GOOGLE', client);
    if (!account) {
      const err = new Error('No external Google account found for integration');
      err.statusCode = 404;
      throw err;
    }

    const credentials = await oauthBoundaryService.getInternalCredentials(userId, client);
    if (!credentials || !credentials.accessToken) {
      const err = new Error('Google integration credentials unavailable; reauthorization required');
      err.code = 'REAUTH_REQUIRED';
      err.statusCode = 401;
      throw err;
    }

    return {
      integration,
      account,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
    };
  }

  /**
   * Discovers the user's accessible Google calendars and maps them into Workaholic.
   * Conforms to docs/8.SYNC-SPECIFICATION.md Section 52
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {Object} [adapterOverride]
   */
  async discoverCalendars(userId, workspaceId, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const { integration, account, accessToken } = await this._getValidCredentials(userId);

    let googleCalendars;
    try {
      googleCalendars = await adapter.listCalendars(accessToken);
    } catch (err) {
      if (err.reauthRequired) {
        await integrationsRepo.updateIntegrationStatus(integration.id, 'REAUTH_REQUIRED');
      }
      throw err;
    }

    const results = [];

    await withTransaction(async txClient => {
      for (const gCal of googleCalendars) {
        // 1. Find or create a matching Workaholic calendar representation
        const existingCalendars = await calendarsRepo.findCalendarsByWorkspace(
          workspaceId,
          { sourceType: 'GOOGLE' },
          txClient,
        );

        let nativeCal = existingCalendars.find(
          c =>
            c.externalCalendarId === gCal.id && c.externalAccountId === account.externalAccountId,
        );

        if (!nativeCal) {
          nativeCal = await calendarsRepo.createCalendar(
            {
              workspaceId,
              ownerUserId: userId,
              name: gCal.summary,
              description: gCal.description || null,
              color: gCal.backgroundColor || '#4285F4',
              sourceType: 'GOOGLE',
              externalAccountId: account.externalAccountId,
              externalCalendarId: gCal.id,
              visibility: 'PRIVATE',
              timezone: gCal.timeZone || 'UTC',
              isDefault: false,
            },
            txClient,
          );
        } else {
          // Update name/color if changed externally
          nativeCal = await calendarsRepo.updateCalendar(
            nativeCal.id,
            workspaceId,
            {
              name: gCal.summary,
              color: gCal.backgroundColor || nativeCal.color,
              timezone: gCal.timeZone || nativeCal.timezone,
            },
            txClient,
          );
        }

        // 2. Persist synchronization mapping in external_object_mappings
        const mapping = await extMappingsRepo.upsertMapping(
          {
            userId,
            workspaceId,
            provider: 'GOOGLE',
            externalAccountId: account.externalAccountId,
            externalContainerId: gCal.id,
            externalObjectType: 'CALENDAR',
            externalObjectId: gCal.id,
            nativeObjectType: 'CALENDAR',
            nativeObjectId: nativeCal.id,
            syncState: SYNC_STATE.SYNCED,
            metadata: {
              summary: gCal.summary,
              primary: gCal.primary,
              accessRole: gCal.accessRole,
            },
          },
          txClient,
        );

        results.push({
          mappingId: mapping.id,
          calendarId: nativeCal.id,
          nativeCalendarId: nativeCal.id,
          googleCalendarId: gCal.id,
          externalAccountId: account.externalAccountId,
          name: nativeCal.name,
          color: nativeCal.color,
          primary: Boolean(gCal.primary),
          isPrimary: Boolean(gCal.primary),
          syncState: mapping.syncState,
          lastSyncedAt: mapping.lastSyncedAt,
        });
      }
    });

    return results;
  }

  /**
   * Imports events from a Google calendar into Workaholic representation.
   * Conforms to docs/8.SYNC-SPECIFICATION.md Section 52, 53 & Section 55 (Conflict Handling)
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} calendarMappingId
   * @param {Object} [options={}]
   * @param {Object} [adapterOverride]
   */
  async importEvents(userId, workspaceId, calendarMappingId, options = {}, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const { integration, account, accessToken } = await this._getValidCredentials(userId);

    const calMapping = await extMappingsRepo.findMappingByNativeId(
      'GOOGLE',
      userId,
      'CALENDAR',
      calendarMappingId,
    );

    // If not found by native ID, try finding by mapping record ID
    let activeCalMapping = calMapping;
    if (!activeCalMapping) {
      const userMappings = await extMappingsRepo.findMappingsByUser(userId, 'GOOGLE', 'CALENDAR');
      activeCalMapping = userMappings.find(
        m => m.id === calendarMappingId || m.nativeObjectId === calendarMappingId,
      );
    }

    if (!activeCalMapping) {
      throw new NotFoundError(`Calendar mapping ${calendarMappingId} not found`);
    }

    const googleCalId = activeCalMapping.externalObjectId;
    const nativeCalendarId = activeCalMapping.nativeObjectId;

    let eventsResponse;
    try {
      eventsResponse = await adapter.listEvents(accessToken, googleCalId, {
        syncToken: options.force ? null : activeCalMapping.syncCursor,
        timeMin: options.timeMin,
        timeMax: options.timeMax,
      });
    } catch (err) {
      if (err.syncTokenExpired) {
        // Full sync fallback when syncToken expires (HTTP 410)
        eventsResponse = await adapter.listEvents(accessToken, googleCalId, {
          syncToken: null,
          timeMin: options.timeMin,
          timeMax: options.timeMax,
        });
      } else if (err.reauthRequired) {
        await integrationsRepo.updateIntegrationStatus(integration.id, 'REAUTH_REQUIRED');
        throw err;
      } else {
        throw err;
      }
    }

    const { items = [], nextSyncToken } = eventsResponse;
    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;

    await withTransaction(async txClient => {
      for (const item of items) {
        // Check existing mapping
        const eventMapping = await extMappingsRepo.findMappingByExternalId(
          'GOOGLE',
          account.externalAccountId,
          'EVENT',
          item.id,
          txClient,
        );

        // 1. Handle external Google deletion (showDeleted = true or status = 'cancelled')
        if (item.status === 'cancelled') {
          if (eventMapping) {
            // Update native event status to CANCELLED per CALENDAR-SPECIFICATION.md Section 40
            await eventsRepo.updateEvent(
              eventMapping.nativeObjectId,
              workspaceId,
              { status: 'CANCELLED' },
              txClient,
            );
            await extMappingsRepo.updateMapping(
              eventMapping.id,
              {
                syncState: SYNC_STATE.DELETED_EXTERNALLY,
                lastExternalModifiedAt: item.updated ? new Date(item.updated) : new Date(),
                lastSyncedAt: new Date(),
              },
              txClient,
            );
            deletedCount++;
          }
          continue;
        }

        // 2. Map Google event payload to Workaholic event attributes
        const mappedData = toWorkaholicEvent(item, nativeCalendarId, workspaceId, userId);

        if (eventMapping) {
          // Existing event: check conflict resolution
          const nativeEvent = await eventsRepo.findEventById(
            eventMapping.nativeObjectId,
            workspaceId,
            txClient,
          );

          if (nativeEvent) {
            const lastSync = eventMapping.lastSyncedAt
              ? new Date(eventMapping.lastSyncedAt).getTime()
              : 0;
            const lastNativeSync = eventMapping.lastNativeModifiedAt
              ? new Date(eventMapping.lastNativeModifiedAt).getTime()
              : lastSync;
            const lastExtSync = eventMapping.lastExternalModifiedAt
              ? new Date(eventMapping.lastExternalModifiedAt).getTime()
              : eventMapping.lastSyncedAt
                ? new Date(eventMapping.lastSyncedAt).getTime()
                : 0;

            const nativeModified = new Date(nativeEvent.updatedAt).getTime();
            const externalModified = item.updated ? new Date(item.updated).getTime() : 0;

            const isNativeModified = nativeModified > lastNativeSync;
            const isExternalModified =
              (item.etag && eventMapping.externalEtag && item.etag !== eventMapping.externalEtag) ||
              externalModified > lastExtSync;

            // Conflict resolution per docs/8.SYNC-SPECIFICATION.md Section 55 & docs/9.CALENDAR-SPECIFICATION.md Section 39:
            // If conflict: for Google-originated events (sourceType === 'GOOGLE'), Google is authoritative.
            if (isNativeModified && isExternalModified) {
              if (nativeEvent.sourceType !== 'GOOGLE') {
                // Native is authoritative for native-created events; mark CONFLICT state
                await extMappingsRepo.updateMapping(
                  eventMapping.id,
                  {
                    syncState: SYNC_STATE.CONFLICT,
                    lastExternalModifiedAt: new Date(externalModified || Date.now()),
                    lastSyncedAt: new Date(),
                  },
                  txClient,
                );
                continue;
              }
              // Google-originated: Google is authoritative; fall through to apply update
            } else if (isNativeModified && !isExternalModified) {
              // Only native changed: do not overwrite native with stale external data
              continue;
            } else if (!isNativeModified && !isExternalModified) {
              // Neither changed: idempotent no-op
              continue;
            }

            // Recurrence rule synchronization for existing event
            let recurrenceRuleId = nativeEvent.recurrenceRuleId;
            if (mappedData.recurrence) {
              if (!recurrenceRuleId) {
                const rule = await recurrenceRepo.createRecurrenceRule(
                  {
                    workspaceId,
                    frequency: mappedData.recurrence.frequency,
                    interval: mappedData.recurrence.interval || 1,
                    byWeekday: mappedData.recurrence.byWeekday || null,
                    startAt: mappedData.recurrence.startAt || mappedData.startAt,
                    endAt: mappedData.recurrence.endAt || null,
                    occurrenceCount: mappedData.recurrence.occurrenceCount || null,
                    timezone: mappedData.recurrence.timezone || mappedData.timezone || 'UTC',
                  },
                  txClient,
                );
                recurrenceRuleId = rule.id;
              } else {
                await recurrenceRepo.updateRecurrenceRule(
                  recurrenceRuleId,
                  workspaceId,
                  {
                    frequency: mappedData.recurrence.frequency,
                    interval: mappedData.recurrence.interval || 1,
                    byWeekday: mappedData.recurrence.byWeekday || null,
                    endAt: mappedData.recurrence.endAt || null,
                    occurrenceCount: mappedData.recurrence.occurrenceCount || null,
                    timezone: mappedData.recurrence.timezone || mappedData.timezone || 'UTC',
                  },
                  txClient,
                );
              }
            }

            // Apply Google update
            const updatedNative = await eventsRepo.updateEvent(
              nativeEvent.id,
              workspaceId,
              {
                title: mappedData.title,
                description: mappedData.description,
                location: mappedData.location,
                meetingUrl: mappedData.meetingUrl,
                status: mappedData.status,
                visibility: mappedData.visibility,
                startAt: mappedData.startAt,
                endAt: mappedData.endAt,
                startDate: mappedData.startDate,
                endDate: mappedData.endDate,
                isAllDay: mappedData.isAllDay,
                timezone: mappedData.timezone,
                recurrenceRuleId,
              },
              txClient,
            );

            await extMappingsRepo.updateMapping(
              eventMapping.id,
              {
                syncState: SYNC_STATE.SYNCED,
                externalEtag: item.etag,
                lastExternalModifiedAt: item.updated ? new Date(item.updated) : new Date(),
                lastNativeModifiedAt: updatedNative?.updatedAt
                  ? new Date(updatedNative.updatedAt)
                  : new Date(),
                lastSyncedAt: new Date(),
              },
              txClient,
            );
            updatedCount++;
          }
        } else {
          // 3. New event from Google: create recurrence rule if present, create native event, and persist mapping
          let recurrenceRuleId = null;
          if (mappedData.recurrence) {
            const rule = await recurrenceRepo.createRecurrenceRule(
              {
                workspaceId,
                frequency: mappedData.recurrence.frequency,
                interval: mappedData.recurrence.interval || 1,
                byWeekday: mappedData.recurrence.byWeekday || null,
                startAt: mappedData.recurrence.startAt || mappedData.startAt,
                endAt: mappedData.recurrence.endAt || null,
                occurrenceCount: mappedData.recurrence.occurrenceCount || null,
                timezone: mappedData.recurrence.timezone || mappedData.timezone || 'UTC',
              },
              txClient,
            );
            recurrenceRuleId = rule.id;
          }

          const created = await eventsRepo.createEvent(
            {
              calendarId: nativeCalendarId,
              workspaceId,
              title: mappedData.title,
              description: mappedData.description,
              location: mappedData.location,
              meetingUrl: mappedData.meetingUrl,
              visibility: mappedData.visibility,
              status: mappedData.status,
              sourceType: 'GOOGLE',
              sourceReference: item.id,
              startAt: mappedData.startAt,
              endAt: mappedData.endAt,
              startDate: mappedData.startDate,
              endDate: mappedData.endDate,
              isAllDay: mappedData.isAllDay,
              timezone: mappedData.timezone,
              recurrenceRuleId,
              createdBy: userId,
            },
            txClient,
          );

          await extMappingsRepo.upsertMapping(
            {
              userId,
              workspaceId,
              provider: 'GOOGLE',
              externalAccountId: account.externalAccountId,
              externalContainerId: googleCalId,
              externalObjectType: 'EVENT',
              externalObjectId: item.id,
              nativeObjectType: 'EVENT',
              nativeObjectId: created.id,
              syncState: SYNC_STATE.SYNCED,
              externalEtag: item.etag,
              lastExternalModifiedAt: item.updated ? new Date(item.updated) : new Date(),
              lastNativeModifiedAt: created?.updatedAt ? new Date(created.updatedAt) : new Date(),
              lastSyncedAt: new Date(),
              metadata: {
                htmlLink: item.htmlLink,
                iCalUID: item.iCalUID,
              },
            },
            txClient,
          );
          createdCount++;
        }
      }

      // 4. Update calendar sync cursor
      if (nextSyncToken) {
        await extMappingsRepo.updateMapping(
          activeCalMapping.id,
          {
            syncCursor: nextSyncToken,
            lastSyncedAt: new Date(),
          },
          txClient,
        );
      }
    });

    return {
      calendarId: nativeCalendarId,
      googleCalendarId: googleCalId,
      created: createdCount,
      updated: updatedCount,
      deleted: deletedCount,
      nextSyncToken: nextSyncToken || activeCalMapping.syncCursor,
    };
  }

  /**
   * Exports a native Workaholic event out to Google Calendar.
   * Conforms to docs/8.SYNC-SPECIFICATION.md Section 54
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} eventId
   * @param {Object} [adapterOverride]
   */
  async exportEvent(userId, workspaceId, eventId, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const { account, accessToken } = await this._getValidCredentials(userId);

    const event = await eventsRepo.findEventById(eventId, workspaceId);
    if (!event) {
      throw new NotFoundError(`Event ${eventId} not found`);
    }

    // Determine target Google calendar from calendar mapping
    const calMapping = await extMappingsRepo.findMappingByNativeId(
      'GOOGLE',
      userId,
      'CALENDAR',
      event.calendarId,
    );

    if (!calMapping) {
      throw new ValidationError(
        `Calendar ${event.calendarId} is not mapped to an external Google calendar`,
      );
    }

    const googleCalId = calMapping.externalObjectId;
    const existingEventMapping = await extMappingsRepo.findMappingByNativeId(
      'GOOGLE',
      userId,
      'EVENT',
      event.id,
    );

    const googlePayload = toGoogleEvent(event);

    if (existingEventMapping) {
      // Update external event
      const updatedGoogleEvent = await adapter.updateEvent(
        accessToken,
        googleCalId,
        existingEventMapping.externalObjectId,
        googlePayload,
      );

      await extMappingsRepo.updateMapping(existingEventMapping.id, {
        syncState: SYNC_STATE.SYNCED,
        externalEtag: updatedGoogleEvent?.etag || existingEventMapping.externalEtag,
        lastNativeModifiedAt: event.updatedAt,
        lastSyncedAt: new Date(),
      });

      return {
        action: 'UPDATED',
        googleEventId: existingEventMapping.externalObjectId,
        eventId: event.id,
      };
    }

    // Create external event
    const createdGoogleEvent = await adapter.createEvent(accessToken, googleCalId, googlePayload);

    await extMappingsRepo.upsertMapping({
      userId,
      workspaceId,
      provider: 'GOOGLE',
      externalAccountId: account.externalAccountId,
      externalContainerId: googleCalId,
      externalObjectType: 'EVENT',
      externalObjectId: createdGoogleEvent.id,
      nativeObjectType: 'EVENT',
      nativeObjectId: event.id,
      syncState: SYNC_STATE.SYNCED,
      externalEtag: createdGoogleEvent.etag,
      lastNativeModifiedAt: event.updatedAt,
      lastSyncedAt: new Date(),
    });

    return {
      action: 'CREATED',
      googleEventId: createdGoogleEvent.id,
      eventId: event.id,
    };
  }

  /**
   * Two-way synchronization for a specific calendar mapping
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} calendarMappingId
   * @param {Object} [options={}]
   * @param {Object} [adapterOverride]
   */
  async syncCalendar(userId, workspaceId, calendarMappingId, options = {}, adapterOverride = null) {
    const { integration } = await this._getValidCredentials(userId);

    // Update status to SYNCING
    await integrationsRepo.updateIntegrationStatus(integration.id, 'SYNCING');

    try {
      // 1. Inward sync: Import Google changes
      const importStats = await this.importEvents(
        userId,
        workspaceId,
        calendarMappingId,
        options,
        adapterOverride,
      );

      // 2. Outward sync: Export any unmapped native events in that calendar
      const dbRes = await pool.query(
        `SELECT id, source_type FROM events WHERE calendar_id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
        [importStats.calendarId, workspaceId],
      );

      let exportCount = 0;
      for (const evt of dbRes.rows) {
        if (evt.source_type !== 'GOOGLE') {
          const mapping = await extMappingsRepo.findMappingByNativeId(
            'GOOGLE',
            userId,
            'EVENT',
            evt.id,
          );
          if (!mapping) {
            await this.exportEvent(userId, workspaceId, evt.id, adapterOverride);
            exportCount++;
          }
        }
      }

      // Restore status to CONNECTED
      await integrationsRepo.updateIntegrationStatus(integration.id, 'CONNECTED');

      return {
        status: 'SUCCESS',
        calendarId: importStats.calendarId,
        googleCalendarId: importStats.googleCalendarId,
        imported: importStats.created + importStats.updated,
        deleted: importStats.deleted,
        exported: exportCount,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const isReauth = err.reauthRequired || err.code === 'REAUTH_REQUIRED';
      await integrationsRepo.updateIntegrationStatus(
        integration.id,
        isReauth ? 'REAUTH_REQUIRED' : 'ERROR',
      );
      throw err;
    }
  }

  /**
   * Disconnects Google Calendar integration while strictly preserving all native calendar data.
   * Conforms to docs/8.SYNC-SPECIFICATION.md Section 58 & docs/9.CALENDAR-SPECIFICATION.md Section 41
   */
  async disconnect(userId, client = pool) {
    // 1. Remove integration and encrypted credentials
    await oauthBoundaryService.disconnectGoogleIntegration(userId, client);

    // 2. Mark mappings as DETACHED to retain historical identity provenance without active sync
    const sql = `
      UPDATE external_object_mappings
      SET sync_state = 'DETACHED', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND provider = 'GOOGLE';
    `;
    await pool.query(sql, [userId]);

    return {
      disconnected: true,
      preservedData: true,
    };
  }
}

export const googleCalendarSyncService = new GoogleCalendarSyncService();
