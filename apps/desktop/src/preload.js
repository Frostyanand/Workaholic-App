const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workaholicDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  send: (channel, data) => {
    const validChannels = ['app:action'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: (channel, func) => {
    const validChannels = ['app:event'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
});
