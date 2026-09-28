/**
 * Web Client API Service for Academic Calendar & Day Order Engine (Phase 18)
 * Conforms to API-SPECIFICATION.md, CALENDAR-SPECIFICATION.md, and REQ-DO-001 through REQ-DO-015.
 */

const API_BASE = '/api/v1/academic';

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

// --- SEMESTERS ---

export async function fetchSemesters(workspaceId, filters = {}) {
  const params = { ...filters };
  if (workspaceId) params.workspaceId = workspaceId;
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const qs = new URLSearchParams(cleanParams).toString();
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};

  const res = await request(`${API_BASE}/semesters${qs ? `?${qs}` : ''}`, { headers });
  return res.data || [];
}

export async function fetchSemester(workspaceId, semesterId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}`, { headers });
  return res.data;
}

export async function createSemester(workspaceId, semesterData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters`, {
    method: 'POST',
    headers,
    body: JSON.stringify(semesterData),
  });
  return res.data;
}

export async function updateSemester(workspaceId, semesterId, updates) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  return res.data;
}

export async function activateSemester(workspaceId, semesterId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/activate`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

export async function endSemester(workspaceId, semesterId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/end`, {
    method: 'POST',
    headers,
  });
  return res.data;
}

// --- CALENDAR & DAY ORDERS ---

export async function fetchAcademicCalendar(workspaceId, semesterId, query = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const qs = new URLSearchParams(cleanParams).toString();
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};

  const res = await request(`${API_BASE}/semesters/${semesterId}/calendar${qs ? `?${qs}` : ''}`, {
    headers,
  });
  return res.data || [];
}

export async function setAcademicDate(workspaceId, semesterId, dateData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/calendar/dates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(dateData),
  });
  return res.data;
}

export async function removeAcademicDate(workspaceId, semesterId, calendarDate) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/calendar/dates/${calendarDate}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

export async function fetchDayOrderSequence(workspaceId, semesterId, query = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const qs = new URLSearchParams(cleanParams).toString();
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};

  const res = await request(`${API_BASE}/semesters/${semesterId}/day-orders${qs ? `?${qs}` : ''}`, {
    headers,
  });
  return res.data || [];
}

// --- CLASS SCHEDULES (REUSABLE TIMETABLES) ---

export async function fetchClassSchedules(workspaceId, query = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  const qs = new URLSearchParams(cleanParams).toString();
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};

  const res = await request(`${API_BASE}/schedules${qs ? `?${qs}` : ''}`, { headers });
  return res.data || [];
}

export async function fetchClassSchedule(workspaceId, scheduleId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/schedules/${scheduleId}`, { headers });
  return res.data;
}

export async function createClassSchedule(workspaceId, scheduleData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/schedules`, {
    method: 'POST',
    headers,
    body: JSON.stringify(scheduleData),
  });
  return res.data;
}

export async function updateClassSchedule(workspaceId, scheduleId, updates) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/schedules/${scheduleId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  return res.data;
}

export async function deleteClassSchedule(workspaceId, scheduleId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/schedules/${scheduleId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

// --- SCHEDULE ENTRIES ---

export async function createScheduleEntry(workspaceId, scheduleId, entryData) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/schedules/${scheduleId}/entries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(entryData),
  });
  return res.data;
}

export async function updateScheduleEntry(workspaceId, scheduleId, entryId, updates) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/schedules/${scheduleId}/entries/${entryId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  return res.data;
}

export async function deleteScheduleEntry(workspaceId, scheduleId, entryId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/schedules/${scheduleId}/entries/${entryId}`, {
    method: 'DELETE',
    headers,
  });
  return res.data;
}

// --- GENERATION & EXCEPTIONS ---

export async function generateAcademicSchedule(workspaceId, semesterId, payload = {}) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function cancelClass(workspaceId, semesterId, data) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/exceptions/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function rescheduleClass(workspaceId, semesterId, data) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/exceptions/reschedule`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function fetchAcademicExceptions(workspaceId, semesterId) {
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const res = await request(`${API_BASE}/semesters/${semesterId}/exceptions`, { headers });
  return res.data || [];
}
