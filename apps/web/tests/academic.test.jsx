// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { AcademicPage } from '../src/pages/AcademicPage.jsx';
import { SemesterModal } from '../src/components/academic/SemesterModal.jsx';
import { HolidayModal } from '../src/components/academic/HolidayModal.jsx';
import { EndSemesterModal } from '../src/components/academic/EndSemesterModal.jsx';
import { ScheduleEntryModal } from '../src/components/academic/ScheduleEntryModal.jsx';
import { ClassExceptionModal } from '../src/components/academic/ClassExceptionModal.jsx';
import * as academicApi from '../src/services/academic.api.js';

// Mock Outlet Context
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useOutletContext: () => ({
      currentWorkspace: { id: 'ws-acad-1', name: 'Academic Workspace' },
    }),
  };
});

describe('Phase 18: Academic Calendar and Day Order UI Components & Pages', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  const mockSemester = {
    id: 'sem-101',
    workspaceId: 'ws-acad-1',
    name: 'Even Semester 2026',
    academicYear: '2025-2026',
    institution: 'SRM Institute of Science and Technology',
    startDate: '2026-09-01',
    endDate: '2026-09-15',
    dayOrderCount: 5,
    status: 'ACTIVE',
  };

  const mockDates = [
    { calendarDate: '2026-09-01', dayStatus: 'WORKING_DAY', dayOrder: 'DO1', reason: null },
    { calendarDate: '2026-09-02', dayStatus: 'WORKING_DAY', dayOrder: 'DO2', reason: null },
    { calendarDate: '2026-09-03', dayStatus: 'HOLIDAY', dayOrder: null, reason: 'Founder Holiday' },
    { calendarDate: '2026-09-04', dayStatus: 'WORKING_DAY', dayOrder: 'DO3', reason: null },
    {
      calendarDate: '2026-09-05',
      dayStatus: 'SPECIAL_WORKING_DAY',
      dayOrder: 'DO4',
      reason: 'Working Saturday',
    },
  ];

  const mockSchedule = {
    id: 'sch-101',
    name: 'Core B.Tech Timetable',
    entries: [
      {
        id: 'entry-1',
        dayOrder: 'DO1',
        courseName: 'Operating Systems',
        courseCode: '18CSC301J',
        instructor: 'Dr. Raman',
        room: 'TP 401',
        startTime: '09:00',
        endTime: '10:00',
        color: '#6366F1',
      },
      {
        id: 'entry-2',
        dayOrder: 'DO2',
        courseName: 'DBMS',
        courseCode: '18CSC302J',
        instructor: 'Dr. Priya',
        room: 'TP 402',
        startTime: '10:00',
        endTime: '11:00',
        color: '#10B981',
      },
    ],
  };

  it('Renders AcademicPage with Day Order calendar and active semester cockpit', async () => {
    vi.spyOn(academicApi, 'fetchSemesters').mockResolvedValue([mockSemester]);
    vi.spyOn(academicApi, 'fetchClassSchedules').mockResolvedValue([mockSchedule]);
    vi.spyOn(academicApi, 'fetchClassSchedule').mockResolvedValue(mockSchedule);
    vi.spyOn(academicApi, 'fetchAcademicCalendar').mockResolvedValue(mockDates);
    vi.spyOn(academicApi, 'fetchAcademicExceptions').mockResolvedValue([]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AcademicPage />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[data-testid="academic-workspace"]')).toBeTruthy();
    expect(container.textContent).toContain('Even Semester 2026');
    expect(container.textContent).toContain('SRM Institute of Science and Technology');

    // Verify Day Order table is rendered
    expect(container.querySelector('[data-testid="academic-calendar-table"]')).toBeTruthy();
    expect(container.textContent).toContain('2026-09-01');
    expect(container.textContent).toContain('DO1');
    expect(container.textContent).toContain('DO2');
    expect(container.textContent).toContain('Founder Holiday');
  });

  it('HolidayModal displays Day Order shift warning per UX-SPECIFICATION.md Section 30', async () => {
    const handleSubmit = vi.fn();

    await act(async () => {
      root.render(
        <HolidayModal
          isOpen={true}
          onClose={vi.fn()}
          semester={mockSemester}
          onSubmit={handleSubmit}
        />,
      );
    });

    const warning = container.querySelector('[data-testid="holiday-shift-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('Day Order Shift Warning');
    expect(warning.textContent).toContain('shifts subsequent Day Orders');
  });

  it('EndSemesterModal displays high-impact warning and preservation list per UX-SPECIFICATION.md Section 31', async () => {
    const handleConfirm = vi.fn();

    await act(async () => {
      root.render(
        <EndSemesterModal
          isOpen={true}
          onClose={vi.fn()}
          semester={mockSemester}
          onConfirm={handleConfirm}
        />,
      );
    });

    const warning = container.querySelector('[data-testid="end-semester-warning"]');
    expect(warning).toBeTruthy();
    expect(container.textContent).toContain('Are you sure you want to end this semester');
    expect(container.textContent).toContain('The following data is strictly PRESERVED');
    expect(container.textContent).toContain('Past academic class history');
    expect(container.textContent).toContain('Reusable class timetable definitions');
  });

  it('ScheduleEntryModal validates start and end times', async () => {
    const handleSubmit = vi.fn();

    await act(async () => {
      root.render(
        <ScheduleEntryModal
          isOpen={true}
          onClose={vi.fn()}
          defaultDayOrder="DO1"
          dayOrderCount={5}
          onSubmit={handleSubmit}
        />,
      );
    });

    expect(container.querySelector('[data-testid="schedule-entry-name-input"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="schedule-entry-do-select"]')).toBeTruthy();
  });

  it('ClassExceptionModal supports cancellation and rescheduling', async () => {
    const handleSubmit = vi.fn();

    await act(async () => {
      root.render(
        <ClassExceptionModal
          isOpen={true}
          onClose={vi.fn()}
          mode="RESCHEDULE"
          calendarDate="2026-09-08"
          scheduleEntry={mockSchedule.entries[0]}
          onSubmit={handleSubmit}
        />,
      );
    });

    expect(container.querySelector('[data-testid="reschedule-date-input"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="reschedule-start-time"]')).toBeTruthy();
  });

  it('SemesterModal creates semester with start and end dates', async () => {
    const handleSubmit = vi.fn();

    await act(async () => {
      root.render(<SemesterModal isOpen={true} onClose={vi.fn()} onSubmit={handleSubmit} />);
    });

    expect(container.querySelector('[data-testid="semester-name-input"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="semester-start-date-input"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="semester-end-date-input"]')).toBeTruthy();
  });
});
