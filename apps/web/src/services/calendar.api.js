/**
 * Web Client API Service for Calendar and Events (Phase 8)
 * Conforms to docs/9.CALENDAR-SPECIFICATION.md and docs/15.API-SPECIFICATION.md
 */

const API_BASE = '/api/v1/calendar';

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

export async function fetchCalendars(workspaceId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.sourceType) params.append('sourceType', filters.sourceType);
  if (filters.visibility) params.append('visibility', filters.visibility);
  if (filters.search) params.append('search', filters.search);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/calendars${qs}`, { headers });
  return res.data || [];
}

export async function fetchCalendarById(calendarId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/calendars/${calendarId}`, { headers });
  return res.data;
}

export async function createCalendar(workspaceId, calendarData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/calendars`, {
    method: 'POST',
    headers,
    body: JSON.stringify(calendarData),
  });
  return res.data;
}

export async function updateCalendar(calendarId, workspaceId, patchData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/calendars/${calendarId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patchData),
  });
  return res.data;
}

export async function deleteCalendar(calendarId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/calendars/${calendarId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function fetchCalendarEvents(workspaceId, query = {}) {
  const params = new URLSearchParams();
  if (query.start) params.append('start', query.start);
  if (query.end) params.append('end', query.end);
  if (query.calendarIds) {
    const ids = Array.isArray(query.calendarIds) ? query.calendarIds.join(',') : query.calendarIds;
    params.append('calendarIds', ids);
  }
  if (query.sourceType) params.append('sourceType', query.sourceType);
  if (query.timezone) params.append('timezone', query.timezone);
  if (query.includeTasks !== undefined) params.append('includeTasks', String(query.includeTasks));
  if (query.includeWorkBlocks !== undefined)
    params.append('includeWorkBlocks', String(query.includeWorkBlocks));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/events${qs}`, { headers });
  return {
    events: Array.isArray(res.data) ? res.data : res.data?.events || [],
    workBlocks: res.workBlocks || res.data?.workBlocks || [],
    deadlines: res.deadlines || res.data?.deadlines || [],
    meta: res.meta || res.data?.meta || {},
  };
}

export async function fetchEventById(eventId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/events/${eventId}`, { headers });
  return res.data;
}

export async function createEvent(workspaceId, eventData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(eventData),
  });
  return res.data;
}

export async function updateEvent(eventId, workspaceId, patchData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/events/${eventId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patchData),
  });
  return res.data;
}

export async function deleteEvent(eventId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/events/${eventId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}
