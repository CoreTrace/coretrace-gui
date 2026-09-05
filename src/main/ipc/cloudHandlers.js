/**
 * IPC surface of the "Run in cloud" integration (contracts/gui-integration.md).
 * The main process owns credentials, network and files; the renderer only sees
 * the results of these calls and the `cloud-run-event` stream.
 */
const { ipcMain, safeStorage, app, net, shell } = require('electron');
const path = require('path');
const { loadBackendSettings } = require('./backendSettingsHandlers');
const { CloudClient, cloudConfigDir } = require('../cloud/cloudClient');
const { CloudRun } = require('../cloud/cloudRun');
const { createSafeStorageStore } = require('../cloud/safeStorageStore');

function isOnline() {
  try {
    return typeof net.isOnline === 'function' ? net.isOnline() : true;
  } catch {
    return true;
  }
}

function setupCloudHandlers(mainWindow, overrides = {}) {
  const userData = app.getPath('userData');
  const cloud = overrides.cloud || new CloudClient({
    loadSettings: loadBackendSettings,
    store: createSafeStorageStore({ safeStorage, userDataDir: userData }),
    configDir: cloudConfigDir(userData),
    log: (line) => console.warn('[cloud]', line),
  });
  const emit = (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('cloud-run-event', event);
  };
  const runs = overrides.runs || new CloudRun({ cloud, emit });

  const wrap = (fn) => async (_event, ...args) => {
    try {
      return { success: true, ...(await fn(...args)) };
    } catch (err) {
      return { success: false, error: String(err && err.message ? err.message : err), code: typeof err.code === 'number' ? err.code : 4 };
    }
  };

  ipcMain.handle('cloud-status', wrap(async () => ({ status: await cloud.status(isOnline()) })));
  ipcMain.handle('cloud-login-start', wrap(async () => {
    const identity = await cloud.loginStart((s) => emit({ type: 'login', state: 'pending', userCode: s.user_code, verificationUri: s.verification_uri, expiresIn: s.expires_in }));
    emit({ type: 'login', state: 'approved', identity });
    return { identity };
  }));
  ipcMain.handle('cloud-login-cancel', wrap(async () => {
    cloud.loginCancel();
    return {};
  }));
  ipcMain.handle('cloud-logout', wrap(async () => ({ result: await cloud.logout() })));
  ipcMain.handle('cloud-tools', wrap(async () => {
    const { upgradeUrl } = await cloud.settings();
    return { tools: await cloud.tools(), upgradeUrl };
  }));
  ipcMain.handle('cloud-limits', wrap(async () => ({ limits: await cloud.limits() })));
  ipcMain.handle('cloud-run-start', wrap(async (opts) => {
    if (!opts || typeof opts.rootPath !== 'string' || !path.isAbsolute(opts.rootPath)) throw new Error('rootPath must be an absolute path');
    if (!Array.isArray(opts.tools) || opts.tools.length === 0) throw new Error('select at least one tool');
    return runs.start(opts);
  }));
  ipcMain.handle('cloud-run-confirm', wrap(async ({ runId, accept }) => runs.confirm(String(runId), Boolean(accept))));
  ipcMain.handle('cloud-run-cancel', wrap(async ({ runId }) => runs.cancel(String(runId))));
  ipcMain.handle('cloud-open-upgrade', wrap(async () => {
    const { upgradeUrl } = await cloud.settings();
    if (/^https:\/\//.test(upgradeUrl)) await shell.openExternal(upgradeUrl);
    return {};
  }));
  ipcMain.handle('cloud-open-url', wrap(async (url) => {
    const { baseUrl } = await cloud.settings();
    // Only the platform's own verification address may be opened from here.
    if (typeof url === 'string' && url.startsWith(baseUrl)) await shell.openExternal(url);
    return {};
  }));
  return { cloud, runs };
}

module.exports = { setupCloudHandlers };
