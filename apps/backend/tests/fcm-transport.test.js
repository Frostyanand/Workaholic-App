import { describe, it, expect, beforeEach } from 'vitest';
import {
  PushTransportInterface,
  MockPushTransport,
  LoggingPushTransport,
  FcmPushTransport,
  getPushTransport,
  setPushTransport,
} from '../src/modules/notifications/fcm.transport.js';

describe('Push Transport Abstraction (Phase 11: NOTIF-T18, NOTIF-T24)', () => {
  beforeEach(() => {
    setPushTransport(new MockPushTransport());
  });

  it('base PushTransportInterface throws not implemented', async () => {
    const base = new PushTransportInterface();
    await expect(base.sendMulticast([], {})).rejects.toThrow('Not implemented');
  });

  it('MockPushTransport sends messages and tracks outcomes correctly', async () => {
    const mock = new MockPushTransport();
    mock.setTokenBehavior('token_dead', {
      status: 'PERMANENT_FAILURE',
      errorCode: 'messaging/registration-token-not-registered',
      errorMessage: 'Device unregistered',
    });
    mock.setTokenBehavior('token_temp', {
      status: 'TEMPORARY_FAILURE',
      errorCode: 'messaging/server-unavailable',
      errorMessage: 'FCM busy',
    });

    const tokens = ['token_ok', 'token_dead', 'token_temp'];
    const payload = { title: 'Test Reminder', body: 'Take action now' };

    const results = await mock.sendMulticast(tokens, payload);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      token: 'token_ok',
      status: 'DELIVERED',
      messageId: 'mock-msg-id-123',
      errorCode: null,
      errorMessage: null,
      shouldInvalidateToken: false,
    });
    expect(results[1]).toEqual({
      token: 'token_dead',
      status: 'PERMANENT_FAILURE',
      messageId: null,
      errorCode: 'messaging/registration-token-not-registered',
      errorMessage: 'Device unregistered',
      shouldInvalidateToken: true,
    });
    expect(results[2]).toEqual({
      token: 'token_temp',
      status: 'TEMPORARY_FAILURE',
      messageId: null,
      errorCode: 'messaging/server-unavailable',
      errorMessage: 'FCM busy',
      shouldInvalidateToken: false,
    });

    expect(mock.sentMessages).toHaveLength(3);
    mock.reset();
    expect(mock.sentMessages).toHaveLength(0);
  });

  it('LoggingPushTransport safely simulates delivery', async () => {
    const loggingTransport = new LoggingPushTransport();
    const results = await loggingTransport.sendMulticast(['token_1', 'token_2'], {
      title: 'Dev Reminder',
      body: 'Testing',
    });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('DELIVERED');
    expect(results[1].status).toBe('DELIVERED');
  });

  it('FcmPushTransport maps successes, permanent failures, and temporary errors', async () => {
    const fakeFirebaseMessaging = {
      sendEachForMulticast: async message => {
        expect(message.tokens).toEqual(['token_good', 'token_invalid', 'token_busy']);
        expect(message.notification.title).toBe('Critical Event');
        expect(message.android.priority).toBe('high');
        expect(message.apns.payload.aps.sound).toBe('critical.aiff');

        return {
          responses: [
            { success: true, messageId: 'projects/123/messages/456' },
            {
              success: false,
              error: {
                code: 'messaging/invalid-registration-token',
                message: 'Token is invalid',
              },
            },
            {
              success: false,
              error: {
                code: 'messaging/internal-error',
                message: 'Temporary internal error',
              },
            },
          ],
        };
      },
    };

    const fcm = new FcmPushTransport(fakeFirebaseMessaging);
    const results = await fcm.sendMulticast(['token_good', 'token_invalid', 'token_busy'], {
      title: 'Critical Event',
      body: 'Immediate action required',
      priority: 'CRITICAL',
    });

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('DELIVERED');
    expect(results[0].shouldInvalidateToken).toBe(false);

    expect(results[1].status).toBe('PERMANENT_FAILURE');
    expect(results[1].shouldInvalidateToken).toBe(true);

    expect(results[2].status).toBe('TEMPORARY_FAILURE');
    expect(results[2].shouldInvalidateToken).toBe(false);
  });

  it('FcmPushTransport handles total network transport failure gracefully', async () => {
    const brokenFirebaseMessaging = {
      sendEachForMulticast: async () => {
        throw new Error('Connection reset by peer');
      },
    };

    const fcm = new FcmPushTransport(brokenFirebaseMessaging);
    const results = await fcm.sendMulticast(['token_1', 'token_2'], {
      title: 'Test',
      body: 'Test',
    });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('TEMPORARY_FAILURE');
    expect(results[0].errorCode).toBe('network_error');
    expect(results[1].status).toBe('TEMPORARY_FAILURE');
  });

  it('getPushTransport and setPushTransport manage the singleton', () => {
    const custom = new MockPushTransport();
    setPushTransport(custom);
    expect(getPushTransport()).toBe(custom);
  });
});
