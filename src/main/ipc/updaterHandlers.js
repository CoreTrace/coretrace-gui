/**
 * @fileoverview IPC handlers and runtime integration for application updates.
 *
 * Uses electron-updater and persists update channel selection (main/beta)
 * under the userData directory.
 */

const { ipcMain, app } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs').promises;
const path = require('path');

let updaterInitialized = false;
let mainWindowRef = null;

function getUpdaterSettingsPath() {
  return path.join(app.getPath('userData'), 'updater-settings.json');
}

function normalizeChannel(channel) {
  return channel === 'beta' ? 'beta' : 'main';
}

function toUpdaterChannel(channel) {
  return channel === 'beta' ? 'beta' : 'latest';
}

async function loadUpdaterSettings() {
  const settingsPath = getUpdaterSettingsPath();
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { channel: normalizeChannel(parsed.channel) };
  } catch (_) {
    return { channel: 'main' };
  }
}

async function saveUpdaterSettings(settings) {
  const settingsPath = getUpdaterSettingsPath();
  const payload = {
    channel: normalizeChannel(settings.channel)
  };
  await fs.writeFile(settingsPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function sendUpdaterEvent(payload) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send('updater-status', payload);
}

function applyUpdaterChannel(channel) {
  const normalized = normalizeChannel(channel);
  autoUpdater.allowPrerelease = normalized === 'beta';
  autoUpdater.channel = toUpdaterChannel(normalized);
  return normalized;
}

function setupUpdaterHandlers(mainWindow) {
  mainWindowRef = mainWindow;

  ipcMain.handle('updater-get-settings', async () => {
    try {
      const settings = await loadUpdaterSettings();
      const applied = applyUpdaterChannel(settings.channel);
      return {
        success: true,
        settings: { channel: applied },
        isPackaged: app.isPackaged
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater-set-channel', async (_event, channel) => {
    try {
      const normalized = normalizeChannel(channel);
      const saved = await saveUpdaterSettings({ channel: normalized });
      applyUpdaterChannel(saved.channel);
      return {
        success: true,
        settings: saved
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater-check-now', async () => {
    if (!app.isPackaged) {
      return {
        success: false,
        error: 'Auto updates are only available in packaged builds.'
      };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        success: true,
        updateInfo: result?.updateInfo || null
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater-install-update', async () => {
    if (!app.isPackaged) {
      return {
        success: false,
        error: 'Install update is only available in packaged builds.'
      };
    }

    try {
      setImmediate(() => autoUpdater.quitAndInstall());
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  console.log('[UpdaterHandlers] Updater IPC handlers registered');
}

async function setupAutoUpdater(mainWindow) {
  if (updaterInitialized) return;
  updaterInitialized = true;
  mainWindowRef = mainWindow;

  const settings = await loadUpdaterSettings();
  const activeChannel = applyUpdaterChannel(settings.channel);

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdaterEvent({ type: 'checking-for-update' });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdaterEvent({ type: 'update-available', info });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdaterEvent({ type: 'update-not-available', info });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdaterEvent({ type: 'download-progress', progress: progressObj });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterEvent({ type: 'update-downloaded', info });
  });

  autoUpdater.on('error', (error) => {
    sendUpdaterEvent({ type: 'error', message: error?.message || String(error) });
  });

  console.log('[UpdaterHandlers] Update channel:', activeChannel);

  if (!app.isPackaged) {
    console.log('[UpdaterHandlers] Skipping updater check in development mode');
    return;
  }

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn('[UpdaterHandlers] Initial update check failed:', error.message);
    });
  }, 5000);
}

module.exports = {
  setupUpdaterHandlers,
  setupAutoUpdater
};
