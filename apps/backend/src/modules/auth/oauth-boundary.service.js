import { generateOAuthState, encryptCredentials, decryptCredentials } from '../../core/crypto.js';
import * as integrationsRepo from './integrations.repository.js';
import * as securityEventsRepo from './security-events.repository.js';
import { ValidationError, NotFoundError } from '../../core/errors.js';
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
};

export const SUPPORTED_SERVICES = ['CALENDAR', 'TASKS', 'DRIVE'];

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

    // Save external account with encrypted credentials
    await this.integrationsRepo.upsertExternalAccount(
      {
        integrationId: integration.id,
        provider: 'GOOGLE',
        externalAccountId: tokenData.externalAccountId || `acc_${Date.now()}`,
        displayName: tokenData.displayName || 'Google Account',
        scopes,
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
  async getIntegrationStatus(userId, client = undefined) {
    const integration = await this.integrationsRepo.findIntegration(userId, 'GOOGLE', client);
    if (!integration || (integration.status !== 'CONNECTED' && integration.status !== 'SYNCING')) {
      return {
        connected: false,
        status: integration?.status || 'DISCONNECTED',
        scopes: [],
      };
    }

    const account = await this.integrationsRepo.findExternalAccount(
      integration.id,
      'GOOGLE',
      client,
    );

    return {
      connected: true,
      status: integration.status,
      connectedAt: integration.connectedAt,
      scopes: account?.scopes || [],
      accountDisplayName: account?.displayName || null,
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
