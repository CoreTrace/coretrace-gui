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
let lastBackendStatus = null;
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const UPDATER_LOG_FILE = 'updater.log';

function getUpdaterSettingsPath() {
  return path.join(app.getPath('userData'), 'updater-settings.json');
}

function getUpdaterLogPath() {
  return path.join(app.getPath('userData'), UPDATER_LOG_FILE);
}

function formatLogMeta(meta) {
  if (meta == null) return '';
  if (typeof meta === 'string') return meta;
  try {
    return JSON.stringify(meta);
  } catch (_) {
    return String(meta);
  }
}

function writeUpdaterLog(level, message, meta) {
  const timestamp = new Date().toISOString();
  const details = formatLogMeta(meta);
  const line = `[${timestamp}] [${level}] ${message}${details ? ` | ${details}` : ''}\n`;
  fs.appendFile(getUpdaterLogPath(), line, 'utf8').catch(() => {});
}

function logUpdaterInfo(message, meta) {
  console.log('[UpdaterHandlers]', message, ...(meta == null ? [] : [meta]));
  writeUpdaterLog('INFO', message, meta);
}

function logUpdaterWarn(message, meta) {
  console.warn('[UpdaterHandlers]', message, ...(meta == null ? [] : [meta]));
  writeUpdaterLog('WARN', message, meta);
}

function logUpdaterError(message, meta) {
  console.error('[UpdaterHandlers]', message, ...(meta == null ? [] : [meta]));
  writeUpdaterLog('ERROR', message, meta);
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
      logUpdaterWarn('Manual update check rejected in development mode');
      return {
        success: false,
        error: 'Auto updates are only available in packaged builds.'
      };
    }

    try {
      logUpdaterInfo('Manual update check requested');
      const result = await autoUpdater.checkForUpdates();
      logUpdaterInfo('Manual update check completed', {
        updateInfo: result?.updateInfo || null
      });
      return {
        success: true,
        updateInfo: result?.updateInfo || null
      };
    } catch (error) {
      logUpdaterError('Manual update check failed', error?.message || String(error));
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater-install-update', async () => {
    if (!app.isPackaged) {
      logUpdaterWarn('Install update rejected in development mode');
      return {
        success: false,
        error: 'Install update is only available in packaged builds.'
      };
    }

    try {
      logUpdaterInfo('Install update requested, app will quit and install');
      setImmediate(() => autoUpdater.quitAndInstall());
      return { success: true };
    } catch (error) {
      logUpdaterError('Install update failed', error?.message || String(error));
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backend-get-status', async () => {
    return {
      success: true,
      status: lastBackendStatus
    };
  });

  logUpdaterInfo('Updater IPC handlers registered', { logPath: getUpdaterLogPath() });
}

