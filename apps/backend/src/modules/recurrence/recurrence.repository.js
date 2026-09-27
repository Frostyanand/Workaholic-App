import { pool } from '../../core/db.js';
import { formatRRuleString } from './recurrence.engine.js';

/**
 * Maps raw SQL row to clean RecurrenceRule domain object
 */
export function mapRecurrenceRuleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    frequency: row.frequency,
    interval: row.interval,
    byWeekday: row.by_weekday,
    byMonthDay: row.by_month_day,
    byMonth: row.by_month,
    bySetPos: row.by_set_pos,
    startAt: row.start_at ? new Date(row.start_at).toISOString() : null,
    endAt: row.end_at ? new Date(row.end_at).toISOString() : null,
    occurrenceCount: row.occurrence_count,
    timezone: row.timezone,
    rruleString: row.rrule_string,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Maps raw SQL row to clean RecurrenceException domain object
 */
export function mapRecurrenceExceptionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    recurrenceRuleId: row.recurrence_rule_id,
    occurrenceKey: row.occurrence_key,
    originalStartAt: row.original_start_at ? new Date(row.original_start_at).toISOString() : null,
    exceptionType: row.exception_type,
    overrideTitle: row.override_title,
    overrideDescription: row.override_description,
    overrideStartAt: row.override_start_at ? new Date(row.override_start_at).toISOString() : null,
    overrideEndAt: row.override_end_at ? new Date(row.override_end_at).toISOString() : null,
    overrideIsAllDay: row.override_is_all_day !== null ? Boolean(row.override_is_all_day) : null,
    overrideStatus: row.override_status,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new recurrence rule
 */
export async function createRecurrenceRule(ruleData, client = pool) {
  const {
    workspaceId,
    frequency,
    interval = 1,
    byWeekday = null,
    byMonthDay = null,
    byMonth = null,
    bySetPos = null,
    startAt,
    endAt = null,
    occurrenceCount = null,
    timezone = 'UTC',
  } = ruleData;

  const rruleString =
    ruleData.rruleString ||
    formatRRuleString({
      frequency,
      interval,
      byWeekday,
      byMonthDay,
      byMonth,
      bySetPos,
      occurrenceCount,
      endAt,
    });

  const query = `
    INSERT INTO recurrence_rules (
      workspace_id,
      frequency,
      interval,
      by_weekday,
      by_month_day,
      by_month,
      by_set_pos,
      start_at,
      end_at,
      occurrence_count,
      timezone,
      rrule_string
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;
  `;

  const values = [
    workspaceId,
    frequency,
    interval,
    byWeekday,
    byMonthDay,
    byMonth,
    bySetPos,
    startAt,
    endAt,
    occurrenceCount,
    timezone,
    rruleString,
  ];

  const result = await client.query(query, values);
  return mapRecurrenceRuleRow(result.rows[0]);
}

/**
 * Get a recurrence rule by ID
 */
export async function getRecurrenceRuleById(id, client = pool) {
  const query = `
    SELECT * FROM recurrence_rules
    WHERE id = $1 AND deleted_at IS NULL;
  `;
  const result = await client.query(query, [id]);
  return mapRecurrenceRuleRow(result.rows[0]);
}

/**
 * Update a recurrence rule
 */
export async function updateRecurrenceRule(id, updates, client = pool) {
  const existing = await getRecurrenceRuleById(id, client);
  if (!existing) return null;

  const merged = { ...existing, ...updates };
  const rruleString = formatRRuleString({
    frequency: merged.frequency,
    interval: merged.interval,
    byWeekday: merged.byWeekday,
    byMonthDay: merged.byMonthDay,
    byMonth: merged.byMonth,
    bySetPos: merged.bySetPos,
    occurrenceCount: merged.occurrenceCount,
    endAt: merged.endAt,
  });

  const query = `
    UPDATE recurrence_rules
    SET
      frequency = $2,
      interval = $3,
      by_weekday = $4,
      by_month_day = $5,
      by_month = $6,
      by_set_pos = $7,
      start_at = $8,
      end_at = $9,
      occurrence_count = $10,
      timezone = $11,
      rrule_string = $12,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const values = [
    id,
    merged.frequency,
    merged.interval,
    merged.byWeekday,
    merged.byMonthDay,
    merged.byMonth,
    merged.bySetPos,
    merged.startAt,
    merged.endAt,
    merged.occurrenceCount,
    merged.timezone,
    rruleString,
  ];

  const result = await client.query(query, values);
  return mapRecurrenceRuleRow(result.rows[0]);
}

/**
 * Soft delete a recurrence rule
 */
export async function deleteRecurrenceRule(id, client = pool) {
  const query = `
    UPDATE recurrence_rules
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
  const result = await client.query(query, [id]);
  return mapRecurrenceRuleRow(result.rows[0]);
}

