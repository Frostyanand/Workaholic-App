import { randomUUID } from 'node:crypto';
import { jobQueue } from './queue.js';

/**
 * General-Purpose PostgreSQL Background Job Worker
 * Conforms to docs/phase-wise-plan.md Section 16 & docs/6.SYSTEM-ARCHITECTURE.md Section 35, 36
 *
 * Provides:
 * - Atomic polling via FOR UPDATE SKIP LOCKED
 * - Adaptive backoff to prevent DB CPU thrashing when idle
 * - Handler isolation: unhandled errors never crash the worker
 * - Periodic recovery of abandoned/stale PROCESSING locks
 * - Clean asynchronous graceful shutdown
 */
export class JobWorker {
  /**
   * @param {Object} [options={}]
   * @param {import('./queue.js').JobQueue} [options.queue=jobQueue]
   * @param {string} [options.queueName='default']
   * @param {number} [options.pollIntervalMs=500] Initial poll delay when idle
   * @param {number} [options.maxPollIntervalMs=3000] Maximum poll delay when idle (adaptive backoff)
   * @param {number} [options.busyDelayMs=20] Delay between iterations when jobs are actively processed
   * @param {number} [options.staleRecoveryIntervalMs=60000] How often to check for abandoned/stale jobs
   * @param {number} [options.staleTimeoutSeconds=300] Time threshold for a processing job to be considered stale
   * @param {string} [options.workerId] Unique identifier for this worker instance
   * @param {Object|number} [options.retryOptions] Options passed to queue.processNext
   */
  constructor(options = {}) {
    this.queue = options.queue || jobQueue;
    this.queueName = options.queueName || 'default';
    this.pollIntervalMs = options.pollIntervalMs || 500;
    this.maxPollIntervalMs = options.maxPollIntervalMs || 3000;
    this.busyDelayMs = options.busyDelayMs !== undefined ? options.busyDelayMs : 20;
    this.staleRecoveryIntervalMs =
      options.staleRecoveryIntervalMs !== undefined ? options.staleRecoveryIntervalMs : 60000;
    this.staleTimeoutSeconds = options.staleTimeoutSeconds || 300;
    this.retryOptions = options.retryOptions || {};
    this.workerId = options.workerId || `worker_${randomUUID().slice(0, 8)}`;

    this.running = false;
    this.currentDelay = this.pollIntervalMs;
    this.pollTimer = null;
    this.staleTimer = null;
    this.activeProcessingPromise = null;
  }

  /**
   * Start worker polling loop and stale job recovery
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.currentDelay = this.pollIntervalMs;

    this._scheduleNextPoll(0);
    this._startStaleRecovery();
  }

  /**
   * Stop worker gracefully, awaiting completion of any currently in-flight job
   * @param {number} [timeoutMs=5000] Maximum time to wait for in-flight job
   * @returns {Promise<void>}
   */
  async stop(timeoutMs = 5000) {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }

    if (this.activeProcessingPromise) {
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
      await Promise.race([this.activeProcessingPromise, timeoutPromise]);
    }
  }

  /**
   * Trigger a single poll immediately (useful for manual invocation and tests)
   * @returns {Promise<{ processed: boolean, job?: Object, status?: string, error?: Error }>}
   */
  async pollOnce() {
    return this.queue.processNext(this.queueName, this.retryOptions);
  }

  _scheduleNextPoll(delayMs) {
    if (!this.running) return;
    this.pollTimer = setTimeout(async () => {
      await this._pollLoop();
    }, delayMs);
  }

  async _pollLoop() {
    if (!this.running) return;

    let hasProcessedJob = false;
    try {
      this.activeProcessingPromise = this.queue.processNext(this.queueName, this.retryOptions);
      const result = await this.activeProcessingPromise;
      hasProcessedJob = Boolean(result?.processed);
    } catch {
      // Handler failure or transient db error — worker must survive and continue
      hasProcessedJob = false;
    } finally {
      this.activeProcessingPromise = null;
    }

    if (!this.running) return;

    if (hasProcessedJob) {
      // Work was processed; poll again promptly
      this.currentDelay = this.pollIntervalMs;
      this._scheduleNextPoll(this.busyDelayMs);
    } else {
      // Queue empty; apply adaptive backoff to prevent DB CPU thrashing
      const nextDelay = this.currentDelay;
      this.currentDelay = Math.min(Math.round(this.currentDelay * 1.5), this.maxPollIntervalMs);
      this._scheduleNextPoll(nextDelay);
    }
  }

  _startStaleRecovery() {
    if (this.staleRecoveryIntervalMs <= 0) return;
    this.staleTimer = setInterval(async () => {
      if (!this.running) return;
      try {
        await this.queue.recoverStale(this.staleTimeoutSeconds);
      } catch {
        // Non-fatal stale check error
      }
    }, this.staleRecoveryIntervalMs);
  }
}
