import { jobQueue } from '../../../core/queue.js';
import { JOB_TYPE, JOB_PRIORITY } from '@workaholic/shared';
import { googleCalendarSyncService } from './google-calendar-sync.service.js';

// Register background job handlers with Phase 12 JobQueue
jobQueue.registerHandler(JOB_TYPE.GOOGLE_CALENDAR_SYNC, async payload => {
  const { userId, workspaceId, calendarMappingId, options } = payload;
  return googleCalendarSyncService.syncCalendar(userId, workspaceId, calendarMappingId, options);
});

jobQueue.registerHandler(JOB_TYPE.CALENDAR_SYNC, async payload => {
  const { userId, workspaceId, calendarMappingId, options } = payload;
  return googleCalendarSyncService.syncCalendar(userId, workspaceId, calendarMappingId, options);
});

/**
 * Enqueue an asynchronous background Google Calendar sync job
 * Conforms to Phase 12 Job Infrastructure requirements
 *
 * @param {string} userId
 * @param {string} workspaceId
 * @param {string} [calendarMappingId]
 * @param {Object} [options={}]
 * @param {import('pg').Pool | import('pg').PoolClient} [client]
 */
export async function enqueueGoogleCalendarSync(
  userId,
  workspaceId,
  calendarMappingId = null,
  options = {},
  client,
) {
  // Deterministic jobKey prevents duplicate active syncs for the same user & calendar
  const keyTarget = calendarMappingId || 'all';
  const jobKey = `google_cal_sync_${userId}_${keyTarget}`;

  return jobQueue.enqueue(
    {
      queue: 'sync',
      jobType: JOB_TYPE.GOOGLE_CALENDAR_SYNC,
      payload: { userId, workspaceId, calendarMappingId, options },
      priority: JOB_PRIORITY.NORMAL,
      jobKey,
    },
    client,
  );
}
