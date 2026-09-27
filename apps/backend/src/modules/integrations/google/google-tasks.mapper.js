/**
 * Google Tasks Mapper
 * Conforms to docs/19.INTEGRATION-SPECIFICATION.md Section 22-24,
 * docs/8.SYNC-SPECIFICATION.md Section 59-60, and REQ-GTASK-003, REQ-GTASK-004.
 *
 * Preserves Workaholic-specific richer fields (priority, labels, recurrence,
 * duration, dependencies, assignment) when synchronizing with Google Tasks.
 */

/**
 * Converts a Google Tasks object into Workaholic task attributes.
 *
 * @param {Object} googleTask - Raw Google Task item from Google Tasks API
 * @param {Object} context
 * @param {string} context.workspaceId - Workaholic workspace ID
 * @param {string} [context.projectId] - Workaholic project ID mapped from task list
 * @param {string} [context.userId] - Current user ID
 * @param {string} [context.parentTaskId] - Workaholic parent task UUID
 * @param {Object} [context.existingTask] - Existing Workaholic task if updating
 * @returns {Object} Clean Workaholic task creation/update payload
 */
export function toWorkaholicTask(googleTask, context = {}) {
  const {
    workspaceId,
    projectId = null,
    userId,
    parentTaskId = null,
    existingTask = null,
  } = context;

  // Title: Google tasks have title
  const title = (googleTask.title || '').trim() || 'Untitled Task';

  // Description: Google tasks store notes in .notes
  const description =
    googleTask.notes !== undefined ? googleTask.notes || null : existingTask?.description || null;

  // Status mapping:
  // Google Tasks has only 'completed' and 'needsAction'.
  // Workaholic has 'TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'.
  let status = existingTask?.status || 'TODO';
  let completedAt = existingTask?.completedAt || null;

  if (googleTask.status === 'completed') {
    status = 'COMPLETED';
    completedAt = googleTask.completed
      ? new Date(googleTask.completed).toISOString()
      : existingTask?.completedAt || new Date().toISOString();
  } else if (googleTask.status === 'needsAction') {
    if (existingTask?.status === 'COMPLETED') {
      // Reopened externally
      status = 'TODO';
      completedAt = null;
    } else if (existingTask?.status === 'IN_PROGRESS' || existingTask?.status === 'BLOCKED') {
      // Preserve richer Workaholic in-progress / blocked states
      status = existingTask.status;
    } else {
      status = 'TODO';
    }
  }

  // Due date mapping:
  // Google Tasks due date is RFC 3339 timestamp (date-only: e.g. '2026-09-28T00:00:00.000Z')
  let dueAt = null;
  if (googleTask.due) {
    const parsed = new Date(googleTask.due);
    dueAt = isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return {
    workspaceId,
    projectId: projectId || existingTask?.projectId || null,
    parentTaskId: parentTaskId || existingTask?.parentTaskId || null,
    title,
    description,
    status,
    completedAt,
    dueAt,
    // Preserve richer native Workaholic fields that Google Tasks cannot represent
    priority: existingTask?.priority || 'P3',
    startAt: existingTask?.startAt || null,
    estimatedDuration: existingTask?.estimatedDuration || null,
    assignedTo: existingTask?.assignedTo || null,
    recurrenceRuleId: existingTask?.recurrenceRuleId || null,
    sourceType: 'GOOGLE',
    sourceReference: googleTask.id,
    createdBy: existingTask?.createdBy || userId,
  };
}

/**
 * Converts a native Workaholic task into a Google Tasks payload for creation or update.
 *
 * @param {Object} nativeTask - Workaholic task domain object
 * @param {Object} [context={}]
 * @param {string} [context.parentGoogleTaskId] - Google parent task ID if subtask
 * @returns {Object} Google Tasks API body payload
 */
export function toGoogleTask(nativeTask, _context = {}) {
  const isCompleted = nativeTask.status === 'COMPLETED';

  const payload = {
    title: nativeTask.title || 'Untitled Task',
    notes: nativeTask.description || '',
    status: isCompleted ? 'completed' : 'needsAction',
  };

  if (isCompleted) {
    payload.completed = nativeTask.completedAt
      ? new Date(nativeTask.completedAt).toISOString()
      : new Date().toISOString();
  }

  if (nativeTask.dueAt) {
    const d = new Date(nativeTask.dueAt);
    if (!isNaN(d.getTime())) {
      // Google Tasks due date requires RFC 3339 formatted timestamp
      payload.due = d.toISOString();
    }
  }

  return payload;
}
