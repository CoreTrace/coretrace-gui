/**
 * Preload script: the only bridge between the sandboxed renderer and the
 * main process. It runs with `sandbox: true`, so it has no Node.js modules;
 * every capability it exposes is a narrow, allow-listed IPC call.
 */
const { contextBridge, ipcRenderer } = require('electron');

function getAdditionalArgumentValue(prefix) {
  const arg = process.argv.find((entry) => typeof entry === 'string' && entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

const monacoBasePath = getAdditionalArgumentValue('--ctrace-monaco-base-path=') || '';

let appInfoPromise = null;
let syntaxConfigPromise = null;

function loadAppInfo() {
  if (!appInfoPromise) {
    appInfoPromise = ipcRenderer.invoke('app-get-info')
      .catch(() => ({ name: 'CTraceGUI', version: '0.0.0' }));
  }
  return appInfoPromise;
}

function loadSyntaxConfig() {
  if (!syntaxConfigPromise) {
    syntaxConfigPromise = ipcRenderer.invoke('app-get-syntax-config').catch(() => ({}));
  }
  return syntaxConfigPromise;
}

// Whitelisted IPC channels
const INVOKE_CHANNELS = [
  'get-file-tree',
  'open-folder-dialog',
  'open-file-dialog',
  'save-file',
  'save-file-as',
  'read-file',
  'read-large-file',
  'read-file-chunk',
  'force-open-file',
  'force-load-full-file',
  'get-directory-contents',
  'get-git-status',
  'search-in-files',
  'create-file',
  'create-folder',
  'rename-path',
  'delete-path',
  'run-ctrace',
  'open-editor',
  'assistant-chat',
  'assistant-abort',
  'assistant-get-providers',
  'assistant-test-provider',
  'assistant-unload-local',
  'assistant-list-models',
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
  'check-file-exists',
  'backend-get-settings',
  'backend-save-settings',
  'backend-browse-binary',
  'assistant-config-save',
  'assistant-config-load',
  'assistant-config-clear',
  'assistant-conversations-save',
  'assistant-conversations-list',
  'assistant-conversations-load',
  'assistant-conversations-delete',
  'watch-workspace',
  'terminal-get-shells',
  'terminal-execute',
  'terminal-kill-current',
  'terminal-get-home',
  'terminal-get-completions',
  'terminal-get-initial-cwd',
  'terminal-send-input',
  'app-get-info',
  'app-get-syntax-config',
  'cloud-status',
  'cloud-login-start',
  'cloud-login-cancel',
  'cloud-logout',
  'cloud-tools',
  'cloud-limits',
  'cloud-run-start',
  'cloud-run-confirm',
  'cloud-run-cancel',
  'cloud-open-upgrade',
  'cloud-open-url',
];

const SEND_CHANNELS = [
  'window-minimize',
  'window-maximize-toggle',
  'window-close',
  'startup-ready',
  'check-wsl-status',
  'install-wsl',
  'install-wsl-distro',
  'show-wsl-setup',
  'assistant-config-updated',
  'clipboard-write-text',
];

const RECEIVE_CHANNELS = [
  'workspace-changed',
  'workspace-loading',
  'wsl-status',
  'wsl-install-response',
  'updater-status',
  'window-maximized',
  'app-before-quit',
  'terminal-data',
  'terminal-command-done',
  'cloud-run-event',
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
    writeText: (text) => ipcRenderer.send('clipboard-write-text', String(text)),
  },

  platform: process.platform,
  getRuntimeInfo: () => ({
    platform: process.platform,
    hardwareAcceleration: getAdditionalArgumentValue('--ctrace-hardware-acceleration=') || 'unknown',
    pid: process.pid
  }),

  getAppInfo: () => loadAppInfo(),
  getSyntaxConfig: () => loadSyntaxConfig(),
  getMonacoBasePath: () => monacoBasePath,
});


