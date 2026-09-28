/**
 * Web Client API Service for Public Calendar and Share Links (Phase 19)
 * Conforms to API-SPECIFICATION.md Section 56-57 and CALENDAR-SPECIFICATION.md Section 42-43.
 */

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
 * Fetch the active public link for a calendar (Authenticated)
 */
export async function getActivePublicLink(workspaceId, calendarId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/calendars/${calendarId}/public-link`, { headers });
  return res.data;
}

/**
 * Create or enable a public calendar link (Authenticated)
 */
export async function createPublicLink(workspaceId, calendarId, payload = {}) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/calendars/${calendarId}/public-link`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

/**
 * Revoke an active public calendar link (Authenticated)
 */
export async function revokePublicLink(workspaceId, calendarId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/calendars/${calendarId}/public-link`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

/**
 * Regenerate a public calendar link atomically (Authenticated)
 */
export async function regeneratePublicLink(workspaceId, calendarId, payload = {}) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/calendars/${calendarId}/public-link/regenerate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

/**
 * Fetch the public calendar feed and privacy projection (Anonymous / Unauthenticated)
 */
export async function getPublicCalendarFeed(token, query = {}) {
  const cleanQuery = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const qs = new URLSearchParams(cleanQuery).toString();
  const res = await request(`/api/v1/public/calendars/${token}${qs ? `?${qs}` : ''}`);
  return res.data;
}
