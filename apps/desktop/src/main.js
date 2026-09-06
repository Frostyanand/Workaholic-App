const electron = require('electron');
const path = require('path');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;

let mainWindow = null;

const ALLOWED_INVOKE_CHANNELS = [
  'desktop:ping',
  'desktop:get-system-info',
  'desktop:window-minimize',
  'desktop:window-maximize',
  'desktop:window-close',
];

/**
 * Configure secure BrowserWindow options adhering to docs/12.PRIVACY-SECURITY.md
 * and AGENTS.md desktop security invariants.
 */
function getWindowOptions() {
  return {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0d14',
    title: 'Workaholic',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

function registerIpcHandlers(ipc = ipcMain) {
  if (!ipc) return;

  ipc.handle('desktop:ping', async () => {
    return { pong: true, timestamp: Date.now() };
  });

  ipc.handle('desktop:get-system-info', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      appVersion: app && app.isPackaged ? app.getVersion() : '0.1.0-dev',
    };
  });

  ipc.handle('desktop:window-minimize', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
      return true;
    }
    return false;
  });

  ipc.handle('desktop:window-maximize', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      return mainWindow.isMaximized();
    }
    return false;
  });

  ipc.handle('desktop:window-close', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
      return true;
    }
    return false;
  });
}

function createWindow() {
  if (!BrowserWindow) return null;
  mainWindow = new BrowserWindow(getWindowOptions());

  const startUrl =
    process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../../web/dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Initialize Electron application lifecycle when running within Electron runtime
if (app && typeof app.requestSingleInstanceLock === 'function') {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();

  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    app.whenReady().then(() => {
      registerIpcHandlers();
      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
}

module.exports = {
  getWindowOptions,
  registerIpcHandlers,
  createWindow,
  ALLOWED_INVOKE_CHANNELS,
};
