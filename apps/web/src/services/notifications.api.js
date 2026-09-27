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

export async function fetchNotifications(filters = {}) {
  const params = new URLSearchParams();
  if (filters.unreadOnly) params.append('unreadOnly', 'true');
  if (filters.type) params.append('type', filters.type);
  if (filters.limit) params.append('limit', String(filters.limit));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await request(`${API_BASE}/notifications${qs}`);
  return res.data || [];
}

export async function fetchUnreadCount() {
  const res = await request(`${API_BASE}/notifications/unread-count`);
  return res.data?.count || 0;
}

export async function markNotificationRead(id) {
  const res = await request(`${API_BASE}/notifications/${id}/read`, {
    method: 'POST',
  });
  return res.data;
}

export async function dismissNotification(id) {
  const res = await request(`${API_BASE}/notifications/${id}/dismiss`, {
    method: 'POST',
  });
  return res.data;
}

export async function markAllNotificationsRead() {
  const res = await request(`${API_BASE}/notifications/read-all`, {
    method: 'POST',
  });
  return res.data;
}

export async function fetchNotificationPreferences() {
  const res = await request(`${API_BASE}/notification-preferences`);
  return res.data;
}

export async function updateNotificationPreferences(preferences) {
  const res = await request(`${API_BASE}/notification-preferences`, {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  });
  return res.data;
}

export async function registerPushToken(tokenData) {
  const res = await request(`${API_BASE}/devices/register-push`, {
    method: 'POST',
    body: JSON.stringify(tokenData),
  });
  return res.data;
}
