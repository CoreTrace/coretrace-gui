const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const MODULE_PATH = path.join(__dirname, '../src/main/utils/ctraceServeClient.js');

// Load ctraceServeClient with `os.platform()` forced to a given value, so the
// macOS-only checks can be exercised from any host.
function loadWithPlatform(platform) {
  const osStub = Object.create(os);
  osStub.platform = () => platform;

  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'os') return osStub;
    return originalLoad.call(this, request, ...rest);
  };

  try {
    delete require.cache[require.resolve(MODULE_PATH)];
    return require(MODULE_PATH);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(MODULE_PATH)];
  }
}

function writeBinary(name, header) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrace-test-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(header));
  return file;
}

// 0x7f 'E' 'L' 'F' — Linux; 0xcffaedfe — 64-bit Mach-O, little endian.
const ELF_HEADER = [0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00];
const MACHO_HEADER = [0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01];

test('checkBinaryFormat rejects a Linux binary on macOS', () => {
  const { checkBinaryFormat } = loadWithPlatform('darwin');
  const file = writeBinary('ctrace', ELF_HEADER);

  const result = checkBinaryFormat(file);

  assert.equal(result.ok, false);
  assert.match(result.error, /Linux executable and cannot run on macOS/);
  assert.match(result.error, /Backend Settings/);
});

test('checkBinaryFormat accepts a Mach-O binary on macOS', () => {
  const { checkBinaryFormat } = loadWithPlatform('darwin');
  const file = writeBinary('ctrace-darwin-arm64', MACHO_HEADER);

  assert.deepEqual(checkBinaryFormat(file), { ok: true });
});

test('checkBinaryFormat reports an unreadable binary on macOS', () => {
  const { checkBinaryFormat } = loadWithPlatform('darwin');

  const result = checkBinaryFormat(path.join(os.tmpdir(), 'does-not-exist-ctrace'));

  assert.equal(result.ok, false);
  assert.match(result.error, /Cannot read the ctrace binary/);
});

test('checkBinaryFormat leaves other platforms alone', () => {
  const { checkBinaryFormat } = loadWithPlatform('linux');
  const file = writeBinary('ctrace', ELF_HEADER);

  assert.deepEqual(checkBinaryFormat(file), { ok: true });
  // Not even read: a missing file is fine off macOS.
  assert.deepEqual(checkBinaryFormat('/nope'), { ok: true });
});
