import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  GraduationCap,
  Calendar as CalendarIcon,
  Plus,
  Play,
  AlertTriangle,
  Clock,
  MapPin,
  User,
  Trash2,
  CalendarCheck,
  CheckCircle,
  Ban,
  CalendarClock,
  PowerOff,
} from 'lucide-react';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { SemesterModal } from '../components/academic/SemesterModal.jsx';
import { HolidayModal } from '../components/academic/HolidayModal.jsx';
import { EndSemesterModal } from '../components/academic/EndSemesterModal.jsx';
import { ScheduleEntryModal } from '../components/academic/ScheduleEntryModal.jsx';
import { ClassExceptionModal } from '../components/academic/ClassExceptionModal.jsx';
import * as academicApi from '../services/academic.api.js';
import { SEMESTER_STATUS, ACADEMIC_DAY_STATUS } from '@workaholic/shared';

export function AcademicPage() {
  const context = useOutletContext() || {};
  const currentWorkspace = context.currentWorkspace;
  const workspaceId = currentWorkspace?.id;

  // Active Tab: 'CALENDAR' | 'TIMETABLE' | 'SEMESTERS'
  const [activeTab, setActiveTab] = useState('CALENDAR');

  // Core Data
  const [semesters, setSemesters] = useState([]);
  const [activeSemester, setActiveSemester] = useState(null);
  const [calendarDates, setCalendarDates] = useState([]);
  const [classSchedules, setClassSchedules] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [exceptions, setExceptions] = useState([]);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generationResult, setGenerationResult] = useState(null);

  // Modals
  const [isSemesterModalOpen, setIsSemesterModalOpen] = useState(false);
  const [editingSemester, setEditingSemester] = useState(null);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [selectedDateItem, setSelectedDateItem] = useState(null);
  const [isEndSemesterModalOpen, setIsEndSemesterModalOpen] = useState(false);
  const [semesterToEnd, setSemesterToEnd] = useState(null);
  const [isScheduleEntryModalOpen, setIsScheduleEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [targetDayOrder, setTargetDayOrder] = useState('DO1');
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [exceptionModalConfig, setExceptionModalConfig] = useState({
    mode: 'CANCEL',
    calendarDate: '',
    scheduleEntry: null,
  });

  // 1. Load Semesters and Schedules
  const loadSemestersAndSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [sems, scheds] = await Promise.all([
        academicApi.fetchSemesters(workspaceId),
        academicApi.fetchClassSchedules(workspaceId),
      ]);

      setSemesters(sems || []);
      setClassSchedules(scheds || []);

      // Auto-select active semester or first upcoming/ended
      const active =
        (sems || []).find(s => s.status === SEMESTER_STATUS.ACTIVE) || sems?.[0] || null;
      setActiveSemester(active);

      // Auto-select schedule
      if (scheds && scheds.length > 0) {
        const fullSched = await academicApi.fetchClassSchedule(workspaceId, scheds[0].id);
        setSelectedSchedule(fullSched);
      } else {
        setSelectedSchedule(null);
      }
    } catch (err) {
      console.error('Failed to load academic data:', err);
      setError(err.message || 'Failed to load academic data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadSemestersAndSchedules();
  }, [loadSemestersAndSchedules]);

  // 2. Load Calendar Dates when active semester changes
  const loadCalendarDates = useCallback(async () => {
    if (!activeSemester?.id) {
      setCalendarDates([]);
      setExceptions([]);
      return;
    }
    try {
      const [dates, excs] = await Promise.all([
        academicApi.fetchAcademicCalendar(workspaceId, activeSemester.id),
        academicApi.fetchAcademicExceptions(workspaceId, activeSemester.id),
      ]);
      setCalendarDates(dates || []);
      setExceptions(excs || []);
    } catch (err) {
      console.error('Failed to load semester dates:', err);
    }
  }, [workspaceId, activeSemester?.id]);

  useEffect(() => {
    loadCalendarDates();
  }, [loadCalendarDates]);

  // Handle Semester Switch
  async function handleSelectSemester(sem) {
    setActiveSemester(sem);
  }

  // Handle Schedule Switch
  async function handleSelectSchedule(schedId) {
    if (!workspaceId || !schedId) return;
    try {
      const full = await academicApi.fetchClassSchedule(workspaceId, schedId);
      setSelectedSchedule(full);
    } catch (err) {
      setError(err.message || 'Failed to load schedule');
    }
  }

  // Semester Actions
  async function handleSaveSemester(data) {
    if (editingSemester) {
      const updated = await academicApi.updateSemester(workspaceId, editingSemester.id, data);
      setSemesters(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      if (activeSemester?.id === updated.id) setActiveSemester(updated);
    } else {
      const created = await academicApi.createSemester(workspaceId, data);
      setSemesters(prev => [created, ...prev]);
      setActiveSemester(created);
    }
    loadCalendarDates();
  }

  async function handleActivateSemester(semId) {
    try {
      const activated = await academicApi.activateSemester(workspaceId, semId);
      setSemesters(prev =>
        prev.map(s =>
          s.id === activated.id
            ? activated
            : s.id === activeSemester?.id
              ? { ...s, status: SEMESTER_STATUS.ENDED }
              : s,
        ),
      );
      setActiveSemester(activated);
    } catch (err) {
      alert(err.message || 'Failed to activate semester');
    }
  }

  async function handleEndSemester(semId) {
    const result = await academicApi.endSemester(workspaceId, semId);
    setSemesters(prev => prev.map(s => (s.id === semId ? result.semester : s)));
    if (activeSemester?.id === semId) {
      setActiveSemester(result.semester);
    }
    loadCalendarDates();
  }

  // Calendar / Holiday Actions
  async function handleSaveDateRule(dateData) {
    if (!activeSemester) return;
    await academicApi.setAcademicDate(workspaceId, activeSemester.id, dateData);
    loadCalendarDates();
  }

  async function handleRemoveDateRule(dateStr) {
    if (!activeSemester) return;
    await academicApi.removeAcademicDate(workspaceId, activeSemester.id, dateStr);
    loadCalendarDates();
  }

  // Timetable Actions
  async function handleCreateNewSchedule() {
    const name = window.prompt('Enter schedule template name (e.g. B.Tech Core Schedule):');
    if (!name || !name.trim()) return;
    try {
      const created = await academicApi.createClassSchedule(workspaceId, {
        name: name.trim(),
        semesterId: activeSemester?.id || null,
        isActive: true,
      });
      const full = { ...created, entries: [] };
      setClassSchedules(prev => [created, ...prev]);
      setSelectedSchedule(full);
    } catch (err) {
      alert(err.message || 'Failed to create schedule template');
    }
  }

  async function handleSaveScheduleEntry(entryData) {
    if (!selectedSchedule) return;
    if (editingEntry) {
      const updated = await academicApi.updateScheduleEntry(
        workspaceId,
        selectedSchedule.id,
        editingEntry.id,
        entryData,
      );
      setSelectedSchedule(prev => ({
        ...prev,
        entries: prev.entries.map(e => (e.id === updated.id ? updated : e)),
      }));
    } else {
      const created = await academicApi.createScheduleEntry(
        workspaceId,
        selectedSchedule.id,
        entryData,
      );
      setSelectedSchedule(prev => ({
        ...prev,
        entries: [...(prev.entries || []), created],
      }));
    }
  }

  async function handleDeleteScheduleEntry(entryId) {
    if (!window.confirm('Delete this class from timetable template?')) return;
    await academicApi.deleteScheduleEntry(workspaceId, selectedSchedule.id, entryId);
    setSelectedSchedule(prev => ({
      ...prev,
      entries: prev.entries.filter(e => e.id !== entryId),
    }));
  }

  // Generation Trigger
  async function handleGenerateEvents() {
    if (!activeSemester) {
      alert('No active semester selected');
      return;
    }
    if (activeSemester.status === SEMESTER_STATUS.ENDED) {
      alert('Cannot generate events for ended semester');
      return;
    }
    if (!selectedSchedule || !selectedSchedule.entries?.length) {
      alert('Please add classes to your schedule timetable before generating events');
      return;
    }

    try {
      setLoading(true);
      setGenerationResult(null);
      const res = await academicApi.generateAcademicSchedule(workspaceId, activeSemester.id, {
        classScheduleId: selectedSchedule.id,
      });
      setGenerationResult(res);
      loadCalendarDates();
    } catch (err) {
      alert(err.message || 'Failed to generate academic events');
    } finally {
      setLoading(false);
    }
  }

  // Exception Actions (Cancel / Reschedule)
  async function handleSaveException(data) {
    if (!activeSemester) return;
    if (exceptionModalConfig.mode === 'CANCEL') {
      await academicApi.cancelClass(workspaceId, activeSemester.id, data);
    } else {
      await academicApi.rescheduleClass(workspaceId, activeSemester.id, data);
    }
    loadCalendarDates();
  }

  if (loading && !semesters.length) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}
      >
        <LoadingSpinner size="lg" message="Loading Academic Calendar & Day Orders..." />
      </div>
    );
  }

  const dayOrderList = Array.from(
    { length: activeSemester?.dayOrderCount || 5 },
    (_, i) => `DO${i + 1}`,
  );

  return (
    <div
      className="academic-workspace-container"
      data-testid="academic-workspace"
      style={{
        padding: '1.5rem',
        maxWidth: '1440px',
        margin: '0 auto',
        color: 'var(--text-primary, #f1f5f9)',
      }}
    >
      {/* Workspace Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--border-subtle, #232b40)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.6rem',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.1)',
              color: '#6366f1',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <GraduationCap size={28} />
          </div>
          <div>
            <h1
              style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}
            >
              Academic Calendar & Day Order Engine
            </h1>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '0.85rem',
                color: 'var(--text-muted, #94a3b8)',
              }}
            >
              SRM Day Order calendar, holiday sequence shift mechanics, and timetable generation
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Button
            variant="secondary"
            onClick={() => {
              setEditingSemester(null);
              setIsSemesterModalOpen(true);
            }}
            data-testid="create-semester-btn"
          >
            <Plus size={16} style={{ marginRight: '4px' }} /> New Semester
          </Button>

          {activeSemester && activeSemester.status === SEMESTER_STATUS.ACTIVE && (
            <Button
              variant="danger"
              onClick={() => {
                setSemesterToEnd(activeSemester);
                setIsEndSemesterModalOpen(true);
              }}
              data-testid="end-semester-btn"
            >
              <PowerOff size={16} style={{ marginRight: '4px' }} /> End Semester
            </Button>
          )}

          {activeSemester && activeSemester.status === SEMESTER_STATUS.UPCOMING && (
            <Button
              variant="primary"
              onClick={() => handleActivateSemester(activeSemester.id)}
              data-testid="activate-semester-btn"
            >
              <CheckCircle size={16} style={{ marginRight: '4px' }} /> Activate Semester
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
          data-testid="academic-error-banner"
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Active Semester Context Cockpit */}
      {activeSemester ? (
        <div
          style={{
            background: 'var(--bg-surface, #161c2e)',
            border: '1px solid var(--border-subtle, #232b40)',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
          data-testid="active-semester-cockpit"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                  {activeSemester.name}
                </h3>
                <Badge
                  variant={
                    activeSemester.status === SEMESTER_STATUS.ACTIVE
                      ? 'success'
                      : activeSemester.status === SEMESTER_STATUS.ENDED
                        ? 'neutral'
                        : 'warning'
                  }
                  data-testid="semester-status-badge"
                >
                  {activeSemester.status}
                </Badge>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted, #94a3b8)',
                  marginTop: '4px',
                }}
              >
                <span>{activeSemester.institution || 'Academic Institution'}</span>
                <span>•</span>
                <span>{activeSemester.academicYear || 'Academic Year'}</span>
                <span>•</span>
                <span>
                  {activeSemester.startDate} to {activeSemester.endDate}
                </span>
              </div>
            </div>
          </div>

          {/* Semester Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
              Switch Semester:
            </span>
            <select
              value={activeSemester.id}
              onChange={e => {
                const s = semesters.find(x => x.id === e.target.value);
                if (s) handleSelectSemester(s);
              }}
              data-testid="switch-semester-select"
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                background: 'var(--bg-secondary, #101522)',
                border: '1px solid var(--border-subtle, #232b40)',
                color: 'inherit',
                fontSize: '0.85rem',
              }}
            >
              {semesters.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--bg-surface, #161c2e)',
            border: '1px dashed var(--border-subtle, #232b40)',
            borderRadius: '10px',
            padding: '2rem',
            textAlign: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <CalendarIcon
            size={36}
            color="var(--text-muted, #64748b)"
            style={{ margin: '0 auto 0.5rem' }}
          />
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>No Active Semester Configured</h3>
          <p
            style={{
              margin: '0.25rem 0 1rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted, #94a3b8)',
            }}
          >
            Create an academic semester to manage Day Orders, timetables, and automated holiday
            shifting.
          </p>
          <Button variant="primary" onClick={() => setIsSemesterModalOpen(true)}>
            Create Semester
          </Button>
        </div>
      )}

      {generationResult && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            color: '#10b981',
            marginBottom: '1.25rem',
            fontSize: '0.9rem',
          }}
          data-testid="generation-success-message"
        >
          <CheckCircle size={18} />
          <span>
            Generated{' '}
            {generationResult.generatedEventsCount ?? generationResult.generatedCount ?? 0} calendar
            occurrences successfully!
          </span>
        </div>
      )}

      {/* Workspace Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle, #232b40)',
          marginBottom: '1.5rem',
          gap: '0.5rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('CALENDAR')}
          data-testid="tab-calendar"
          style={{
            padding: '0.6rem 1.2rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'CALENDAR' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'CALENDAR' ? '#6366f1' : 'var(--text-muted, #94a3b8)',
            fontWeight: activeTab === 'CALENDAR' ? 600 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <CalendarCheck size={16} /> Day Order Calendar ({calendarDates.length} Days)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TIMETABLE')}
          data-testid="tab-timetable"
          style={{
            padding: '0.6rem 1.2rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'TIMETABLE' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'TIMETABLE' ? '#6366f1' : 'var(--text-muted, #94a3b8)',
            fontWeight: activeTab === 'TIMETABLE' ? 600 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <Clock size={16} /> Timetable & Schedules
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('EXCEPTIONS')}
          data-testid="tab-exceptions"
          style={{
            padding: '0.6rem 1.2rem',
            background: 'transparent',
            border: 'none',
            borderBottom:
              activeTab === 'EXCEPTIONS' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'EXCEPTIONS' ? '#6366f1' : 'var(--text-muted, #94a3b8)',
            fontWeight: activeTab === 'EXCEPTIONS' ? 600 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <Ban size={16} /> Exceptions & Lifecycle ({exceptions.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAY ORDER CALENDAR & DATE TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'CALENDAR' && (
        <div>
          {/* Top Bar for Calendar actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Button
                variant="danger"
                onClick={() => {
                  setSelectedDateItem(null);
                  setIsHolidayModalOpen(true);
                }}
                data-testid="add-holiday-btn"
              >
                <AlertTriangle size={15} style={{ marginRight: '4px' }} /> Add Holiday / Shift DO
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedDateItem({ dayStatus: ACADEMIC_DAY_STATUS.SPECIAL_WORKING_DAY });
                  setIsHolidayModalOpen(true);
                }}
                data-testid="add-special-working-btn"
              >
                <Plus size={15} style={{ marginRight: '4px' }} /> Special Working Day
              </Button>
            </div>

            {generationResult && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                  color: '#10b981',
                }}
                data-testid="generation-success-message"
              >
                <CheckCircle size={16} />
                <span>
                  Generated {generationResult.generatedCount} calendar occurrences successfully!
                </span>
              </div>
            )}
          </div>

          {/* Interactive Date Table (conforming to UX-SPECIFICATION.md Section 29) */}
          <div
            style={{
              background: 'var(--bg-surface, #161c2e)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
            data-testid="academic-calendar-table-container"
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.85rem',
              }}
              data-testid="academic-calendar-table"
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--bg-secondary, #101522)',
                    borderBottom: '1px solid var(--border-subtle, #232b40)',
                  }}
                >
                  <th style={{ padding: '0.75rem 1rem', width: '130px' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', width: '150px' }}>Working Status</th>
                  <th style={{ padding: '0.75rem 1rem', width: '110px' }}>Day Order</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Reason / Notes</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', width: '180px' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {calendarDates.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: '2rem',
                        textAlign: 'center',
                        color: 'var(--text-muted, #94a3b8)',
                      }}
                    >
                      No academic calendar dates available. Create or activate a semester to
                      populate dates.
                    </td>
                  </tr>
                ) : (
                  calendarDates.map((item, index) => {
                    const isHoliday = item.dayStatus === ACADEMIC_DAY_STATUS.HOLIDAY;
                    const isSpecialWorking =
                      item.dayStatus === ACADEMIC_DAY_STATUS.SPECIAL_WORKING_DAY;
                    const isOtherNonWorking =
                      item.dayStatus === ACADEMIC_DAY_STATUS.OTHER_NON_WORKING_DAY;

                    return (
                      <tr
                        key={item.calendarDate}
                        style={{
                          borderBottom: '1px solid var(--border-subtle, #232b40)',
                          background: isHoliday
                            ? 'rgba(239, 68, 68, 0.04)'
                            : isSpecialWorking
                              ? 'rgba(99, 102, 241, 0.05)'
                              : index % 2 === 0
                                ? 'transparent'
                                : 'rgba(255, 255, 255, 0.01)',
                        }}
                        data-testid={`calendar-row-${item.calendarDate}`}
                      >
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                          {item.calendarDate}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Badge
                            variant={
                              isHoliday
                                ? 'danger'
                                : isSpecialWorking
                                  ? 'primary'
                                  : isOtherNonWorking
                                    ? 'neutral'
                                    : 'success'
                            }
                          >
                            {isHoliday
                              ? 'Holiday'
                              : isSpecialWorking
                                ? 'Special Working'
                                : isOtherNonWorking
                                  ? 'Weekend'
                                  : 'Working'}
                          </Badge>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {item.dayOrder ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                background: '#6366f1',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                              }}
                              data-testid={`day-order-badge-${item.calendarDate}`}
                            >
                              {item.dayOrder}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted, #64748b)' }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: '0.75rem 1rem',
                            color: item.reason ? 'inherit' : 'var(--text-muted, #64748b)',
                          }}
                        >
                          {item.reason ||
                            (isOtherNonWorking ? 'Weekend' : 'Regular academic schedule')}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDateItem(item);
                              setIsHolidayModalOpen(true);
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: 'transparent',
                              border: '1px solid var(--border-subtle, #232b40)',
                              color: 'inherit',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              marginRight: '0.25rem',
                            }}
                            data-testid={`edit-date-btn-${item.calendarDate}`}
                          >
                            Edit Rule
                          </button>
                          {(isHoliday || isSpecialWorking) && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDateRule(item.calendarDate)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                background: 'transparent',
                                border: '1px solid var(--accent-danger, #ef4444)',
                                color: '#ef4444',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                              data-testid={`reset-date-btn-${item.calendarDate}`}
                            >
                              Reset
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TIMETABLE & REUSABLE CLASS SCHEDULES */}
      {/* ========================================================================= */}
      {activeTab === 'TIMETABLE' && (
        <div>
          {/* Schedule Selection & Action Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
                Timetable Template:
              </span>
              <select
                value={selectedSchedule?.id || ''}
                onChange={e => handleSelectSchedule(e.target.value)}
                data-testid="schedule-selector"
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #161c2e)',
                  border: '1px solid var(--border-subtle, #232b40)',
                  color: 'inherit',
                  fontSize: '0.85rem',
                  minWidth: '220px',
                }}
              >
                {classSchedules.map(sch => (
                  <option key={sch.id} value={sch.id}>
                    {sch.name}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                onClick={handleCreateNewSchedule}
                data-testid="create-schedule-btn"
              >
                <Plus size={15} style={{ marginRight: '4px' }} /> New Template
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Button
                variant="primary"
                onClick={handleGenerateEvents}
                data-testid="generate-schedule-events-btn"
                disabled={activeSemester?.status === SEMESTER_STATUS.ENDED}
              >
                <Play size={15} style={{ marginRight: '4px' }} /> Generate Calendar Events
              </Button>
            </div>
          </div>

          {/* Reusable Day Order Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${dayOrderList.length}, minmax(180px, 1fr))`,
              gap: '1rem',
              overflowX: 'auto',
              paddingBottom: '1rem',
            }}
            data-testid="timetable-day-order-grid"
          >
            {dayOrderList.map(doKey => {
              const entries = (selectedSchedule?.entries || []).filter(e => e.dayOrder === doKey);

              return (
                <div
                  key={doKey}
                  style={{
                    background: 'var(--bg-surface, #161c2e)',
                    border: '1px solid var(--border-subtle, #232b40)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: '180px',
                  }}
                  data-testid={`do-column-${doKey}`}
                >
                  {/* Column Header */}
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid var(--border-subtle, #232b40)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-secondary, #101522)',
                      borderTopLeftRadius: '8px',
                      borderTopRightRadius: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{doKey}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEntry(null);
                        setTargetDayOrder(doKey);
                        setIsScheduleEntryModalOpen(true);
                      }}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: '#6366f1',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                      data-testid={`add-entry-btn-${doKey}`}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>

                  {/* Classes List */}
                  <div
                    style={{
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      flex: 1,
                    }}
                  >
                    {entries.length === 0 ? (
                      <div
                        style={{
                          padding: '1rem',
                          textAlign: 'center',
                          color: 'var(--text-muted, #64748b)',
                          fontSize: '0.75rem',
                        }}
                      >
                        No classes scheduled
                      </div>
                    ) : (
                      entries.map(entry => (
                        <div
                          key={entry.id}
                          style={{
                            background: 'var(--bg-primary, #0a0d14)',
                            borderLeft: `3px solid ${entry.color || '#6366f1'}`,
                            border: '1px solid var(--border-subtle, #232b40)',
                            borderLeftWidth: '3px',
                            borderRadius: '6px',
                            padding: '0.6rem 0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                          }}
                          data-testid={`schedule-entry-card-${entry.id}`}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                              {entry.courseName}
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteScheduleEntry(entry.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted, #64748b)',
                                  cursor: 'pointer',
                                  padding: '2px',
                                }}
                                title="Delete"
                                data-testid={`delete-entry-btn-${entry.id}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {entry.courseCode && (
                            <span
                              style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}
                            >
                              {entry.courseCode}
                            </span>
                          )}

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              fontSize: '0.75rem',
                              color: '#6366f1',
                              marginTop: '2px',
                            }}
                          >
                            <Clock size={12} />
                            <span>
                              {entry.startTime} - {entry.endTime}
                            </span>
                          </div>

                          {entry.room && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted, #94a3b8)',
                              }}
                            >
                              <MapPin size={12} />
                              <span>{entry.room}</span>
                            </div>
                          )}

                          {entry.instructor && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted, #94a3b8)',
                              }}
                            >
                              <User size={12} />
                              <span>{entry.instructor}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EXCEPTIONS & LIFECYCLE LOG */}
      {/* ========================================================================= */}
      {activeTab === 'EXCEPTIONS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Quick Exceptions Action */}
          <div
            style={{
              background: 'var(--bg-surface, #161c2e)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', fontWeight: 600 }}>
              Class Occurrence Exceptions
            </h3>
            <p
              style={{
                margin: '0 0 1rem 0',
                fontSize: '0.85rem',
                color: 'var(--text-muted, #94a3b8)',
              }}
            >
              Explicitly cancel or reschedule individual class occurrences without mutating reusable
              timetable templates.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Button
                variant="danger"
                onClick={() => {
                  setExceptionModalConfig({
                    mode: 'CANCEL',
                    calendarDate:
                      activeSemester?.startDate || new Date().toISOString().slice(0, 10),
                    scheduleEntry: selectedSchedule?.entries?.[0] || null,
                  });
                  setIsExceptionModalOpen(true);
                }}
                data-testid="open-cancel-class-btn"
                disabled={!selectedSchedule?.entries?.length}
              >
                <Ban size={15} style={{ marginRight: '4px' }} /> Cancel a Class Occurrence
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  setExceptionModalConfig({
                    mode: 'RESCHEDULE',
                    calendarDate:
                      activeSemester?.startDate || new Date().toISOString().slice(0, 10),
                    scheduleEntry: selectedSchedule?.entries?.[0] || null,
                  });
                  setIsExceptionModalOpen(true);
                }}
                data-testid="open-reschedule-class-btn"
                disabled={!selectedSchedule?.entries?.length}
              >
                <CalendarClock size={15} style={{ marginRight: '4px' }} /> Reschedule a Class
                Occurrence
              </Button>
            </div>
          </div>

          {/* Exceptions Table */}
          <div
            style={{
              background: 'var(--bg-surface, #161c2e)',
              border: '1px solid var(--border-subtle, #232b40)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary, #101522)',
                borderBottom: '1px solid var(--border-subtle, #232b40)',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              Recorded Exceptions ({exceptions.length})
            </div>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.85rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle, #232b40)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Original Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Exception Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Details</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: '2rem',
                        textAlign: 'center',
                        color: 'var(--text-muted, #94a3b8)',
                      }}
                    >
                      No class exceptions recorded for this semester. All occurrences follow
                      standard Day Order schedule.
                    </td>
                  </tr>
                ) : (
                  exceptions.map(exc => (
                    <tr
                      key={exc.id}
                      style={{ borderBottom: '1px solid var(--border-subtle, #232b40)' }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                        {exc.calendarDate}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Badge variant={exc.exceptionType === 'CANCELLED' ? 'danger' : 'warning'}>
                          {exc.exceptionType}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {exc.exceptionType === 'RESCHEDULED' ? (
                          <span>
                            Moved to <strong>{exc.rescheduledDate}</strong> at{' '}
                            {exc.rescheduledStartTime} - {exc.rescheduledEndTime}
                            {exc.rescheduledRoom ? ` (${exc.rescheduledRoom})` : ''}
                          </span>
                        ) : (
                          <span>Occurrence cancelled</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted, #94a3b8)' }}>
                        {exc.reason || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <SemesterModal
        isOpen={isSemesterModalOpen}
        onClose={() => setIsSemesterModalOpen(false)}
        semester={editingSemester}
        onSubmit={handleSaveSemester}
      />

      <HolidayModal
        isOpen={isHolidayModalOpen}
        onClose={() => setIsHolidayModalOpen(false)}
        dateItem={selectedDateItem}
        semester={activeSemester}
        onSubmit={handleSaveDateRule}
      />

      <EndSemesterModal
        isOpen={isEndSemesterModalOpen}
        onClose={() => setIsEndSemesterModalOpen(false)}
        semester={semesterToEnd}
        onConfirm={handleEndSemester}
      />

      <ScheduleEntryModal
        isOpen={isScheduleEntryModalOpen}
        onClose={() => setIsScheduleEntryModalOpen(false)}
        entry={editingEntry}
        defaultDayOrder={targetDayOrder}
        dayOrderCount={activeSemester?.dayOrderCount || 5}
        onSubmit={handleSaveScheduleEntry}
      />

      <ClassExceptionModal
        isOpen={isExceptionModalOpen}
        onClose={() => setIsExceptionModalOpen(false)}
        mode={exceptionModalConfig.mode}
        calendarDate={exceptionModalConfig.calendarDate}
        scheduleEntry={exceptionModalConfig.scheduleEntry}
        onSubmit={handleSaveException}
      />
    </div>
  );
}
