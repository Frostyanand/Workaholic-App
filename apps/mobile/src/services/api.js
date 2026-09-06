import { ENV } from '../config/env.js';

/**
 * Baseline mobile API client conforming to docs/15.API-SPECIFICATION.md.
 * Automatically prepends the base URL, ensures application/json headers,
 * and standardizes response envelopes ({ data } / { error }).
 */
export async function apiClient(endpoint, options = {}) {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${ENV.apiUrl}${normalizedEndpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const json = await res.json();

    if (!res.ok) {
      return {
        error: json.error || {
          code: 'HTTP_ERROR',
          message: `Request failed with status ${res.status}`,
        },
      };
    }

    return json;
  } catch (err) {
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      },
    };
  }
}
