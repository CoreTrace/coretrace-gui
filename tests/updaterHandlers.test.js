const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

function withModuleMocks(mocks, callback) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    return callback();
  } finally {
    Module._load = originalLoad;
  }
}

test('updater handlers load/save channel and gate checks in dev mode', async (t) => {
  const handlers = new Map();
  const readFileMock = t.mock.fn(async () => JSON.stringify({ channel: 'beta' }));
  const writeFileMock = t.mock.fn(async () => {});
  const appendFileMock = t.mock.fn(async () => {});

  const autoUpdaterStub = {
    allowPrerelease: false,
    channel: 'latest',
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: t.mock.fn(),
    checkForUpdates: t.mock.fn(async () => ({ updateInfo: null })),
    quitAndInstall: t.mock.fn()
  };

  const electronStub = {
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler)
    },
    app: {
      isPackaged: false,
      getPath: () => '/tmp/test-user-data'
    }
  };

  const modulePath = path.join(__dirname, '../src/main/ipc/updaterHandlers.js');
  const { setupUpdaterHandlers } = withModuleMocks({
    electron: electronStub,
    'electron-updater': { autoUpdater: autoUpdaterStub },
    fs: {
      promises: {
        readFile: (...args) => readFileMock(...args),
        writeFile: (...args) => writeFileMock(...args),
        appendFile: (...args) => appendFileMock(...args)
      }
    }
  }, () => {
    delete require.cache[modulePath];
    return require(modulePath);
  });

  setupUpdaterHandlers({ isDestroyed: () => false, webContents: { send: () => {} } });

  const getSettings = await handlers.get('updater-get-settings')();
  assert.equal(getSettings.success, true);
  assert.equal(getSettings.settings.channel, 'beta');
  assert.equal(autoUpdaterStub.allowPrerelease, true);
  assert.equal(autoUpdaterStub.channel, 'beta');

  const setChannel = await handlers.get('updater-set-channel')(null, 'main');
  assert.equal(setChannel.success, true);
  assert.equal(setChannel.settings.channel, 'main');
  assert.equal(autoUpdaterStub.allowPrerelease, false);
  assert.equal(autoUpdaterStub.channel, 'latest');
  assert.equal(writeFileMock.mock.calls.length > 0, true);

  const checkNow = await handlers.get('updater-check-now')();
  assert.equal(checkNow.success, false);
  assert.match(checkNow.error, /packaged builds/i);
});

test('setupAutoUpdater runs initial check when packaged', async (t) => {
  const autoUpdaterStub = {
    allowPrerelease: false,
    channel: 'latest',
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: t.mock.fn(),
    checkForUpdates: t.mock.fn(async () => ({ updateInfo: { version: '1.0.1' } })),
    quitAndInstall: t.mock.fn()
  };

  const electronStub = {
    ipcMain: {
      handle: () => {}
    },
    app: {
      isPackaged: true,
      getPath: () => '/tmp/test-user-data'
    }
  };

  const timeoutMock = t.mock.method(global, 'setTimeout', (fn) => {
    fn();
    return 0;
  });

  const modulePath = path.join(__dirname, '../src/main/ipc/updaterHandlers.js');
  const { setupAutoUpdater } = withModuleMocks({
    electron: electronStub,
    'electron-updater': { autoUpdater: autoUpdaterStub },
    fs: {
      promises: {
        readFile: async () => JSON.stringify({ channel: 'main' }),
        writeFile: async () => {},
        appendFile: async () => {}
      }
    }
  }, () => {
    delete require.cache[modulePath];
    return require(modulePath);
  });

  await setupAutoUpdater({ isDestroyed: () => false, webContents: { send: () => {} } });
  assert.equal(autoUpdaterStub.checkForUpdates.mock.calls.length, 1);

  timeoutMock.mock.restore();
});

test('setupAutoUpdater emits backend release tag when backend check uses cached data', async () => {
  const sentEvents = [];
  const backendUpdaterPath = path.join(__dirname, '../src/main/utils/backendUpdater.js');

  const autoUpdaterStub = {
    allowPrerelease: false,
    channel: 'latest',
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: () => {},
    checkForUpdates: async () => ({ updateInfo: null }),
    quitAndInstall: () => {}
  };

  const electronStub = {
    ipcMain: {
      handle: () => {}
    },
    app: {
      isPackaged: false,
      getPath: () => '/tmp/test-user-data'
    }
  };

  require.cache[backendUpdaterPath] = {
    id: backendUpdaterPath,
    filename: backendUpdaterPath,
    loaded: true,
    exports: {
      checkAndUpdateBackendBinary: async () => ({
        success: true,
        updated: false,
        releaseTag: 'v1.2.3',
        stale: true,
        reason: 'cached'
      })
    }
  };

  const modulePath = path.join(__dirname, '../src/main/ipc/updaterHandlers.js');
  const { setupAutoUpdater } = withModuleMocks({
    electron: electronStub,
    'electron-updater': { autoUpdater: autoUpdaterStub },
    fs: {
      promises: {
        readFile: async () => JSON.stringify({ channel: 'main' }),
        writeFile: async () => {},
        appendFile: async () => {}
      }
    },
  }, () => {
    delete require.cache[modulePath];
    return require(modulePath);
  });

  await setupAutoUpdater({
    isDestroyed: () => false,
    webContents: {
      send: (_channel, payload) => {
        sentEvents.push(payload);
      }
    }
  });

  await new Promise((resolve) => setImmediate(resolve));

  const backendResultEvent = sentEvents.find((event) => event && event.type === 'backend-update-not-available');
  assert.ok(backendResultEvent);
  assert.equal(backendResultEvent.info.releaseTag, 'v1.2.3');

  delete require.cache[backendUpdaterPath];
});
