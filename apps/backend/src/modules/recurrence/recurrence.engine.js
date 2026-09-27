/**
 * Workaholic Recurrence Engine
 * Authoritative implementation matching DOMAIN-MODEL.md Section 9.5,
 * CALENDAR-SPECIFICATION.md Sections 8, 11-13, and BUSINESS-RULES.md BR-REC-001..004.
 *
 * Pure JavaScript ES2023 - Zero TypeScript - Zero third-party dependencies.
 * Deterministic, range-bounded, timezone/DST-safe occurrence calculation.
 */

import { RECURRENCE_FREQUENCY, WEEKDAY } from '@workaholic/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses local date components (year, month 1-12, day 1-31, hour 0-23, minute 0-59, second 0-59, ms)
 * from a Date object or ISO string in a given IANA timezone.
 * @param {Date|string} date
 * @param {string} [timezone='UTC']
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond: number, weekday: number }}
 */
export function getLocalComponents(date, timezone = 'UTC') {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid date passed to getLocalComponents: ${date}`);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  });

  const parts = {};
  for (const p of formatter.formatToParts(d)) {
    if (p.type === 'year') parts.year = parseInt(p.value, 10);
    else if (p.type === 'month') parts.month = parseInt(p.value, 10);
    else if (p.type === 'day') parts.day = parseInt(p.value, 10);
    else if (p.type === 'hour') parts.hour = parseInt(p.value, 10);
    else if (p.type === 'minute') parts.minute = parseInt(p.value, 10);
    else if (p.type === 'second') parts.second = parseInt(p.value, 10);
  }

  const ms = d.getUTCMilliseconds();

  // Determine weekday in target timezone: Sunday=0, Monday=1, ..., Saturday=6
  // We can compute weekday from year, month, day (Gregorian):
  const dateObj = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = dateObj.getUTCDay();

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
    millisecond: ms,
    weekday,
  };
}

/**
 * Converts a local wall-clock date and time in an IANA timezone to an exact UTC ISO timestamp string.
 * Iteratively converges against DST shifts for 100% precision.
 * @param {number} year
 * @param {number} month (1-12)
 * @param {number} day (1-31)
 * @param {number} hour (0-23)
 * @param {number} minute (0-59)
 * @param {number} second (0-59)
 * @param {number} millisecond (0-999)
 * @param {string} [timezone='UTC']
 * @returns {string} ISO 8601 UTC timestamp string
 */
export function localToUtc(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  timezone = 'UTC',
) {
  let guessTime = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });

  const getLocalOfTimestamp = ms => {
    const d = new Date(ms);
    const p = {};
    for (const part of formatter.formatToParts(d)) {
      if (part.type !== 'literal') {
        p[part.type] = parseInt(part.value, 10);
      }
    }
    return Date.UTC(p.year, p.month - 1, p.day, p.hour ?? 0, p.minute ?? 0, p.second ?? 0, 0);
  };

  const targetLocal = Date.UTC(year, month - 1, day, hour, minute, second, 0);

  for (let i = 0; i < 3; i++) {
    const currentLocal = getLocalOfTimestamp(guessTime);
    const diff = targetLocal - currentLocal;
    if (diff === 0) break;
    guessTime += diff;
  }

  return new Date(guessTime + millisecond).toISOString();
}

/**
 * Returns the number of days in a given year and month.
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Finds the date of the nth occurrence of a weekday in a given month.
 * @param {number} year
 * @param {number} month (1-12)
 * @param {number} targetWeekday (0=Sun..6=Sat)
 * @param {number} setPos (1=1st, 2=2nd, 3=3rd, 4=4th, -1=last)
 * @returns {number|null} Day of month (1-31), or null if nonexistent
 */
export function getNthWeekdayOfMonth(year, month, targetWeekday, setPos) {
  const daysCount = getDaysInMonth(year, month);
  const matchingDays = [];

  for (let day = 1; day <= daysCount; day++) {
    const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (wd === targetWeekday) {
      matchingDays.push(day);
    }
  }

  if (matchingDays.length === 0) return null;

  if (setPos > 0) {
    const idx = setPos - 1;
    return idx < matchingDays.length ? matchingDays[idx] : null;
  }
  if (setPos < 0) {
    const idx = matchingDays.length + setPos;
    return idx >= 0 ? matchingDays[idx] : null;
  }

  return null;
}

/**
 * Generates an RFC 5545 RRULE string from a structured recurrence rule object.
 * @param {object} rule
 * @returns {string}
 */
export function formatRRuleString(rule) {
  if (!rule || !rule.frequency) return '';

  const parts = [`FREQ=${rule.frequency}`];

  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }

  if (Array.isArray(rule.byWeekday) && rule.byWeekday.length > 0) {
    const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const daysStr = rule.byWeekday
      .map(w => {
        const num = typeof w === 'number' ? w : (WEEKDAY[w] ?? 0);
        return dayNames[num] || 'MO';
      })
      .join(',');
    parts.push(`BYDAY=${daysStr}`);
  }

  if (Array.isArray(rule.byMonthDay) && rule.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  }

  if (Array.isArray(rule.byMonth) && rule.byMonth.length > 0) {
    parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  }

  if (rule.bySetPos) {
    parts.push(`BYSETPOS=${rule.bySetPos}`);
  }

  if (rule.occurrenceCount) {
    parts.push(`COUNT=${rule.occurrenceCount}`);
  } else if (rule.endAt) {
    // Format UNTIL in UTC YYYYMMDDTHHMMSSZ
    const d = new Date(rule.endAt);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    parts.push(`UNTIL=${y}${m}${day}T${h}${min}${s}Z`);
  }

  return parts.join(';');
}

/**
 * Expands occurrences of a recurrence rule strictly bounded by [rangeStart, rangeEnd].
 * Preserves local wall-clock times across DST transitions.
 *
 * @param {object} rule
 * @param {string} rule.frequency - 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
 * @param {number} [rule.interval=1] - Frequency interval
 * @param {number[]} [rule.byWeekday] - Weekday numbers (0=Sun..6=Sat)
 * @param {number[]} [rule.byMonthDay] - Days of month (1-31)
 * @param {number[]} [rule.byMonth] - Months (1-12)
 * @param {number} [rule.bySetPos] - Positional (e.g. 1st, 2nd, -1=last)
 * @param {string|Date} rule.startAt - Series inception UTC start
 * @param {string|Date} [rule.endAt] - Series termination UTC end (UNTIL)
 * @param {number} [rule.occurrenceCount] - Count limit
 * @param {string} [rule.timezone='UTC'] - Series IANA timezone
 * @param {string|Date} rangeStart - Window start timestamp
 * @param {string|Date} rangeEnd - Window end timestamp
 * @param {object} [options={}]
 * @param {number} [options.durationMs=0] - Event duration in milliseconds
 * @param {boolean} [options.isAllDay=false] - Whether rule represents an all-day event
 * @param {Map<string, object>|object} [options.exceptions={}] - Exceptions keyed by occurrenceKey
 * @param {number} [options.maxOccurrences=500] - Hard cap to prevent runaway calculations
 * @returns {Array<{ occurrenceKey: string, startAt: string, endAt: string, index: number, isException: boolean, exception?: object }>}
 */
export function expandOccurrences(rule, rangeStart, rangeEnd, options = {}) {
  if (!rule || !rule.frequency) {
    throw new Error('Valid recurrence rule with frequency is required');
  }

  const isAllDay = Boolean(options.isAllDay);
  const timezone = isAllDay ? 'UTC' : rule.timezone || 'UTC';
  const interval = Math.max(1, rule.interval || 1);
  const durationMs = options.durationMs > 0 ? options.durationMs : isAllDay ? DAY_MS - 1 : 0;
  const maxOccurrences = options.maxOccurrences || 1000;

  const startAtDate = new Date(rule.startAt);
  const endAtDate = rule.endAt ? new Date(rule.endAt) : null;
  const rangeStartDate = new Date(rangeStart);
  const rangeEndDate = new Date(rangeEnd);

  const rangeStartMs = rangeStartDate.getTime();
  const rangeEndMs = rangeEndDate.getTime();

  // Extract initial local start components
  const startComp = getLocalComponents(startAtDate, timezone);
  if (isAllDay) {
    startComp.hour = 0;
    startComp.minute = 0;
    startComp.second = 0;
    startComp.millisecond = 0;
  }

  // Normalize byWeekday if specified
  const byWeekday =
    Array.isArray(rule.byWeekday) && rule.byWeekday.length > 0
      ? [...new Set(rule.byWeekday)].sort((a, b) => a - b)
      : rule.frequency === 'WEEKLY'
        ? [startComp.weekday]
        : null;

  let exceptionsMap;
  if (options.exceptions instanceof Map) {
    exceptionsMap = options.exceptions;
  } else if (Array.isArray(options.exceptions)) {
    exceptionsMap = new Map(options.exceptions.map(e => [e.occurrenceKey || e.occurrence_key, e]));
  } else if (options.exceptions && typeof options.exceptions === 'object') {
    exceptionsMap = new Map(Object.entries(options.exceptions));
  } else {
    exceptionsMap = new Map();
  }

  const occurrences = [];
  let generatedCount = 0; // Total occurrences since series start

  // Helper to format occurrence key:
  // For all-day: YYYY-MM-DD
  // For timed: ISO UTC string of original occurrence start
  const makeKey = (origIso, y, m, d) => {
    if (isAllDay) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return origIso;
  };

  // Helper to check and record occurrence if within range
  const recordCandidate = (y, m, d) => {
    if (rule.occurrenceCount && generatedCount >= rule.occurrenceCount) {
      return false; // Reached count limit
    }

    const origStartIso = localToUtc(
      y,
      m,
      d,
      startComp.hour,
      startComp.minute,
      startComp.second,
      startComp.millisecond,
      timezone,
    );
    const origStartMs = new Date(origStartIso).getTime();

    // Occurrence cannot precede the series start
    if (origStartMs < startAtDate.getTime()) {
      return true; // continue
    }

    // Check UNTIL boundary
    if (endAtDate && origStartMs > endAtDate.getTime()) {
      return false; // Series ended
    }

    const currentIdx = generatedCount++;
    const key = makeKey(origStartIso, y, m, d);
    const exception = exceptionsMap.get(key);

    // If cancelled, omit from output but counts towards occurrenceCount
    if (exception && exception.exceptionType === 'CANCELLED') {
      return true;
    }

    // Effective start and end
    let effectiveStartAt = origStartIso;
    let effectiveEndAt = new Date(origStartMs + durationMs).toISOString();

    if (exception) {
      if (exception.overrideStartAt) {
        effectiveStartAt = new Date(exception.overrideStartAt).toISOString();
      }
      if (exception.overrideEndAt) {
        effectiveEndAt = new Date(exception.overrideEndAt).toISOString();
      }
    }

    const effectiveStartMs = new Date(effectiveStartAt).getTime();
    const effectiveEndMs = new Date(effectiveEndAt).getTime();

    // Check if occurrence overlaps query range [rangeStart, rangeEnd]
    if (effectiveStartMs <= rangeEndMs && effectiveEndMs >= rangeStartMs) {
      occurrences.push({
        occurrenceKey: key,
        originalStartAt: origStartIso,
        startAt: effectiveStartAt,
        endAt: effectiveEndAt,
        index: currentIdx,
        isException: Boolean(exception),
        ...(exception ? { exception } : {}),
      });
    }

    // If this occurrence is past rangeEnd and no count is pending, we might stop early for monotonic sequences
    if (origStartMs > rangeEndMs && !rule.occurrenceCount) {
      return false;
    }

    return true;
  };

  // =========================================================================
  // FREQUENCY DISPATCH
  // =========================================================================

  if (rule.frequency === RECURRENCE_FREQUENCY.DAILY) {
    let currDateObj = new Date(Date.UTC(startComp.year, startComp.month - 1, startComp.day));

    while (occurrences.length < maxOccurrences) {
      const y = currDateObj.getUTCFullYear();
      const m = currDateObj.getUTCMonth() + 1;
      const d = currDateObj.getUTCDate();
      const wd = currDateObj.getUTCDay();

      // If byWeekday is specified on DAILY (e.g. weekdays Mon-Fri: [1,2,3,4,5])
      if (!byWeekday || byWeekday.includes(wd)) {
        const canContinue = recordCandidate(y, m, d);
        if (!canContinue) break;
      }

      // Advance by interval days
      currDateObj.setUTCDate(currDateObj.getUTCDate() + interval);

      // Fast check: if past rangeEnd and no count constraint, break
      if (currDateObj.getTime() > rangeEndMs + 2 * DAY_MS && !rule.occurrenceCount) {
        break;
      }
    }
  } else if (rule.frequency === RECURRENCE_FREQUENCY.WEEKLY) {
    // Find week start Sunday for the series start
    const seriesWeekStart = new Date(Date.UTC(startComp.year, startComp.month - 1, startComp.day));
    seriesWeekStart.setUTCDate(seriesWeekStart.getUTCDate() - seriesWeekStart.getUTCDay());

    let weekCursor = new Date(seriesWeekStart.getTime());

    while (occurrences.length < maxOccurrences) {
      // For the current week, test all days in byWeekday
      for (const targetWd of byWeekday) {
        const dayCandidate = new Date(weekCursor.getTime());
        dayCandidate.setUTCDate(dayCandidate.getUTCDate() + targetWd);

        const y = dayCandidate.getUTCFullYear();
        const m = dayCandidate.getUTCMonth() + 1;
        const d = dayCandidate.getUTCDate();

        const canContinue = recordCandidate(y, m, d);
        if (!canContinue) break;
      }

      if (rule.occurrenceCount && generatedCount >= rule.occurrenceCount) {
        break;
      }

      // Advance by interval weeks (7 * interval days)
      weekCursor.setUTCDate(weekCursor.getUTCDate() + 7 * interval);

      if (weekCursor.getTime() > rangeEndMs + 8 * DAY_MS && !rule.occurrenceCount) {
        break;
      }
    }
  } else if (rule.frequency === RECURRENCE_FREQUENCY.MONTHLY) {
    let currYear = startComp.year;
    let currMonth = startComp.month;

    while (occurrences.length < maxOccurrences) {
      if (rule.bySetPos && byWeekday && byWeekday.length > 0) {
        // Nth weekday of month
        for (const targetWd of byWeekday) {
          const targetDay = getNthWeekdayOfMonth(currYear, currMonth, targetWd, rule.bySetPos);
          if (targetDay !== null) {
            const canContinue = recordCandidate(currYear, currMonth, targetDay);
            if (!canContinue) break;
          }
        }
      } else {
        // Day of month
        const targetDays =
          Array.isArray(rule.byMonthDay) && rule.byMonthDay.length > 0
            ? rule.byMonthDay
            : [startComp.day];

        const daysInCurrentMonth = getDaysInMonth(currYear, currMonth);

        for (const rawDay of targetDays) {
          // Clamp to max days in month (e.g. 31 in Feb -> 28)
          const clampedDay = Math.min(rawDay, daysInCurrentMonth);
          const canContinue = recordCandidate(currYear, currMonth, clampedDay);
          if (!canContinue) break;
        }
      }

      if (rule.occurrenceCount && generatedCount >= rule.occurrenceCount) {
        break;
      }

      // Advance month by interval
      currMonth += interval;
      while (currMonth > 12) {
        currMonth -= 12;
        currYear += 1;
      }

      const approxMonthMs = Date.UTC(currYear, currMonth - 1, 1);
      if (approxMonthMs > rangeEndMs + 35 * DAY_MS && !rule.occurrenceCount) {
        break;
      }
    }
  } else if (rule.frequency === RECURRENCE_FREQUENCY.YEARLY) {
    let currYear = startComp.year;
    const targetMonth = startComp.month;
    const targetDay = startComp.day;

    while (occurrences.length < maxOccurrences) {
      const daysInM = getDaysInMonth(currYear, targetMonth);
      const day = Math.min(targetDay, daysInM);

      const canContinue = recordCandidate(currYear, targetMonth, day);
      if (!canContinue) break;

      if (rule.occurrenceCount && generatedCount >= rule.occurrenceCount) {
        break;
      }

      currYear += interval;

      const approxYearMs = Date.UTC(currYear, targetMonth - 1, 1);
      if (approxYearMs > rangeEndMs + 400 * DAY_MS && !rule.occurrenceCount) {
        break;
      }
    }
  }

  return occurrences;
}

/**
 * Checks if a specific timestamp is an occurrence of a given recurrence rule.
 * @param {object} rule
 * @param {string|Date} targetDate
 * @param {object} [options={}]
 * @returns {boolean}
 */
export function isOccurrenceOfSeries(rule, targetDate, options = {}) {
  const targetMs = new Date(targetDate).getTime();
  if (Number.isNaN(targetMs)) return false;

  // Range window covering 2 days around targetDate
  const rangeStart = new Date(targetMs - DAY_MS).toISOString();
  const rangeEnd = new Date(targetMs + DAY_MS).toISOString();

  const occurrences = expandOccurrences(rule, rangeStart, rangeEnd, options);
  return occurrences.some(
    occ =>
      new Date(occ.originalStartAt).getTime() === targetMs ||
      new Date(occ.startAt).getTime() === targetMs,
  );
}