async function setupAutoUpdater(mainWindow) {
  if (updaterInitialized) return;
  updaterInitialized = true;
  mainWindowRef = mainWindow;

  const settings = await loadUpdaterSettings();
  const activeChannel = applyUpdaterChannel(settings.channel);

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  logUpdaterInfo('Auto updater initialized', {
    activeChannel,
    logPath: getUpdaterLogPath(),
    isPackaged: app.isPackaged
  });

  autoUpdater.on('checking-for-update', () => {
    logUpdaterInfo('Checking for update');
    sendUpdaterEvent({ type: 'checking-for-update' });
  });

  autoUpdater.on('update-available', (info) => {
    logUpdaterInfo('Update available', info);
    sendUpdaterEvent({ type: 'update-available', info });
  });

  autoUpdater.on('update-not-available', (info) => {
    logUpdaterInfo('Update not available', info);
    sendUpdaterEvent({ type: 'update-not-available', info });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    logUpdaterInfo('Update download progress', {
      percent: progressObj?.percent,
      transferred: progressObj?.transferred,
      total: progressObj?.total,
      bytesPerSecond: progressObj?.bytesPerSecond
    });
    sendUpdaterEvent({ type: 'download-progress', progress: progressObj });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logUpdaterInfo('Update downloaded', info);
    sendUpdaterEvent({ type: 'update-downloaded', info });
  });

  autoUpdater.on('error', (error) => {
    logUpdaterError('Updater error event', error?.message || String(error));
    sendUpdaterEvent({ type: 'error', message: error?.message || String(error) });
  });

  logUpdaterInfo('Update channel applied', { activeChannel });

  let backendCheckInFlight = false;
  const runBackendCheck = () => {
    if (backendCheckInFlight) return;
    backendCheckInFlight = true;

    let checkAndUpdateBackendBinary;
    try {
      ({ checkAndUpdateBackendBinary } = require('../utils/backendUpdater'));
    } catch (error) {
      logUpdaterWarn('Backend updater module unavailable; skipping backend check', error?.message || String(error));
      backendCheckInFlight = false;
      return;
    }

    logUpdaterInfo('Running backend binary update check');
    lastBackendStatus = { type: 'backend-checking-for-update', at: Date.now() };
    sendUpdaterEvent({ type: 'backend-checking-for-update' });

    checkAndUpdateBackendBinary({
      log: (message, meta) => logUpdaterInfo(`[BackendUpdater] ${message}`, meta)
    })
      .then((result) => {
        if (!result?.success) {
          const message = result?.error || 'Unknown backend updater failure';
          logUpdaterWarn('Backend binary update check failed', { message });
          lastBackendStatus = { type: 'backend-error', message, at: Date.now() };
          sendUpdaterEvent({ type: 'backend-error', message });
          return;
        }

        if (result.updated) {
          logUpdaterInfo('Backend binary updated successfully', result);
          lastBackendStatus = { type: 'backend-update-installed', info: result, at: Date.now() };
          sendUpdaterEvent({ type: 'backend-update-installed', info: result });
          return;
        }

        logUpdaterInfo('Backend binary already up to date', result);
        lastBackendStatus = { type: 'backend-update-not-available', info: result, at: Date.now() };
        sendUpdaterEvent({ type: 'backend-update-not-available', info: result });
      })
      .catch((error) => {
        const message = error?.message || String(error);
        logUpdaterWarn('Backend binary update check exception', message);
        lastBackendStatus = { type: 'backend-error', message, at: Date.now() };
        sendUpdaterEvent({ type: 'backend-error', message });
      })
      .finally(() => {
        backendCheckInFlight = false;
      });
  };

  // Backend binary checks should run on startup and periodically in all modes.
  runBackendCheck();

  const backendInterval = setInterval(() => {
    runBackendCheck();
  }, UPDATE_CHECK_INTERVAL_MS);

  if (typeof backendInterval.unref === 'function') {
    backendInterval.unref();
  }

  if (!app.isPackaged) {
    logUpdaterInfo('Skipping app updater check in development mode');
    logUpdaterInfo('Backend updater scheduled', {
      startup: 'immediate',
      intervalMs: UPDATE_CHECK_INTERVAL_MS
    });
    return;
  }

  const runUpdateCheck = () => {
    logUpdaterInfo('Running update check');
    autoUpdater.checkForUpdates().catch((error) => {
      logUpdaterWarn('Update check failed', error?.message || String(error));
    });
  };

  setTimeout(() => {
    runUpdateCheck();
  }, 5000);

  const appInterval = setInterval(() => {
    runUpdateCheck();
  }, UPDATE_CHECK_INTERVAL_MS);

  logUpdaterInfo('Updater schedules active', {
    backendStartup: 'immediate',
    backendIntervalMs: UPDATE_CHECK_INTERVAL_MS,
    appStartupDelayMs: 5000,
    intervalMs: UPDATE_CHECK_INTERVAL_MS
  });

  if (typeof appInterval.unref === 'function') {
    appInterval.unref();
  }
}

module.exports = {
  setupUpdaterHandlers,
  setupAutoUpdater
};
