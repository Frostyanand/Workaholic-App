/**
 * Web Client API Service for Authentication & Session Exchange
 * Conforms to docs/15.API-SPECIFICATION.md Section 4 & docs/6.SYSTEM-ARCHITECTURE.md Section 13, 14
 */

const API_BASE = '/api/v1';

async function request(url, options = {}) {
  const storedToken =
    typeof window !== 'undefined' ? localStorage.getItem('workaholic_session_token') : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Authentication request failed');
    error.status = response.status;
    error.code = payload?.error?.code;
    error.fields = payload?.error?.fields;
    throw error;
  }

  return payload;
}

/**
 * Exchanges a verified Firebase ID token for a native Workaholic session.
 * @param {string} idToken Firebase ID token
 * @param {Object} [device] Optional device metadata
 */
export async function createSessionFromFirebase(idToken, device = null) {
  const payload = {
    idToken,
    ...(device ? { device } : {}),
  };

  const res = await request(`${API_BASE}/auth/session`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (res.data?.token && typeof window !== 'undefined') {
    localStorage.setItem('workaholic_session_token', res.data.token);
    if (res.data.user) {
      localStorage.setItem('workaholic_user', JSON.stringify(res.data.user));
    }
  }

  return res.data;
}

/**
 * Checks current session status from backend.
 */
export async function fetchCurrentSession() {
  const res = await request(`${API_BASE}/auth/session`);
  return res.data;
}

/**
 * Logs out of native Workaholic session and cleans up local tokens.
 */
export async function logoutSession() {
  try {
    await request(`${API_BASE}/auth/logout`, {
      method: 'POST',
    });
  } finally {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('workaholic_session_token');
      localStorage.removeItem('workaholic_user');
    }
  }
}

/**
 * Retrieves user's Google integration status and connected services.
 */
export async function getGoogleStatus() {
  const res = await request(`${API_BASE}/auth/google/status`);
  return res.data;
}

/**
 * Initiates Google OAuth authorization flow for specific or all services.
 * @param {'WORKSPACE'|'CALENDAR'|'TASKS'|'DRIVE'} [service='WORKSPACE']
 */
export async function initiateGoogleOAuth(service = 'WORKSPACE') {
  const res = await request(
    `${API_BASE}/auth/google/authorize?service=${encodeURIComponent(service)}`,
  );
  return res.data;
}

/**
 * Disconnects Google integrations entirely.
 */
export async function disconnectGoogle() {
  const res = await request(`${API_BASE}/auth/google`, {
    method: 'DELETE',
  });
  return res.data;
}
