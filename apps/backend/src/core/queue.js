import { randomUUID } from 'node:crypto';
import * as jobsRepo from './jobs.repository.js';
import { withTransaction, pool } from './db.js';

/**
 * PostgreSQL-backed Background Job Queue
 * Conforms to docs/phase-wise-plan.md Section 16 & docs/6.SYSTEM-ARCHITECTURE.md Section 35, 36, 64 & AGENTS.md
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
   * Calculate exponential backoff delay in seconds
   * @param {number} attempts Current attempt count (1-based)
   * @param {number} [baseDelaySeconds=10]
   * @param {number} [maxDelaySeconds=3600]
   * @param {number} [backoffFactor=2]
   * @returns {number} Delay in seconds
   */
  calculateBackoff(attempts, baseDelaySeconds = 10, maxDelaySeconds = 3600, backoffFactor = 2) {
    const exponent = Math.max(0, attempts - 1);
    const delay = baseDelaySeconds * Math.pow(backoffFactor, exponent);
    return Math.min(Math.round(delay), maxDelaySeconds);
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
   * @param {string} [jobData.jobKey=null] Optional deduplication key
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   */
  async enqueue(jobData, client = this.pool) {
    return this.repo.enqueueJob(jobData, client);
  }

  /**
   * Retrieve a background job by ID
   * @param {string} jobId
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   */
  async getJob(jobId, client = this.pool) {
    return this.repo.findJobById(jobId, client);
  }

  /**
   * Atomically poll and process a single job from the specified queue.
   * Employs FOR UPDATE SKIP LOCKED to prevent duplicate processing and lock contention.
   *
   * @param {string} [queueName='default']
   * @param {number|Object} [options=60] Retry delay seconds or configuration object
   * @returns {Promise<{ processed: boolean, job?: Object, status?: string, error?: Error }>}
   */
  async processNext(queueName = 'default', options = 60) {
    let baseDelay = 10;
    let maxDelay = 3600;
    let factor = 2;
    let fixedDelay = null;

    if (typeof options === 'number') {
      fixedDelay = options;
    } else if (typeof options === 'object' && options !== null) {
      if (options.retryDelaySeconds) fixedDelay = options.retryDelaySeconds;
      if (options.baseDelaySeconds) baseDelay = options.baseDelaySeconds;
      if (options.maxDelaySeconds) maxDelay = options.maxDelaySeconds;
      if (options.backoffFactor) factor = options.backoffFactor;
    }

    // 1. Atomically lock and advance the next job inside an isolated transaction
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
      const failed = await this.repo.failJob(
        job.id,
        errMessage,
        fixedDelay || 60,
        false,
        this.pool,
      );
      return {
        processed: true,
        job: failed || job,
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
      const isNonRetryable = Boolean(err.nonRetryable || err.fatal);
      const delaySeconds =
        fixedDelay !== null
          ? fixedDelay
          : this.calculateBackoff(job.attempts, baseDelay, maxDelay, factor);

      const failed = await this.repo.failJob(
        job.id,
        err.message || 'Job handler execution failure',
        delaySeconds,
        isNonRetryable,
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
   * Cancel an enqueued job
   * @param {string} jobId
   * @param {import('pg').Pool | import('pg').PoolClient} [client=this.pool]
   */
  async cancel(jobId, client = this.pool) {
    return this.repo.cancelJob(jobId, client);
  }

  /**
   * Explicitly transition a job to DEAD_LETTER
   * @param {string} jobId
   * @param {string} reason
   * @param {import('pg').Pool | import('pg').PoolClient} [client=this.pool]
   */
  async deadLetter(jobId, reason, client = this.pool) {
    return this.repo.deadLetterJob(jobId, reason, client);
  }

  /**
   * Recover stale jobs from abandoned or crashed workers
   * @param {number} [staleTimeoutSeconds=300]
   * @param {number} [retryDelaySeconds=30]
   */
  async recoverStale(staleTimeoutSeconds = 300, retryDelaySeconds = 30) {
    return this.repo.recoverStaleJobs(staleTimeoutSeconds, retryDelaySeconds, this.pool);
  }

  /**
   * Retrieve queue metrics
   * @param {string} [queueName='default']
   */
  async getMetrics(queueName = 'default') {
    return this.repo.getQueueMetrics(queueName, this.pool);
  }

  /**
   * Find a job by ID
   * @param {string} jobId
   */
  async findById(jobId) {
    return this.repo.findJobById(jobId, this.pool);
  }

  /**
   * Query jobs with filtering
   * @param {Object} filter
   */
  async find(filter = {}) {
    return this.repo.findJobs(filter, this.pool);
  }
}

export const jobQueue = new JobQueue();
