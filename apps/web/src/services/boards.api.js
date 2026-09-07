/**
 * Web Client API Service for Boards & Columns (Phase 6)
 * Conforms to docs/15.API-SPECIFICATION.md Section 36
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

export async function fetchBoards(workspaceId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.append('projectId', filters.projectId);
  if (filters.search) params.append('search', filters.search);
  if (filters.sort) params.append('sort', filters.sort);
  if (filters.order) params.append('order', filters.order);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards${qs}`, { headers });
  return res.data || [];
}

export async function fetchBoardById(boardId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}`, { headers });
  return res.data;
}

export async function createBoard(workspaceId, boardData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards`, {
    method: 'POST',
    headers,
    body: JSON.stringify(boardData),
  });
  return res.data;
}

export async function updateBoard(boardId, workspaceId, updateData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updateData),
  });
  return res.data;
}

export async function deleteBoard(boardId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function restoreBoard(boardId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}/restore`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

export async function fetchBoardTasks(boardId, workspaceId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.boardColumnId) params.append('boardColumnId', filters.boardColumnId);
  if (filters.status) params.append('status', filters.status);
  if (filters.priority) params.append('priority', filters.priority);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}/tasks${qs}`, { headers });
  return res.data || [];
}

export async function createColumn(boardId, workspaceId, columnData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}/columns`, {
    method: 'POST',
    headers,
    body: JSON.stringify(columnData),
  });
  return res.data;
}

export async function updateColumn(boardId, columnId, workspaceId, updateData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}/columns/${columnId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updateData),
  });
  return res.data;
}

export async function deleteColumn(boardId, columnId, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}/columns/${columnId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function reorderColumns(boardId, workspaceId, columnIds) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}/columns/reorder`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ columnIds }),
  });
  return res.data;
}

export async function moveBoardTask(boardId, taskId, workspaceId, columnId, status) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/boards/${boardId}/tasks/${taskId}/move`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ columnId, status }),
  });
  return res.data;
}
