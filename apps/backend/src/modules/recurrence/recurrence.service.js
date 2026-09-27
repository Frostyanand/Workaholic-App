import { withTransaction } from '../../core/db.js';
import * as recurrenceRepo from './recurrence.repository.js';
import { ERROR_CODE, RECURRENCE_EXCEPTION_TYPE } from '@workaholic/shared';

/**
 * Service error helper
 */
function createServiceError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = status;
  return err;
}

/**
 * Create a new recurrence rule with workspace validation
 */
export async function createRule(workspaceId, ruleData, client) {
  if (!workspaceId) {
    throw createServiceError(ERROR_CODE.VALIDATION_ERROR, 'workspaceId is required', 400);
  }
  if (!ruleData || !ruleData.frequency || !ruleData.startAt) {
    throw createServiceError(
      ERROR_CODE.VALIDATION_ERROR,
      'frequency and startAt are required',
      400,
    );
  }

  return recurrenceRepo.createRecurrenceRule(
    {
      ...ruleData,
      workspaceId,
    },
    client,
  );
}

/**
 * Get recurrence rule by ID with workspace isolation
 */
export async function getRule(workspaceId, ruleId, client) {
  const rule = await recurrenceRepo.getRecurrenceRuleById(ruleId, client);
  if (!rule || rule.workspaceId !== workspaceId) {
    throw createServiceError(ERROR_CODE.NOT_FOUND, 'Recurrence rule not found', 404);
  }
  return rule;
}

/**
 * Update entire recurrence rule (SERIES edit)
 */
export async function updateRule(workspaceId, ruleId, updates, client) {
  await getRule(workspaceId, ruleId, client);
  return recurrenceRepo.updateRecurrenceRule(ruleId, updates, client);
}

/**
 * Soft delete recurrence rule
 */
export async function deleteRule(workspaceId, ruleId, client) {
  await getRule(workspaceId, ruleId, client);
  return recurrenceRepo.deleteRecurrenceRule(ruleId, client);
}

/**
 * Add or update an occurrence exception (THIS occurrence edit/cancel/complete)
 */
export async function addException(
  workspaceId,
  recurrenceRuleId,
  occurrenceKey,
  exceptionData,
  client,
) {
  const rule = await getRule(workspaceId, recurrenceRuleId, client);
  if (!rule) {
    throw createServiceError(ERROR_CODE.NOT_FOUND, 'Recurrence rule not found', 404);
  }

  const originalStartAt =
    exceptionData.originalStartAt ||
    (occurrenceKey.includes('T') ? occurrenceKey : `${occurrenceKey}T00:00:00.000Z`);

  return recurrenceRepo.upsertRecurrenceException(
    {
      workspaceId,
      recurrenceRuleId,
      occurrenceKey,
      originalStartAt,
      exceptionType: exceptionData.exceptionType || RECURRENCE_EXCEPTION_TYPE.MODIFIED,
      overrideTitle: exceptionData.overrideTitle ?? null,
      overrideDescription: exceptionData.overrideDescription ?? null,
      overrideStartAt: exceptionData.overrideStartAt ?? null,
      overrideEndAt: exceptionData.overrideEndAt ?? null,
      overrideIsAllDay: exceptionData.overrideIsAllDay ?? null,
      overrideStatus: exceptionData.overrideStatus ?? null,
      completedAt: exceptionData.completedAt ?? null,
    },
    client,
  );
}

/**
 * Get all exceptions for a recurrence rule
 */
export async function getExceptions(workspaceId, recurrenceRuleId, client) {
  await getRule(workspaceId, recurrenceRuleId, client);
  return recurrenceRepo.getExceptionsByRuleId(recurrenceRuleId, client);
}

/**
 * Split a recurrence series at a specific occurrence (THIS_AND_FOLLOWING edit).
 * Atomically:
 * 1. Truncates original series: sets old series endAt to 1 second before the occurrence.
 * 2. Creates new series starting at the occurrence with updated rule configurations.
 * 3. Re-links any future exceptions >= occurrenceKey to the new rule.
 */
export async function splitSeries(
  workspaceId,
  recurrenceRuleId,
  occurrenceKey,
  newRuleData = {},
  client,
) {
  const execute = async tx => {
    const oldRule = await getRule(workspaceId, recurrenceRuleId, tx);

    const splitStartAt =
      newRuleData.startAt ||
      (occurrenceKey.includes('T') ? occurrenceKey : `${occurrenceKey}T00:00:00.000Z`);
    const splitStartMs = new Date(splitStartAt).getTime();

    // 1. Truncate previous rule end_at to 1 second before splitStartAt
    const oldSeriesEndAt = new Date(splitStartMs - 1000).toISOString();
    const updatedOldRule = await recurrenceRepo.updateRecurrenceRule(
      recurrenceRuleId,
      { endAt: oldSeriesEndAt },
      tx,
    );

    // 2. Create new recurrence rule starting from split point
    const mergedRuleData = {
      workspaceId,
      frequency: newRuleData.frequency || oldRule.frequency,
      interval: newRuleData.interval || oldRule.interval,
      byWeekday: newRuleData.byWeekday !== undefined ? newRuleData.byWeekday : oldRule.byWeekday,
      byMonthDay:
        newRuleData.byMonthDay !== undefined ? newRuleData.byMonthDay : oldRule.byMonthDay,
      byMonth: newRuleData.byMonth !== undefined ? newRuleData.byMonth : oldRule.byMonth,
      bySetPos: newRuleData.bySetPos !== undefined ? newRuleData.bySetPos : oldRule.bySetPos,
      startAt: splitStartAt,
      endAt: newRuleData.endAt !== undefined ? newRuleData.endAt : oldRule.endAt,
      occurrenceCount:
        newRuleData.occurrenceCount !== undefined ? newRuleData.occurrenceCount : null,
      timezone: newRuleData.timezone || oldRule.timezone,
    };

    const newRule = await recurrenceRepo.createRecurrenceRule(mergedRuleData, tx);

    // 3. Migrate any existing exceptions on oldRule that occur at or after splitStartAt
    const oldExceptions = await recurrenceRepo.getExceptionsByRuleId(recurrenceRuleId, tx);
    for (const ex of oldExceptions) {
      const exMs = new Date(ex.originalStartAt).getTime();
      if (exMs >= splitStartMs) {
        // Move exception to new rule
        await recurrenceRepo.deleteException(recurrenceRuleId, ex.occurrenceKey, tx);
        await recurrenceRepo.upsertRecurrenceException(
          {
            ...ex,
            recurrenceRuleId: newRule.id,
          },
          tx,
        );
      }
    }

    return {
      oldRule: updatedOldRule,
      newRule,
    };
  };

  if (client) {
    return execute(client);
  }
  return withTransaction(execute);
}
