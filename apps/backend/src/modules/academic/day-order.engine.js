/**
 * Day Order Engine
 * Deterministic Day Order calculation according to CALENDAR-SPECIFICATION.md
 * and BUSINESS-RULES.md (BR-DO-001 through BR-DO-006)
 */

import { ACADEMIC_DAY_STATUS } from '@workaholic/shared';

/**
 * Format a Date object to YYYY-MM-DD using UTC date parts
 * @param {Date} date
 * @returns {string}
 */
export function formatDateUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD string into UTC Date
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseDateUtc(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Generates array of date strings between start and end inclusive
 * @param {string} startDateStr
 * @param {string} endDateStr
 * @returns {string[]}
 */
export function getDateRangeArray(startDateStr, endDateStr) {
  const dates = [];
  const current = parseDateUtc(startDateStr);
  const end = parseDateUtc(endDateStr);

  while (current <= end) {
    dates.push(formatDateUtc(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Pure, deterministic Day Order sequence calculation
 *
 * @param {object} params
 * @param {string} params.startDate - YYYY-MM-DD
 * @param {string} params.endDate - YYYY-MM-DD
 * @param {number} [params.dayOrderCount=5] - Number of Day Orders (e.g. 5 for DO1..DO5)
 * @param {Array|Map|object} [params.explicitDateRules=[]] - Explicit rules per date
 * @param {number} [params.initialSequenceIndex=0] - Starting sequence index
 * @returns {Array<{
 *   calendarDate: string,
 *   dayStatus: string,
 *   isWorking: boolean,
 *   dayOrder: string | null,
 *   reason: string | null,
 *   overrideDayOrder: string | null
 * }>}
 */
export function calculateDayOrderSequence({
  startDate,
  endDate,
  dayOrderCount = 5,
  explicitDateRules = [],
  initialSequenceIndex = 0,
}) {
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required');
  }

  const dCount = Math.max(1, Math.min(10, Number(dayOrderCount) || 5));

  // Index explicit rules by calendarDate
  const ruleMap = new Map();
  if (Array.isArray(explicitDateRules)) {
    for (const rule of explicitDateRules) {
      if (rule && rule.calendarDate) {
        ruleMap.set(rule.calendarDate, rule);
      }
    }
  } else if (explicitDateRules instanceof Map) {
    for (const [k, v] of explicitDateRules.entries()) {
      ruleMap.set(k, v);
    }
  } else if (typeof explicitDateRules === 'object' && explicitDateRules !== null) {
    for (const [k, v] of Object.entries(explicitDateRules)) {
      ruleMap.set(k, v);
    }
  }

  const allDates = getDateRangeArray(startDate, endDate);
  const result = [];
  let currentSequenceIndex = Math.max(0, initialSequenceIndex);

  for (const dateStr of allDates) {
    const curDate = parseDateUtc(dateStr);
    const dayOfWeek = curDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const rule = ruleMap.get(dateStr);

    let dayStatus;
    let isWorking;
    let reason = rule?.reason || null;
    let overrideDayOrder = rule?.overrideDayOrder || null;

    if (rule) {
      dayStatus = rule.dayStatus;
      if (
        dayStatus === ACADEMIC_DAY_STATUS.HOLIDAY ||
        dayStatus === ACADEMIC_DAY_STATUS.OTHER_NON_WORKING_DAY
      ) {
        isWorking = false;
      } else if (
        dayStatus === ACADEMIC_DAY_STATUS.SPECIAL_WORKING_DAY ||
        dayStatus === ACADEMIC_DAY_STATUS.WORKING_DAY
      ) {
        isWorking = true;
      } else {
        isWorking = dayOfWeek >= 1 && dayOfWeek <= 5;
        dayStatus = isWorking
          ? ACADEMIC_DAY_STATUS.WORKING_DAY
          : ACADEMIC_DAY_STATUS.OTHER_NON_WORKING_DAY;
      }
    } else {
      // Default: Mon-Fri are working, Sat-Sun are non-working
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        isWorking = false;
        dayStatus = ACADEMIC_DAY_STATUS.OTHER_NON_WORKING_DAY;
      } else {
        isWorking = true;
        dayStatus = ACADEMIC_DAY_STATUS.WORKING_DAY;
      }
    }

    let dayOrder = null;

    if (isWorking) {
      if (overrideDayOrder) {
        dayOrder = overrideDayOrder;
        currentSequenceIndex++;
      } else {
        const orderNum = (currentSequenceIndex % dCount) + 1;
        dayOrder = `DO${orderNum}`;
        currentSequenceIndex++;
      }
    } else {
      // Holidays and non-working days do NOT consume a Day Order
      dayOrder = null;
    }

    result.push({
      calendarDate: dateStr,
      dayStatus,
      isWorking,
      dayOrder,
      reason,
      overrideDayOrder,
    });
  }

  return result;
}

/**
 * Lookup Day Order for a specific date in precalculated sequence
 * @param {string} dateStr - YYYY-MM-DD
 * @param {Array} sequence
 * @returns {object | null}
 */
export function getDayOrderForDate(dateStr, sequence) {
  if (!Array.isArray(sequence)) return null;
  return sequence.find(item => item.calendarDate === dateStr) || null;
}

/**
 * Filter all dates matching a particular Day Order
 * @param {string} dayOrder - e.g. 'DO1'
 * @param {Array} sequence
 * @returns {string[]} Array of date strings
 */
export function getDatesForDayOrder(dayOrder, sequence) {
  if (!Array.isArray(sequence) || !dayOrder) return [];
  return sequence.filter(item => item.dayOrder === dayOrder).map(item => item.calendarDate);
}
