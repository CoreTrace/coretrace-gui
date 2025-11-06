const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');

function loadModule() {
  const modulePath = path.join(__dirname, '../src/main/utils/wslTest.js');
  delete require.cache[modulePath];
  return require(modulePath);
}

function createChild(result) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };

  process.nextTick(() => {
    if (result.stdout) {
      child.stdout.emit('data', Buffer.from(result.stdout));
    }
    if (result.stderr) {
      child.stderr.emit('data', Buffer.from(result.stderr));
    }
    if (result.error) {
      child.emit('error', new Error(result.error));
    } else {
      child.emit('close', result.code ?? 0);
    }
  });

  return child;
}

test('testWSLAndCTrace resolves immediately on non-Windows platforms', async (t) => {
  const platformMock = t.mock.method(os, 'platform', () => 'linux');
  const spawnMock = t.mock.method(childProcess, 'spawn');
  const { testWSLAndCTrace } = loadModule();

  const result = await testWSLAndCTrace();
  assert.strictEqual(result, true);
  assert.strictEqual(spawnMock.mock.calls.length, 0);

  platformMock.mock.restore();
  spawnMock.mock.restore();
});

test('testWSLAndCTrace completes checks on Windows when commands succeed', async (t) => {
  const platformMock = t.mock.method(os, 'platform', () => 'win32');
  const spawnSequence = [
    { code: 0 },
    { stdout: 'ctrace help', code: 0 }
  ];
  const spawnMock = t.mock.method(childProcess, 'spawn', () => {
    const next = spawnSequence.shift();
    return createChild(next || {});
  });

  const { testWSLAndCTrace } = loadModule();
  const result = await testWSLAndCTrace();

  assert.strictEqual(result, true);
  assert.strictEqual(spawnMock.mock.calls.length, 2);
  assert.deepStrictEqual(spawnMock.mock.calls[0].arguments.slice(0, 2), ['wsl', ['--status']]);
  assert.deepStrictEqual(spawnMock.mock.calls[1].arguments[0], 'wsl');

  platformMock.mock.restore();
  spawnMock.mock.restore();
});

