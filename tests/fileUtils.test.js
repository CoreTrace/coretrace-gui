const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const {
  isValidUTF8,
  buildFileTree,
  searchInDirectory,
  detectFileEncoding
} = require('../src/main/utils/fileUtils');

async function withTempDir(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
  try {
    return await callback(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('isValidUTF8 returns true for ASCII text', () => {
  const buffer = Buffer.from('Hello, world!', 'utf8');
  assert.strictEqual(isValidUTF8(buffer), true);
});

test('isValidUTF8 returns true for empty buffer', () => {
  const buffer = Buffer.alloc(0);
  assert.strictEqual(isValidUTF8(buffer), true);
});

test('isValidUTF8 returns false when null byte ratio exceeds threshold', () => {
  const buffer = Buffer.alloc(200, 1);
  for (let i = 0; i < 50; i++) {
    buffer[i] = 0;
  }
  assert.strictEqual(isValidUTF8(buffer), false);
});

test('buildFileTree lists directories before files and skips ignored entries', async () => {
  await withTempDir(async (tempDir) => {
    await fs.mkdir(path.join(tempDir, 'visibleDir'));
    await fs.writeFile(path.join(tempDir, 'visibleDir', 'inner.txt'), 'content');
    await fs.writeFile(path.join(tempDir, 'visibleFile.txt'), 'content');
    await fs.writeFile(path.join(tempDir, '.hiddenFile'), 'secret');
    await fs.mkdir(path.join(tempDir, 'node_modules'));

    const tree = await buildFileTree(tempDir);
    assert.strictEqual(tree.length, 2);
    assert.deepStrictEqual(tree.map((entry) => entry.name), ['visibleDir', 'visibleFile.txt']);

    const dirEntry = tree.find((entry) => entry.type === 'directory');
    assert.ok(dirEntry, 'expected directory entry to be present');
    assert.deepStrictEqual(dirEntry.children.map((child) => child.name), ['inner.txt']);
  });
});

test('searchInDirectory finds matches and respects maximum results', async () => {
  await withTempDir(async (tempDir) => {
    await fs.writeFile(path.join(tempDir, 'first.txt'), 'TODO: write tests\nNothing here');
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.writeFile(path.join(tempDir, 'subdir', 'second.txt'), 'Line 1\nSecond TODO item');
    await fs.writeFile(path.join(tempDir, 'subdir', 'third.txt'), 'TODO once more');

    const results = await searchInDirectory(tempDir, 'TODO', 2);
    assert.strictEqual(results.length, 2);
    results.forEach((result) => {
      assert.ok(result.content.includes('TODO'));
      assert.ok(result.file.endsWith('.txt'));
    });
  });
});

test('detectFileEncoding reads UTF-8 files', async () => {
  await withTempDir(async (tempDir) => {
    const filePath = path.join(tempDir, 'hello.txt');
    const content = 'Hello, world!';
    await fs.writeFile(filePath, content, 'utf8');

    const info = await detectFileEncoding(filePath);
    assert.strictEqual(info.isUTF8, true);
    assert.strictEqual(info.size, Buffer.byteLength(content));
    assert.ok(Buffer.isBuffer(info.buffer));
    assert.strictEqual(info.buffer.toString('utf8'), content);
  });
});
