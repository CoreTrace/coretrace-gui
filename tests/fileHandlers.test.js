const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fsPromises = require('node:fs/promises');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

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

test('open-folder-dialog handler returns tree and starts watcher', async (t) => {
  const handlers = new Map();
  const recorded = { watchCalls: 0 };
  const mainWindow = {
    webContents: {
      send: t.mock.fn()
    }
  };

  const electronStub = {
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: () => {}
    },
    dialog: {
      showOpenDialog: () => Promise.resolve({ canceled: false, filePaths: ['/workspace/project'] }),
      showSaveDialog: () => Promise.resolve({ canceled: false, filePath: '/workspace/save.txt' })
    }
  };

  const fileUtilsStub = {
    buildFileTree: async (folderPath) => [{ name: 'file.txt', path: `${folderPath}/file.txt`, type: 'file' }],
    detectFileEncoding: async () => ({ isUTF8: true, size: 10, buffer: Buffer.from('hello world') }),
    searchInDirectory: async () => [{ file: '/workspace/project/file.txt', content: 'match' }],
    FILE_SIZE_LIMIT: 5
  };

  const chokidarStub = {
    watch: () => {
      recorded.watchCalls++;
      const emitter = new EventEmitter();
      emitter.on = function (event, listener) {
        EventEmitter.prototype.on.call(this, event, listener);
        return this;
      };
      emitter.close = () => { emitter.closed = true; };
      return emitter;
    }
  };

  const modulePath = path.join(__dirname, '../src/main/ipc/fileHandlers.js');
  const mocks = {
    electron: electronStub,
    chokidar: chokidarStub,
    '../utils/fileUtils': fileUtilsStub
  };

  const writeFileMock = t.mock.method(fsPromises, 'writeFile', async () => {});

  const { setupFileHandlers } = withModuleMocks(mocks, () => {
    delete require.cache[modulePath];
    return require(modulePath);
  });

  setupFileHandlers(mainWindow);
  assert.ok(handlers.has('open-folder-dialog'));

  const response = await handlers.get('open-folder-dialog')();
  assert.deepStrictEqual(response, {
    success: true,
    folderPath: '/workspace/project',
    fileTree: [{ name: 'file.txt', path: '/workspace/project/file.txt', type: 'file' }]
  });
  assert.strictEqual(recorded.watchCalls, 1);

  const saveResponse = await handlers.get('save-file')(null, '/workspace/project/file.txt', 'updated');
  assert.deepStrictEqual(saveResponse, { success: true });
  assert.strictEqual(writeFileMock.mock.calls.length > 0, true);

  const searchResponse = await handlers.get('search-in-files')(null, 'match', '/workspace/project');
  assert.deepStrictEqual(searchResponse, { success: true, results: [{ file: '/workspace/project/file.txt', content: 'match' }] });
});

test('open-file-dialog returns encoding warning when detectFileEncoding rejects UTF-8', async (t) => {
  const handlers = new Map();
  const electronStub = {
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: () => {}
    },
    dialog: {
      showOpenDialog: () => Promise.resolve({ canceled: false, filePaths: ['/workspace/warn.bin'] }),
      showSaveDialog: () => Promise.resolve({ canceled: true })
    }
  };

  const fileUtilsStub = {
    buildFileTree: async () => [],
    detectFileEncoding: async () => ({ isUTF8: false, size: 20, buffer: Buffer.alloc(0) }),
    searchInDirectory: async () => [],
    FILE_SIZE_LIMIT: 5
  };

  const modulePath = path.join(__dirname, '../src/main/ipc/fileHandlers.js');

  const { setupFileHandlers } = withModuleMocks({
    electron: electronStub,
    chokidar: { watch: () => new EventEmitter() },
    '../utils/fileUtils': fileUtilsStub
  }, () => {
    delete require.cache[modulePath];
    return require(modulePath);
  });

  setupFileHandlers({ webContents: { send: () => {} } });
  const response = await handlers.get('open-file-dialog')();
  assert.strictEqual(response.warning, 'encoding');
  assert.strictEqual(response.success, true);
});

