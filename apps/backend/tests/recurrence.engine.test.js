import { describe, it, expect } from 'vitest';
import {
  expandOccurrences,
  formatRRuleString,
  getLocalComponents,
  localToUtc,
  isOccurrenceOfSeries,
} from '../src/modules/recurrence/recurrence.engine.js';
import { RECURRENCE_FREQUENCY, WEEKDAY } from '@workaholic/shared';

describe('Recurrence Engine Unit Tests', () => {
  describe('TM-REC-001: Daily recurrence generates correct occurrences', () => {
    it('generates consecutive daily occurrences within range', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 1,
        startAt: '2026-06-01T09:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-05T23:59:59.999Z',
        { durationMs: 3600000 },
      );

      expect(occurrences).toHaveLength(5);
      expect(occurrences[0].startAt).toBe('2026-06-01T09:00:00.000Z');
      expect(occurrences[0].endAt).toBe('2026-06-01T10:00:00.000Z');
      expect(occurrences[4].startAt).toBe('2026-06-05T09:00:00.000Z');
      expect(occurrences.map(o => o.index)).toEqual([0, 1, 2, 3, 4]);
    });

    it('supports custom interval (every 3 days)', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 3,
        startAt: '2026-06-01T10:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-10T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(4);
      expect(occurrences[0].startAt).toBe('2026-06-01T10:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2026-06-04T10:00:00.000Z');
      expect(occurrences[2].startAt).toBe('2026-06-07T10:00:00.000Z');
      expect(occurrences[3].startAt).toBe('2026-06-10T10:00:00.000Z');
    });
  });

  describe('TM-REC-002: Weekly recurrence generates correct occurrences', () => {
    it('generates weekly occurrences on the series weekday', () => {
      // 2026-06-01 is a Monday
      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: '2026-06-01T14:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-23T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(4);
      expect(occurrences[0].startAt).toBe('2026-06-01T14:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2026-06-08T14:00:00.000Z');
      expect(occurrences[2].startAt).toBe('2026-06-15T14:00:00.000Z');
      expect(occurrences[3].startAt).toBe('2026-06-22T14:00:00.000Z');
    });

    it('supports bi-weekly recurrence (interval: 2)', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 2,
        startAt: '2026-06-01T14:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-30T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].startAt).toBe('2026-06-01T14:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2026-06-15T14:00:00.000Z');
      expect(occurrences[2].startAt).toBe('2026-06-29T14:00:00.000Z');
    });
  });

  describe('TM-REC-003: Monthly recurrence generates correct occurrences', () => {
    it('generates monthly occurrences on same day of month', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.MONTHLY,
        interval: 1,
        startAt: '2026-01-15T11:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-01-01T00:00:00.000Z',
        '2026-04-30T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(4);
      expect(occurrences[0].startAt).toBe('2026-01-15T11:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2026-02-15T11:00:00.000Z');
      expect(occurrences[2].startAt).toBe('2026-03-15T11:00:00.000Z');
      expect(occurrences[3].startAt).toBe('2026-04-15T11:00:00.000Z');
    });

    it('clamps 31st to month end in shorter months', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.MONTHLY,
        interval: 1,
        byMonthDay: [31],
        startAt: '2026-01-31T12:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-01-01T00:00:00.000Z',
        '2026-04-30T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(4);
      expect(occurrences[0].startAt).toBe('2026-01-31T12:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2026-02-28T12:00:00.000Z'); // 2026 is non-leap year
      expect(occurrences[2].startAt).toBe('2026-03-31T12:00:00.000Z');
      expect(occurrences[3].startAt).toBe('2026-04-30T12:00:00.000Z');
    });

    it('generates nth weekday of month (e.g. 2nd Tuesday)', () => {
      // 2nd Tuesday of month at 15:00 UTC
      const rule = {
        frequency: RECURRENCE_FREQUENCY.MONTHLY,
        interval: 1,
        byWeekday: [WEEKDAY.TU], // 2
        bySetPos: 2, // 2nd Tuesday
        startAt: '2026-01-01T15:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-01-01T00:00:00.000Z',
        '2026-03-31T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(3);
      // Jan 2026: 1st Tue = Jan 6, 2nd Tue = Jan 13
      expect(occurrences[0].startAt).toBe('2026-01-13T15:00:00.000Z');
      // Feb 2026: 1st Tue = Feb 3, 2nd Tue = Feb 10
      expect(occurrences[1].startAt).toBe('2026-02-10T15:00:00.000Z');
      // Mar 2026: 1st Tue = Mar 3, 2nd Tue = Mar 10
      expect(occurrences[2].startAt).toBe('2026-03-10T15:00:00.000Z');
    });

    it('generates last Friday of month (bySetPos: -1)', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.MONTHLY,
        interval: 1,
        byWeekday: [WEEKDAY.FR], // 5
        bySetPos: -1,
        startAt: '2026-01-01T18:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-01-01T00:00:00.000Z',
        '2026-02-28T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(2);
      expect(occurrences[0].startAt).toBe('2026-01-30T18:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2026-02-27T18:00:00.000Z');
    });
  });

  describe('TM-REC-004: Yearly recurrence generates correct occurrences', () => {
    it('generates annual occurrences on the same date', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.YEARLY,
        interval: 1,
        startAt: '2026-07-04T12:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-01-01T00:00:00.000Z',
        '2029-12-31T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(4);
      expect(occurrences[0].startAt).toBe('2026-07-04T12:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2027-07-04T12:00:00.000Z');
      expect(occurrences[2].startAt).toBe('2028-07-04T12:00:00.000Z');
      expect(occurrences[3].startAt).toBe('2029-07-04T12:00:00.000Z');
    });
  });

  describe('TM-REC-005: Selected weekday recurrence works', () => {
    it('generates occurrences on Mon, Wed, Fri', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        byWeekday: [WEEKDAY.MO, WEEKDAY.WE, WEEKDAY.FR], // [1, 3, 5]
        startAt: '2026-06-01T08:30:00.000Z', // Monday
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-07T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].startAt).toBe('2026-06-01T08:30:00.000Z'); // Mon
      expect(occurrences[1].startAt).toBe('2026-06-03T08:30:00.000Z'); // Wed
      expect(occurrences[2].startAt).toBe('2026-06-05T08:30:00.000Z'); // Fri
    });

    it('generates weekdays (Mon-Fri) using DAILY with byWeekday', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 1,
        byWeekday: [1, 2, 3, 4, 5],
        startAt: '2026-06-05T09:00:00.000Z', // Friday
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-05T00:00:00.000Z',
        '2026-06-09T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].startAt).toBe('2026-06-05T09:00:00.000Z'); // Fri
      expect(occurrences[1].startAt).toBe('2026-06-08T09:00:00.000Z'); // Mon (skipped Sat/Sun)
      expect(occurrences[2].startAt).toBe('2026-06-09T09:00:00.000Z'); // Tue
    });
  });

  describe('TM-REC-006: Recurrence end date is respected', () => {
    it('stops generating occurrences after endAt (UNTIL)', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 1,
        startAt: '2026-06-01T10:00:00.000Z',
        endAt: '2026-06-03T10:00:00.000Z',
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-10T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences.map(o => o.startAt)).toEqual([
        '2026-06-01T10:00:00.000Z',
        '2026-06-02T10:00:00.000Z',
        '2026-06-03T10:00:00.000Z',
      ]);
    });
  });

  describe('TM-REC-007: Occurrence count limit is respected', () => {
    it('generates strictly up to occurrenceCount occurrences', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 1,
        startAt: '2026-06-01T10:00:00.000Z',
        occurrenceCount: 3,
        timezone: 'UTC',
      };
      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-30T23:59:59.999Z',
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences.map(o => o.index)).toEqual([0, 1, 2]);
      expect(occurrences[2].startAt).toBe('2026-06-03T10:00:00.000Z');
    });
  });

  describe('TM-REC-008: Single occurrence can be modified', () => {
    it('applies override exception to a specific occurrence without altering others', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 1,
        startAt: '2026-06-01T09:00:00.000Z',
        timezone: 'UTC',
      };
      const exceptions = [
        {
          occurrenceKey: '2026-06-02T09:00:00.000Z',
          exceptionType: 'MODIFIED',
          overrideTitle: 'Special Standup',
          overrideStartAt: '2026-06-02T11:30:00.000Z',
          overrideEndAt: '2026-06-02T12:30:00.000Z',
        },
      ];

      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-03T23:59:59.999Z',
        { exceptions },
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].isException).toBe(false);
      expect(occurrences[0].startAt).toBe('2026-06-01T09:00:00.000Z');

      // Modified occurrence preserves occurrenceKey
      expect(occurrences[1].isException).toBe(true);
      expect(occurrences[1].occurrenceKey).toBe('2026-06-02T09:00:00.000Z');
      expect(occurrences[1].originalStartAt).toBe('2026-06-02T09:00:00.000Z');
      expect(occurrences[1].startAt).toBe('2026-06-02T11:30:00.000Z');
      expect(occurrences[1].endAt).toBe('2026-06-02T12:30:00.000Z');
      expect(occurrences[1].exception.overrideTitle).toBe('Special Standup');

      // Subsequent occurrence remains unaffected
      expect(occurrences[2].isException).toBe(false);
      expect(occurrences[2].startAt).toBe('2026-06-03T09:00:00.000Z');
    });
  });

  describe('TM-REC-009: Entire recurrence series can be modified', () => {
    it('adjusting series parameters updates all future dynamic occurrences', () => {
      const originalRule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: '2026-06-01T10:00:00.000Z',
        timezone: 'UTC',
      };
      const updatedRule = {
        ...originalRule,
        interval: 2, // Modified series to bi-weekly
      };

      const originalOccurrences = expandOccurrences(
        originalRule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-30T23:59:59.999Z',
      );
      const updatedOccurrences = expandOccurrences(
        updatedRule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-30T23:59:59.999Z',
      );

      expect(originalOccurrences).toHaveLength(5);
      expect(updatedOccurrences).toHaveLength(3);
      expect(updatedOccurrences.map(o => o.startAt)).toEqual([
        '2026-06-01T10:00:00.000Z',
        '2026-06-15T10:00:00.000Z',
        '2026-06-29T10:00:00.000Z',
      ]);
    });
  });

  describe('TM-REC-010: Single occurrence can be cancelled', () => {
    it('omits cancelled occurrence while retaining series continuity and occurrence count', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 1,
        startAt: '2026-06-01T09:00:00.000Z',
        occurrenceCount: 4,
        timezone: 'UTC',
      };
      const exceptions = [
        {
          occurrenceKey: '2026-06-02T09:00:00.000Z',
          exceptionType: 'CANCELLED',
        },
      ];

      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-10T23:59:59.999Z',
        { exceptions },
      );

      // Total generated is 4, but index 1 is cancelled, so output length is 3
      expect(occurrences).toHaveLength(3);
      expect(occurrences.map(o => o.index)).toEqual([0, 2, 3]);
      expect(occurrences.map(o => o.startAt)).toEqual([
        '2026-06-01T09:00:00.000Z',
        '2026-06-03T09:00:00.000Z',
        '2026-06-04T09:00:00.000Z',
      ]);
    });
  });

  describe('TM-REC-011 & Section 25: Timezone and DST Invariants', () => {
    it('CASE A: Asia/Kolkata Recurring Monday 09:00 (No DST)', () => {
      // 09:00 IST = 03:30 UTC
      const startAtIso = localToUtc(2026, 6, 1, 9, 0, 0, 0, 'Asia/Kolkata');
      expect(startAtIso).toBe('2026-06-01T03:30:00.000Z');

      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: startAtIso,
        timezone: 'Asia/Kolkata',
      };

      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-16T00:00:00.000Z',
      );

      expect(occurrences).toHaveLength(3);
      for (const occ of occurrences) {
        const local = getLocalComponents(occ.startAt, 'Asia/Kolkata');
        expect(local.hour).toBe(9);
        expect(local.minute).toBe(0);
        expect(local.weekday).toBe(1); // Monday
      }
    });

    it('CASE B: America/New_York Weekly 09:00 across spring-forward (March 2026)', () => {
      // US DST spring-forward is Sunday, March 8, 2026: 02:00 EST -> 03:00 EDT
      // Before March 8 (EST): 09:00 EST = 14:00 UTC
      // After March 8 (EDT): 09:00 EDT = 13:00 UTC
      const startAtIso = localToUtc(2026, 3, 2, 9, 0, 0, 0, 'America/New_York');
      expect(startAtIso).toBe('2026-03-02T14:00:00.000Z');

      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: startAtIso,
        timezone: 'America/New_York',
      };

      const occurrences = expandOccurrences(
        rule,
        '2026-03-01T00:00:00.000Z',
        '2026-03-25T00:00:00.000Z',
      );

      expect(occurrences).toHaveLength(4);
      // Pre-DST: March 2 -> 14:00 UTC
      expect(occurrences[0].startAt).toBe('2026-03-02T14:00:00.000Z');
      // Post-DST: March 9 -> 13:00 UTC (preserved 09:00 wall-clock in NY!)
      expect(occurrences[1].startAt).toBe('2026-03-09T13:00:00.000Z');
      expect(occurrences[2].startAt).toBe('2026-03-16T13:00:00.000Z');
      expect(occurrences[3].startAt).toBe('2026-03-23T13:00:00.000Z');

      for (const occ of occurrences) {
        const local = getLocalComponents(occ.startAt, 'America/New_York');
        expect(local.hour).toBe(9);
        expect(local.minute).toBe(0);
      }
    });

    it('CASE C: America/New_York Weekly 09:00 across fall-back (November 2026)', () => {
      // US DST fall-back is Sunday, November 1, 2026: 02:00 EDT -> 01:00 EST
      // Before Nov 1 (EDT): 09:00 EDT = 13:00 UTC
      // After Nov 1 (EST): 09:00 EST = 14:00 UTC
      const startAtIso = localToUtc(2026, 10, 26, 9, 0, 0, 0, 'America/New_York');
      expect(startAtIso).toBe('2026-10-26T13:00:00.000Z');

      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: startAtIso,
        timezone: 'America/New_York',
      };

      const occurrences = expandOccurrences(
        rule,
        '2026-10-25T00:00:00.000Z',
        '2026-11-15T00:00:00.000Z',
      );

      expect(occurrences).toHaveLength(3);
      // Pre-fallback: Oct 26 -> 13:00 UTC
      expect(occurrences[0].startAt).toBe('2026-10-26T13:00:00.000Z');
      // Post-fallback: Nov 2 -> 14:00 UTC (preserved 09:00 wall-clock!)
      expect(occurrences[1].startAt).toBe('2026-11-02T14:00:00.000Z');
      expect(occurrences[2].startAt).toBe('2026-11-09T14:00:00.000Z');

      for (const occ of occurrences) {
        const local = getLocalComponents(occ.startAt, 'America/New_York');
        expect(local.hour).toBe(9);
        expect(local.minute).toBe(0);
      }
    });

    it('CASE D: Europe/London Weekly recurrence across DST boundary', () => {
      // UK DST spring-forward: March 29, 2026: 01:00 GMT -> 02:00 BST
      // Pre-DST: 10:00 GMT = 10:00 UTC
      // Post-DST: 10:00 BST = 09:00 UTC
      const startAtIso = localToUtc(2026, 3, 23, 10, 0, 0, 0, 'Europe/London');
      expect(startAtIso).toBe('2026-03-23T10:00:00.000Z');

      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: startAtIso,
        timezone: 'Europe/London',
      };

      const occurrences = expandOccurrences(
        rule,
        '2026-03-20T00:00:00.000Z',
        '2026-04-10T00:00:00.000Z',
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].startAt).toBe('2026-03-23T10:00:00.000Z'); // GMT
      expect(occurrences[1].startAt).toBe('2026-03-30T09:00:00.000Z'); // BST
      expect(occurrences[2].startAt).toBe('2026-04-06T09:00:00.000Z'); // BST

      for (const occ of occurrences) {
        const local = getLocalComponents(occ.startAt, 'Europe/London');
        expect(local.hour).toBe(10);
        expect(local.minute).toBe(0);
      }
    });

    it('CASE E: All-day recurring event across timezone/viewer differences', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.DAILY,
        interval: 1,
        startAt: '2026-06-01T00:00:00.000Z',
        timezone: 'America/New_York', // should be normalized to whole-date UTC
      };

      const occurrences = expandOccurrences(
        rule,
        '2026-06-01T00:00:00.000Z',
        '2026-06-03T23:59:59.999Z',
        { isAllDay: true },
      );

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].occurrenceKey).toBe('2026-06-01');
      expect(occurrences[0].startAt).toBe('2026-06-01T00:00:00.000Z');
      expect(occurrences[0].endAt).toBe('2026-06-01T23:59:59.999Z');

      expect(occurrences[1].occurrenceKey).toBe('2026-06-02');
      expect(occurrences[1].startAt).toBe('2026-06-02T00:00:00.000Z');
      expect(occurrences[1].endAt).toBe('2026-06-02T23:59:59.999Z');
    });
  });

  describe('TM-REC-012: Repeated generation does not create duplicates', () => {
    it('deterministic repeated expansions produce identical occurrence keys and counts', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: '2026-06-01T10:00:00.000Z',
        timezone: 'UTC',
      };

      const run1 = expandOccurrences(rule, '2026-06-01T00:00:00.000Z', '2026-06-30T23:59:59.999Z');
      const run2 = expandOccurrences(rule, '2026-06-01T00:00:00.000Z', '2026-06-30T23:59:59.999Z');

      expect(run1).toEqual(run2);
      const keys = run1.map(o => o.occurrenceKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('formatRRuleString & isOccurrenceOfSeries', () => {
    it('formats RFC 5545 RRULE strings accurately', () => {
      expect(
        formatRRuleString({
          frequency: 'WEEKLY',
          interval: 2,
          byWeekday: [1, 3, 5],
          occurrenceCount: 10,
        }),
      ).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=10');

      expect(
        formatRRuleString({
          frequency: 'MONTHLY',
          bySetPos: 2,
          byWeekday: [2],
          endAt: '2026-12-31T23:59:59.000Z',
        }),
      ).toBe('FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2;UNTIL=20261231T235959Z');
    });

    it('identifies if a date belongs to a series', () => {
      const rule = {
        frequency: RECURRENCE_FREQUENCY.WEEKLY,
        interval: 1,
        startAt: '2026-06-01T10:00:00.000Z',
        timezone: 'UTC',
      };

      expect(isOccurrenceOfSeries(rule, '2026-06-01T10:00:00.000Z')).toBe(true);
      expect(isOccurrenceOfSeries(rule, '2026-06-08T10:00:00.000Z')).toBe(true);
      expect(isOccurrenceOfSeries(rule, '2026-06-03T10:00:00.000Z')).toBe(false);
    });
  });
});
