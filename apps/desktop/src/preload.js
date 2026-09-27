const electron = require('electron');

const contextBridge = electron.contextBridge;
const ipcRenderer = electron.ipcRenderer;

const ALLOWED_INVOKE_CHANNELS = [
  'desktop:ping',
  'desktop:get-system-info',
  'desktop:window-minimize',
  'desktop:window-maximize',
  'desktop:window-close',
  'desktop:show-notification',
  'desktop:schedule-notification',
];

/**
 * Expose secure, whitelisted desktop bridge into the web renderer context.
 * Complies with AGENTS.md desktop security invariants (contextIsolation: true, nodeIntegration: false).
 */
function setupDesktopBridge(bridge = contextBridge, renderer = ipcRenderer) {
  if (!bridge || typeof bridge.exposeInMainWorld !== 'function') {
    return null;
  }

  const api = {
    isDesktop: true,
    platform: process.platform,
    invoke: (channel, ...args) => {
      if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
        return renderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
    },
    ping: () => renderer.invoke('desktop:ping'),
    getSystemInfo: () => renderer.invoke('desktop:get-system-info'),
    minimizeWindow: () => renderer.invoke('desktop:window-minimize'),
    maximizeWindow: () => renderer.invoke('desktop:window-maximize'),
    closeWindow: () => renderer.invoke('desktop:window-close'),
    showNotification: options => renderer.invoke('desktop:show-notification', options),
    scheduleNotification: options => renderer.invoke('desktop:schedule-notification', options),
  };

  bridge.exposeInMainWorld('workaholicDesktop', api);
  return api;
}

if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
  setupDesktopBridge(contextBridge, ipcRenderer);
}

module.exports = {
  setupDesktopBridge,
  ALLOWED_INVOKE_CHANNELS,
};
