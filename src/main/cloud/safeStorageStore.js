/**
 * Credential store for the cloud client backed by Electron's safeStorage.
 * Implements the CredentialStore interface of @coretrace/cli-core: the refresh
 * token travels encrypted at rest in userData/cloud-credentials.json and is
 * never exposed to the renderer.
 */
const fs = require('fs').promises;
const path = require('path');

function createSafeStorageStore({ safeStorage, userDataDir }) {
  const file = path.join(userDataDir, 'cloud-credentials.json');

  async function read() {
    try {
      const doc = JSON.parse(await fs.readFile(file, 'utf8'));
      return doc && typeof doc === 'object' && doc.profiles ? doc : { v: 1, profiles: {} };
    } catch {
      return { v: 1, profiles: {} };
    }
  }

  async function write(doc) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(doc), { mode: 0o600 });
    await fs.rename(tmp, file);
  }

  return {
    kind: 'safe_storage',
    async available() {
      try {
        return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
      } catch {
        return false;
      }
    },
    async load(profile) {
      const doc = await read();
      const entry = doc.profiles[profile];
      if (!entry) return undefined;
      try {
        const plain = safeStorage.decryptString(Buffer.from(entry, 'base64'));
        const session = JSON.parse(plain);
        return typeof session.refreshToken === 'string' ? session : undefined;
      } catch {
        return undefined;
      }
    },
    async save(profile, session) {
      const doc = await read();
      doc.profiles[profile] = safeStorage.encryptString(JSON.stringify(session)).toString('base64');
      await write(doc);
    },
    async remove(profile) {
      const doc = await read();
      if (!doc.profiles[profile]) return false;
      delete doc.profiles[profile];
      if (Object.keys(doc.profiles).length === 0) await fs.rm(file, { force: true });
      else await write(doc);
      return true;
    },
  };
}

module.exports = { createSafeStorageStore };
