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
    throw error;
  }

  return payload;
}

// ----------------------------------------------------
// Trusted Sharing & Onboarding Share Codes (REQ-SHARE)
// ----------------------------------------------------

export async function createShareCode(data = {}) {
  const res = await request(`${API_BASE}/trusted/share-codes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function listShareCodes() {
  const res = await request(`${API_BASE}/trusted/share-codes`);
  return res.data || [];
}

export async function revokeShareCode(id) {
  const res = await request(`${API_BASE}/trusted/share-codes/${id}`, {
    method: 'DELETE',
  });
  return res.data;
}

export async function redeemShareCode(code) {
  const res = await request(`${API_BASE}/trusted/share-codes/redeem`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return res.data;
}

// ----------------------------------------------------
// Trusted Relationships & Permissions (REQ-SHARE-003, 004, 005)
// ----------------------------------------------------

export async function listRelationships() {
  const res = await request(`${API_BASE}/trusted/relationships`);
  return res.data || [];
}

export async function getRelationship(id) {
  const res = await request(`${API_BASE}/trusted/relationships/${id}`);
  return res.data;
}

export async function updatePermissions(id, permissions) {
  const res = await request(`${API_BASE}/trusted/relationships/${id}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ permissions }),
  });
  return res.data;
}

export async function revokeRelationship(id) {
  const res = await request(`${API_BASE}/trusted/relationships/${id}/revoke`, {
    method: 'POST',
  });
  return res.data;
}

// ----------------------------------------------------
// Comments & Mentions (REQ-COLLAB-003, 004)
// ----------------------------------------------------

export async function createComment(data, workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/collaboration/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function listComments(params = {}, workspaceId) {
  const searchParams = new URLSearchParams();
  if (params.targetType) searchParams.append('targetType', params.targetType);
  if (params.targetId) searchParams.append('targetId', params.targetId);
  if (params.limit) searchParams.append('limit', params.limit);
  if (params.offset) searchParams.append('offset', params.offset);

  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/collaboration/comments${qs}`, { headers });
  return res.data || [];
}

export async function deleteComment(id) {
  const res = await request(`${API_BASE}/collaboration/comments/${id}`, {
    method: 'DELETE',
  });
  return res.data;
}

// ----------------------------------------------------
// Activity Feed (REQ-COLLAB-005, 006)
// ----------------------------------------------------

export async function listActivity(params = {}, workspaceId) {
  const searchParams = new URLSearchParams();
  if (params.workspaceId) searchParams.append('workspaceId', params.workspaceId);
  if (params.targetType) searchParams.append('targetType', params.targetType);
  if (params.targetId) searchParams.append('targetId', params.targetId);
  if (params.actorUserId) searchParams.append('actorUserId', params.actorUserId);
  if (params.activityType) searchParams.append('activityType', params.activityType);
  if (params.limit) searchParams.append('limit', params.limit);
  if (params.offset) searchParams.append('offset', params.offset);

  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/collaboration/activity${qs}`, { headers });
  return res.data || [];
}

// ----------------------------------------------------
// Eligible Collaborators (Workspace Members + Active Trusted)
// ----------------------------------------------------

export async function listEligibleMembers(workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/collaboration/members`, { headers });
  return res.data || [];
}

// ----------------------------------------------------
// Shared Reminders & Multi-Recipient Delivery (REQ-SREM-001..003)
// ----------------------------------------------------

export async function shareReminder(reminderId, recipientUserId) {
  const res = await request(`${API_BASE}/reminders/${reminderId}/recipients`, {
    method: 'POST',
    body: JSON.stringify({ recipientUserId }),
  });
  return res.data;
}

export async function listReminderRecipients(reminderId) {
  const res = await request(`${API_BASE}/reminders/${reminderId}/recipients`);
  return res.data || [];
}

export async function snoozeReminderRecipient(reminderId, snoozeMinutes = 10) {
  const res = await request(`${API_BASE}/reminders/${reminderId}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ snoozeMinutes }),
  });
  return res.data;
}

export async function dismissReminderRecipient(reminderId) {
  const res = await request(`${API_BASE}/reminders/${reminderId}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res.data;
}
