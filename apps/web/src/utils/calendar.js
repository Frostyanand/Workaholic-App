/**
 * Calendar Date & Grid Calculation Utilities
 * Strictly enforces date-based semantics for all-day events without clock-time distortion.
 */

import { formatISODate } from '@workaholic/shared';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Returns formatted title for calendar header based on current view
 */
export function formatHeaderTitle(date, view) {
  const d = new Date(date);
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();

  if (view === 'MONTH') {
    return `${month} ${year}`;
  }

  if (view === 'DAY') {
    return `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  if (view === 'WEEK' || view === 'WORKWEEK') {
    const days = getWeekDates(d, view === 'WORKWEEK');
    const first = days[0];
    const last = days[days.length - 1];

    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`;
    }
    return `${MONTH_NAMES[first.getMonth()].slice(0, 3)} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getDate()}, ${last.getFullYear()}`;
  }

  if (view === 'AGENDA') {
    return `Agenda — ${month} ${year}`;
  }

  return `${month} ${year}`;
}

/**
 * Gets array of Dates for a given week (Sunday-Saturday for Week, Monday-Friday for Workweek)
 */
export function getWeekDates(baseDate, isWorkweek = false) {
  const current = new Date(baseDate);
  current.setHours(0, 0, 0, 0);

  const dayOfWeek = current.getDay(); // 0 is Sunday
  const startOffset = isWorkweek ? (dayOfWeek === 0 ? -6 : 1 - dayOfWeek) : -dayOfWeek;

  const startDate = new Date(current);
  startDate.setDate(current.getDate() + startOffset);

  const count = isWorkweek ? 5 : 7;
  const days = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }

  return days;
}

/**
 * Generates 6-week matrix (42 cells) for month view
 */
export function getMonthMatrix(baseDate) {
  const date = new Date(baseDate);
  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const startDay = firstDayOfMonth.getDay(); // 0 is Sunday

  const matrixStart = new Date(firstDayOfMonth);
  matrixStart.setDate(1 - startDay);
  matrixStart.setHours(0, 0, 0, 0);

  const matrix = [];
  let current = new Date(matrixStart);

  for (let week = 0; week < 6; week++) {
    const weekDays = [];
    for (let day = 0; day < 7; day++) {
      weekDays.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    matrix.push(weekDays);
  }

  return matrix;
}

/**
 * Checks if two dates represent the exact same calendar day
 */
export function isSameCalendarDate(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formats a local date object to YYYY-MM-DD
 */
export function toLocalDateString(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Filters all-day events applicable to a specific date string (YYYY-MM-DD)
 */
export function filterAllDayEventsForDate(events, targetDateStr) {
  return events.filter(event => {
    if (!event.isAllDay) return false;
    const start = event.startDate || (event.startAt ? formatISODate(event.startAt) : '');
    const end = event.endDate || (event.endAt ? formatISODate(event.endAt) : start);
    return targetDateStr >= start && targetDateStr <= end;
  });
}

/**
 * Filters timed events applicable to a specific date string (YYYY-MM-DD)
 */
export function filterTimedEventsForDate(events, targetDateStr) {
  return events.filter(event => {
    if (event.isAllDay) return false;
    if (!event.startAt) return false;
    const eventDateStr = toLocalDateString(event.startAt);
    return eventDateStr === targetDateStr;
  });
}

/**
 * Calculates top (%) and height (%) on a 24-hour vertical grid (each hour = 60px)
 */
export function calculateEventGridPosition(event) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const durationMinutes = Math.max(endMinutes - startMinutes, 20); // Minimum 20 mins visual height

  const totalMinutesInDay = 24 * 60;
  const topPercent = (startMinutes / totalMinutesInDay) * 100;
  const heightPercent = (durationMinutes / totalMinutesInDay) * 100;

  return {
    top: `${topPercent.toFixed(2)}%`,
    height: `${heightPercent.toFixed(2)}%`,
    startLabel: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    endLabel: end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

export { MONTH_NAMES, DAY_NAMES, DAY_SHORT_NAMES };
