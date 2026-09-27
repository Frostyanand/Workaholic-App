/**
 * Google Calendar API Adapter
 * Conforms to docs/19.INTEGRATION-SPECIFICATION.md Section 3, 7, 10
 * Pure JavaScript using native global fetch.
 */

export class GoogleCalendarAdapter {
  constructor(baseUrl = 'https://www.googleapis.com/calendar/v3') {
    this.baseUrl = baseUrl;
  }

  /**
   * Helper to perform authenticated Google Calendar API requests
   */
  async _request(accessToken, path, options = {}) {
    if (!accessToken) {
      const err = new Error('Access token is required for Google Calendar API');
      err.reauthRequired = true;
      throw err;
    }

    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      const err = new Error(`Google Calendar network error: ${networkErr.message}`);
      err.transient = true;
      throw err;
    }

    if (response.status === 401) {
      const err = new Error('Google Calendar access token expired or revoked');
      err.reauthRequired = true;
      err.statusCode = 401;
      throw err;
    }

    if (response.status === 410) {
      // Google sync token expired; full sync required
      const err = new Error('Google Calendar sync token has expired');
      err.syncTokenExpired = true;
      err.statusCode = 410;
      throw err;
    }

    if (response.status === 404) {
      return null;
    }

    if (response.status === 204) {
      return { success: true };
    }

    if (!response.ok) {
      const errBody = await response.text();
      const err = new Error(`Google Calendar API error (${response.status}): ${errBody}`);
      err.statusCode = response.status;
      err.nonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw err;
    }

    return response.json();
  }

  /**
   * List the user's accessible Google calendars
   * @param {string} accessToken
   * @returns {Promise<Array<{ id: string, summary: string, description: string, primary: boolean, timeZone: string, backgroundColor: string }>>}
   */
  async listCalendars(accessToken) {
    const data = await this._request(accessToken, '/users/me/calendarList');
    if (!data?.items) return [];

    return data.items.map(item => ({
      id: item.id,
      summary: item.summary || 'Untitled Calendar',
      description: item.description || '',
      primary: Boolean(item.primary),
      timeZone: item.timeZone || 'UTC',
      backgroundColor: item.backgroundColor || '#4285F4',
      accessRole: item.accessRole || 'reader',
    }));
  }

  /**
   * List events in a specific Google calendar (supports incremental sync via syncToken)
   * @param {string} accessToken
   * @param {string} calendarId
   * @param {Object} [options={}]
   * @param {string} [options.syncToken]
   * @param {string} [options.timeMin]
   * @param {string} [options.timeMax]
   * @returns {Promise<{ items: Array<Object>, nextSyncToken?: string }>}
   */
  async listEvents(accessToken, calendarId, options = {}) {
    const params = new URLSearchParams({
      singleEvents: 'false', // Keep recurring series distinct per CALENDAR-SPECIFICATION.md Section 19
      showDeleted: 'true', // Needed to detect external deletions
      maxResults: '250',
    });

    if (options.syncToken) {
      params.append('syncToken', options.syncToken);
    } else {
      if (options.timeMin) params.append('timeMin', options.timeMin);
      if (options.timeMax) params.append('timeMax', options.timeMax);
    }

    const encodedCalId = encodeURIComponent(calendarId);
    const data = await this._request(
      accessToken,
      `/calendars/${encodedCalId}/events?${params.toString()}`,
    );

    return {
      items: data?.items || [],
      nextSyncToken: data?.nextSyncToken || null,
    };
  }

  /**
   * Get a single Google Calendar event by ID
   */
  async getEvent(accessToken, calendarId, eventId) {
    const encodedCalId = encodeURIComponent(calendarId);
    const encodedEvtId = encodeURIComponent(eventId);
    return this._request(accessToken, `/calendars/${encodedCalId}/events/${encodedEvtId}`);
  }

  /**
   * Create an event in Google Calendar
   */
  async createEvent(accessToken, calendarId, eventPayload) {
    const encodedCalId = encodeURIComponent(calendarId);
    return this._request(accessToken, `/calendars/${encodedCalId}/events`, {
      method: 'POST',
      body: JSON.stringify(eventPayload),
    });
  }

  /**
   * Update an existing event in Google Calendar
   */
  async updateEvent(accessToken, calendarId, eventId, eventPayload) {
    const encodedCalId = encodeURIComponent(calendarId);
    const encodedEvtId = encodeURIComponent(eventId);
    return this._request(accessToken, `/calendars/${encodedCalId}/events/${encodedEvtId}`, {
      method: 'PUT',
      body: JSON.stringify(eventPayload),
    });
  }

  /**
   * Delete an event in Google Calendar
   */
  async deleteEvent(accessToken, calendarId, eventId) {
    const encodedCalId = encodeURIComponent(calendarId);
    const encodedEvtId = encodeURIComponent(eventId);
    return this._request(accessToken, `/calendars/${encodedCalId}/events/${encodedEvtId}`, {
      method: 'DELETE',
    });
  }
}

