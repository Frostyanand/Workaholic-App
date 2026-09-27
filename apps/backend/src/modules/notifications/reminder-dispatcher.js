import { notificationsService } from './notifications.service.js';
import { jobQueue } from '../../core/queue.js';
import { JobWorker } from '../../core/worker.js';
import { JOB_TYPE, JOB_PRIORITY } from '@workaholic/shared';

let tickerIntervalId = null;
let notificationWorker = null;

// Register the REMINDER_SWEEP handler with the general-purpose JobQueue
jobQueue.registerHandler(JOB_TYPE.REMINDER_SWEEP, async payload => {
  const currentTime = payload?.currentTime ? new Date(payload.currentTime) : new Date();
  return runReminderSweep(currentTime);
});

// Register the REMINDER_DISPATCH handler for targeted reminder dispatches
jobQueue.registerHandler(JOB_TYPE.REMINDER_DISPATCH, async payload => {
  if (payload?.reminderId) {
    return notificationsService.dispatchReminder(payload.reminderId);
  }
  return null;
});

/**
 * Executes a single due-reminder sweep and dispatches notifications
 * @param {Date} [currentTime=new Date()]
 * @returns {Promise<Array>}
 */
export async function runReminderSweep(currentTime = new Date()) {
  try {
    return await notificationsService.processDueReminders(currentTime);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[ReminderDispatcher] Error processing due reminders:', err);
    }
    return [];
  }
}

/**
 * Enqueue a reminder sweep background job into PostgreSQL queue
 * @param {Date} [currentTime=new Date()]
 * @param {import('pg').Pool | import('pg').PoolClient} [client]
 */
export async function enqueueReminderSweep(currentTime = new Date(), client) {
  // Deduplicate sweeps within a 30-second window
  const windowKey = `sweep_${Math.floor(currentTime.getTime() / 30000)}`;
  return jobQueue.enqueue(
    {
      queue: 'notifications',
      jobType: JOB_TYPE.REMINDER_SWEEP,
      payload: { currentTime: currentTime.toISOString() },
      priority: JOB_PRIORITY.HIGH,
      jobKey: windowKey,
    },
    client,
  );
}

/**
 * Starts the periodic reminder dispatcher and background worker
 * @param {import('fastify').FastifyInstance} [app]
 * @param {number} [intervalMs=30000]
 */
export function startReminderDispatcher(app = null, intervalMs = 30000) {
  if (tickerIntervalId) return;

  // Don't auto-start recurring background ticker in test environment to avoid open handles
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  notificationWorker = new JobWorker({
    queue: jobQueue,
    queueName: 'notifications',
    pollIntervalMs: 1000,
    maxPollIntervalMs: 5000,
  });
  notificationWorker.start();

  tickerIntervalId = setInterval(async () => {
    try {
      await enqueueReminderSweep();
    } catch {
      await runReminderSweep();
    }
  }, intervalMs);

  if (app && typeof app.addHook === 'function') {
    app.addHook('onClose', async () => {
      await stopReminderDispatcher();
    });
  }
}

export async function stopReminderDispatcher() {
  if (tickerIntervalId) {
    clearInterval(tickerIntervalId);
    tickerIntervalId = null;
  }
  if (notificationWorker) {
    await notificationWorker.stop();
    notificationWorker = null;
  }
}
