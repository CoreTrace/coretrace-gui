/**
 * @fileoverview IPC handlers for data the sandboxed preload cannot read itself.
 *
 * With `sandbox: true` the preload script has no filesystem or clipboard
 * access, so the few pieces of static app data it used to read directly are
 * served from here instead.
 */

const { ipcMain, clipboard } = require('electron');
const fs = require('fs').promises;
const path = require('path');

const CLIPBOARD_MAX_CHARS = 1024 * 1024;

let appInfoPromise = null;
let syntaxConfigPromise = null;

function loadAppInfo() {
  if (!appInfoPromise) {
    appInfoPromise = fs.readFile(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')
      .then((raw) => JSON.parse(raw))
      .then((packageJson) => ({
        name: packageJson.productName || packageJson.name || 'CTraceGUI',
        version: packageJson.version || '0.0.0'
      }))
      .catch((error) => {
        console.warn('[AppInfo] Failed to load package.json:', error);
        return { name: 'CTraceGUI', version: '0.0.0' };
      });
  }
  return appInfoPromise;
}

function loadSyntaxConfig() {
  if (!syntaxConfigPromise) {
    syntaxConfigPromise = fs.readFile(path.join(__dirname, '..', '..', 'renderer', 'utils', 'syntax-config.json'), 'utf-8')
      .then((raw) => JSON.parse(raw))
      .catch((error) => {
        console.warn('[AppInfo] Failed to load syntax-config.json:', error);
        return {};
      });
  }
  return syntaxConfigPromise;
}

function setupAppInfoHandlers() {
  ipcMain.handle('app-get-info', () => loadAppInfo());
  ipcMain.handle('app-get-syntax-config', () => loadSyntaxConfig());

  ipcMain.on('clipboard-write-text', (_event, text) => {
    if (typeof text !== 'string') return;
    clipboard.writeText(text.slice(0, CLIPBOARD_MAX_CHARS));
  });
}

module.exports = { setupAppInfoHandlers };
