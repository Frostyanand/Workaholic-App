import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { JobWorker } from '../src/core/worker.js';
import { JobQueue } from '../src/core/queue.js';
import { pool, query } from '../src/core/db.js';
import { JOB_STATUS, JOB_TYPE } from '@workaholic/shared';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { remindersService } from '../src/modules/reminders/reminders.service.js';
import * as remindersRepo from '../src/modules/reminders/reminders.repository.js';
import { enqueueReminderSweep } from '../src/modules/notifications/reminder-dispatcher.js';
import { setPushTransport, MockPushTransport } from '../src/modules/notifications/fcm.transport.js';

describe('JobWorker & Concurrency Integration (Phase 12)', () => {
  const testQueue = 'test_worker_queue';
  let activeWorkers = [];

  beforeEach(async () => {
    await pool.query('DELETE FROM background_jobs WHERE queue = $1', [testQueue]);
    await pool.query('DELETE FROM background_jobs WHERE queue = $1', ['notifications']);
  });

  afterEach(async () => {
    // Ensure all workers are cleanly stopped
    for (const w of activeWorkers) {
      await w.stop();
    }
    activeWorkers = [];
  });

  afterAll(async () => {
    await pool.query('DELETE FROM background_jobs WHERE queue = $1', [testQueue]);
  });

  it('starts and stops gracefully without throwing or leaving unhandled rejections', async () => {
    const queue = new JobQueue();
    const worker = new JobWorker({
      queue,
      queueName: testQueue,
      pollIntervalMs: 50,
      staleRecoveryIntervalMs: 0, // disabled in test
    });
    activeWorkers.push(worker);

    worker.start();
    expect(worker.running).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 80));

    await worker.stop();
    expect(worker.running).toBe(false);
  });

  it('concurrently processes jobs across multiple workers without duplicate execution', async () => {
    const queue = new JobQueue();
    const processedJobIds = new Set();
    const executionLogs = [];

    queue.registerHandler('CONCURRENT_TASK', async (payload, job) => {
      // Simulate non-trivial work
      await new Promise(resolve => setTimeout(resolve, 30));
      if (processedJobIds.has(job.id)) {
        throw new Error(`DUPLICATE EXECUTION DETECTED for job ${job.id}`);
      }
      processedJobIds.add(job.id);
      executionLogs.push({ workerId: job.lockedBy, jobId: job.id, num: payload.num });
    });

    // Enqueue 8 discrete jobs into the queue
    for (let i = 0; i < 8; i++) {
      await queue.enqueue({
        queue: testQueue,
        jobType: 'CONCURRENT_TASK',
        payload: { num: i },
        priority: i,
      });
    }

    // Launch 3 distinct concurrent workers on the same queue
    const worker1 = new JobWorker({
      queue,
      queueName: testQueue,
      pollIntervalMs: 20,
      busyDelayMs: 10,
      staleRecoveryIntervalMs: 0,
    });
    const worker2 = new JobWorker({
      queue,
      queueName: testQueue,
      pollIntervalMs: 20,
      busyDelayMs: 10,
      staleRecoveryIntervalMs: 0,
    });
    const worker3 = new JobWorker({
      queue,
      queueName: testQueue,
      pollIntervalMs: 20,
      busyDelayMs: 10,
      staleRecoveryIntervalMs: 0,
    });

    activeWorkers.push(worker1, worker2, worker3);
    worker1.start();
    worker2.start();
    worker3.start();

    // Await completion of all 8 jobs
    const maxWait = 4000;
    const startTime = Date.now();
    while (processedJobIds.size < 8 && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    await worker1.stop();
    await worker2.stop();
    await worker3.stop();

    expect(processedJobIds.size).toBe(8);
    const metrics = await queue.getMetrics(testQueue);
    expect(metrics.COMPLETED).toBe(8);
    expect(metrics.PROCESSING).toBe(0);
    expect(metrics.PENDING).toBe(0);
  });

  it('isolates handler failures: a failing job does not crash the worker or block other jobs', async () => {
    const queue = new JobQueue();
    const successfulPayloads = [];

    queue.registerHandler('FAULT_TOLERANT_TASK', async payload => {
      if (payload.shouldFail) {
        const err = new Error('Simulated fatal external service failure');
        err.nonRetryable = true;
        throw err;
      }
      successfulPayloads.push(payload.id);
    });

    // Enqueue 1 failing job and 2 succeeding jobs
    await queue.enqueue({
      queue: testQueue,
      jobType: 'FAULT_TOLERANT_TASK',
      payload: { id: 'fail_1', shouldFail: true },
      priority: 10, // Attempted first
    });
    await queue.enqueue({
      queue: testQueue,
      jobType: 'FAULT_TOLERANT_TASK',
      payload: { id: 'succ_1', shouldFail: false },
      priority: 5,
    });
    await queue.enqueue({
      queue: testQueue,
      jobType: 'FAULT_TOLERANT_TASK',
      payload: { id: 'succ_2', shouldFail: false },
      priority: 1,
    });

    const worker = new JobWorker({
      queue,
      queueName: testQueue,
      pollIntervalMs: 25,
      busyDelayMs: 10,
      staleRecoveryIntervalMs: 0,
    });
    activeWorkers.push(worker);
    worker.start();

    const maxWait = 3000;
    const startTime = Date.now();
    while (successfulPayloads.length < 2 && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    await worker.stop();

    expect(successfulPayloads).toContain('succ_1');
    expect(successfulPayloads).toContain('succ_2');

    const metrics = await queue.getMetrics(testQueue);
    expect(metrics.COMPLETED).toBe(2);
    expect(metrics.DEAD_LETTER).toBe(1);
    expect(metrics.PENDING).toBe(0);
  });

  it('recovers abandoned jobs periodically when worker is running', async () => {
    const queue = new JobQueue();

    // Create an abandoned job in testQueue
    const abandonedJob = await queue.enqueue({
      queue: testQueue,
      jobType: 'ORPHANED_TASK',
      maxAttempts: 3,
    });

    const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
    await query(
      `UPDATE background_jobs
       SET status = 'PROCESSING', locked_at = $2, locked_by = 'vanished_worker', attempts = 1
       WHERE id = $1`,
      [abandonedJob.id, tenMinutesAgo],
    );

    const worker = new JobWorker({
      queue,
      queueName: testQueue,
      pollIntervalMs: 100,
      staleRecoveryIntervalMs: 50, // fast recovery for test
      staleTimeoutSeconds: 300,
    });
    activeWorkers.push(worker);

    worker.start();

    // Wait for recovery ticker to run
    await new Promise(resolve => setTimeout(resolve, 150));
    await worker.stop();

    const recovered = await queue.findById(abandonedJob.id);
    expect(recovered.status).toBe(JOB_STATUS.PENDING);
    expect(recovered.lockedBy).toBeNull();
  });

  describe('Phase 11 Reminder Processing via JobQueue & JobWorker', () => {
    let user;
    let workspace;
    let mockTransport;

    beforeEach(async () => {
      mockTransport = new MockPushTransport();
      setPushTransport(mockTransport);

      user = await createUser({
        displayName: 'Worker Integration User',
        email: `worker_reminder_${Date.now()}@example.com`,
      });

      const wsRes = await createWorkspaceWithMembership({
        name: 'Worker Workspace',
        workspaceType: 'PERSONAL',
        ownerUserId: user.id,
      });
      workspace = wsRes.workspace;
    });

    afterEach(async () => {
      if (user && workspace) {
        await query(
          'DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE recipient_user_id = $1)',
          [user.id],
        );
        await query('DELETE FROM notifications WHERE recipient_user_id = $1', [user.id]);
        await query('DELETE FROM reminder_recipients WHERE user_id = $1', [user.id]);
        await query('DELETE FROM reminders WHERE workspace_id = $1', [workspace.id]);
        await query('DELETE FROM workspaces WHERE id = $1', [workspace.id]);
        await query('DELETE FROM users WHERE id = $1', [user.id]);
      }
    });

    it('processes due reminders end-to-end through background JobWorker', async () => {
      const queue = new JobQueue();
      // Import the registered reminder handler behavior
      const { runReminderSweep } =
        await import('../src/modules/notifications/reminder-dispatcher.js');
      queue.registerHandler(JOB_TYPE.REMINDER_SWEEP, async payload => {
        const currentTime = payload?.currentTime ? new Date(payload.currentTime) : new Date();
        return runReminderSweep(currentTime);
      });

      // 1. Create a reminder due in the past
      const pastTime = new Date(Date.now() - 120000).toISOString();
      const reminder = await remindersService.createReminder(
        {
          workspaceId: workspace.id,
          triggerType: 'ABSOLUTE_TIME',
          triggerAt: pastTime,
          title: 'Queue Processed Reminder',
        },
        user,
      );

      // 2. Enqueue the reminder sweep job into 'notifications' queue
      const sweepJob = await enqueueReminderSweep(new Date());
      expect(sweepJob.status).toBe(JOB_STATUS.PENDING);
      expect(sweepJob.jobType).toBe(JOB_TYPE.REMINDER_SWEEP);

      // 3. Start a worker dedicated to the notifications queue
      const worker = new JobWorker({
        queue,
        queueName: 'notifications',
        pollIntervalMs: 25,
        busyDelayMs: 10,
        staleRecoveryIntervalMs: 0,
      });
      activeWorkers.push(worker);
      worker.start();

      // 4. Poll until the sweep job is completed
      const maxWait = 3000;
      const startWait = Date.now();
      let completedJob = null;

      while (Date.now() - startWait < maxWait) {
        completedJob = await queue.findById(sweepJob.id);
        if (completedJob && completedJob.status === JOB_STATUS.COMPLETED) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      await worker.stop();

      expect(completedJob.status).toBe(JOB_STATUS.COMPLETED);

      // 5. Verify the reminder recipient status transitioned to SENT in the database
      const recipient = await remindersRepo.findRecipient(reminder.id, user.id);
      expect(recipient.recipientStatus).toBe('SENT');
    });
  });
});
