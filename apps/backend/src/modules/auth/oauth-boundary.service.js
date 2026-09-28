import { generateOAuthState, encryptCredentials, decryptCredentials } from '../../core/crypto.js';
import * as integrationsRepo from './integrations.repository.js';
import * as securityEventsRepo from './security-events.repository.js';
import { ValidationError, NotFoundError, ExternalServiceError } from '../../core/errors.js';
import { config } from '../../core/config.js';

/**
 * Google API OAuth Scope definitions conforming to docs/19.INTEGRATION-SPECIFICATION.md Section 7.
 * Strictly separates Google API permissions (Calendar, Tasks, Drive) from user authentication.
 */
export const GOOGLE_API_SCOPES = {
  CALENDAR: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
  ],
  TASKS: ['https://www.googleapis.com/auth/tasks'],
  DRIVE: ['https://www.googleapis.com/auth/drive.file'],
  WORKSPACE: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.file',
  ],
};

export const SUPPORTED_SERVICES = ['CALENDAR', 'TASKS', 'DRIVE', 'WORKSPACE'];

/**
 * OAuth Boundary Service managing external Google API permissions.
 */
export class OAuthBoundaryService {
  constructor(integrations = integrationsRepo, securityEvents = securityEventsRepo) {
    this.integrationsRepo = integrations;
    this.securityEventsRepo = securityEvents;
    // In-memory state tracker for CSRF prevention in active authorization flows
    this.pendingStates = new Map();
  }

  /**
   * Generates authorization URL with minimal required scopes for the chosen service.
   *
   * @param {Object} options
   * @param {string} options.userId - Requesting user UUID
   * @param {'CALENDAR'|'TASKS'|'DRIVE'} options.service - Specific service to authorize
   * @param {string} [options.redirectUri]
   * @returns {{ authorizationUrl: string, state: string, service: string, scopes: string[] }}
   */
  generateAuthorizationUrl(options) {
    const { userId, service, redirectUri } = options;

    if (!userId) {
      throw new TypeError('userId is required');
    }

    if (!service || !SUPPORTED_SERVICES.includes(service.toUpperCase())) {
      throw new ValidationError(
        `Unsupported service: ${service}. Must be one of ${SUPPORTED_SERVICES.join(', ')}`,
      );
    }

    const serviceKey = service.toUpperCase();
    const scopes = GOOGLE_API_SCOPES[serviceKey];
    const state = generateOAuthState();

    // Store state with 10-minute expiration
    this.pendingStates.set(state, {
      userId,
      service: serviceKey,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const clientId = config.googleClientId || 'workaholic-mock-google-client-id';
    const effectiveRedirectUri =
      redirectUri ||
      config.googleRedirectUri ||
      'http://localhost:3001/api/v1/auth/google/callback';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: effectiveRedirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return {
      authorizationUrl,
      state,
      service: serviceKey,
      scopes,
    };
  }

  /**
   * Verifies CSRF state token and ensures it matches expected user and service.
   */
  verifyState(state, userId, service) {
    if (!state || !this.pendingStates.has(state)) {
      throw new ValidationError('Invalid or expired OAuth state token');
    }

    const entry = this.pendingStates.get(state);
    this.pendingStates.delete(state);

    if (Date.now() > entry.expiresAt) {
      throw new ValidationError('OAuth authorization state has expired');
    }

    if (entry.userId !== userId) {
      throw new ValidationError('OAuth state does not match requesting user');
    }

    if (service && entry.service !== service.toUpperCase()) {
      throw new ValidationError('OAuth state does not match requested service');
    }

    return entry;
  }

  /**
   * Completes OAuth flow by exchanging authorization code and securely storing credentials.
   *
   * @param {Object} options
   * @param {string} options.userId
   * @param {string} options.code
   * @param {string} options.state
   * @param {string} options.service
   * @param {Object} [options.tokenExchangeAdapter] - Optional custom or mock token exchanger
   * @param {import('pg').Pool | import('pg').PoolClient} [client]
   */
  async exchangeAuthorizationCode(options, client = undefined) {
    const { userId, code, state, service, tokenExchangeAdapter } = options;

    if (!code || typeof code !== 'string') {
      throw new ValidationError('Authorization code is required');
    }

    // Verify state token
    this.verifyState(state, userId, service);
    const serviceKey = service.toUpperCase();
    const scopes = GOOGLE_API_SCOPES[serviceKey];

    // Exchange code for tokens (using mock/adapter if in test or without live Google credentials)
    let tokenData;
    if (tokenExchangeAdapter) {
      tokenData = await tokenExchangeAdapter(code);
    } else if (
      config.googleClientId &&
      config.googleClientSecret &&
      !config.googleClientId.startsWith('mock_') &&
      config.googleClientId !== 'YOUR_GOOGLE_CLIENT_ID' &&
      config.env !== 'test'
    ) {
      tokenData = await this.exchangeCodeWithGoogle(code);
    } else {
      tokenData = {
        accessToken: `mock_access_token_${Date.now()}`,
        refreshToken: `mock_refresh_token_${Date.now()}`,
        externalAccountId: `google_acc_${userId.substring(0, 8)}`,
        displayName: 'Google Connected Account',
      };
    }

    // Encrypt long-lived refresh token
    const base64Enc = encryptCredentials({
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
    });
    const parsedBundle = JSON.parse(Buffer.from(base64Enc, 'base64').toString('utf8'));
    const encryptedCredentials = {
      encrypted: parsedBundle.ciphertext,
      ciphertext: parsedBundle.ciphertext,
      iv: parsedBundle.iv,
      authTag: parsedBundle.authTag,
    };

    // Save integration record
    const integration = await this.integrationsRepo.upsertIntegration(
      {
        userId,
        provider: 'GOOGLE',
        status: 'CONNECTED',
        connectedAt: new Date(),
        disconnectedAt: null,
      },
      client,
    );

    // Merge scopes with existing account if already connected
    const existingAccount = await this.integrationsRepo.findExternalAccount(
      integration.id,
      'GOOGLE',
      client,
    );
    const mergedScopes = Array.from(new Set([...(existingAccount?.scopes || []), ...scopes]));

    // Save external account with encrypted credentials
    await this.integrationsRepo.upsertExternalAccount(
      {
        integrationId: integration.id,
        provider: 'GOOGLE',
        externalAccountId:
          tokenData.externalAccountId || existingAccount?.externalAccountId || `acc_${Date.now()}`,
        displayName: tokenData.displayName || existingAccount?.displayName || 'Google Account',
        scopes: mergedScopes,
        encryptedCredentials,
      },
      client,
    );

    // Record security event
    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId,
            eventType: 'GOOGLE_OAUTH_CONNECTED',
            metadata: { service: serviceKey, scopes },
          },
          client,
        )
        .catch(() => {});
    }

