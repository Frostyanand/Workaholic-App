/**
 * Web Client API Service for Notes & Knowledge Workspace (Phase 17)
 * Conforms to docs/15.API-SPECIFICATION.md Section 38-40 and REQ-NOTE-001 through REQ-NOTE-008.
 */

const API_BASE = '/api/v1/notes';

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
 * Fetch notes with search, categories, tags, pinned/favorite/archived filtering, and pagination.
 */
export async function fetchNotes(workspaceId, filters = {}) {
  const params = { ...filters };
  if (workspaceId) {
    params.workspaceId = workspaceId;
  }
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const qs = new URLSearchParams(cleanParams).toString();

  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}${qs ? `?${qs}` : ''}`, { headers });
  return {
    notes: res.data || [],
    pagination: res.pagination || { limit: 50, offset: 0, total: 0 },
  };
}

/**
 * Fetch a single note by ID (includes tags, relationships, backlinks, and attachments).
 */
export async function fetchNote(workspaceId, noteId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}${qs}`, { headers });
  return res.data;
}

/**
 * Create a new note.
 */
export async function createNote(workspaceId, noteData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(API_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      workspaceId,
      ...noteData,
    }),
  });
  return res.data;
}

/**
 * Update an existing note.
 */
export async function updateNote(workspaceId, noteId, noteData) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}${qs}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(noteData),
  });
  return res.data;
}

/**
 * Soft-delete a note.
 */
export async function deleteNote(workspaceId, noteId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}${qs}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

/**
 * Restore a soft-deleted note.
 */
export async function restoreNote(workspaceId, noteId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}/restore${qs}`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

/**
 * Fetch all workspace tags with note counts.
 */
export async function fetchTags(workspaceId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/tags${qs}`, { headers });
  return res.data || [];
}

/**
 * Fetch all workspace categories with note counts.
 */
export async function fetchCategories(workspaceId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/categories${qs}`, { headers });
  return res.data || [];
}

/**
 * Discover notes related to a target entity (Task, Project, etc.).
 */
export async function fetchRelatedNotes(workspaceId, targetType, targetId) {
  const params = { targetType, targetId };
  if (workspaceId) params.workspaceId = workspaceId;
  const qs = new URLSearchParams(params).toString();
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/related?${qs}`, { headers });
  return res.data || [];
}

/**
 * Add an explicit relationship to a Note.
 */
export async function addNoteRelationship(workspaceId, noteId, relationshipData) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}/relationships${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(relationshipData),
  });
  return res.data;
}

/**
 * Remove an explicit relationship from a Note.
 */
export async function removeNoteRelationship(workspaceId, noteId, relationshipId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}/relationships/${relationshipId}${qs}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

/**
 * Get backlinks pointing to a Note.
 */
export async function fetchNoteBacklinks(workspaceId, noteId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}/backlinks${qs}`, { headers });
  return res.data || [];
}

/**
 * Convert a checklist item in a Note into an explicit Workaholic Task.
 * Conforms to BR-NOTE-001, BR-NOTE-002, and REQ-NOTE-008.
 */
export async function convertChecklistItemToTask(workspaceId, noteId, conversionData) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${noteId}/convert-checklist-item${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(conversionData),
  });
  return res.data;
}
