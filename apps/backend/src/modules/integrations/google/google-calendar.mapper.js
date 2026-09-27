import { normalizeAllDayBounds, formatISODate } from '@workaholic/shared';

/**
 * Add or subtract days from a YYYY-MM-DD string
 */
function shiftDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().split('T')[0];
}

/**
 * Parses a standard iCalendar RRULE string into Workaholic recurrence structure
 * @param {string} rruleStr e.g. "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=5"
 * @returns {Object|null}
 */
export function parseRrule(rruleStr) {
  if (!rruleStr || typeof rruleStr !== 'string') return null;

  const clean = rruleStr.replace(/^RRULE:/i, '');
  const parts = clean.split(';');
  const params = {};

  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k && v) {
      params[k.toUpperCase()] = v;
    }
  }

  if (!params.FREQ) return null;

  const freq = params.FREQ.toUpperCase();
  const rule = {
    frequency: freq,
    freq,
    interval: params.INTERVAL ? parseInt(params.INTERVAL, 10) : 1,
  };

  if (params.COUNT) {
    rule.occurrenceCount = parseInt(params.COUNT, 10);
    rule.count = rule.occurrenceCount;
  }

  if (params.UNTIL) {
    const u = params.UNTIL;
    let iso = null;
    if (u.length === 8) {
      const y = u.substring(0, 4);
      const m = u.substring(4, 6);
      const d = u.substring(6, 8);
      iso = `${y}-${m}-${d}T23:59:59.999Z`;
    } else if (u.includes('T')) {
      const formatted = u.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/i,
        '$1-$2-$3T$4:$5:$6.000Z',
      );
      iso = new Date(formatted).toISOString();
    } else {
      iso = new Date(u).toISOString();
    }
    rule.endAt = iso;
    rule.until = iso;
  }

  if (params.BYDAY) {
    const rawDays = params.BYDAY.split(',').map(d => d.trim().toUpperCase());
    rule.byweekday = rawDays;
    const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    rule.byWeekday = rawDays.map(d => dayMap[d]).filter(n => n !== undefined);
  }

  return rule;
}

/**
 * Formats a Workaholic recurrence rule into an iCalendar RRULE string
 * @param {Object} rule
 * @returns {string} e.g. "RRULE:FREQ=WEEKLY;INTERVAL=2"
 */
export function formatRrule(rule) {
  const frequency = rule?.frequency || rule?.freq;
  if (!frequency) return '';

  const parts = [`FREQ=${frequency}`];

  const interval = rule.interval || 1;
  if (interval > 1) {
    parts.push(`INTERVAL=${interval}`);
  }

  const count = rule.occurrenceCount || rule.count;
  const endAt = rule.endAt || rule.until;
  if (count) {
    parts.push(`COUNT=${count}`);
  } else if (endAt) {
    const d = new Date(endAt);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    parts.push(`UNTIL=${y}${m}${day}T235959Z`);
  }

  const rawByDay = rule.byweekday;
  const numByDay = rule.byWeekday;
  if (Array.isArray(rawByDay) && rawByDay.length > 0 && typeof rawByDay[0] === 'string') {
    parts.push(`BYDAY=${rawByDay.join(',')}`);
  } else if (Array.isArray(numByDay) && numByDay.length > 0) {
    const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    parts.push(`BYDAY=${numByDay.map(n => dayNames[n]).join(',')}`);
  }

  return `RRULE:${parts.join(';')}`;
}

/**
 * Maps an incoming Google Calendar Event to Workaholic Event creation/update payload
 * Conforms to docs/9.CALENDAR-SPECIFICATION.md Section 38
 *
 * @param {Object} googleEvent
 * @param {string} calendarId
 * @param {string} workspaceId
 * @param {string} [userId]
 * @returns {Object}
 */
