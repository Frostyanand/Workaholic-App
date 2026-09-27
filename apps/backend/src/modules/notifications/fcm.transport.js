import { config } from '../../core/config.js';

/**
 * Base Push Transport Interface
 */
export class PushTransportInterface {
  async sendMulticast(_tokens, _payload) {
    throw new Error('Not implemented');
  }
}

/**
 * In-memory Mock Push Transport for isolated, deterministic tests
 */
export class MockPushTransport extends PushTransportInterface {
  constructor() {
    super();
    this.sentMessages = [];
    this.tokenBehaviors = new Map();
    this.defaultBehavior = { status: 'DELIVERED', messageId: 'mock-msg-id-123' };
  }

  setTokenBehavior(token, outcome) {
    this.tokenBehaviors.set(token, outcome);
  }

  async sendMulticast(tokens, payload) {
    const results = [];
    for (const token of tokens) {
      const behavior = this.tokenBehaviors.get(token) || this.defaultBehavior;
      const result = {
        token,
        status: behavior.status,
        messageId: behavior.messageId || null,
        errorCode: behavior.errorCode || null,
        errorMessage: behavior.errorMessage || null,
        shouldInvalidateToken:
          behavior.status === 'PERMANENT_FAILURE' ||
          behavior.errorCode === 'messaging/registration-token-not-registered' ||
          behavior.errorCode === 'messaging/invalid-registration-token',
      };
      this.sentMessages.push({ token, payload, result, at: new Date() });
      results.push(result);
    }
    return results;
  }

  reset() {
    this.sentMessages = [];
    this.tokenBehaviors.clear();
  }
}

/**
 * Logging / No-op Transport for development when Firebase credentials are not provided
 */
export class LoggingPushTransport extends PushTransportInterface {
  async sendMulticast(tokens, payload) {
    if (config.env !== 'test') {
      console.log(
        `[PUSH SIMULATED] To ${tokens.length} token(s): "${payload.title}" - "${payload.body}"`,
      );
    }
    return tokens.map(token => ({
      token,
      status: 'DELIVERED',
      messageId: `simulated-${Date.now()}`,
      shouldInvalidateToken: false,
    }));
  }
}

/**
 * Production FCM Transport wrapping Firebase Admin SDK
 */
export class FcmPushTransport extends PushTransportInterface {
  constructor(firebaseMessaging = null) {
    super();
    this.messaging = firebaseMessaging;
  }

  async sendMulticast(tokens, payload) {
    if (!this.messaging || tokens.length === 0) {
      return [];
    }

    const message = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority:
          payload.priority === 'HIGH' || payload.priority === 'CRITICAL' ? 'high' : 'normal',
      },
      apns: {
        payload: {
          aps: {
            sound: payload.priority === 'CRITICAL' ? 'critical.aiff' : 'default',
          },
        },
      },
    };

    try {
      const response = await this.messaging.sendEachForMulticast(message);
      return response.responses.map((res, idx) => {
        const token = tokens[idx];
        if (res.success) {
          return {
            token,
            status: 'DELIVERED',
            messageId: res.messageId,
            shouldInvalidateToken: false,
          };
        }

        const errCode = res.error?.code || 'unknown';
        const isPermanent =
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered' ||
          errCode === 'messaging/invalid-argument';

        return {
          token,
          status: isPermanent ? 'PERMANENT_FAILURE' : 'TEMPORARY_FAILURE',
          errorCode: errCode,
          errorMessage: res.error?.message,
          shouldInvalidateToken: isPermanent,
        };
      });
    } catch (err) {
      return tokens.map(token => ({
        token,
        status: 'TEMPORARY_FAILURE',
        errorCode: 'network_error',
        errorMessage: err.message,
        shouldInvalidateToken: false,
      }));
    }
  }
}

let transportInstance = null;

export function getPushTransport() {
  if (transportInstance) return transportInstance;

  if (config.env === 'test') {
    transportInstance = new MockPushTransport();
    return transportInstance;
  }

  // In development or when credentials are not configured, use LoggingPushTransport
  transportInstance = new LoggingPushTransport();
  return transportInstance;
}

export function setPushTransport(transport) {
  transportInstance = transport;
}
