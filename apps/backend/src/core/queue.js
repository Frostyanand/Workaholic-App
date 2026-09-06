import { randomUUID } from 'node:crypto';
import * as jobsRepo from './jobs.repository.js';
import { withTransaction, pool } from './db.js';

/**
 * PostgreSQL-backed Background Job Queue
 * Conforms to docs/6.SYSTEM-ARCHITECTURE.md Section 35, 36, 64 & AGENTS.md
 * Strictly uses PostgreSQL with SELECT ... FOR UPDATE SKIP LOCKED
 */
export class JobQueue {
  constructor(repository = jobsRepo, dbPool = pool) {
    this.repo = repository;
    this.pool = dbPool;
    this.handlers = new Map();
    this.workerId = `worker_${randomUUID().slice(0, 8)}`;
  }

  /**
   * Register an asynchronous execution handler for a specific jobType
   * @param {string} jobType
   * @param {(payload: Object, job: Object) => Promise<any>} handlerFn
   */
  registerHandler(jobType, handlerFn) {
    if (typeof handlerFn !== 'function') {
      throw new TypeError(`Handler for jobType ${jobType} must be a function`);
    }
    this.handlers.set(jobType, handlerFn);
  }

  /**
   * Enqueue a new background job
   * @param {Object} jobData
   * @param {string} jobData.jobType
   * @param {Object} [jobData.payload={}]
   * @param {string} [jobData.queue='default']
   * @param {number} [jobData.priority=0]
   * @param {Date|string} [jobData.runAt]
   * @param {number} [jobData.maxAttempts=3]
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   */
  async enqueue(jobData, client = this.pool) {
    return this.repo.enqueueJob(jobData, client);
  }

  /**
   * Atomically poll and process a single job from the specified queue.
   * Employs FOR UPDATE SKIP LOCKED to prevent duplicate processing and lock contention.
   *
   * @param {string} [queueName='default']
   * @param {number} [retryDelaySeconds=60]
   * @returns {Promise<{ processed: boolean, job?: Object, status?: string, error?: Error }>}
   */
  async processNext(queueName = 'default', retryDelaySeconds = 60) {
    // 1. Atomically lock and advance the next job inside a transaction
    const job = await withTransaction(async txClient => {
      return this.repo.fetchNextPendingJob(queueName, this.workerId, txClient);
    }, this.pool);

    if (!job) {
      return { processed: false };
    }

    // 2. Resolve handler
    const handler = this.handlers.get(job.jobType);
    if (!handler) {
      const errMessage = `No handler registered for jobType: ${job.jobType}`;
      await this.repo.failJob(job.id, errMessage, retryDelaySeconds, this.pool);
      return {
        processed: true,
        job,
        status: 'FAILED',
        error: new Error(errMessage),
      };
    }

    // 3. Execute handler
    try {
      await handler(job.payload, job);
      const completed = await this.repo.completeJob(job.id, this.pool);
      return {
        processed: true,
        job: completed,
        status: 'COMPLETED',
      };
    } catch (err) {
      const failed = await this.repo.failJob(
        job.id,
        err.message || 'Job handler execution failure',
        retryDelaySeconds,
        this.pool,
      );
      return {
        processed: true,
        job: failed,
        status: failed.status,
        error: err,
      };
    }
  }

  /**
   * Retrieve queue metrics
   * @param {string} [queueName='default']
   */
  async getMetrics(queueName = 'default') {
    return this.repo.getQueueMetrics(queueName, this.pool);
  }
}

export const jobQueue = new JobQueue();