export function toWorkaholicEvent(googleEvent, calendarId, workspaceId, userId = null) {
  const isCancelled = googleEvent.status === 'cancelled';
  let status = 'CONFIRMED';
  if (isCancelled) status = 'CANCELLED';
  else if (googleEvent.status === 'tentative') status = 'TENTATIVE';

  const isAllDay = Boolean(googleEvent.start?.date);
  let startAt;
  let endAt;
  let timezone = 'UTC';

  let startDate = null;
  let endDate = null;
  if (isAllDay) {
    startDate = googleEvent.start.date;
    // Google's all-day end date is exclusive (day after). Convert to inclusive for Workaholic
    endDate = startDate;
    if (googleEvent.end?.date && googleEvent.end.date > startDate) {
      endDate = shiftDateString(googleEvent.end.date, -1);
    }
    const bounds = normalizeAllDayBounds(startDate, endDate);
    startAt = bounds.startAt;
    endAt = bounds.endAt;
    timezone = 'UTC';
  } else {
    startAt = googleEvent.start?.dateTime
      ? new Date(googleEvent.start.dateTime).toISOString()
      : new Date().toISOString();
    endAt = googleEvent.end?.dateTime
      ? new Date(googleEvent.end.dateTime).toISOString()
      : new Date(new Date(startAt).getTime() + 3600000).toISOString();
    timezone = googleEvent.start?.timeZone || googleEvent.end?.timeZone || 'UTC';
  }

  let recurrence = null;
  if (googleEvent.recurrence && googleEvent.recurrence.length > 0) {
    const rruleStr = googleEvent.recurrence.find(r => r.toUpperCase().startsWith('RRULE:'));
    if (rruleStr) {
      const parsed = parseRrule(rruleStr);
      if (parsed) {
        recurrence = {
          ...parsed,
          timezone,
          startAt,
        };
      }
    }
  }

  const meetingUrl =
    googleEvent.hangoutLink ||
    googleEvent.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri ||
    null;

  return {
    calendarId,
    workspaceId,
    title: googleEvent.summary || '(Untitled Google Event)',
    description: googleEvent.description || null,
    location: googleEvent.location || null,
    meetingUrl,
    visibility: googleEvent.visibility === 'public' ? 'PUBLIC' : 'PRIVATE',
    status,
    sourceType: 'GOOGLE',
    sourceReference: googleEvent.id,
    startAt,
    endAt,
    startDate,
    endDate,
    isAllDay,
    timezone,
    recurrence,
    createdBy: userId,
    metadata: {
      etag: googleEvent.etag,
      htmlLink: googleEvent.htmlLink,
      iCalUID: googleEvent.iCalUID,
      recurringEventId: googleEvent.recurringEventId || null,
    },
  };
}

/**
 * Maps a Workaholic Event to Google Calendar Event API payload
 * Conforms to docs/9.CALENDAR-SPECIFICATION.md Section 38
 *
 * @param {Object} workaholicEvent
 * @param {Object} [recurrenceRule]
 * @returns {Object}
 */
export function toGoogleEvent(workaholicEvent, recurrenceRule = null) {
  let status = 'confirmed';
  if (workaholicEvent.status === 'CANCELLED') status = 'cancelled';
  else if (workaholicEvent.status === 'TENTATIVE') status = 'tentative';

  const payload = {
    summary: workaholicEvent.title,
    description: workaholicEvent.description || undefined,
    location: workaholicEvent.location || undefined,
    status,
    visibility: workaholicEvent.visibility === 'PUBLIC' ? 'public' : 'private',
  };

  if (workaholicEvent.isAllDay) {
    const startDate = workaholicEvent.startDate || formatISODate(workaholicEvent.startAt);
    const inclusiveEndDate = workaholicEvent.endDate || formatISODate(workaholicEvent.endAt);
    // Google all-day end date is exclusive: add 1 day
    const exclusiveEndDate = shiftDateString(inclusiveEndDate, 1);

    payload.start = { date: startDate };
    payload.end = { date: exclusiveEndDate };
  } else {
    payload.start = {
      dateTime: workaholicEvent.startAt,
      timeZone: workaholicEvent.timezone || 'UTC',
    };
    payload.end = {
      dateTime: workaholicEvent.endAt,
      timeZone: workaholicEvent.timezone || 'UTC',
    };
  }

  if (recurrenceRule) {
    const rrule = formatRrule(recurrenceRule);
    if (rrule) {
      payload.recurrence = [rrule];
    }
  }

  return payload;
}
