/**
 * Platform-safe Date/Time utilities conforming to docs/1.project.md
 * and AGENTS.md cross-platform constraints.
 * Uses pure JavaScript Date APIs without third-party native or runtime assumptions.
 */

/**
 * Validates whether a given string is a valid ISO 8601 date or datetime format.
 * @param {string} str
 * @returns {boolean}
 */
export function isValidISODateString(str) {
  if (typeof str !== 'string' || str.trim() === '') {
    return false;
  }
  const date = new Date(str);
  return !Number.isNaN(date.getTime()) && (str.includes('-') || str.includes('T'));
}

/**
 * Safely parses an ISO date or datetime string into a Date object.
 * Returns null if the input is invalid or not a string.
 * @param {string} str
 * @returns {Date | null}
 */
export function parseISODate(str) {
  if (!isValidISODateString(str)) {
    return null;
  }
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a Date object or timestamp to a standard YYYY-MM-DD calendar date string.
 * @param {Date | number | string} input
 * @returns {string}
 */
export function formatISODate(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date input provided to formatISODate');
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a Date object or timestamp to full ISO 8601 UTC string.
 * @param {Date | number | string} input
 * @returns {string}
 */
export function formatISODateTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date input provided to formatISODateTime');
  }
  return date.toISOString();
}

/**
 * Returns a new Date object representing the start of the day (00:00:00.000 UTC).
 * @param {Date | number | string} input
 * @returns {Date}
 */
export function getStartOfDay(input) {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date input provided to getStartOfDay');
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns a new Date object representing the end of the day (23:59:59.999 UTC).
 * @param {Date | number | string} input
 * @returns {Date}
 */
export function getEndOfDay(input) {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date input provided to getEndOfDay');
  }
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

/**
 * Returns true if two Date inputs fall on the exact same calendar date in UTC.
 * @param {Date | number | string} a
 * @param {Date | number | string} b
 * @returns {boolean}
 */
export function isSameDay(a, b) {
  const dateA = a instanceof Date ? a : new Date(a);
  const dateB = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(dateA.getTime()) || Number.isNaN(dateB.getTime())) {
    return false;
  }
  return (
    dateA.getUTCFullYear() === dateB.getUTCFullYear() &&
    dateA.getUTCMonth() === dateB.getUTCMonth() &&
    dateA.getUTCDate() === dateB.getUTCDate()
  );
}

/**
 * Adds or subtracts days from a given Date and returns a new Date object.
 * @param {Date | number | string} input
 * @param {number} days
 * @returns {Date}
 */
export function addDays(input, days) {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date input provided to addDays');
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}
