const { contextBridge, ipcRenderer, clipboard } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let appInfoPromise = null;
let syntaxConfigPromise = null;

function loadAppInfo() {
  if (!appInfoPromise) {
    appInfoPromise = fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf-8')
      .then((raw) => JSON.parse(raw))
      .then((packageJson) => ({
        name: packageJson.productName || packageJson.name || 'CTraceGUI',
        version: packageJson.version || '0.0.0',
      }))
      .catch((error) => {
        console.warn('Failed to load package.json in preload:', error);
        return { name: 'CTraceGUI', version: '0.0.0' };
      });
  }

  return appInfoPromise;
}

function loadSyntaxConfig() {
  if (!syntaxConfigPromise) {
    syntaxConfigPromise = fs.readFile(path.join(__dirname, 'renderer', 'utils', 'syntax-config.json'), 'utf-8')
      .then((raw) => JSON.parse(raw))
      .catch((error) => {
        console.warn('Failed to load syntax-config.json in preload:', error);
        return {};
      });
  }

  return syntaxConfigPromise;
}

const monacoBasePath = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs').replace(/\\/g, '/');

// Whitelisted IPC channels
const INVOKE_CHANNELS = [
  'get-file-tree',
  'open-folder-dialog',
  'open-file-dialog',
  'save-file',
  'save-file-as',
  'read-file',
  'force-open-file',
  'force-load-full-file',
  'get-directory-contents',
  'search-in-files',
  'create-file',
  'create-folder',
  'rename-path',
  'delete-path',
  'run-ctrace',
  'open-editor',
  'assistant-chat',
  'assistant-get-providers',
  'assistant-test-provider',
  'assistant-unload-local',
  'select-llm-file',
  'save-app-state',
  'load-app-state',
  'clear-app-state',
  'get-state-info',
  'updater-get-settings',
  'updater-check-now',
  'updater-set-channel',
  'updater-install-update',
  'backend-get-status',
  'watch-workspace',
];

const SEND_CHANNELS = [
  'window-minimize',
  'window-maximize-toggle',
  'window-close',
  'open-visualyzer',
  'startup-ready',
  'check-wsl-status',
  'install-wsl',
  'install-wsl-distro',
  'show-wsl-setup',
  'assistant-config-updated',
];

const RECEIVE_CHANNELS = [
  'workspace-changed',
  'workspace-loading',
  'wsl-status',
  'wsl-install-response',
  'updater-status',
  'window-maximized',
  'app-before-quit',
];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    console.error(`IPC invoke channel "${channel}" is not allowed`);
    return Promise.reject(new Error(`IPC invoke channel "${channel}" is not allowed`));
  },

  send: (channel, ...args) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.error(`IPC send channel "${channel}" is not allowed`);
    }
  },

  on: (channel, callback) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return subscription;
    }
    console.error(`IPC receive channel "${channel}" is not allowed`);
  },

  removeListener: (channel, subscription) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeListener(channel, subscription);
    }
  },

  clipboard: {
    writeText: (text) => clipboard.writeText(text),
  },

  platform: process.platform,

  getAppInfo: () => loadAppInfo(),
  getSyntaxConfig: () => loadSyntaxConfig(),
  getMonacoBasePath: () => monacoBasePath,
});


