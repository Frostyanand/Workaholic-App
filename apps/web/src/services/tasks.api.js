/**
 * Web Client API Service for Task Management (Phase 5)
 * Conforms to docs/15.API-SPECIFICATION.md
 */

const API_BASE = '/api/v1';

async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'API request failed');
    error.status = response.status;
    error.code = payload?.error?.code;
    error.fields = payload?.error?.fields;
    throw error;
  }

  return payload;
}

export async function fetchTasks(workspaceId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'ALL') params.append('status', filters.status);
  if (filters.priority && filters.priority !== 'ALL') params.append('priority', filters.priority);
  if (filters.overdue) params.append('overdue', 'true');
  if (filters.search) params.append('search', filters.search);
  if (filters.sort) params.append('sort', filters.sort);
  if (filters.order) params.append('order', filters.order);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks${qs}`, { headers });
  return res.data || [];
}

export async function fetchTaskById(taskId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}`, { headers });
  return res.data;
}

export async function createTask(workspaceId, taskData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(taskData),
  });
  return res.data;
}

export async function updateTask(taskId, workspaceId, updateData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updateData),
  });
  return res.data;
}

export async function completeTask(taskId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/complete`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

export async function reopenTask(taskId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/reopen`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

export async function deleteTask(taskId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function restoreTask(taskId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/restore`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

export async function createSubtask(taskId, workspaceId, subtaskData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/subtasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(subtaskData),
  });
  return res.data;
}

export async function fetchLabels(workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/labels`, { headers });
  return res.data || [];
}

export async function createLabel(workspaceId, labelData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/labels`, {
    method: 'POST',
    headers,
    body: JSON.stringify(labelData),
  });
  return res.data;
}

export async function assignLabel(taskId, workspaceId, labelId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/labels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ labelId }),
  });
  return res.data;
}

export async function removeLabel(taskId, workspaceId, labelId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/labels/${labelId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function createWorkBlock(taskId, workspaceId, blockData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/work-blocks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(blockData),
  });
  return res.data;
}

export async function deleteWorkBlock(taskId, workspaceId, blockId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tasks/${taskId}/work-blocks/${blockId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function completeTaskOccurrence(taskId, occurrenceKey, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(
    `${API_BASE}/tasks/${taskId}/occurrences/${encodeURIComponent(occurrenceKey)}/complete`,
    {
      method: 'POST',
      headers,
    },
  );
  return res.data;
}

export async function reopenTaskOccurrence(taskId, occurrenceKey, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(
    `${API_BASE}/tasks/${taskId}/occurrences/${encodeURIComponent(occurrenceKey)}/reopen`,
    {
      method: 'POST',
      headers,
    },
  );
  return res.data;
}

export async function cancelTaskOccurrence(taskId, occurrenceKey, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(
    `${API_BASE}/tasks/${taskId}/occurrences/${encodeURIComponent(occurrenceKey)}/cancel`,
    {
      method: 'POST',
      headers,
    },
  );
  return res.data;
}

export async function rescheduleTaskOccurrence(taskId, occurrenceKey, payload, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(
    `${API_BASE}/tasks/${taskId}/occurrences/${encodeURIComponent(occurrenceKey)}/reschedule`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

export async function fetchTaskOccurrences(taskId, start, end, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const queryParams = new URLSearchParams();
  if (start) queryParams.set('start', start);
  if (end) queryParams.set('end', end);
  const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const res = await request(`${API_BASE}/tasks/${taskId}/occurrences${queryStr}`, {
    method: 'GET',
    headers,
  });
  return res.data;
}
