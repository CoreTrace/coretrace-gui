const { ipcMain, app, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'backend-settings.json');
}

async function loadBackendSettings() {
  try {
    const raw = await fs.readFile(getSettingsPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveBackendSettings(settings) {
  await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function setupBackendSettingsHandlers(mainWindow) {
  ipcMain.handle('backend-get-settings', async () => {
    try {
      const settings = await loadBackendSettings();
      return { success: true, settings };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('backend-save-settings', async (_event, settings) => {
    try {
      await saveBackendSettings(settings);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('backend-browse-binary', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    // macOS and Linux executables carry no extension, so only Windows gets an
    // .exe filter — elsewhere it would hide the very file the user is after.
    const filters = process.platform === 'win32'
      ? [{ name: 'Executable', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'All Files', extensions: ['*'] }];

    const opts = {
      title: process.platform === 'win32' ? 'Locate ctrace.exe' : 'Locate the ctrace binary',
      filters,
      properties: ['openFile']
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, filePath: result.filePaths[0] };
  });
}

module.exports = { setupBackendSettingsHandlers, loadBackendSettings };
