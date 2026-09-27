import { describe, it, expect, beforeEach } from 'vitest';
import { TasksService } from '../src/modules/tasks/tasks.service.js';
import { TodayService } from '../src/modules/today/today.service.js';
import { NotFoundError } from '../src/core/errors.js';

describe('Phase 10.13 — Task Recurrence Occurrence-State Remediation', () => {
  let mockTasks;
  let mockRules;
  let mockOccurrences;
  let tasksService;

  const WORKSPACE_A = '11111111-1111-1111-1111-111111111111';
  const WORKSPACE_B = '22222222-2222-2222-2222-222222222222';
  const USER_ID = '99999999-9999-9999-9999-999999999999';

  beforeEach(() => {
    mockTasks = [];
    mockRules = [];
    mockOccurrences = [];

    const mockTasksRepo = {
      findTaskById: async (id, workspaceId) => {
        return (
          mockTasks.find(t => t.id === id && t.workspaceId === workspaceId && !t.deletedAt) || null
        );
      },
      updateTask: async (id, workspaceId, updateData) => {
        const t = mockTasks.find(x => x.id === id && x.workspaceId === workspaceId && !x.deletedAt);
        if (!t) return null;
        Object.assign(t, updateData);
        return t;
      },
    };

    const mockRecurrenceRepo = {
      getRecurrenceRuleById: async id => {
        return mockRules.find(r => r.id === id) || null;
      },
    };

    const mockTaskOccurrencesRepo = {
      upsertTaskOccurrence: async data => {
        const idx = mockOccurrences.findIndex(
          o => o.taskId === data.taskId && o.occurrenceKey === data.occurrenceKey,
        );
        const record = {
          id: idx !== -1 ? mockOccurrences[idx].id : `occ_${mockOccurrences.length + 1}`,
          workspaceId: data.workspaceId,
          taskId: data.taskId,
          occurrenceKey: data.occurrenceKey,
          isAllDay: Boolean(data.isAllDay),
          originalDueAt: data.originalDueAt || null,
          originalDueDate: data.originalDueDate || null,
          overrideDueAt:
            data.overrideDueAt || (idx !== -1 ? mockOccurrences[idx].overrideDueAt : null),
          overrideDueDate:
            data.overrideDueDate || (idx !== -1 ? mockOccurrences[idx].overrideDueDate : null),
          status: data.status || 'TODO',
          completedAt: data.completedAt || null,
          createdAt: idx !== -1 ? mockOccurrences[idx].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (idx !== -1) {
          mockOccurrences[idx] = record;
        } else {
          mockOccurrences.push(record);
        }
        return record;
      },
      findTaskOccurrence: async (taskId, occurrenceKey, workspaceId) => {
        return (
          mockOccurrences.find(
            o =>
              o.taskId === taskId &&
              o.occurrenceKey === occurrenceKey &&
              (!workspaceId || o.workspaceId === workspaceId),
          ) || null
        );
      },
      deleteTaskOccurrence: async (taskId, occurrenceKey, workspaceId) => {
        const idx = mockOccurrences.findIndex(
          o =>
            o.taskId === taskId &&
            o.occurrenceKey === occurrenceKey &&
            (!workspaceId || o.workspaceId === workspaceId),
        );
        if (idx !== -1) {
          mockOccurrences.splice(idx, 1);
          return true;
        }
        return false;
      },
      findOccurrencesByTaskId: async (taskId, workspaceId) => {
        return mockOccurrences.filter(
          o => o.taskId === taskId && (!workspaceId || o.workspaceId === workspaceId),
        );
      },
      findOccurrencesByTaskIds: async (taskIds, workspaceId) => {
        return mockOccurrences.filter(
          o => taskIds.includes(o.taskId) && (!workspaceId || o.workspaceId === workspaceId),
        );
      },
      findCompletedOccurrencesByRange: async (workspaceId, startIso, endIso) => {
        return mockOccurrences
          .filter(
            o =>
              o.workspaceId === workspaceId &&
              o.status === 'COMPLETED' &&
              o.completedAt >= startIso &&
              o.completedAt <= endIso,
          )
          .map(o => {
            const task = mockTasks.find(t => t.id === o.taskId);
            return {
              ...o,
              taskTitle: task?.title,
              taskDescription: task?.description,
              taskPriority: task?.priority,
              taskProjectId: task?.projectId,
              taskBoardId: task?.boardId,
              taskBoardColumnId: task?.boardColumnId,
              subtaskCount: 0,
            };
          });
      },
      countAccountedOccurrencesForTask: async (taskId, workspaceId) => {
        const rows = mockOccurrences.filter(
          o =>
            o.taskId === taskId &&
            (!workspaceId || o.workspaceId === workspaceId) &&
            (o.status === 'COMPLETED' || o.status === 'CANCELLED'),
        );
        const completedCount = rows.filter(r => r.status === 'COMPLETED').length;
        const cancelledCount = rows.filter(r => r.status === 'CANCELLED').length;
        return {
          completedCount,
          cancelledCount,
          accountedCount: completedCount + cancelledCount,
        };
      },
    };

    tasksService = new TasksService(
      mockTasksRepo,
      null, // labels
      null, // dependencies
      null, // links
      null, // workBlocks
      null, // projects
      null, // boards
      null, // columns
      mockTaskOccurrencesRepo,
      mockRecurrenceRepo,
    );
  });

  // Helper to seed a recurring task
  function seedRecurringTask(options = {}) {
    const taskId = options.taskId || `task_${mockTasks.length + 1}`;
    const ruleId = options.ruleId || `rule_${mockRules.length + 1}`;

    const rule = {
      id: ruleId,
      workspaceId: options.workspaceId || WORKSPACE_A,
      frequency: options.frequency || 'DAILY',
      interval: options.interval || 1,
      byWeekday: options.byWeekday || null,
      byMonthDay: options.byMonthDay || null,
      byMonth: options.byMonth || null,
      bySetPos: options.bySetPos || null,
      startAt: options.startAt || '2026-06-01T09:00:00.000Z',
      endAt: options.endAt || null,
      occurrenceCount: options.occurrenceCount || null,
      timezone: options.timezone || 'UTC',
      deletedAt: null,
    };
    mockRules.push(rule);

    const task = {
      id: taskId,
      workspaceId: options.workspaceId || WORKSPACE_A,
      title: options.title || 'Recurring Test Task',
      description: null,
      status: 'TODO',
      priority: options.priority || 'P2',
      startAt: options.startAt || '2026-06-01T09:00:00.000Z',
      dueAt: options.dueAt || '2026-06-01T09:00:00.000Z',
      recurrenceRuleId: ruleId,
      completedAt: null,
      deletedAt: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    mockTasks.push(task);

    return { task, rule };
  }

  // 1. BR-TASK-008: Historical due-date preservation
  it('preserves master task due_at when completing an occurrence (BR-TASK-008)', async () => {
    const { task } = seedRecurringTask({
      dueAt: '2026-06-01T09:00:00.000Z',
    });

    const res = await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
    );

    expect(res.success).toBe(true);
    expect(res.status).toBe('COMPLETED');
    expect(res.occurrenceKey).toBe('2026-06-01T09:00:00.000Z');

    // CRITICAL: Master task due_at must NOT be mutated!
    const master = mockTasks.find(t => t.id === task.id);
    expect(master.dueAt).toBe('2026-06-01T09:00:00.000Z');
    expect(master.status).toBe('TODO'); // Infinite series remains TODO
    expect(master.completedAt).toBeNull();
  });

  // 2. Out-of-order completion
  it('supports out-of-order occurrence completion without orphaning earlier occurrences', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      dueAt: '2026-06-01T09:00:00.000Z',
    });

    // Complete occurrence 3 (June 3) first, before occurrence 1 or 2
    const res = await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-03T09:00:00.000Z',
    );
    expect(res.success).toBe(true);

    // Expand occurrences for June 1 to June 4
    const expanded = await tasksService.getTaskOccurrences(
      WORKSPACE_A,
      task.id,
      '2026-06-01T00:00:00.000Z',
      '2026-06-04T00:00:00.000Z',
    );

    expect(expanded).toHaveLength(3); // June 1, June 2, June 3
    // June 1 and 2 are still TODO (not orphaned)
    expect(expanded[0].occurrenceKey).toBe('2026-06-01T09:00:00.000Z');
    expect(expanded[0].status).toBe('TODO');

    expect(expanded[1].occurrenceKey).toBe('2026-06-02T09:00:00.000Z');
    expect(expanded[1].status).toBe('TODO');

    // June 3 is COMPLETED
    expect(expanded[2].occurrenceKey).toBe('2026-06-03T09:00:00.000Z');
    expect(expanded[2].status).toBe('COMPLETED');
  });

  // 3. Arbitrary occurrence reopening
  it('reopens an individual occurrence without mutating master task due_at', async () => {
    const { task } = seedRecurringTask({
      dueAt: '2026-06-01T09:00:00.000Z',
    });

    // Complete June 2
    await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-02T09:00:00.000Z',
    );
    expect(mockOccurrences).toHaveLength(1);

    // Reopen June 2
    const reopenRes = await tasksService.reopenOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-02T09:00:00.000Z',
    );
    expect(reopenRes.success).toBe(true);
    expect(reopenRes.status).toBe('TODO');

    // Sparse representation: non-rescheduled row is deleted (reverting to implicit dynamic TODO)
    expect(mockOccurrences).toHaveLength(0);

    // Master task due_at is completely untouched
    const master = mockTasks.find(t => t.id === task.id);
    expect(master.dueAt).toBe('2026-06-01T09:00:00.000Z');
  });

  // 4. Reschedule then complete
  it('preserves canonical occurrenceKey and reschedule override when completed', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      dueAt: '2026-06-01T09:00:00.000Z',
    });

    // Reschedule June 1 occurrence to June 5 14:00
    const resched = await tasksService.rescheduleOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
      { overrideDueAt: '2026-06-05T14:00:00.000Z' },
    );
    expect(resched.success).toBe(true);
    expect(resched.occurrenceKey).toBe('2026-06-01T09:00:00.000Z'); // Canonical identity preserved!
    expect(resched.effectiveDueAt).toBe('2026-06-05T14:00:00.000Z');

    // Complete the rescheduled occurrence
    const comp = await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
    );
    expect(comp.success).toBe(true);
    expect(comp.status).toBe('COMPLETED');
    expect(comp.occurrenceKey).toBe('2026-06-01T09:00:00.000Z');
    expect(comp.effectiveDueAt).toBe('2026-06-05T14:00:00.000Z'); // Override preserved!

    // Verify stored record
    const stored = mockOccurrences.find(o => o.occurrenceKey === '2026-06-01T09:00:00.000Z');
    expect(stored.status).toBe('COMPLETED');
    expect(stored.overrideDueAt).toBe('2026-06-05T14:00:00.000Z');
  });

  // 5. Reschedule then reopen
  it('preserves reschedule override when a rescheduled occurrence is reopened', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
    });

    // Reschedule June 1 to June 5
    await tasksService.rescheduleOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
      { overrideDueAt: '2026-06-05T14:00:00.000Z' },
    );

    // Complete June 1
    await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
    );

    // Reopen June 1
    await tasksService.reopenOccurrence(WORKSPACE_A, USER_ID, task.id, '2026-06-01T09:00:00.000Z');

    // Row must NOT be deleted because it has a reschedule override!
    const stored = mockOccurrences.find(o => o.occurrenceKey === '2026-06-01T09:00:00.000Z');
    expect(stored).toBeTruthy();
    expect(stored.status).toBe('TODO');
    expect(stored.completedAt).toBeNull();
    expect(stored.overrideDueAt).toBe('2026-06-05T14:00:00.000Z');
  });

  // 6. COUNT out-of-order completion
  it('does NOT complete a COUNT-bounded series when the final occurrence is completed out of order', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      occurrenceCount: 3, // Series of 3 occurrences: June 1, 2, 3
    });

    // Complete occurrence 3 (June 3) out of order
    const res = await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-03T09:00:00.000Z',
    );

    expect(res.seriesCompleted).toBe(false);
    const master = mockTasks.find(t => t.id === task.id);
    expect(master.status).toBe('TODO'); // Must NOT prematurely complete series!
    expect(master.completedAt).toBeNull();
  });

  // 7. COUNT mixed COMPLETED/CANCELLED completion
  it('completes COUNT-bounded series when all occurrences are accounted for (COMPLETED + CANCELLED)', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      occurrenceCount: 3,
    });

    // Occurrence 1: COMPLETED
    await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
    );
    expect(mockTasks.find(t => t.id === task.id).status).toBe('TODO');

    // Occurrence 2: CANCELLED
    await tasksService.cancelOccurrence(WORKSPACE_A, USER_ID, task.id, '2026-06-02T09:00:00.000Z');
    expect(mockTasks.find(t => t.id === task.id).status).toBe('TODO');

    // Occurrence 3: COMPLETED -> Now 2 completed + 1 cancelled = 3 accounted!
    const finalRes = await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-03T09:00:00.000Z',
    );

    expect(finalRes.seriesCompleted).toBe(true);
    const master = mockTasks.find(t => t.id === task.id);
    expect(master.status).toBe('COMPLETED');
    expect(master.completedAt).toBeTruthy();
  });

  // 8. UNTIL completion
  it('completes UNTIL-bounded series only when all occurrences through endAt are accounted for', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      endAt: '2026-06-03T09:00:00.000Z', // 3 occurrences: June 1, 2, 3
    });

    // Complete June 1
    const res1 = await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
    );
    expect(res1.seriesCompleted).toBe(false);

    // Cancel June 2
    const res2 = await tasksService.cancelOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-02T09:00:00.000Z',
    );
    expect(res2.seriesCompleted).toBe(false);

    // Complete June 3
    const res3 = await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-03T09:00:00.000Z',
    );
    expect(res3.seriesCompleted).toBe(true);

    const master = mockTasks.find(t => t.id === task.id);
    expect(master.status).toBe('COMPLETED');
  });

  // 9. Infinite recurrence
  it('never automatically transitions an infinite recurring series to COMPLETED', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      occurrenceCount: null,
      endAt: null,
    });

    for (let day = 1; day <= 10; day++) {
      const occKey = `2026-06-${String(day).padStart(2, '0')}T09:00:00.000Z`;
      const res = await tasksService.completeOccurrence(WORKSPACE_A, USER_ID, task.id, occKey);
      expect(res.seriesCompleted).toBe(false);
    }

    const master = mockTasks.find(t => t.id === task.id);
    expect(master.status).toBe('TODO');
    expect(master.completedAt).toBeNull();
  });

  // 10. Occurrence cancellation
  it('cancels an occurrence and preserves master task due_at', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      dueAt: '2026-06-01T09:00:00.000Z',
    });

    const res = await tasksService.cancelOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
    );

    expect(res.success).toBe(true);
    expect(res.status).toBe('CANCELLED');

    const stored = mockOccurrences.find(o => o.occurrenceKey === '2026-06-01T09:00:00.000Z');
    expect(stored.status).toBe('CANCELLED');

    const master = mockTasks.find(t => t.id === task.id);
    expect(master.dueAt).toBe('2026-06-01T09:00:00.000Z');
    expect(master.status).toBe('TODO');
  });

  // 11. All-day occurrence semantics
  it('preserves all-day YYYY-MM-DD date semantics without UTC midnight distortion', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-07-01',
      dueAt: '2026-07-01',
    });

    // All-day occurrenceKey: '2026-07-01' (no 'T')
    const res = await tasksService.completeOccurrence(WORKSPACE_A, USER_ID, task.id, '2026-07-01');

    expect(res.isAllDay).toBe(true);
    expect(res.originalDueDate).toBe('2026-07-01');
    expect(res.originalDueAt).toBeNull();

    // Reschedule all-day occurrence
    const resched = await tasksService.rescheduleOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-07-01',
      { overrideDueDate: '2026-07-04' },
    );

    expect(resched.isAllDay).toBe(true);
    expect(resched.effectiveDueDate).toBe('2026-07-04');
    expect(resched.effectiveDueAt).toBeNull();

    const stored = mockOccurrences.find(o => o.occurrenceKey === '2026-07-01');
    expect(stored.isAllDay).toBe(true);
    expect(stored.originalDueDate).toBe('2026-07-01');
    expect(stored.overrideDueDate).toBe('2026-07-04');
    expect(stored.originalDueAt).toBeNull();
    expect(stored.overrideDueAt).toBeNull();
  });

  // 12. Idempotency / repeated completion
  it('is idempotent on repeated completion calls without duplicate records', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
    });

    const occKey = '2026-06-01T09:00:00.000Z';

    const res1 = await tasksService.completeOccurrence(WORKSPACE_A, USER_ID, task.id, occKey);
    expect(res1.status).toBe('COMPLETED');

    const res2 = await tasksService.completeOccurrence(WORKSPACE_A, USER_ID, task.id, occKey);
    expect(res2.status).toBe('COMPLETED');

    const matching = mockOccurrences.filter(
      o => o.taskId === task.id && o.occurrenceKey === occKey,
    );
    expect(matching).toHaveLength(1); // Exactly one record, no duplicates!
  });

  // 13. Concurrent completion
  it('handles concurrent completion calls deterministically without duplicate rows', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
    });

    const occKey = '2026-06-01T09:00:00.000Z';

    const [r1, r2, r3] = await Promise.all([
      tasksService.completeOccurrence(WORKSPACE_A, USER_ID, task.id, occKey),
      tasksService.completeOccurrence(WORKSPACE_A, USER_ID, task.id, occKey),
      tasksService.completeOccurrence(WORKSPACE_A, USER_ID, task.id, occKey),
    ]);

    expect(r1.status).toBe('COMPLETED');
    expect(r2.status).toBe('COMPLETED');
    expect(r3.status).toBe('COMPLETED');

    const matching = mockOccurrences.filter(
      o => o.taskId === task.id && o.occurrenceKey === occKey,
    );
    expect(matching).toHaveLength(1);
  });

  // 14. Tenant isolation / IDOR protection
  it('enforces workspace isolation on occurrence operations (IDOR prevention)', async () => {
    const { task } = seedRecurringTask({
      workspaceId: WORKSPACE_A,
      startAt: '2026-06-01T09:00:00.000Z',
    });

    const occKey = '2026-06-01T09:00:00.000Z';

    // Attempting to complete with WORKSPACE_B must throw NotFoundError
    await expect(
      tasksService.completeOccurrence(WORKSPACE_B, USER_ID, task.id, occKey),
    ).rejects.toThrow(NotFoundError);

    // Attempting to reopen with WORKSPACE_B must throw NotFoundError
    await expect(
      tasksService.reopenOccurrence(WORKSPACE_B, USER_ID, task.id, occKey),
    ).rejects.toThrow(NotFoundError);

    // Attempting to cancel with WORKSPACE_B must throw NotFoundError
    await expect(
      tasksService.cancelOccurrence(WORKSPACE_B, USER_ID, task.id, occKey),
    ).rejects.toThrow(NotFoundError);

    // Attempting to reschedule with WORKSPACE_B must throw NotFoundError
    await expect(
      tasksService.rescheduleOccurrence(WORKSPACE_B, USER_ID, task.id, occKey, {
        overrideDueAt: '2026-06-05T09:00:00.000Z',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  // 15. Reopening completed bounded series restores series to TODO
  it('restores master task series status to TODO when an occurrence of a completed bounded series is reopened', async () => {
    const { task } = seedRecurringTask({
      startAt: '2026-06-01T09:00:00.000Z',
      occurrenceCount: 2,
    });

    // Complete occurrence 1 and 2 -> completes series
    await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-01T09:00:00.000Z',
    );
    await tasksService.completeOccurrence(
      WORKSPACE_A,
      USER_ID,
      task.id,
      '2026-06-02T09:00:00.000Z',
    );

    expect(mockTasks.find(t => t.id === task.id).status).toBe('COMPLETED');

    // Reopen occurrence 1
    await tasksService.reopenOccurrence(WORKSPACE_A, USER_ID, task.id, '2026-06-01T09:00:00.000Z');

    const master = mockTasks.find(t => t.id === task.id);
    expect(master.status).toBe('TODO'); // Reverted to TODO!
    expect(master.completedAt).toBeNull();
  });

  // 16. Today Cockpit Integration for Recurring Occurrences
  describe('Today Cockpit Recurring Occurrences Projection', () => {
    it('projects due today, overdue, and completed today recurring occurrences correctly with rescheduling', async () => {
      const targetDate = '2026-09-10';
      const dayStartUtc = '2026-09-10T00:00:00.000Z';
      const dayEndUtc = '2026-09-10T23:59:59.999Z';
      const asOf = new Date('2026-09-10T12:00:00.000Z');

      // Task 1: Daily standup (starts Sept 8, due 09:00 UTC) -> Sept 8 & 9 are overdue, Sept 10 is due today
      const task1Id = 't_rec_1';
      const rule1 = {
        rule_id: 'r_1',
        frequency: 'DAILY',
        interval: 1,
        start_at: '2026-09-08T09:00:00.000Z',
        timezone: 'UTC',
      };
      const rTask1 = {
        ...rule1,
        id: task1Id,
        workspace_id: WORKSPACE_A,
        title: 'Daily Standup',
        priority: 'P1',
        status: 'TODO',
        recurrence_rule_id: 'r_1',
      };

      // Task 2: Task originally scheduled Sept 9 (yesterday), rescheduled to Sept 10 (today)
      const task2Id = 't_rec_2';
      const rule2 = {
        rule_id: 'r_2',
        frequency: 'DAILY',
        interval: 1,
        start_at: '2026-09-09T10:00:00.000Z',
        timezone: 'UTC',
      };
      const rTask2 = {
        ...rule2,
        id: task2Id,
        workspace_id: WORKSPACE_A,
        title: 'Rescheduled Task Yesterday to Today',
        priority: 'P2',
        status: 'TODO',
        recurrence_rule_id: 'r_2',
      };

      // Task 3: Task originally scheduled Sept 10 (today), rescheduled to Sept 15 (future)
      const task3Id = 't_rec_3';
      const rule3 = {
        rule_id: 'r_3',
        frequency: 'DAILY',
        interval: 1,
        start_at: '2026-09-10T15:00:00.000Z',
        timezone: 'UTC',
      };
      const rTask3 = {
        ...rule3,
        id: task3Id,
        workspace_id: WORKSPACE_A,
        title: 'Rescheduled Task Today to Next Week',
        priority: 'P3',
        status: 'TODO',
        recurrence_rule_id: 'r_3',
      };

      // Task occurrences overrides:
      // - Task 1: Sept 8 completed today (Sept 10 at 08:00)
      // - Task 2: Sept 9 rescheduled to Sept 10 at 14:00
      // - Task 3: Sept 10 rescheduled to Sept 15 at 15:00
      const overrides = [
        {
          id: 'o_1',
          workspaceId: WORKSPACE_A,
          taskId: task1Id,
          occurrenceKey: '2026-09-08T09:00:00.000Z',
          isAllDay: false,
          originalDueAt: '2026-09-08T09:00:00.000Z',
          status: 'COMPLETED',
          completedAt: '2026-09-10T08:00:00.000Z', // Completed today!
          taskTitle: 'Daily Standup',
          taskPriority: 'P1',
        },
        {
          id: 'o_2',
          workspaceId: WORKSPACE_A,
          taskId: task2Id,
          occurrenceKey: '2026-09-09T10:00:00.000Z',
          isAllDay: false,
          originalDueAt: '2026-09-09T10:00:00.000Z',
          overrideDueAt: '2026-09-10T14:00:00.000Z', // Rescheduled to TODAY
          status: 'TODO',
          completedAt: null,
        },
        {
          id: 'o_3',
          workspaceId: WORKSPACE_A,
          taskId: task3Id,
          occurrenceKey: '2026-09-10T15:00:00.000Z',
          isAllDay: false,
          originalDueAt: '2026-09-10T15:00:00.000Z',
          overrideDueAt: '2026-09-15T15:00:00.000Z', // Rescheduled to FUTURE
          status: 'TODO',
          completedAt: null,
        },
      ];

      const mockOccurrencesRepo = {
        findOccurrencesByTaskIds: async () => overrides,
        findCompletedOccurrencesByRange: async (wsId, s, e) =>
          overrides.filter(
            o => o.status === 'COMPLETED' && o.completedAt >= s && o.completedAt <= e,
          ),
      };

      const mockClient = {
        query: async sql => {
          if (sql.includes('day_start_utc')) {
            return {
              rows: [{ day_start_utc: dayStartUtc, day_end_utc: dayEndUtc }],
            };
          }
          if (sql.includes('FROM tasks t') && sql.includes('JOIN recurrence_rules r')) {
            return {
              rows: [rTask1, rTask2, rTask3],
            };
          }
          return { rows: [] };
        },
      };

      const service = new TodayService({
        eventsRepo: { findEventsByRange: async () => [] },
        taskOccurrencesRepo: mockOccurrencesRepo,
      });

      const cockpit = await service.getTodayCockpit(
        WORKSPACE_A,
        { asOf, date: targetDate, timezone: 'UTC' },
        mockClient,
      );

      // Verify dueToday:
      // - Task 1 Sept 10 is due today
      // - Task 2 Sept 9 (rescheduled to Sept 10) is due today
      // - Task 3 Sept 10 is NOT due today (rescheduled to Sept 15)
      const dueTodayKeys = cockpit.dueToday.map(t => `${t.taskId}:${t.occurrenceKey}`);
      expect(dueTodayKeys).toContain(`${task1Id}:2026-09-10T09:00:00.000Z`);
      expect(dueTodayKeys).toContain(`${task2Id}:2026-09-09T10:00:00.000Z`);
      expect(dueTodayKeys).not.toContain(`${task3Id}:2026-09-10T15:00:00.000Z`);

      // Verify overdue:
      // - Task 1 Sept 9 is overdue
      // - Task 1 Sept 8 is NOT overdue (because it was COMPLETED)
      // - Task 2 Sept 9 is NOT overdue (because it was rescheduled to Sept 10)
      const overdueKeys = cockpit.overdue.map(t => `${t.taskId}:${t.occurrenceKey}`);
      expect(overdueKeys).toContain(`${task1Id}:2026-09-09T09:00:00.000Z`);
      expect(overdueKeys).not.toContain(`${task1Id}:2026-09-08T09:00:00.000Z`);
      expect(overdueKeys).not.toContain(`${task2Id}:2026-09-09T10:00:00.000Z`);

      // Verify completedToday:
      // - Task 1 Sept 8 occurrence completed today
      const completedTodayKeys = cockpit.completedToday.map(t => `${t.taskId}:${t.occurrenceKey}`);
      expect(completedTodayKeys).toContain(`${task1Id}:2026-09-08T09:00:00.000Z`);
    });
  });
});
