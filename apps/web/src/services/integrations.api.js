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
