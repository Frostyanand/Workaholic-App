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
    throw error;
  }

  return payload;
}

export async function fetchReminders(workspaceId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.taskId) params.append('taskId', filters.taskId);
  if (filters.eventId) params.append('eventId', filters.eventId);
  if (filters.status) params.append('status', filters.status);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/reminders${qs}`, { headers });
  return res.data || [];
}

export async function createReminder(workspaceId, reminderData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/reminders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(reminderData),
  });
  return res.data;
}

export async function snoozeReminder(id, snoozeData) {
  const res = await request(`${API_BASE}/reminders/${id}/snooze`, {
    method: 'POST',
    body: JSON.stringify(snoozeData),
  });
  return res.data;
}

export async function dismissReminder(id, options = {}) {
  const res = await request(`${API_BASE}/reminders/${id}/dismiss`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
  return res.data;
}

export async function deleteReminder(id, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/reminders/${id}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}
