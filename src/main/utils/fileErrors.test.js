'use strict';
/**
 * Integration tests for file-error paths in fileUtils.js.
 * Run with: node src/main/utils/fileErrors.test.js
 *
 * Triggers real OS errors and asserts the formatted message contains both
 * the error code AND the relevant hint text — not just the path.
 * A test that only checks the path would pass even with all hints removed.
 *
 * Note: run as a normal user, NOT as root.
 * chmod-based tests have no effect when running as root (root bypasses permissions).
 */

const fs   = require('fs').promises;
const path = require('path');
const os   = require('os');
const { detectFileEncoding, searchInDirectory } = require('./fileUtils');
const { formatFileError } = require('./errorUtils');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`[PASS] ${label}`);
    passed++;
  } else {
    console.error(`[FAIL] ${label}${detail ? '\n       ' + detail : ''}`);
    failed++;
  }
}

async function withTempDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctrace-err-test-'));
  try {
    await fn(tmp);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function run() {
  console.log('=== File error integration tests ===\n');

  if (process.getuid && process.getuid() === 0) {
    console.warn('WARNING: running as root — permission tests will be skipped (root bypasses chmod).\n');
  }

  // ── ENOENT: detectFileEncoding on a missing file ──────────────────────────
  // detectFileEncoding re-throws the raw OS error (formatting is the caller's job).
  // We check .code and that the path appears — not hint text, which lives in errorUtils.test.js.
  await (async () => {
    const missing = path.join(os.tmpdir(), `nonexistent-${Date.now()}.txt`);
    try {
      await detectFileEncoding(missing);
      assert('ENOENT detectFileEncoding: throws on missing file', false, 'expected throw, got none');
    } catch (err) {
      assert('ENOENT detectFileEncoding: raw error has correct code and path',
        err.code === 'ENOENT' &&
        err.message.includes(path.normalize(missing)),
        `code=${err.code} message=${err.message}`);
    }
  })();

  // ── ENOENT: writeFile to a path inside a missing directory ───────────────
  // Parent dir does not exist → ENOENT. Verifies both code and path are in the message.
  await (async () => {
    const ghost = path.join(os.tmpdir(), `no-such-dir-${Date.now()}`, 'file.txt');
    try {
      await fs.writeFile(ghost, 'data');
      assert('ENOENT writeFile missing parent dir: throws', false, 'expected throw, got none');
    } catch (err) {
      const msg = formatFileError(err, ghost, 'save');
      assert('ENOENT writeFile missing parent dir: message contains code + path + hint',
        err.code === 'ENOENT' &&
        msg.includes('ENOENT') &&
        msg.includes(path.normalize(ghost)) &&
        msg.includes('not found'),
        msg);
    }
  })();

  // ── EEXIST: writeFile with exclusive-create flag (wx) ────────────────────
  // Simulates what create-file does in fileHandlers.js.
  await withTempDir(async (tmp) => {
    const existing = path.join(tmp, 'already.txt');
    await fs.writeFile(existing, 'hello');
    try {
      await fs.writeFile(existing, 'world', { flag: 'wx' });
      assert('EEXIST writeFile wx: throws on existing file', false, 'expected throw, got none');
    } catch (err) {
      const msg = formatFileError(err, existing, 'create file');
      assert('EEXIST writeFile wx: message contains code + path + hint',
        err.code === 'EEXIST' &&
        msg.includes('EEXIST') &&
        msg.includes(path.normalize(existing)) &&
        msg.includes('already exists'),
        msg);
    }
  });

  // ── EISDIR: readFile on a directory path ─────────────────────────────────
  // On Linux/macOS, reading a directory as a file raises EISDIR.
  // The message must reflect "directory" — not a generic "permission denied".
  await withTempDir(async (tmp) => {
    try {
      await fs.readFile(tmp, 'utf8');
      assert('EISDIR readFile on directory: throws', false, 'expected throw, got none');
    } catch (err) {
      const msg = formatFileError(err, tmp, 'read');
      // Accept EISDIR (Linux) or EBADF (some edge cases) — but NOT EACCES,
      // because that would mean the OS returned a permission error instead of a type error
      // and the hint would be wrong ("Permission denied" instead of "directory").
      const validCode = err.code === 'EISDIR' || err.code === 'EBADF';
      assert('EISDIR readFile on directory: correct error code',
        validCode,
        `got ${err.code} — expected EISDIR or EBADF`);
      assert('EISDIR readFile on directory: message mentions "directory"',
        msg.includes('directory') && msg.includes(path.normalize(tmp)),
        msg);
    }
  });

  // ── EACCES: read a file with chmod 000 ───────────────────────────────────
  // Tests formatFileError through detectFileEncoding with a real permission error.
  // Skipped on Windows (chmod has no effect) and when running as root.
  const isRoot = process.getuid && process.getuid() === 0;
  if (process.platform !== 'win32' && !isRoot) {
    await withTempDir(async (tmp) => {
      const locked = path.join(tmp, 'locked.txt');
      await fs.writeFile(locked, 'content');
      await fs.chmod(locked, 0o000);
      try {
        await detectFileEncoding(locked);
        assert('EACCES detectFileEncoding chmod 000: throws', false, 'expected throw, got none');
      } catch (err) {
        // Raw OS error — formatting is the caller's responsibility.
        assert('EACCES detectFileEncoding chmod 000: raw error has correct code and path',
          err.code === 'EACCES' &&
          err.message.includes(path.normalize(locked)),
          `code=${err.code} message=${err.message}`);
      } finally {
        await fs.chmod(locked, 0o644).catch(() => {});
      }
    });
  } else {
    console.log(`[SKIP] EACCES chmod 000 — ${isRoot ? 'running as root' : 'Windows'}`);
  }

  // ── EACCES: write to a read-only file (chmod 444) ────────────────────────
  // More realistic than chmod 000: file exists and is readable, but not writable.
  // This is what happens when a user tries to save a read-only file.
  if (process.platform !== 'win32' && !isRoot) {
    await withTempDir(async (tmp) => {
      const readonly = path.join(tmp, 'readonly.txt');
      await fs.writeFile(readonly, 'original');
      await fs.chmod(readonly, 0o444); // read-only for everyone
      try {
        await fs.writeFile(readonly, 'modified');
        assert('EACCES writeFile chmod 444: throws', false, 'expected throw, got none');
      } catch (err) {
        const msg = formatFileError(err, readonly, 'save');
        assert('EACCES writeFile chmod 444: message contains code + path + hint',
          err.code === 'EACCES' &&
          msg.includes('EACCES') &&
          msg.includes(path.normalize(readonly)) &&
          msg.includes('Permission denied'),
          msg);
      } finally {
        await fs.chmod(readonly, 0o644).catch(() => {});
      }
    });
  } else {
    console.log(`[SKIP] EACCES chmod 444 write — ${isRoot ? 'running as root' : 'Windows'}`);
  }

  // ── searchInDirectory: unreadable file is skipped, not thrown ────────────
  // Verifies the function returns partial results and doesn't crash when
  // one file in the directory cannot be read.
  if (process.platform !== 'win32' && !isRoot) {
    await withTempDir(async (tmp) => {
      const readable   = path.join(tmp, 'readable.txt');
      const unreadable = path.join(tmp, 'unreadable.txt');
      await fs.writeFile(readable,   'hello world');
      await fs.writeFile(unreadable, 'secret content hello'); // also matches "hello"
      await fs.chmod(unreadable, 0o000);

      try {
        const results = await searchInDirectory(tmp, 'hello');
        // readable.txt must appear, unreadable.txt must NOT (it was skipped)
        const hasReadable   = results.some(r => r.fileName === 'readable.txt');
        const hasUnreadable = results.some(r => r.fileName === 'unreadable.txt');
        assert('searchInDirectory: readable file appears in results',   hasReadable,  JSON.stringify(results));
        assert('searchInDirectory: unreadable file is skipped silently', !hasUnreadable, JSON.stringify(results));
      } catch (err) {
        assert('searchInDirectory: does not throw on unreadable file', false, err.message);
        assert('searchInDirectory: unreadable file is skipped silently', false, err.message);
      } finally {
        await fs.chmod(unreadable, 0o644).catch(() => {});
      }
    });
  } else {
    console.log(`[SKIP] searchInDirectory permission test — ${isRoot ? 'running as root' : 'Windows'}`);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Unexpected test runner error:', err);
  process.exit(1);
});
