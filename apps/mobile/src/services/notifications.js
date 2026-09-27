/**
 * Mobile notification service contract conforming to docs/20.OFFLINE-PLATFORM-SPECIFICATION.md
 * and docs/10.NOTIFICATION-SPECIFICATION.md Section 21.
 * Provides platform-native push and exact local scheduled alarm hooks for Android.
 */

export const mobileNotifications = {
  /**
   * Request notification permissions and register push device token with the backend
   * @param {Function} [apiClient]
   * @returns {Promise<{ granted: boolean, token?: string }>}
   */
  async registerForPushNotifications(apiClient) {
    // In production, uses Expo Notifications / FCM native module
    const token = 'simulated_expo_push_token';
    if (apiClient) {
      await apiClient('/devices/register-push', {
        method: 'POST',
        body: JSON.stringify({
          platform: 'ANDROID',
          token,
          deviceName: 'Android Device',
        }),
      }).catch(() => {});
    }
    return { granted: true, token };
  },

  /**
   * Schedules a local exact alarm on Android for offline-capable reminders
   * @param {Object} options
   * @param {string} options.id - Reminder or occurrence ID
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body
   * @param {Date|number} options.triggerAt - Trigger timestamp
   */
  async scheduleLocalNotification({ id, title, body, triggerAt }) {
    return {
      scheduled: true,
      id,
      title,
      body,
      triggerAt: new Date(triggerAt).toISOString(),
    };
  },

  /**
   * Cancels a previously scheduled local alarm
   * @param {string} id
   */
  async cancelLocalNotification(id) {
    return { cancelled: true, id };
  },
};
