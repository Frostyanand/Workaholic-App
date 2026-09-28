/**
 * Web Client API Service for Workspaces, Profiles & Security Sessions
 * Conforms to docs/15.API-SPECIFICATION.md Section 7, Section 9 & docs/11.PERMISSIONS-MODEL.md
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

// Workspaces
export async function fetchWorkspaces() {
  const res = await request(`${API_BASE}/workspaces`);
  return res.data || [];
}

export async function createWorkspace(data) {
  const res = await request(`${API_BASE}/workspaces`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function fetchWorkspace(id) {
  const res = await request(`${API_BASE}/workspaces/${id}`);
  return res.data;
}

export async function fetchWorkspaceMembers(id) {
  const res = await request(`${API_BASE}/workspaces/${id}/members`);
  return res.data || [];
}

export async function addWorkspaceMember(workspaceId, memberData) {
  const res = await request(`${API_BASE}/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: JSON.stringify(memberData),
  });
  return res.data;
}

export async function updateWorkspaceMemberRole(workspaceId, userId, role) {
  const res = await request(`${API_BASE}/workspaces/${workspaceId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  return res.data;
}

export async function removeWorkspaceMember(workspaceId, userId) {
  const res = await request(`${API_BASE}/workspaces/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
  });
  return res.data;
}

// User Profile
export async function fetchUserProfile() {
  const res = await request(`${API_BASE}/users/me`);
  return res.data;
}

export async function updateUserProfile(data) {
  const res = await request(`${API_BASE}/users/me`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.data;
}

// Sessions & Devices
export async function fetchActiveSessions() {
  const res = await request(`${API_BASE}/auth/sessions`);
  return res.data || [];
}

export async function revokeSession(sessionId) {
  const res = await request(`${API_BASE}/auth/sessions/${sessionId}/revoke`, {
    method: 'POST',
  });
  return res.data;
}

export async function revokeAllSessions() {
  const res = await request(`${API_BASE}/auth/revoke-all`, {
    method: 'POST',
  });
  return res.data;
}

export async function fetchUserDevices() {
  const res = await request(`${API_BASE}/auth/devices`);
  return res.data || [];
}
