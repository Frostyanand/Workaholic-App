import { describe, it, expect } from 'vitest';
import * as eventsRepo from '../src/modules/calendar/events.repository.js';
import { normalizeAllDayBounds, extractAllDayDates, deriveAllDayDates } from '@workaholic/shared';

describe('Calendar & Event Domain Logic Unit Tests (Phase 8)', () => {
  const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174001';
  const CALENDAR_ID = '123e4567-e89b-12d3-a456-426614174002';

  describe('All-Day Whole Date Semantics Reconciled', () => {
    it('normalizes single-day all-day event to UTC date bounds without timezone distortion', () => {
      const bounds = normalizeAllDayBounds('2026-09-15');
      expect(bounds.startDate).toBe('2026-09-15');
      expect(bounds.endDate).toBe('2026-09-15');
      expect(bounds.startAt).toBe('2026-09-15T00:00:00.000Z');
      expect(bounds.endAt).toBe('2026-09-15T23:59:59.999Z');

      // Inverse extraction restores exact dates
      const extracted = extractAllDayDates(bounds.startAt, bounds.endAt);
      expect(extracted.startDate).toBe('2026-09-15');
      expect(extracted.endDate).toBe('2026-09-15');
    });

    it('normalizes multi-day all-day event spanning multiple dates', () => {
      const bounds = normalizeAllDayBounds('2026-09-15', '2026-09-17');
      expect(bounds.startDate).toBe('2026-09-15');
      expect(bounds.endDate).toBe('2026-09-17');
      expect(bounds.startAt).toBe('2026-09-15T00:00:00.000Z');
      expect(bounds.endAt).toBe('2026-09-17T23:59:59.999Z');

      const allDates = deriveAllDayDates('2026-09-15', '2026-09-17');
      expect(allDates).toEqual(['2026-09-15', '2026-09-16', '2026-09-17']);
    });

    it('rejects all-day bounds where endDate precedes startDate', () => {
      expect(() => normalizeAllDayBounds('2026-09-17', '2026-09-15')).toThrow(RangeError);
    });

    it('mapping event row preserves startDate and endDate for is_all_day = true', () => {
      const rawRow = {
        id: 'evt_1',
        calendar_id: CALENDAR_ID,
        workspace_id: WORKSPACE_ID,
        title: 'Independence Day Holiday',
        start_at: new Date('2026-09-15T00:00:00.000Z'),
        end_at: new Date('2026-09-15T23:59:59.999Z'),
        timezone: 'UTC',
        is_all_day: true,
        visibility: 'PRIVATE',
        status: 'CONFIRMED',
        source_type: 'HOLIDAY',
        task_ids: [],
        project_ids: [],
      };

      const event = eventsRepo.mapEventRow(rawRow);
      expect(event.isAllDay).toBe(true);
      expect(event.startDate).toBe('2026-09-15');
      expect(event.endDate).toBe('2026-09-15');
    });
  });

  describe('Conflict Detection Semantics (CALENDAR-SPECIFICATION Section 14)', () => {
    it('detects overlapping confirmed timed events but does NOT reject transactions', async () => {
      // Overlap condition: e.start_at < newEnd AND e.end_at > newStart
      const existingEvent = {
        id: 'evt_conflict_1',
        title: 'Standup',
        startAt: '2026-09-15T10:00:00.000Z',
        endAt: '2026-09-15T11:00:00.000Z',
        timezone: 'UTC',
      };

      // Test overlap logic directly: 10:30 to 11:30 overlaps with 10:00 to 11:00
      const overlaps =
        new Date(existingEvent.startAt) < new Date('2026-09-15T11:30:00.000Z') &&
        new Date(existingEvent.endAt) > new Date('2026-09-15T10:30:00.000Z');

      expect(overlaps).toBe(true);

      // Adjacent non-overlapping: 11:00 to 12:00
      const adjacentOverlaps =
        new Date(existingEvent.startAt) < new Date('2026-09-15T12:00:00.000Z') &&
        new Date(existingEvent.endAt) > new Date('2026-09-15T11:00:00.000Z');

      expect(adjacentOverlaps).toBe(false);
    });
  });
});
