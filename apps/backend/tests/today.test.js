import { describe, it, expect } from 'vitest';
import {
  resolveTimezone,
  getLocalDateString,
  TodayService,
} from '../src/modules/today/today.service.js';

describe('Today & Command Center Domain Logic Unit Tests (Phase 9)', () => {
  describe('Timezone & Date Utilities', () => {
    it('resolves valid IANA timezones and falls back on invalid timezones', () => {
      expect(resolveTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
      expect(resolveTimezone('America/New_York')).toBe('America/New_York');
      expect(resolveTimezone('UTC')).toBe('UTC');
      expect(resolveTimezone('Invalid/Timezone_Foo', 'UTC')).toBe('UTC');
      expect(resolveTimezone('', 'Europe/London')).toBe('Europe/London');
      expect(resolveTimezone(null, 'UTC')).toBe('UTC');
    });

    it('formats local calendar date YYYY-MM-DD correctly in target timezone', () => {
      // 2026-09-06T20:00:00.000Z is 2026-09-07 01:30 in Asia/Kolkata (+05:30)
      const instant = new Date('2026-09-06T20:00:00.000Z');
      expect(getLocalDateString(instant, 'UTC')).toBe('2026-09-06');
      expect(getLocalDateString(instant, 'Asia/Kolkata')).toBe('2026-09-07');
    });
  });

  describe('Current and Next Work Temporal Ordering (TM-TODAY-006 & Section 24)', () => {
    it('Case 1: Work block takes precedence over overlapping event for currentWork', async () => {
      const asOf = new Date('2026-09-07T10:30:00.000Z');
      const mockClient = {
        query: async sql => {
          if (sql.includes('day_start_utc')) {
            return {
              rows: [
                {
                  day_start_utc: '2026-09-07T00:00:00.000Z',
                  day_end_utc: '2026-09-07T23:59:59.999Z',
                },
              ],
            };
          }
          if (sql.includes('task_work_blocks wb')) {
            return {
              rows: [
                {
                  id: 'wb-1',
                  task_id: 'task-1',
                  task_title: 'Focus Deep Work',
                  start_at: '2026-09-07T10:00:00.000Z',
                  end_at: '2026-09-07T11:00:00.000Z',
                  status: 'SCHEDULED',
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      const mockEventsRepo = {
        findEventsByRange: async () => [
          {
            id: 'evt-1',
            title: 'Team Standup',
            startAt: '2026-09-07T10:15:00.000Z',
            endAt: '2026-09-07T10:45:00.000Z',
            isAllDay: false,
            status: 'CONFIRMED',
          },
        ],
      };

      const todayService = new TodayService({ eventsRepo: mockEventsRepo });

      const cockpit = await todayService.getTodayCockpit(
        '123e4567-e89b-12d3-a456-426614174000',
        { asOf, date: '2026-09-07', timezone: 'UTC' },
        mockClient,
      );

      expect(cockpit.currentWork).not.toBeNull();
      expect(cockpit.currentWork.type).toBe('WORK_BLOCK');
      expect(cockpit.currentWork.taskTitle).toBe('Focus Deep Work');
    });

    it('Case 2: Active event becomes currentWork when no work block is active', async () => {
      const asOf = new Date('2026-09-07T14:30:00.000Z');
      const mockClient = {
        query: async sql => {
          if (sql.includes('day_start_utc')) {
            return {
              rows: [
                {
                  day_start_utc: '2026-09-07T00:00:00.000Z',
                  day_end_utc: '2026-09-07T23:59:59.999Z',
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      const mockEventsRepo = {
        findEventsByRange: async () => [
          {
            id: 'evt-client-sync',
            title: 'Client Roadmap Sync',
            startAt: '2026-09-07T14:00:00.000Z',
            endAt: '2026-09-07T15:00:00.000Z',
            isAllDay: false,
            status: 'CONFIRMED',
          },
        ],
      };

      const todayService = new TodayService({ eventsRepo: mockEventsRepo });

      const cockpit = await todayService.getTodayCockpit(
        '123e4567-e89b-12d3-a456-426614174000',
        { asOf, date: '2026-09-07', timezone: 'UTC' },
        mockClient,
      );

      expect(cockpit.currentWork).not.toBeNull();
      expect(cockpit.currentWork.type).toBe('EVENT');
      expect(cockpit.currentWork.title).toBe('Client Roadmap Sync');
    });

    it('Case 3: currentWork is null when nothing is currently scheduled (no arbitrary task fallback)', async () => {
      const asOf = new Date('2026-09-07T12:00:00.000Z');
      const mockClient = {
        query: async sql => {
          if (sql.includes('day_start_utc')) {
            return {
              rows: [
                {
                  day_start_utc: '2026-09-07T00:00:00.000Z',
                  day_end_utc: '2026-09-07T23:59:59.999Z',
                },
              ],
            };
          }
          if (sql.includes("priority IN ('P0', 'P1', 'P2')")) {
            return {
              rows: [
                {
                  id: 'task-p0',
                  title: 'Critical Fix',
                  priority: 'P0',
                  status: 'TODO',
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      const mockEventsRepo = {
        findEventsByRange: async () => [],
      };

      const todayService = new TodayService({ eventsRepo: mockEventsRepo });

      const cockpit = await todayService.getTodayCockpit(
        '123e4567-e89b-12d3-a456-426614174000',
        { asOf, date: '2026-09-07', timezone: 'UTC' },
        mockClient,
      );

      // Must honestly be null, NOT fallback to Critical Fix task
      expect(cockpit.currentWork).toBeNull();
      expect(cockpit.important).toHaveLength(1);
    });

    it('Case 4: Earliest upcoming scheduled item becomes nextWork', async () => {
      const asOf = new Date('2026-09-07T08:00:00.000Z');
      const mockClient = {
        query: async sql => {
          if (sql.includes('day_start_utc')) {
            return {
              rows: [
                {
                  day_start_utc: '2026-09-07T00:00:00.000Z',
                  day_end_utc: '2026-09-07T23:59:59.999Z',
                },
              ],
            };
          }
          if (sql.includes('task_work_blocks wb')) {
            return {
              rows: [
                {
                  id: 'wb-afternoon',
                  task_id: 'task-2',
                  task_title: 'Afternoon Architecture Review',
                  start_at: '2026-09-07T14:00:00.000Z',
                  end_at: '2026-09-07T15:30:00.000Z',
                  status: 'SCHEDULED',
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      const mockEventsRepo = {
        findEventsByRange: async () => [
          {
            id: 'evt-morning',
            title: 'Daily Standup',
            startAt: '2026-09-07T09:00:00.000Z',
            endAt: '2026-09-07T09:30:00.000Z',
            isAllDay: false,
            status: 'CONFIRMED',
          },
        ],
      };

      const todayService = new TodayService({ eventsRepo: mockEventsRepo });

      const cockpit = await todayService.getTodayCockpit(
        '123e4567-e89b-12d3-a456-426614174000',
        { asOf, date: '2026-09-07', timezone: 'UTC' },
        mockClient,
      );

      expect(cockpit.nextWork).not.toBeNull();
      expect(cockpit.nextWork.title).toBe('Daily Standup');
      expect(cockpit.nextWork.startAt).toBe('2026-09-07T09:00:00.000Z');
    });

    it('Case 5: nextWork is null when no future scheduled items remain today', async () => {
      const asOf = new Date('2026-09-07T20:00:00.000Z');
      const mockClient = {
        query: async sql => {
          if (sql.includes('day_start_utc')) {
            return {
              rows: [
                {
                  day_start_utc: '2026-09-07T00:00:00.000Z',
                  day_end_utc: '2026-09-07T23:59:59.999Z',
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      const mockEventsRepo = {
        findEventsByRange: async () => [],
      };

      const todayService = new TodayService({ eventsRepo: mockEventsRepo });

      const cockpit = await todayService.getTodayCockpit(
        '123e4567-e89b-12d3-a456-426614174000',
        { asOf, date: '2026-09-07', timezone: 'UTC' },
        mockClient,
      );

      expect(cockpit.nextWork).toBeNull();
    });

    it('Case 6: Task due earlier today (09:00) when asOf is 14:00 is marked isOverdue: true and belongs to both Due Today and Overdue', async () => {
      const asOf = new Date('2026-09-07T14:00:00.000Z');
      const mockClient = {
        query: async sql => {
          if (sql.includes('day_start_utc')) {
            return {
              rows: [
                {
                  day_start_utc: '2026-09-07T00:00:00.000Z',
                  day_end_utc: '2026-09-07T23:59:59.999Z',
                },
              ],
            };
          }
          if (sql.includes('t.due_at >= $2 AND t.due_at <= $3')) {
            // Due Today query
            return {
              rows: [
                {
                  id: 'task-morning-deadline',
                  title: 'Morning Report Submission',
                  due_at: '2026-09-07T09:00:00.000Z',
                  priority: 'P1',
                  status: 'TODO',
                },
              ],
            };
          }
          if (sql.includes('t.due_at < $2')) {
            // Overdue query
            return {
              rows: [
                {
                  id: 'task-morning-deadline',
                  title: 'Morning Report Submission',
                  due_at: '2026-09-07T09:00:00.000Z',
                  priority: 'P1',
                  status: 'TODO',
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      const todayService = new TodayService({ eventsRepo: { findEventsByRange: async () => [] } });

      const cockpit = await todayService.getTodayCockpit(
        '123e4567-e89b-12d3-a456-426614174000',
        { asOf, date: '2026-09-07', timezone: 'UTC' },
        mockClient,
      );

      expect(cockpit.dueToday).toHaveLength(1);
      expect(cockpit.dueToday[0].isOverdue).toBe(true);
      expect(cockpit.overdue).toHaveLength(1);
      expect(cockpit.overdue[0].id).toBe('task-morning-deadline');
      expect(cockpit.overdue[0].isOverdue).toBe(true);
    });
  });
});
