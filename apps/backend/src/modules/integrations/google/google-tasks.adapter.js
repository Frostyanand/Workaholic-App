/**
 * Google Tasks API Adapter
 * Conforms to docs/19.INTEGRATION-SPECIFICATION.md Section 21-24, docs/8.SYNC-SPECIFICATION.md Section 59,
 * and docs/6.SYSTEM-ARCHITECTURE.md.
 * Pure JavaScript using native global fetch.
 */

export class GoogleTasksAdapter {
  constructor(baseUrl = 'https://tasks.googleapis.com/tasks/v1') {
    this.baseUrl = baseUrl;
  }

  /**
   * Helper to perform authenticated Google Tasks API requests
   */
  async _request(accessToken, path, options = {}) {
    if (!accessToken) {
      const err = new Error('Access token is required for Google Tasks API');
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
      const err = new Error(`Google Tasks network error: ${networkErr.message}`);
      err.transient = true;
      throw err;
    }

    if (response.status === 401) {
      const err = new Error('Google Tasks access token expired or revoked');
      err.reauthRequired = true;
      err.statusCode = 401;
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
      const err = new Error(`Google Tasks API error (${response.status}): ${errBody}`);
      err.statusCode = response.status;
      err.nonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw err;
    }

    return response.json();
  }

  /**
   * List the user's accessible Google Task Lists
   * @param {string} accessToken
   * @returns {Promise<Array<{ id: string, title: string, updated: string, etag: string, isDefault?: boolean }>>}
   */
  async listTaskLists(accessToken) {
    const data = await this._request(accessToken, '/users/@me/lists');
    if (!data?.items) return [];

    return data.items.map((item, index) => ({
      id: item.id,
      title: item.title || 'My Tasks',
      updated: item.updated || new Date().toISOString(),
      etag: item.etag || null,
      isDefault: item.id === '@default' || index === 0,
    }));
  }

  /**
   * Retrieve a single Google Task List by ID
   * @param {string} accessToken
   * @param {string} taskListId
   */
  async getTaskList(accessToken, taskListId) {
    return this._request(accessToken, `/users/@me/lists/${encodeURIComponent(taskListId)}`);
  }

