const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSafeStorageStore } = require('../src/main/cloud/safeStorageStore');

function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`),
    decryptString: (b) => Buffer.from(b.toString().replace(/^enc:/, ''), 'base64').toString(),
  };
}

test('safeStorage store round trip, removal and unavailability', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-'));
  const store = createSafeStorageStore({ safeStorage: fakeSafeStorage(), userDataDir: dir });
  assert.equal(store.kind, 'safe_storage');
  assert.equal(await store.available(), true);
  assert.equal(await store.load('p'), undefined);
  const session = { baseUrl: 'https://api', profile: 'p', refreshToken: 'rt_secret_1234567890', savedAt: 'now' };
  await store.save('p', session);
  const raw = fs.readFileSync(path.join(dir, 'cloud-credentials.json'), 'utf8');
  assert.ok(!raw.includes('rt_secret'));
  assert.deepEqual(await store.load('p'), session);
  assert.equal(await store.remove('p'), true);
  assert.equal(await store.remove('p'), false);
  assert.equal(fs.existsSync(path.join(dir, 'cloud-credentials.json')), false);
  const off = createSafeStorageStore({ safeStorage: fakeSafeStorage(false), userDataDir: dir });
  assert.equal(await off.available(), false);
});
