/**
 * Web Client API Service for Attachments (Phase 15: Google Drive Attachments)
 * Conforms to docs/15.API-SPECIFICATION.md Section 47 and docs/19.INTEGRATION-SPECIFICATION.md Section 25-29
 */

const API_BASE = '/api/v1/attachments';

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
 * Fetch attachments for a target resource (e.g. TASK, PROJECT)
 */
export async function fetchAttachments(workspaceId, targetType, targetId) {
  const params = {
    targetType,
    targetId,
  };
  if (workspaceId) {
    params.workspaceId = workspaceId;
  }
  const qs = new URLSearchParams(params).toString();

  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}?${qs}`, { headers });
  return res.data || [];
}

/**
 * Fetch a single attachment by ID
 */
export async function fetchAttachment(workspaceId, attachmentId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${attachmentId}${qs}`, { headers });
  return res.data;
}

/**
 * Upload an attachment to Google Drive via Workaholic API
 */
export async function uploadDriveAttachment(workspaceId, uploadData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(API_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      workspaceId,
      ...uploadData,
    }),
  });
  return res.data;
}

/**
 * Detach attachment relationship from Workaholic
 * Does NOT delete the underlying Google Drive file (REQ-GDRIVE-004)
 */
export async function detachAttachment(workspaceId, attachmentId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${attachmentId}${qs}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

/**
 * Explicitly delete attachment AND the underlying Google Drive file (REQ-GDRIVE-005)
 */
export async function deleteAttachmentWithDriveFile(workspaceId, attachmentId) {
  const qs = `?workspaceId=${encodeURIComponent(workspaceId)}&deleteDriveFile=true`;
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/${attachmentId}${qs}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}
