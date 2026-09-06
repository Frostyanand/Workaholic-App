import { describe, it, expect } from 'vitest';
import {
  isValidISODateString,
  parseISODate,
  formatISODate,
  formatISODateTime,
  getStartOfDay,
  getEndOfDay,
  isSameDay,
  addDays,
} from '../src/utils/datetime.js';

describe('Shared Date/Time Utilities (Task 1.5)', () => {
  it('identifies valid and invalid ISO date strings', () => {
    expect(isValidISODateString('2026-09-06')).toBe(true);
    expect(isValidISODateString('2026-09-06T14:30:00.000Z')).toBe(true);
    expect(isValidISODateString('not-a-date')).toBe(false);
    expect(isValidISODateString('')).toBe(false);
    expect(isValidISODateString(null)).toBe(false);
    expect(isValidISODateString(undefined)).toBe(false);
  });

  it('safely parses ISO date strings', () => {
    const parsed = parseISODate('2026-09-06T12:00:00.000Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getUTCFullYear()).toBe(2026);
    expect(parsed.getUTCMonth()).toBe(8); // 0-indexed: September is 8
    expect(parsed.getUTCDate()).toBe(6);

    expect(parseISODate('invalid-date')).toBeNull();
    expect(parseISODate(null)).toBeNull();
  });

  it('formats dates into YYYY-MM-DD strings', () => {
    const date = new Date(Date.UTC(2026, 8, 6, 12, 0, 0));
    expect(formatISODate(date)).toBe('2026-09-06');
    expect(formatISODate('2026-09-06T10:00:00Z')).toBe('2026-09-06');
  });

  it('formats dates into ISO 8601 UTC strings', () => {
    const date = new Date(Date.UTC(2026, 8, 6, 12, 0, 0));
    expect(formatISODateTime(date)).toBe('2026-09-06T12:00:00.000Z');
  });

  it('computes start and end of day in UTC', () => {
    const date = new Date(Date.UTC(2026, 8, 6, 15, 30, 45, 500));

    const start = getStartOfDay(date);
    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
    expect(start.getUTCMilliseconds()).toBe(0);

    const end = getEndOfDay(date);
    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
    expect(end.getUTCSeconds()).toBe(59);
    expect(end.getUTCMilliseconds()).toBe(999);
  });

  it('accurately evaluates same calendar day', () => {
    const morning = new Date(Date.UTC(2026, 8, 6, 6, 0, 0));
    const evening = new Date(Date.UTC(2026, 8, 6, 22, 0, 0));
    const nextDay = new Date(Date.UTC(2026, 8, 7, 1, 0, 0));

    expect(isSameDay(morning, evening)).toBe(true);
    expect(isSameDay(morning, nextDay)).toBe(false);
  });

  it('correctly shifts dates by specified days including month rollover', () => {
    const date = new Date(Date.UTC(2026, 8, 30)); // Sept 30
    const nextMonth = addDays(date, 2); // Oct 2

    expect(nextMonth.getUTCMonth()).toBe(9); // Oct is 9
    expect(nextMonth.getUTCDate()).toBe(2);

    const previousDay = addDays(date, -1);
    expect(previousDay.getUTCDate()).toBe(29);
  });
});
