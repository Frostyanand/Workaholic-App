/**
 * Web Client API Service for External Integrations (Phase 13: Google Calendar)
 * Conforms to docs/15.API-SPECIFICATION.md Section 62, 63 and docs/19.INTEGRATION-SPECIFICATION.md
 */

const API_BASE = '/api/v1/integrations';

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

/**
 * Fetch Google Calendar integration status
 */
export async function fetchGoogleCalendarStatus() {
  const res = await request(`${API_BASE}/google/calendar/status`);
  return res.data;
}

/**
 * Initiate Google Calendar OAuth authorization
 */
export async function connectGoogleCalendar(redirectUri) {
  const res = await request(`${API_BASE}/google/calendar/connect`, {
    method: 'POST',
    body: JSON.stringify({ redirectUri }),
  });
  return res.data;
}

/**
 * Complete Google Calendar OAuth callback
 */
export async function completeGoogleCalendarCallback(code, state) {
  const res = await request(`${API_BASE}/google/calendar/callback`, {
    method: 'POST',
    body: JSON.stringify({ code, state, service: 'CALENDAR' }),
  });
  return res.data;
}

/**
 * Discover/list user's accessible Google calendars
 */
export async function fetchGoogleCalendars(workspaceId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/calendar/calendars${qs}`, { headers });
  return res.data || [];
}

/**
 * Trigger synchronization for Google Calendar
 */
export async function syncGoogleCalendar(workspaceId, calendarMappingId = null, options = {}) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/calendar/sync${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      calendarMappingId,
      force: options.force || false,
      async: options.async || false,
    }),
  });
  return res.data;
}

/**
 * Disconnect Google Calendar integration
 */
export async function disconnectGoogleCalendar() {
  const res = await request(`${API_BASE}/google/calendar/disconnect`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res.data;
}

/**
 * Fetch Google Tasks integration status
 */
export async function fetchGoogleTasksStatus() {
  const res = await request(`${API_BASE}/google/tasks/status`);
  return res.data;
}

/**
 * Initiate Google Tasks OAuth authorization
 */
export async function connectGoogleTasks(redirectUri) {
  const res = await request(`${API_BASE}/google/tasks/connect`, {
    method: 'POST',
    body: JSON.stringify({ redirectUri }),
  });
  return res.data;
}

/**
 * Complete Google Tasks OAuth callback
 */
export async function completeGoogleTasksCallback(code, state) {
  const res = await request(`${API_BASE}/google/tasks/callback`, {
    method: 'POST',
    body: JSON.stringify({ code, state, service: 'TASKS' }),
  });
  return res.data;
}

/**
 * Discover/list user's accessible Google task lists
 */
export async function fetchGoogleTaskLists(workspaceId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/tasks/task-lists${qs}`, { headers });
  return res.data || [];
}

/**
 * Trigger synchronization for Google Tasks
 */
export async function syncGoogleTasks(workspaceId, taskListMappingId = null, options = {}) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/tasks/sync${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      taskListMappingId,
      force: options.force || false,
      async: options.async || false,
    }),
  });
  return res.data;
}

/**
 * Disconnect Google Tasks integration
 */
export async function disconnectGoogleTasks() {
  const res = await request(`${API_BASE}/google/tasks/disconnect`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res.data;
}

/**
 * Fetch Google Drive integration status
 */
export async function fetchGoogleDriveStatus() {
  const res = await request(`${API_BASE}/google/drive/status`);
  return res.data;
}

/**
 * Initiate Google Drive OAuth authorization
 */
export async function connectGoogleDrive(redirectUri) {
  const res = await request(`${API_BASE}/google/drive/connect`, {
    method: 'POST',
    body: JSON.stringify({ redirectUri }),
  });
  return res.data;
}

/**
 * Complete Google Drive OAuth callback
 */
export async function completeGoogleDriveCallback(code, state) {
  const res = await request(`${API_BASE}/google/drive/callback`, {
    method: 'POST',
    body: JSON.stringify({ code, state, service: 'DRIVE' }),
  });
  return res.data;
}

/**
 * Get or create dedicated Workaholic Google Drive folder
 */
export async function getOrCreateGoogleDriveFolder(workspaceId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/drive/folder${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workspaceId }),
  });
  return res.data;
}

/**
 * Upload file to Google Drive
 */
export async function uploadGoogleDriveFile(workspaceId, uploadData) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/drive/upload${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(uploadData),
  });
  return res.data;
}

/**
 * Sync / reconcile Google Drive attachment status
 */
export async function syncGoogleDriveAttachment(workspaceId, attachmentId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/drive/sync${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ attachmentId }),
  });
  return res.data;
}

/**
 * Explicitly delete file from Google Drive
 */
export async function deleteGoogleDriveFile(workspaceId, fileId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/google/drive/files/${encodeURIComponent(fileId)}${qs}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

/**
 * Disconnect Google Drive integration
 */
export async function disconnectGoogleDrive() {
  const res = await request(`${API_BASE}/google/drive/disconnect`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res.data;
}

/**
 * Fetch synchronization diagnostics
 */
export async function fetchSyncDiagnostics(options = {}) {
  const params = new URLSearchParams();
  if (options.service) params.set('service', options.service);
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await request(`${API_BASE}/google/diagnostics${qs}`);
  return res.data;
}

/**
 * Trigger synchronization recovery / reset stale locks
 */
export async function recoverSync(recoveryOptions = {}) {
  const res = await request(`${API_BASE}/google/recover`, {
    method: 'POST',
    body: JSON.stringify(recoveryOptions),
  });
  return res.data;
}