    return {
      connected: true,
      provider: 'GOOGLE',
      service: serviceKey,
      scopes,
      connectedAt: integration.connectedAt,
    };
  }

  /**
   * Disconnects Google API authorization without terminating Workaholic user identity.
   */
  async disconnectGoogleIntegration(userId, client = undefined) {
    const integration = await this.integrationsRepo.findIntegration(userId, 'GOOGLE', client);
    if (!integration) {
      throw new NotFoundError('Google integration not connected');
    }

    await this.integrationsRepo.deleteIntegration(integration.id, client);

    if (this.securityEventsRepo?.recordSecurityEvent) {
      await this.securityEventsRepo
        .recordSecurityEvent(
          {
            userId,
            eventType: 'GOOGLE_OAUTH_DISCONNECTED',
            metadata: { provider: 'GOOGLE' },
          },
          client,
        )
        .catch(() => {});
    }

    return { disconnected: true };
  }

  /**
   * Retrieves integration connection status and enabled Google API scopes.
   */
  async getIntegrationStatus(userId, service = null, client = undefined) {
    const integration = await this.integrationsRepo.findIntegration(userId, 'GOOGLE', client);
    if (!integration || (integration.status !== 'CONNECTED' && integration.status !== 'SYNCING')) {
      return {
        connected: false,
        status: integration?.status || 'DISCONNECTED',
        scopes: [],
        services: {
          calendar: false,
          tasks: false,
          drive: false,
        },
      };
    }

    const account = await this.integrationsRepo.findExternalAccount(
      integration.id,
      'GOOGLE',
      client,
    );

    const scopes = account?.scopes || [];
    const hasCalendar = GOOGLE_API_SCOPES.CALENDAR.some(s => scopes.includes(s));
    const hasTasks = GOOGLE_API_SCOPES.TASKS.some(s => scopes.includes(s));
    const hasDrive = GOOGLE_API_SCOPES.DRIVE.some(s => scopes.includes(s));

    if (service) {
      const requiredScopes = GOOGLE_API_SCOPES[service.toUpperCase()] || [];
      const hasScope =
        service.toUpperCase() === 'WORKSPACE'
          ? hasCalendar || hasTasks || hasDrive
          : requiredScopes.some(s => scopes.includes(s));
      if (!hasScope) {
        return {
          connected: false,
          status: 'DISCONNECTED',
          scopes,
          accountDisplayName: account?.displayName || null,
          services: {
            calendar: hasCalendar,
            tasks: hasTasks,
            drive: hasDrive,
          },
        };
      }
    }

    return {
      connected: true,
      status: integration.status,
      connectedAt: integration.connectedAt,
      scopes,
      accountDisplayName: account?.displayName || null,
      services: {
        calendar: hasCalendar,
        tasks: hasTasks,
        drive: hasDrive,
      },
    };
  }

  /**
   * Exchanges authorization code with Google's OAuth 2.0 token endpoint.
   * @param {string} code Authorization code from Google redirect
   * @returns {Promise<{ accessToken: string, refreshToken: string|null, externalAccountId: string, displayName: string }>}
   */
  async exchangeCodeWithGoogle(code) {
    const params = new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: config.googleRedirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new ExternalServiceError(
        data.error_description || data.error || 'Failed to exchange authorization code with Google',
      );
    }

    let externalAccountId = 'google_account';
    let displayName = 'Google Connected Account';

    if (data.id_token) {
      try {
        const parts = data.id_token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        externalAccountId = payload.sub || payload.email || externalAccountId;
        displayName = payload.name || payload.email || displayName;
      } catch {
        // Fall back to default identifiers
      }
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      externalAccountId,
      displayName,
    };
  }

  /**
   * Decrypts credentials for internal backend sync jobs.
   * NEVER exposed via API responses.
   */
  async getInternalCredentials(userId, client = undefined) {
    const integration = await this.integrationsRepo.findIntegration(userId, 'GOOGLE', client);
    if (!integration || (integration.status !== 'CONNECTED' && integration.status !== 'SYNCING')) {
      return null;
    }
    const account = await this.integrationsRepo.findExternalAccount(
      integration.id,
      'GOOGLE',
      client,
    );
    if (!account?.encryptedCredentials) {
      return null;
    }
    return decryptCredentials(account.encryptedCredentials);
  }
}

export const oauthBoundaryService = new OAuthBoundaryService();
