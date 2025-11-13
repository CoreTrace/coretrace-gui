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

test('open-editor uses platform specific commands', async (t) => {
  const handlers = new Map();
  const electronStub = {
    ipcMain: {
      on: (channel, listener) => handlers.set(channel, listener)
    }
  };

  const execStub = t.mock.fn((command, cb) => cb && cb(null));

  const modulePath = path.join(__dirname, '../src/main/ipc/editorHandlers.js');
  const { setupEditorHandlers } = withModuleMocks({
    electron: electronStub,
    'child_process': { exec: (...args) => execStub(...args) }
  }, () => {
    delete require.cache[modulePath];
    return require(modulePath);
  });

  const originalPlatform = process.platform;

  setupEditorHandlers();
  assert.ok(handlers.has('open-editor'));

  const listener = handlers.get('open-editor');

  Object.defineProperty(process, 'platform', { value: 'linux' });
  listener();
  assert.strictEqual(execStub.mock.calls.at(-1).arguments[0], 'x-terminal-emulator -e nano');

  Object.defineProperty(process, 'platform', { value: 'darwin' });
  listener();
  assert.strictEqual(execStub.mock.calls.at(-1).arguments[0], 'open -a TextEdit');

  Object.defineProperty(process, 'platform', { value: 'win32' });
  listener();
  assert.strictEqual(execStub.mock.calls.at(-1).arguments[0], 'notepad');

  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