  /**
   * Create a new Google Task List
   * @param {string} accessToken
   * @param {string} title
   */
  async createTaskList(accessToken, title) {
    return this._request(accessToken, '/users/@me/lists', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  /**
   * List tasks in a specific task list with pagination and incremental filtering
   * @param {string} accessToken
   * @param {string} taskListId
   * @param {Object} [options={}]
   * @param {boolean} [options.showCompleted=true]
   * @param {boolean} [options.showHidden=true]
   * @param {boolean} [options.showDeleted=true]
   * @param {string} [options.updatedMin]
   * @param {string} [options.pageToken]
   * @param {number} [options.maxResults=100]
   * @returns {Promise<{ items: Array<Object>, nextPageToken?: string, etag?: string }>}
   */
  async listTasks(accessToken, taskListId, options = {}) {
    const params = new URLSearchParams();
    if (options.showCompleted !== false) params.set('showCompleted', 'true');
    if (options.showHidden !== false) params.set('showHidden', 'true');
    if (options.showDeleted !== false) params.set('showDeleted', 'true');
    if (options.updatedMin) params.set('updatedMin', options.updatedMin);
    if (options.pageToken) params.set('pageToken', options.pageToken);
    if (options.maxResults) params.set('maxResults', String(options.maxResults));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await this._request(
      accessToken,
      `/lists/${encodeURIComponent(taskListId)}/tasks${qs}`,
    );

    return {
      items: data?.items || [],
      nextPageToken: data?.nextPageToken || null,
      etag: data?.etag || null,
    };
  }

  /**
   * Retrieve a single task by ID
   * @param {string} accessToken
   * @param {string} taskListId
   * @param {string} taskId
   */
  async getTask(accessToken, taskListId, taskId) {
    return this._request(
      accessToken,
      `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    );
  }

  /**
   * Create a new task in Google Tasks
   * @param {string} accessToken
   * @param {string} taskListId
   * @param {Object} taskData
   * @param {Object} [options={}]
   * @param {string} [options.parent]
   * @param {string} [options.previous]
   */
  async createTask(accessToken, taskListId, taskData, options = {}) {
    const params = new URLSearchParams();
    if (options.parent) params.set('parent', options.parent);
    if (options.previous) params.set('previous', options.previous);

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this._request(accessToken, `/lists/${encodeURIComponent(taskListId)}/tasks${qs}`, {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  }

  /**
   * Update an existing task in Google Tasks
   * @param {string} accessToken
   * @param {string} taskListId
   * @param {string} taskId
   * @param {Object} taskData
   */
  async updateTask(accessToken, taskListId, taskId, taskData) {
    return this._request(
      accessToken,
      `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(taskData),
      },
    );
  }

  /**
   * Delete a task from Google Tasks
   * @param {string} accessToken
   * @param {string} taskListId
   * @param {string} taskId
   */
  async deleteTask(accessToken, taskListId, taskId) {
    return this._request(
      accessToken,
      `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'DELETE',
      },
    );
  }

  /**
   * Clears all completed tasks from the specified task list
   * @param {string} accessToken
   * @param {string} taskListId
   */
  async clearTasks(accessToken, taskListId) {
    return this._request(accessToken, `/lists/${encodeURIComponent(taskListId)}/clear`, {
      method: 'POST',
    });
  }
}

export const defaultGoogleTasksAdapter = new GoogleTasksAdapter();

/**
 * Deterministic Mock Adapter for Automated Unit and Integration Testing
 */
export class MockGoogleTasksAdapter {
  constructor() {
    this.taskLists = [
      {
        id: '@default',
        title: 'My Tasks',
        updated: new Date().toISOString(),
        etag: 'etag_mock_default_list',
        isDefault: true,
      },
      {
        id: 'work_list_001',
        title: 'Work Tasks',
        updated: new Date().toISOString(),
        etag: 'etag_mock_work_list',
        isDefault: false,
      },
    ];
    // Map of listId -> Map of taskId -> task object
    this.tasksByList = new Map();
    this.tasksByList.set('@default', new Map());
    this.tasksByList.set('work_list_001', new Map());
    this.shouldFailAuth = false;
    this.shouldFailRateLimit = false;
  }

  setShouldFailAuth(fail) {
    this.shouldFailAuth = fail;
  }

  setShouldFailRateLimit(fail) {
    this.shouldFailRateLimit = fail;
  }

  async listTaskLists(_accessToken) {
    if (this.shouldFailAuth) {
      const err = new Error('Google Tasks access token expired or revoked');
      err.reauthRequired = true;
      err.statusCode = 401;
      throw err;
    }
    if (this.shouldFailRateLimit) {
      const err = new Error('Google Tasks rate limit exceeded');
      err.statusCode = 429;
      err.transient = true;
      throw err;
    }
    return JSON.parse(JSON.stringify(this.taskLists));
  }

  async getTaskList(_accessToken, taskListId) {
    const list = this.taskLists.find(l => l.id === taskListId);
    return list ? JSON.parse(JSON.stringify(list)) : null;
  }

  async createTaskList(_accessToken, title) {
    const listId = `mock_list_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const created = {
      id: listId,
      title,
      updated: new Date().toISOString(),
      etag: `etag_${listId}`,
      isDefault: false,
    };
    this.taskLists.push(created);
    this.tasksByList.set(listId, new Map());
    return JSON.parse(JSON.stringify(created));
  }

  seedTaskLists(lists) {
    this.taskLists = JSON.parse(JSON.stringify(lists));
    for (const l of lists) {
      if (!this.tasksByList.has(l.id)) {
        this.tasksByList.set(l.id, new Map());
      }
    }
  }

  seedTasks(taskListId, tasks) {
    let listMap = this.tasksByList.get(taskListId);
    if (!listMap) {
      listMap = new Map();
      this.tasksByList.set(taskListId, listMap);
    }
    for (const t of tasks) {
      listMap.set(t.id, JSON.parse(JSON.stringify(t)));
    }
  }

  async listTasks(_accessToken, taskListId, options = {}) {
    if (this.shouldFailAuth) {
      const err = new Error('Google Tasks access token expired');
      err.reauthRequired = true;
      err.statusCode = 401;
      throw err;
    }
    if (this.shouldFailRateLimit) {
      const err = new Error('Google Tasks rate limit exceeded');
      err.statusCode = 429;
      err.transient = true;
      throw err;
    }
    const listMap = this.tasksByList.get(taskListId) || new Map();
    let items = Array.from(listMap.values());

    if (!options.showDeleted) {
      items = items.filter(t => !t.deleted);
    }

    if (options.updatedMin) {
      const minTime = new Date(options.updatedMin).getTime();
      items = items.filter(t => new Date(t.updated).getTime() >= minTime);
    }

    // Support pagination if maxResults specified
    if (options.maxResults && items.length > options.maxResults) {
      const page = options.pageToken ? parseInt(options.pageToken, 10) : 0;
      const start = page * options.maxResults;
      const pagedItems = items.slice(start, start + options.maxResults);
      const hasMore = start + options.maxResults < items.length;
      return {
        items: JSON.parse(JSON.stringify(pagedItems)),
        nextPageToken: hasMore ? String(page + 1) : null,
      };
    }

    return {
      items: JSON.parse(JSON.stringify(items)),
      nextPageToken: null,
    };
  }

  async getTask(_accessToken, taskListId, taskId) {
    const listMap = this.tasksByList.get(taskListId);
    const item = listMap?.get(taskId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async createTask(_accessToken, taskListId, taskData, options = {}) {
    let listMap = this.tasksByList.get(taskListId);
    if (!listMap) {
      listMap = new Map();
      this.tasksByList.set(taskListId, listMap);
    }

    const taskId =
      taskData.id || `gtask_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const created = {
      ...taskData,
      id: taskId,
      parent: options.parent || taskData.parent || undefined,
      etag: `etag_${taskId}_${Date.now()}`,
      updated: new Date().toISOString(),
      status: taskData.status || 'needsAction',
      deleted: false,
    };

    listMap.set(taskId, created);
    return JSON.parse(JSON.stringify(created));
  }

  async updateTask(_accessToken, taskListId, taskId, taskData) {
    let listMap = this.tasksByList.get(taskListId);
    if (!listMap) {
      listMap = new Map();
      this.tasksByList.set(taskListId, listMap);
    }

    const existing = listMap.get(taskId) || {};
    const updated = {
      ...existing,
      ...taskData,
      id: taskId,
      etag: `etag_${taskId}_${Date.now()}`,
      updated: new Date().toISOString(),
    };

    listMap.set(taskId, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async deleteTask(_accessToken, taskListId, taskId) {
    const listMap = this.tasksByList.get(taskListId);
    if (listMap) {
      const existing = listMap.get(taskId);
      if (existing) {
        existing.deleted = true;
        existing.updated = new Date().toISOString();
      }
    }
    return { success: true };
  }

  async clearTasks(_accessToken, taskListId) {
    const listMap = this.tasksByList.get(taskListId);
    if (listMap) {
      for (const [id, t] of listMap.entries()) {
        if (t.status === 'completed') {
          listMap.delete(id);
        }
      }
    }
    return { success: true };
  }
}
