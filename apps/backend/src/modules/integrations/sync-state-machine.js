import { SYNC_STATE_MACHINE } from '@workaholic/shared';

/**
 * Valid state transitions for the Synchronization State Machine.
 * Conforms to docs/8.SYNC-SPECIFICATION.md Section 10 & Section 69.
 */
const VALID_TRANSITIONS = {
  [SYNC_STATE_MACHINE.IDLE]: new Set([
    SYNC_STATE_MACHINE.SYNCING,
    SYNC_STATE_MACHINE.DETACHED,
    SYNC_STATE_MACHINE.UNAVAILABLE,
  ]),
  [SYNC_STATE_MACHINE.SYNCING]: new Set([
    SYNC_STATE_MACHINE.SUCCEEDED,
    SYNC_STATE_MACHINE.FAILED,
    SYNC_STATE_MACHINE.RETRYING,
    SYNC_STATE_MACHINE.CONFLICT,
    SYNC_STATE_MACHINE.UNAVAILABLE,
    SYNC_STATE_MACHINE.IDLE, // Manual abort / reset
  ]),
  [SYNC_STATE_MACHINE.SUCCEEDED]: new Set([
    SYNC_STATE_MACHINE.SYNCING,
    SYNC_STATE_MACHINE.IDLE,
    SYNC_STATE_MACHINE.DETACHED,
    SYNC_STATE_MACHINE.UNAVAILABLE,
  ]),
  [SYNC_STATE_MACHINE.FAILED]: new Set([
    SYNC_STATE_MACHINE.SYNCING,
    SYNC_STATE_MACHINE.IDLE,
    SYNC_STATE_MACHINE.RETRYING,
    SYNC_STATE_MACHINE.DETACHED,
    SYNC_STATE_MACHINE.UNAVAILABLE,
  ]),
  [SYNC_STATE_MACHINE.RETRYING]: new Set([
    SYNC_STATE_MACHINE.SYNCING,
    SYNC_STATE_MACHINE.FAILED,
    SYNC_STATE_MACHINE.DETACHED,
    SYNC_STATE_MACHINE.UNAVAILABLE,
    SYNC_STATE_MACHINE.IDLE,
  ]),
  [SYNC_STATE_MACHINE.CONFLICT]: new Set([
    SYNC_STATE_MACHINE.SYNCING,
    SYNC_STATE_MACHINE.IDLE,
    SYNC_STATE_MACHINE.SUCCEEDED,
    SYNC_STATE_MACHINE.DETACHED,
  ]),
  [SYNC_STATE_MACHINE.DETACHED]: new Set([
    SYNC_STATE_MACHINE.IDLE,
    SYNC_STATE_MACHINE.SYNCING,
    SYNC_STATE_MACHINE.UNAVAILABLE,
  ]),
  [SYNC_STATE_MACHINE.UNAVAILABLE]: new Set([
    SYNC_STATE_MACHINE.IDLE,
    SYNC_STATE_MACHINE.SYNCING,
    SYNC_STATE_MACHINE.DETACHED,
  ]),
};

/**
 * Validates if a transition from currentState to targetState is valid.
 *
 * @param {string} currentState
 * @param {string} targetState
 * @returns {boolean}
 */
export function isValidTransition(currentState, targetState) {
  if (!currentState || !targetState) return false;
  if (currentState === targetState) return true;
  const allowed = VALID_TRANSITIONS[currentState];
  return allowed ? allowed.has(targetState) : false;
}

/**
 * Asserts a valid state transition, throwing an Error if illegal.
 *
 * @param {string} currentState
 * @param {string} targetState
 */
export function assertValidTransition(currentState, targetState) {
  if (!isValidTransition(currentState, targetState)) {
    const err = new Error(
      `Illegal synchronization state transition from '${currentState}' to '${targetState}'`,
    );
    err.code = 'INVALID_STATE_TRANSITION';
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Checks if a synchronization process is currently active.
 *
 * @param {string} state
 * @returns {boolean}
 */
export function isSyncActive(state) {
  return state === SYNC_STATE_MACHINE.SYNCING;
}

/**
 * Evaluates whether an active sync is stale (e.g. worker process crashed).
 * Default timeout is 15 minutes per SYNC-SPECIFICATION.md Section 84.
 *
 * @param {Date | string | number} startedAt
 * @param {number} [timeoutMs=900000] 15 minutes
 * @returns {boolean}
 */
export function isSyncStale(startedAt, timeoutMs = 15 * 60 * 1000) {
  if (!startedAt) return false;
  const start = new Date(startedAt).getTime();
  return Date.now() - start > timeoutMs;
}
