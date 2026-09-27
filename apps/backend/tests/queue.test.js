import { describe, it, expect, beforeEach } from 'vitest';
import { JobQueue } from '../src/core/queue.js';
import {
  enqueueJob,
  fetchNextPendingJob,
  completeJob,
  failJob,
  findJobById,
  findJobs,
  cancelJob,
  deadLetterJob,
  recoverStaleJobs,
  getQueueMetrics,
} from '../src/core/jobs.repository.js';
import { pool, withTransaction, query } from '../src/core/db.js';
import { JOB_STATUS } from '@workaholic/shared';

describe('Background Job Foundation (Task 3.6 & Phase 12)', () => {
  describe('JobQueue Unit Tests', () => {
    let mockRepo;
    let queue;

    beforeEach(() => {
      mockRepo = {
        enqueueJob: async data => ({ id: 'job_1', status: 'PENDING', ...data }),
        fetchNextPendingJob: async (_q, workerId) => ({
          id: 'job_1',
          jobType: 'TEST_TASK',
          payload: { foo: 'bar' },
          attempts: 1,
          maxAttempts: 3,
          lockedBy: workerId,
        }),
        completeJob: async id => ({ id, status: 'COMPLETED' }),
        failJob: async (id, err, delay, isDeadLetter) => ({
          id,
          status: isDeadLetter ? 'DEAD_LETTER' : 'PENDING',
          lastError: err,
        }),
        getQueueMetrics: async () => ({
          queue: 'default',
          PENDING: 1,
          PROCESSING: 0,
          COMPLETED: 0,
          FAILED: 0,
          CANCELLED: 0,
          DEAD_LETTER: 0,
          total: 1,
        }),
      };
      queue = new JobQueue(mockRepo);
    });

    it('enqueues a job successfully', async () => {
      const job = await queue.enqueue({
        jobType: 'SEND_REMINDER',
        payload: { eventId: 'evt_1' },
      });
      expect(job.id).toBe('job_1');
      expect(job.status).toBe('PENDING');
    });

    it('processes job successfully when handler executes without error', async () => {
      let handledPayload = null;
      queue.registerHandler('TEST_TASK', async payload => {
        handledPayload = payload;
      });

      const result = await queue.processNext('default');
      expect(result.processed).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(handledPayload).toEqual({ foo: 'bar' });
    });

    it('handles failing job handler and records failure in repository', async () => {
      queue.registerHandler('TEST_TASK', async () => {
        throw new Error('Connection timeout to notification provider');
      });

      const result = await queue.processNext('default');
      expect(result.processed).toBe(true);
      expect(result.error.message).toBe('Connection timeout to notification provider');
    });

    it('fails job when no handler is registered for jobType', async () => {
      // No handler registered for TEST_TASK
      const result = await queue.processNext('default');
      expect(result.processed).toBe(true);
      expect(result.status).toBe('FAILED');
      expect(result.error.message).toContain('No handler registered');
    });

    it('retrieves queue metrics', async () => {
      const metrics = await queue.getMetrics('default');
      expect(metrics.total).toBe(1);
      expect(metrics.PENDING).toBe(1);
    });

    it('calculates exponential backoff delay correctly', () => {
      expect(queue.calculateBackoff(1, 10, 3600, 2)).toBe(10);
      expect(queue.calculateBackoff(2, 10, 3600, 2)).toBe(20);
      expect(queue.calculateBackoff(3, 10, 3600, 2)).toBe(40);
      expect(queue.calculateBackoff(4, 10, 3600, 2)).toBe(80);
      // Caps at maxDelay
      expect(queue.calculateBackoff(10, 10, 100, 2)).toBe(100);
    });

    it('identifies non-retryable errors and marks job as DEAD_LETTER', async () => {
      queue.registerHandler('TEST_TASK', async () => {
        const err = new Error('Unrecoverable schema validation error');
        err.nonRetryable = true;
        throw err;
      });

      const result = await queue.processNext('default');
      expect(result.processed).toBe(true);
      expect(result.status).toBe('DEAD_LETTER');
    });
  });

  describe('PostgreSQL 16 Live Queue Integration', () => {
    const testQueue = 'test_integration_queue';

    beforeEach(async () => {
      // Clean up integration test jobs
      await pool.query('DELETE FROM background_jobs WHERE queue = $1', [testQueue]);
    });

    it('persists enqueued jobs in live database with correct schema and defaults', async () => {
      const job = await enqueueJob({
        queue: testQueue,
        jobType: 'ACADEMIC_SYNC',
        payload: { semesterId: 'sem_123', count: 42 },
        priority: 10,
        maxAttempts: 3,
      });

      expect(job.id).toBeDefined();
      expect(job.queue).toBe(testQueue);
      expect(job.jobType).toBe('ACADEMIC_SYNC');
      expect(job.payload).toEqual({ semesterId: 'sem_123', count: 42 });
      expect(job.status).toBe(JOB_STATUS.PENDING);
      expect(job.priority).toBe(10);
      expect(job.attempts).toBe(0);

      const fromDb = await findJobById(job.id);
      expect(fromDb.id).toBe(job.id);
    });

    it('concurrently locks jobs using FOR UPDATE SKIP LOCKED without blocking', async () => {
      // Insert two jobs with different priorities
      const job1 = await enqueueJob({
        queue: testQueue,
        jobType: 'TASK_A',
        priority: 5,
      });

      const job2 = await enqueueJob({
        queue: testQueue,
        jobType: 'TASK_B',
        priority: 10, // Higher priority should be picked first
      });

      // Worker 1 acquires next job inside tx1
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        await client1.query('BEGIN');
        const worker1Job = await fetchNextPendingJob(testQueue, 'worker-1', client1);
        expect(worker1Job.id).toBe(job2.id); // Higher priority job2 acquired
        expect(worker1Job.status).toBe(JOB_STATUS.PROCESSING);

        // Worker 2 concurrently acquires next job inside tx2 without blocking
        await client2.query('BEGIN');
        const worker2Job = await fetchNextPendingJob(testQueue, 'worker-2', client2);
        expect(worker2Job.id).toBe(job1.id); // Skipped locked job2, acquired job1
        expect(worker2Job.status).toBe(JOB_STATUS.PROCESSING);

        await client1.query('COMMIT');
        await client2.query('COMMIT');
      } finally {
        client1.release();
        client2.release();
      }
    });

    it('marks completed job with timestamp and clears locks', async () => {
      const job = await enqueueJob({
        queue: testQueue,
        jobType: 'CLEANUP',
      });

      const completed = await completeJob(job.id);
      expect(completed.status).toBe(JOB_STATUS.COMPLETED);
      expect(completed.completedAt).toBeDefined();

      const metrics = await getQueueMetrics(testQueue);
      expect(metrics.COMPLETED).toBe(1);
      expect(metrics.PENDING).toBe(0);
    });

    it('schedules retry with backoff on failure when attempts < maxAttempts', async () => {
      const job = await enqueueJob({
        queue: testQueue,
        jobType: 'GOOGLE_SYNC',
        maxAttempts: 3,
      });

      // Simulate lock & first attempt
      await withTransaction(async txClient => {
        await fetchNextPendingJob(testQueue, 'worker-err', txClient);
      });

      // Fail attempt 1
      const retryResult = await failJob(job.id, 'API 503 Rate Limit', 300);
      expect(retryResult.status).toBe(JOB_STATUS.PENDING); // Rescheduled
      expect(retryResult.attempts).toBe(1);
      expect(retryResult.lastError).toBe('API 503 Rate Limit');
      // run_at is in the future
      expect(new Date(retryResult.runAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('transitions job to FAILED when maxAttempts is reached', async () => {
      const job = await enqueueJob({
        queue: testQueue,
        jobType: 'SEND_PUSH',
        maxAttempts: 1, // Will exhaust after 1 attempt
      });

      // Simulate lock & attempt
      await withTransaction(async txClient => {
        await fetchNextPendingJob(testQueue, 'worker-max', txClient);
      });

      const terminalFail = await failJob(job.id, 'Invalid device token');
      expect(terminalFail.status).toBe(JOB_STATUS.FAILED);
      expect(terminalFail.attempts).toBe(1);
      expect(terminalFail.lastError).toBe('Invalid device token');

      const metrics = await getQueueMetrics(testQueue);
      expect(metrics.FAILED).toBe(1);
    });

    it('transitions job to DEAD_LETTER on non-retryable failure or explicit dead-lettering', async () => {
      const job = await enqueueJob({
        queue: testQueue,
        jobType: 'CORRUPT_PAYLOAD',
        maxAttempts: 5,
      });

      const deadLettered = await deadLetterJob(job.id, 'Payload malformed and cannot be processed');
      expect(deadLettered.status).toBe(JOB_STATUS.DEAD_LETTER);
      expect(deadLettered.deadLetterReason).toBe('Payload malformed and cannot be processed');

      const metrics = await getQueueMetrics(testQueue);
      expect(metrics.DEAD_LETTER).toBe(1);
    });

    it('deduplicates enqueued jobs when jobKey matches an active pending/processing job', async () => {
      const job1 = await enqueueJob({
        queue: testQueue,
        jobType: 'CALENDAR_SYNC',
        payload: { userId: 'usr_123' },
        jobKey: 'sync_usr_123',
      });

      const job2 = await enqueueJob({
        queue: testQueue,
        jobType: 'CALENDAR_SYNC',
        payload: { userId: 'usr_123' },
        jobKey: 'sync_usr_123', // Same active key
      });

      expect(job1.id).toBe(job2.id); // Re-used existing active job
      const metrics = await getQueueMetrics(testQueue);
      expect(metrics.total).toBe(1);
    });

    it('cancels pending and processing jobs cleanly', async () => {
      const job = await enqueueJob({
        queue: testQueue,
        jobType: 'FUTURE_REPORT',
      });

      const cancelled = await cancelJob(job.id);
      expect(cancelled.status).toBe(JOB_STATUS.CANCELLED);

      const metrics = await getQueueMetrics(testQueue);
      expect(metrics.CANCELLED).toBe(1);
      expect(metrics.PENDING).toBe(0);
    });

    it('recovers stale processing jobs left by crashed workers', async () => {
      const job1 = await enqueueJob({
        queue: testQueue,
        jobType: 'CRASHED_JOB_1',
        maxAttempts: 3,
      });

      const job2 = await enqueueJob({
        queue: testQueue,
        jobType: 'CRASHED_JOB_2',
        maxAttempts: 1, // Will exhaust on recovery
      });

      // Manually set both to PROCESSING with old locked_at (10 minutes ago)
      const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
      await query(
        `UPDATE background_jobs
         SET status = 'PROCESSING', locked_at = $2, locked_by = 'crashed_worker', attempts = 1
         WHERE id = $1`,
        [job1.id, tenMinutesAgo],
      );
      await query(
        `UPDATE background_jobs
         SET status = 'PROCESSING', locked_at = $2, locked_by = 'crashed_worker', attempts = 1
         WHERE id = $1`,
        [job2.id, tenMinutesAgo],
      );

      // Run stale recovery for jobs locked > 300 seconds ago
      const recovered = await recoverStaleJobs(300, 10);
      expect(recovered.length).toBe(2);

      // Job 1 had attempts (1) < maxAttempts (3) -> recovered to PENDING
      const updatedJob1 = await findJobById(job1.id);
      expect(updatedJob1.status).toBe(JOB_STATUS.PENDING);
      expect(updatedJob1.lockedBy).toBeNull();
      expect(updatedJob1.lastError).toContain('Recovered from stale PROCESSING lock');

      // Job 2 had attempts (1) >= maxAttempts (1) -> recovered to DEAD_LETTER
      const updatedJob2 = await findJobById(job2.id);
      expect(updatedJob2.status).toBe(JOB_STATUS.DEAD_LETTER);
      expect(updatedJob2.deadLetterReason).toContain('Stale lock timed out');
    });

    it('queries jobs with filtering for observability', async () => {
      await enqueueJob({ queue: testQueue, jobType: 'QUERY_TYPE_A' });
      await enqueueJob({ queue: testQueue, jobType: 'QUERY_TYPE_B' });

      const foundA = await findJobs({ queue: testQueue, jobType: 'QUERY_TYPE_A' });
      expect(foundA.length).toBe(1);
      expect(foundA[0].jobType).toBe('QUERY_TYPE_A');

      const all = await findJobs({ queue: testQueue, limit: 10 });
      expect(all.length).toBe(2);
    });
  });
});
