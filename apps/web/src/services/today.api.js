/**
 * Web Client API Service for Today / Command Center (Phase 9)
 * Conforms to docs/15.API-SPECIFICATION.md and UX-SPECIFICATION.md
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

/**
 * Fetch unified daily command center cockpit data
 * @param {string|null} workspaceId
 * @param {object} [query={}]
 * @param {string} [query.date] - Optional YYYY-MM-DD
 * @param {string} [query.timezone] - Optional IANA timezone string
 * @returns {Promise<object>}
 */
export async function fetchTodayCockpit(workspaceId, query = {}) {
  const params = new URLSearchParams();
  if (query.date) params.append('date', query.date);
  if (query.timezone) params.append('timezone', query.timezone);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};

  const res = await request(`${API_BASE}/today${qs}`, { headers });
  return res.data;
}
