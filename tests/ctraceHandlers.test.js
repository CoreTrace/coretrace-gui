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

  const serveClientStub = {
    ensureServerRunning: t.mock.fn(async () => ({ host: '127.0.0.1', port: 8080, token: 't' })),
    callApi: t.mock.fn(async () => ({ ok: true, json: { result: {} }, statusCode: 200 })),
    shutdownServer: t.mock.fn(async () => ({ success: true })),
    resolveBinaryPath: () => '/fake/bin/ctrace'
  };

  const { setupCtraceHandlers } = withModuleMocks({
    electron: electronStub,
    '../utils/ctraceServeClient': serveClientStub
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
  assert.strictEqual(serveClientStub.ensureServerRunning.mock.calls.length, 0);

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

  const serveClientStub = {
    ensureServerRunning: t.mock.fn(async () => ({ host: '127.0.0.1', port: 8080, token: 't' })),
    callApi: t.mock.fn(async () => ({ ok: true, json: { result: { meta: { tool: 'ctrace' }, diagnostics: [] } }, statusCode: 200 })),
    shutdownServer: t.mock.fn(async () => ({ success: true })),
    resolveBinaryPath: () => '/fake/bin/ctrace'
  };

  const { setupCtraceHandlers } = withModuleMocks({
    electron: electronStub,
    '../utils/ctraceServeClient': serveClientStub
  }, () => {
    const modulePath = path.join(__dirname, '../src/main/ipc/ctraceHandlers.js');
    delete require.cache[modulePath];
    return require(modulePath);
  });

  const accessMock = t.mock.method(fsPromises, 'access', async () => {});
  const platformMock = t.mock.method(os, 'platform', () => 'linux');

  setupCtraceHandlers();
  const response = await handlers.get('run-ctrace')(null, ['--version']);

  assert.strictEqual(response.success, true);
  assert.ok(typeof response.output === 'string');
  assert.ok(response.output.includes('"diagnostics"'));
  assert.strictEqual(serveClientStub.ensureServerRunning.mock.calls.length, 1);
  assert.strictEqual(serveClientStub.callApi.mock.calls.length, 1);

  accessMock.mock.restore();
  platformMock.mock.restore();
});

test('run-ctrace handler flattens result.outputs stack analyzer JSON', async (t) => {
  const handlers = new Map();
  const electronStub = {
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler)
    }
  };

  const serveClientStub = {
    ensureServerRunning: t.mock.fn(async () => ({ host: '127.0.0.1', port: 8080, token: 't' })),
    callApi: t.mock.fn(async () => ({
      ok: true,
      statusCode: 200,
      json: {
        result: {
          sarif_format: true,
          invoked_tools: ['ctrace_stack_analyzer'],
          outputs: {
            ctrace_stack_analyzer: [
              {
                stream: 'stdout',
                message: {
                  meta: { tool: 'ctrace-stack-analyzer', inputFile: 'x.c', mode: 'IR', stackLimit: 123, analysisTimeMs: -1 },
                  functions: [],
                  diagnostics: [
                    {
                      id: '1',
                      ruleId: 'StackPointerEscape',
                      severity: 'WARNING',
                      location: { file: 'x.c', function: 'main', startLine: 10, startColumn: 1, endLine: 10, endColumn: 1 },
                      details: { message: 'escape' }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    })),
    shutdownServer: t.mock.fn(async () => ({ success: true })),
    resolveBinaryPath: () => '/fake/bin/ctrace'
  };

  const { setupCtraceHandlers } = withModuleMocks({
    electron: electronStub,
    '../utils/ctraceServeClient': serveClientStub
  }, () => {
    const modulePath = path.join(__dirname, '../src/main/ipc/ctraceHandlers.js');
    delete require.cache[modulePath];
    return require(modulePath);
  });

  const accessMock = t.mock.method(fsPromises, 'access', async () => {});
  const platformMock = t.mock.method(os, 'platform', () => 'linux');

  setupCtraceHandlers();
  const response = await handlers.get('run-ctrace')(null, ['--invoke', 'ctrace_stack_analyzer', '--sarif-format']);

  assert.strictEqual(response.success, true);
  const parsed = JSON.parse(response.output);
  assert.strictEqual(parsed.meta.tool, 'ctrace-stack-analyzer');
  assert.ok(Array.isArray(parsed.diagnostics));
  assert.strictEqual(parsed.diagnostics.length, 1);
  assert.strictEqual(parsed.diagnostics[0].ruleId, 'StackPointerEscape');

  accessMock.mock.restore();
  platformMock.mock.restore();
});