/**
 * Upsert an occurrence exception (guaranteed unique by (recurrence_rule_id, occurrence_key))
 */
export async function upsertRecurrenceException(exceptionData, client = pool) {
  const {
    workspaceId,
    recurrenceRuleId,
    occurrenceKey,
    originalStartAt,
    exceptionType,
    overrideTitle = null,
    overrideDescription = null,
    overrideStartAt = null,
    overrideEndAt = null,
    overrideIsAllDay = null,
    overrideStatus = null,
    completedAt = null,
  } = exceptionData;

  const query = `
    INSERT INTO recurrence_exceptions (
      workspace_id,
      recurrence_rule_id,
      occurrence_key,
      original_start_at,
      exception_type,
      override_title,
      override_description,
      override_start_at,
      override_end_at,
      override_is_all_day,
      override_status,
      completed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (recurrence_rule_id, occurrence_key)
    DO UPDATE SET
      exception_type = EXCLUDED.exception_type,
      override_title = EXCLUDED.override_title,
      override_description = EXCLUDED.override_description,
      override_start_at = EXCLUDED.override_start_at,
      override_end_at = EXCLUDED.override_end_at,
      override_is_all_day = EXCLUDED.override_is_all_day,
      override_status = EXCLUDED.override_status,
      completed_at = EXCLUDED.completed_at,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const values = [
    workspaceId,
    recurrenceRuleId,
    occurrenceKey,
    originalStartAt,
    exceptionType,
    overrideTitle,
    overrideDescription,
    overrideStartAt,
    overrideEndAt,
    overrideIsAllDay,
    overrideStatus,
    completedAt,
  ];

  const result = await client.query(query, values);
  return mapRecurrenceExceptionRow(result.rows[0]);
}

/**
 * Get all exceptions for a recurrence rule
 */
export async function getExceptionsByRuleId(recurrenceRuleId, client = pool) {
  const query = `
    SELECT * FROM recurrence_exceptions
    WHERE recurrence_rule_id = $1
    ORDER BY original_start_at ASC;
  `;
  const result = await client.query(query, [recurrenceRuleId]);
  return result.rows.map(mapRecurrenceExceptionRow);
}

/**
 * Batch get exceptions for multiple recurrence rules
 */
export async function getExceptionsByRuleIds(recurrenceRuleIds, client = pool) {
  if (!recurrenceRuleIds || recurrenceRuleIds.length === 0) return [];

  const query = `
    SELECT * FROM recurrence_exceptions
    WHERE recurrence_rule_id = ANY($1::uuid[])
    ORDER BY original_start_at ASC;
  `;
  const result = await client.query(query, [recurrenceRuleIds]);
  return result.rows.map(mapRecurrenceExceptionRow);
}

/**
 * Get a single exception by rule ID and occurrence key
 */
export async function getException(recurrenceRuleId, occurrenceKey, client = pool) {
  const query = `
    SELECT * FROM recurrence_exceptions
    WHERE recurrence_rule_id = $1 AND occurrence_key = $2;
  `;
  const result = await client.query(query, [recurrenceRuleId, occurrenceKey]);
  return mapRecurrenceExceptionRow(result.rows[0]);
}

/**
 * Delete an exception
 */
export async function deleteException(recurrenceRuleId, occurrenceKey, client = pool) {
  const query = `
    DELETE FROM recurrence_exceptions
    WHERE recurrence_rule_id = $1 AND occurrence_key = $2
    RETURNING *;
  `;
  const result = await client.query(query, [recurrenceRuleId, occurrenceKey]);
  return mapRecurrenceExceptionRow(result.rows[0]);
}