/**
 * Deterministic Mock Adapter for Automated Unit and Integration Testing
 */
export class MockGoogleCalendarAdapter {
  constructor() {
    this.calendars = [
      {
        id: 'primary',
        summary: 'Primary Google Calendar',
        description: 'Mock primary calendar',
        primary: true,
        timeZone: 'UTC',
        backgroundColor: '#4285F4',
        accessRole: 'owner',
      },
      {
        id: 'work_team_cal@group.calendar.google.com',
        summary: 'Team Schedule',
        description: 'Shared team calendar',
        primary: false,
        timeZone: 'UTC',
        backgroundColor: '#0F9D58',
        accessRole: 'writer',
      },
    ];
    // Map of calendarId -> Map of eventId -> event object
    this.eventsByCalendar = new Map();
    this.eventsByCalendar.set('primary', new Map());
    this.eventsByCalendar.set('work_team_cal@group.calendar.google.com', new Map());
    this.nextSyncToken = 'mock_sync_token_v1';
    this.shouldFailAuth = false;
  }

  setShouldFailAuth(fail) {
    this.shouldFailAuth = fail;
  }

  async listCalendars(_accessToken) {
    if (this.shouldFailAuth) {
      const err = new Error('Google Calendar access token expired');
      err.reauthRequired = true;
      err.statusCode = 401;
      throw err;
    }
    return JSON.parse(JSON.stringify(this.calendars));
  }

  async listEvents(_accessToken, calendarId, _options = {}) {
    if (this.shouldFailAuth) {
      const err = new Error('Google Calendar access token expired');
      err.reauthRequired = true;
      throw err;
    }
    const calMap = this.eventsByCalendar.get(calendarId) || new Map();
    const items = Array.from(calMap.values());
    return {
      items: JSON.parse(JSON.stringify(items)),
      nextSyncToken: this.nextSyncToken,
    };
  }

  async getEvent(_accessToken, calendarId, eventId) {
    const calMap = this.eventsByCalendar.get(calendarId);
    const item = calMap?.get(eventId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async createEvent(_accessToken, calendarId, eventPayload) {
    let calMap = this.eventsByCalendar.get(calendarId);
    if (!calMap) {
      calMap = new Map();
      this.eventsByCalendar.set(calendarId, calMap);
    }

    const eventId =
      eventPayload.id || `google_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const created = {
      ...eventPayload,
      id: eventId,
      etag: `etag_${Date.now()}`,
      status: eventPayload.status || 'confirmed',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    calMap.set(eventId, created);
    return JSON.parse(JSON.stringify(created));
  }

  async updateEvent(_accessToken, calendarId, eventId, eventPayload) {
    const calMap = this.eventsByCalendar.get(calendarId);
    const existing = calMap?.get(eventId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      ...eventPayload,
      etag: `etag_${Date.now()}`,
      updated: new Date().toISOString(),
    };
    calMap.set(eventId, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async deleteEvent(_accessToken, calendarId, eventId) {
    const calMap = this.eventsByCalendar.get(calendarId);
    if (calMap && calMap.has(eventId)) {
      const item = calMap.get(eventId);
      item.status = 'cancelled';
      item.updated = new Date().toISOString();
      return { success: true };
    }
    return { success: true };
  }
}

export const defaultGoogleCalendarAdapter = new GoogleCalendarAdapter();
