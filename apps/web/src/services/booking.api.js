/**
 * Web Client API Service for Booking & Availability Engine (Phase 20)
 * Conforms to API-SPECIFICATION.md Section 58-61 and BUSINESS-RULES.md Section 19.
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

// =========================================================
// Authenticated Booking Pages Management
// =========================================================

export async function createBookingPage(workspaceId, payload) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request('/api/v1/booking/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function listBookingPages(workspaceId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request('/api/v1/booking/pages', { headers });
  return res.data || [];
}

export async function getBookingPage(workspaceId, id) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${id}`, { headers });
  return res.data;
}

export async function updateBookingPage(workspaceId, id, payload) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteBookingPage(workspaceId, id) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${id}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

// =========================================================
// Authenticated Booking Types Management
// =========================================================

export async function createBookingType(workspaceId, pageId, payload) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${pageId}/types`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function listBookingTypes(workspaceId, pageId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${pageId}/types`, { headers });
  return res.data || [];
}

export async function updateBookingType(workspaceId, id, payload) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/types/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteBookingType(workspaceId, id) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/types/${id}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

// =========================================================
// Authenticated Availability Rules & Exceptions
// =========================================================

export async function setAvailabilityRules(workspaceId, pageId, rules) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${pageId}/availability-rules`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ rules }),
  });
  return res.data;
}

export async function getAvailabilityRules(workspaceId, pageId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${pageId}/availability-rules`, { headers });
  return res.data || [];
}

export async function createAvailabilityException(workspaceId, pageId, payload) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/pages/${pageId}/exceptions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteAvailabilityException(workspaceId, id) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/exceptions/${id}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

// =========================================================
// Authenticated Owner Bookings
// =========================================================

export async function listOwnerBookings(workspaceId, filters = {}) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();
  const res = await request(`/api/v1/booking/bookings${qs ? `?${qs}` : ''}`, { headers });
  return res.data || [];
}

export async function ownerCancelBooking(workspaceId, id, reason) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/bookings/${id}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason }),
  });
  return res.data;
}

export async function ownerRescheduleBooking(workspaceId, id, newStartAt, timezone, reason) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`/api/v1/booking/bookings/${id}/reschedule`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ newStartAt, timezone, reason }),
  });
  return res.data;
}

// =========================================================
// Public Unauthenticated Endpoints (Guest Facing)
// =========================================================

export async function fetchPublicBookingPage(slug) {
  const res = await request(`/api/v1/booking-pages/${slug}`);
  return res.data;
}

export async function fetchPublicAvailability(slug, bookingTypeId, startDate, endDate, timezone) {
  const params = new URLSearchParams({
    bookingTypeId,
    startDate,
    endDate,
    ...(timezone ? { timezone } : {}),
  }).toString();
  const res = await request(`/api/v1/booking-pages/${slug}/availability?${params}`);
  return res.data;
}

export async function createPublicBooking(slug, payload) {
  const res = await request(`/api/v1/booking-pages/${slug}/bookings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function fetchPublicBooking(token) {
  const res = await request(`/api/v1/public/bookings/${token}`);
  return res.data;
}

export async function guestCancelBooking(token, reason) {
  const res = await request(`/api/v1/public/bookings/${token}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return res.data;
}

export async function guestRescheduleBooking(token, newStartAt, timezone, reason) {
  const res = await request(`/api/v1/public/bookings/${token}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ newStartAt, timezone, reason }),
  });
  return res.data;
}
