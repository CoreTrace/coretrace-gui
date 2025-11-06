const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
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

function createChildProcess({ stdout = '', stderr = '', code = 0, error = null }) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };

  process.nextTick(() => {
    if (error) {
      child.emit('error', error instanceof Error ? error : new Error(error));
      return;
    }
    if (stdout) {
      child.stdout.emit('data', Buffer.from(stdout));
    }
    if (stderr) {
      child.stderr.emit('data', Buffer.from(stderr));
    }
    child.emit('close', code);
  });

  return child;
}

test('run-ctrace handler reports missing binary when access fails', async (t) => {
  const handlers = new Map();
  const electronStub = {
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler)
    }
  };

  const spawnStub = t.mock.fn(() => createChildProcess({ code: 0 }));

  const { setupCtraceHandlers } = withModuleMocks({
    electron: electronStub,
    'child_process': { spawn: (...args) => spawnStub(...args) }
  }, () => {
    const modulePath = path.join(__dirname, '../src/main/ipc/ctraceHandlers.js');
    delete require.cache[modulePath];
    return require(modulePath);
  });

  const accessMock = t.mock.method(fsPromises, 'access', async () => {
    throw new Error('not found');
  });

  const platformMock = t.mock.method(os, 'platform', () => 'linux');

  setupCtraceHandlers();
  const response = await handlers.get('run-ctrace')(null, []);

  assert.strictEqual(response.success, false);
  assert.ok(response.error.includes('ctrace binary not found'));
  assert.strictEqual(spawnStub.mock.calls.length, 0);

  accessMock.mock.restore();
  platformMock.mock.restore();
});

test('run-ctrace handler executes binary and returns output', async (t) => {
  const handlers = new Map();
  const electronStub = {
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler)
    }
  };

  const spawnStub = t.mock.fn(() => createChildProcess({ stdout: 'analysis complete', code: 0 }));

  const { setupCtraceHandlers } = withModuleMocks({
    electron: electronStub,
    'child_process': { spawn: (...args) => spawnStub(...args) }
  }, () => {
    const modulePath = path.join(__dirname, '../src/main/ipc/ctraceHandlers.js');
    delete require.cache[modulePath];
    return require(modulePath);
  });

  const accessMock = t.mock.method(fsPromises, 'access', async () => {});
  const platformMock = t.mock.method(os, 'platform', () => 'linux');

  setupCtraceHandlers();
  const response = await handlers.get('run-ctrace')(null, ['--version']);

  assert.deepStrictEqual(response, { success: true, output: 'analysis complete', exitCode: 0 });
  assert.ok(spawnStub.mock.calls.length >= 1);
  const firstCall = spawnStub.mock.calls[0].arguments;
  assert.ok(firstCall[0].includes('bin/ctrace'));

  accessMock.mock.restore();
  platformMock.mock.restore();
});

