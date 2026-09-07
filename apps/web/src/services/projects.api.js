/**
 * Web Client API Service for Projects (Phase 6)
 * Conforms to docs/15.API-SPECIFICATION.md Section 35
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

export async function fetchProjects(workspaceId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'ALL') params.append('status', filters.status);
  if (filters.search) params.append('search', filters.search);
  if (filters.sort) params.append('sort', filters.sort);
  if (filters.order) params.append('order', filters.order);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects${qs}`, { headers });
  return res.data || [];
}

export async function fetchProjectById(projectId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects/${projectId}`, { headers });
  return res.data;
}

export async function createProject(workspaceId, projectData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify(projectData),
  });
  return res.data;
}

export async function updateProject(projectId, workspaceId, updateData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updateData),
  });
  return res.data;
}

export async function deleteProject(projectId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects/${projectId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function restoreProject(projectId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects/${projectId}/restore`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

export async function fetchProjectMembers(projectId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects/${projectId}/members`, { headers });
  return res.data || [];
}

export async function addProjectMember(projectId, workspaceId, memberData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects/${projectId}/members`, {
    method: 'POST',
    headers,
    body: JSON.stringify(memberData),
  });
  return res.data;
}

export async function removeProjectMember(projectId, workspaceId, userId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/projects/${projectId}/members/${userId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}
