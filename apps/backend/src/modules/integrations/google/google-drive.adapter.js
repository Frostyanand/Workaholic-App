/**
 * Google Drive API Adapter
 * Conforms to docs/19.INTEGRATION-SPECIFICATION.md Section 25-29, docs/8.SYNC-SPECIFICATION.md Section 61-63,
 * and docs/6.SYSTEM-ARCHITECTURE.md.
 * Pure JavaScript using native global fetch.
 */

export class GoogleDriveAdapter {
  constructor(
    baseUrl = 'https://www.googleapis.com/drive/v3',
    uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files',
  ) {
    this.baseUrl = baseUrl;
    this.uploadUrl = uploadUrl;
  }

  /**
   * Helper to perform authenticated Google Drive API requests
   */
  async _request(accessToken, path, options = {}) {
    if (!accessToken) {
      const err = new Error('Access token is required for Google Drive API');
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
      const err = new Error(`Google Drive network error: ${networkErr.message}`);
      err.transient = true;
      throw err;
    }

    if (response.status === 401) {
      const err = new Error('Google Drive access token expired or revoked');
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
      const err = new Error(`Google Drive API error (${response.status}): ${errBody}`);
      err.statusCode = response.status;
      err.nonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw err;
    }

    return response.json();
  }

  /**
   * Discovers existing folder by name or creates it idempotently.
   * Conforms to REQ-GDRIVE-006.
   *
   * @param {string} accessToken
   * @param {string} [folderName='Workaholic Attachments']
   * @param {string} [parentId=null]
   * @returns {Promise<{ id: string, name: string, mimeType: string }>}
   */
  async findOrCreateFolder(accessToken, folderName = 'Workaholic Attachments', parentId = null) {
    const parentQuery = parentId ? `'${parentId}' in parents and ` : '';
    const q = `${parentQuery}name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchRes = await this._request(
      accessToken,
      `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,trashed)`,
    );

    if (searchRes?.files && searchRes.files.length > 0) {
      return searchRes.files[0];
    }

    // Create folder if not found
    const createRes = await this._request(accessToken, '/files?fields=id,name,mimeType', {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      }),
    });

    return createRes;
  }

  /**
   * Uploads a file to Google Drive.
   * Conforms to REQ-GDRIVE-002 and REQ-GDRIVE-003.
   *
   * @param {string} accessToken
   * @param {Object} fileData
   * @param {string} fileData.name
   * @param {string} fileData.mimeType
   * @param {string|Buffer} fileData.content
   * @param {string} [fileData.parentFolderId]
   * @param {string} [fileData.description]
   * @returns {Promise<Object>}
   */
  async uploadFile(accessToken, fileData) {
    const { name, mimeType, content, parentFolderId, description } = fileData;

    const metadata = {
      name,
      mimeType,
      parents: parentFolderId ? [parentFolderId] : undefined,
      description: description || 'Workaholic attachment',
    };

    const boundary = `workaholic_drive_${Date.now()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const binaryContent = Buffer.isBuffer(content)
      ? content
      : typeof content === 'string'
        ? Buffer.from(content, 'utf8')
        : Buffer.from(String(content));

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${mimeType}\r\n` +
          'Content-Transfer-Encoding: base64\r\n\r\n' +
          binaryContent.toString('base64') +
          closeDelimiter,
        'utf8',
      ),
    ]);

    const url = `${this.uploadUrl}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,parents,trashed`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipartRequestBody.length),
        },
        body: multipartRequestBody,
      });
    } catch (networkErr) {
      const err = new Error(`Google Drive upload network error: ${networkErr.message}`);
      err.transient = true;
      throw err;
    }

    if (response.status === 401) {
      const err = new Error('Google Drive access token expired or revoked');
      err.reauthRequired = true;
      err.statusCode = 401;
      throw err;
    }

    if (!response.ok) {
      const errBody = await response.text();
      const err = new Error(`Google Drive upload error (${response.status}): ${errBody}`);
      err.statusCode = response.status;
      err.nonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw err;
    }

    return response.json();
  }

  /**
   * Retrieves file metadata from Google Drive.
   *
   * @param {string} accessToken
   * @param {string} fileId
   * @returns {Promise<Object|null>}
   */
  async getFile(accessToken, fileId) {
    return this._request(
      accessToken,
      `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,parents,trashed`,
    );
  }

  /**
   * Explicitly deletes a file from Google Drive.
   * Conforms to REQ-GDRIVE-005.
   *
   * @param {string} accessToken
   * @param {string} fileId
   * @returns {Promise<{ deleted: boolean, notFound?: boolean }>}
   */
  async deleteFile(accessToken, fileId) {
    if (!accessToken) {
      const err = new Error('Access token is required for Google Drive API');
      err.reauthRequired = true;
      throw err;
    }

    const url = `${this.baseUrl}/files/${encodeURIComponent(fileId)}`;
    let response;
    try {
      response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (networkErr) {
      const err = new Error(`Google Drive delete network error: ${networkErr.message}`);
      err.transient = true;
      throw err;
    }

    if (response.status === 401) {
      const err = new Error('Google Drive access token expired or revoked');
      err.reauthRequired = true;
      err.statusCode = 401;
      throw err;
    }

    if (response.status === 404) {
      // Idempotent: already deleted
      return { deleted: true, notFound: true };
    }

    if (!response.ok && response.status !== 204) {
      const errBody = await response.text();
      const err = new Error(`Google Drive delete error (${response.status}): ${errBody}`);
      err.statusCode = response.status;
      throw err;
    }

    return { deleted: true };
  }

  /**
   * Lists files in Drive or inside a folder.
   *
   * @param {string} accessToken
   * @param {Object} [options]
   */
  async listFiles(accessToken, options = {}) {
    const { folderId, pageSize = 50 } = options;
    const parentQuery = folderId ? `'${folderId}' in parents and ` : '';
    const q = `${parentQuery}trashed = false`;

    return this._request(
      accessToken,
      `/files?q=${encodeURIComponent(q)}&pageSize=${pageSize}&fields=files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,trashed)`,
    );
  }
}

export const defaultGoogleDriveAdapter = new GoogleDriveAdapter();

/**
 * Deterministic Mock Adapter for Automated Unit and Integration Testing
 */
export class MockGoogleDriveAdapter {
  constructor() {
    this.folders = new Map();
    this.files = new Map();
    this.shouldFailAuth = false;
    this.shouldFailRateLimit = false;
    this.shouldFailNetwork = false;
  }

  setShouldFailAuth(fail) {
    this.shouldFailAuth = fail;
  }

  setShouldFailRateLimit(fail) {
    this.shouldFailRateLimit = fail;
  }

  setShouldFailNetwork(fail) {
    this.shouldFailNetwork = fail;
  }

  _checkSimulatedErrors() {
    if (this.shouldFailAuth) {
      const err = new Error('Google Drive access token expired or revoked');
      err.reauthRequired = true;
      err.statusCode = 401;
      throw err;
    }
    if (this.shouldFailRateLimit) {
      const err = new Error('Google Drive rate limit exceeded');
      err.statusCode = 429;
      err.transient = true;
      throw err;
    }
    if (this.shouldFailNetwork) {
      const err = new Error('Google Drive network error: ECONNRESET');
      err.transient = true;
      throw err;
    }
  }

  async findOrCreateFolder(_accessToken, folderName = 'Workaholic Attachments', parentId = null) {
    this._checkSimulatedErrors();

    // Check if folder exists
    for (const folder of this.folders.values()) {
      if (folder.name === folderName && !folder.trashed) {
        if (!parentId || folder.parents?.includes(parentId)) {
          return JSON.parse(JSON.stringify(folder));
        }
      }
    }

    const folderId = `mock_folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newFolder = {
      id: folderId,
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
      trashed: false,
      createdTime: new Date().toISOString(),
    };
    this.folders.set(folderId, newFolder);
    return JSON.parse(JSON.stringify(newFolder));
  }

  async uploadFile(_accessToken, fileData) {
    this._checkSimulatedErrors();

    const fileId = `mock_drive_file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const size = fileData.sizeBytes || Buffer.byteLength(String(fileData.content || ''));

    const created = {
      id: fileId,
      name: fileData.name,
      mimeType: fileData.mimeType || 'application/octet-stream',
      size: String(size),
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      webContentLink: `https://drive.google.com/uc?id=${fileId}&export=download`,
      parents: fileData.parentFolderId ? [fileData.parentFolderId] : [],
      trashed: false,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
    };

    this.files.set(fileId, created);
    return JSON.parse(JSON.stringify(created));
  }

  async getFile(_accessToken, fileId) {
    this._checkSimulatedErrors();

    const file = this.files.get(fileId) || this.folders.get(fileId);
    if (!file) {
      return null;
    }
    return JSON.parse(JSON.stringify(file));
  }

  async deleteFile(_accessToken, fileId) {
    this._checkSimulatedErrors();

    if (!this.files.has(fileId) && !this.folders.has(fileId)) {
      return { deleted: true, notFound: true };
    }
    this.files.delete(fileId);
    this.folders.delete(fileId);
    return { deleted: true };
  }

  async listFiles(_accessToken, options = {}) {
    this._checkSimulatedErrors();

    const { folderId } = options;
    const result = [];
    for (const file of this.files.values()) {
      if (file.trashed) continue;
      if (folderId && !file.parents?.includes(folderId)) continue;
      result.push(file);
    }
    return { files: JSON.parse(JSON.stringify(result)) };
  }

  // Simulation helpers for tests
  trashFile(fileId) {
    const file = this.files.get(fileId);
    if (file) {
      file.trashed = true;
    }
  }

  moveFile(fileId, newParentId) {
    const file = this.files.get(fileId);
    if (file) {
      file.parents = [newParentId];
    }
  }
}
