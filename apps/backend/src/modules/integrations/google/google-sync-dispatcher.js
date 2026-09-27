import { jobQueue } from '../../../core/queue.js';
import { JOB_TYPE, JOB_PRIORITY } from '@workaholic/shared';
import { googleCalendarSyncService } from './google-calendar-sync.service.js';
import { googleTasksSyncService } from './google-tasks-sync.service.js';
import { googleDriveSyncService } from './google-drive-sync.service.js';

// Register background job handlers with Phase 12 JobQueue
jobQueue.registerHandler(JOB_TYPE.GOOGLE_CALENDAR_SYNC, async payload => {
  const { userId, workspaceId, calendarMappingId, options } = payload;
  return googleCalendarSyncService.syncCalendar(userId, workspaceId, calendarMappingId, options);
});

jobQueue.registerHandler(JOB_TYPE.CALENDAR_SYNC, async payload => {
  const { userId, workspaceId, calendarMappingId, options } = payload;
  return googleCalendarSyncService.syncCalendar(userId, workspaceId, calendarMappingId, options);
});

jobQueue.registerHandler(JOB_TYPE.GOOGLE_TASKS_SYNC, async payload => {
  const { userId, workspaceId, taskListMappingId, options } = payload;
  return googleTasksSyncService.syncTasks(userId, workspaceId, taskListMappingId, options);
});

jobQueue.registerHandler(JOB_TYPE.TASKS_SYNC, async payload => {
  const { userId, workspaceId, taskListMappingId, options } = payload;
  return googleTasksSyncService.syncTasks(userId, workspaceId, taskListMappingId, options);
});

jobQueue.registerHandler(JOB_TYPE.GOOGLE_DRIVE_UPLOAD, async payload => {
  const { userId, workspaceId, uploadData } = payload;
  return googleDriveSyncService.uploadAttachment(userId, workspaceId, uploadData);
});

jobQueue.registerHandler(JOB_TYPE.DRIVE_UPLOAD, async payload => {
  const { userId, workspaceId, uploadData } = payload;
  return googleDriveSyncService.uploadAttachment(userId, workspaceId, uploadData);
});

jobQueue.registerHandler(JOB_TYPE.GOOGLE_DRIVE_SYNC, async payload => {
  const { userId, workspaceId, attachmentId } = payload;
  return googleDriveSyncService.syncAttachmentStatus(userId, workspaceId, attachmentId);
});

jobQueue.registerHandler(JOB_TYPE.DRIVE_SYNC, async payload => {
  const { userId, workspaceId, attachmentId } = payload;
  return googleDriveSyncService.syncAttachmentStatus(userId, workspaceId, attachmentId);
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

/**
 * Enqueue an asynchronous background Google Tasks sync job
 * Conforms to Phase 12 Job Infrastructure requirements
 *
 * @param {string} userId
 * @param {string} workspaceId
 * @param {string} [taskListMappingId]
 * @param {Object} [options={}]
 * @param {import('pg').Pool | import('pg').PoolClient} [client]
 */
export async function enqueueGoogleTasksSync(
  userId,
  workspaceId,
  taskListMappingId = null,
  options = {},
  client,
) {
  // Deterministic jobKey prevents duplicate active syncs for the same user & task list
  const keyTarget = taskListMappingId || 'all';
  const jobKey = `google_tasks_sync_${userId}_${keyTarget}`;

  return jobQueue.enqueue(
    {
      queue: 'sync',
      jobType: JOB_TYPE.GOOGLE_TASKS_SYNC,
      payload: { userId, workspaceId, taskListMappingId, options },
      priority: JOB_PRIORITY.NORMAL,
      jobKey,
    },
    client,
  );
}

/**
 * Enqueue an asynchronous background Google Drive upload job
 *
 * @param {string} userId
 * @param {string} workspaceId
 * @param {Object} uploadData
 * @param {import('pg').Pool | import('pg').PoolClient} [client]
 */
export async function enqueueGoogleDriveUpload(userId, workspaceId, uploadData, client) {
  const jobKey = `google_drive_upload_${userId}_${uploadData.targetType}_${uploadData.targetId}_${Date.now()}`;

  return jobQueue.enqueue(
    {
      queue: 'sync',
      jobType: JOB_TYPE.GOOGLE_DRIVE_UPLOAD,
      payload: { userId, workspaceId, uploadData },
      priority: JOB_PRIORITY.NORMAL,
      jobKey,
    },
    client,
  );
}

/**
 * Enqueue an asynchronous background Google Drive sync / reconciliation job
 *
 * @param {string} userId
 * @param {string} workspaceId
 * @param {string} attachmentId
 * @param {import('pg').Pool | import('pg').PoolClient} [client]
 */
export async function enqueueGoogleDriveSync(userId, workspaceId, attachmentId, client) {
  const jobKey = `google_drive_sync_${userId}_${attachmentId}`;

  return jobQueue.enqueue(
    {
      queue: 'sync',
      jobType: JOB_TYPE.GOOGLE_DRIVE_SYNC,
      payload: { userId, workspaceId, attachmentId },
      priority: JOB_PRIORITY.NORMAL,
      jobKey,
    },
    client,
  );
}
