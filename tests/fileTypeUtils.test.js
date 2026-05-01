const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.join(__dirname, '../src/renderer/utils/fileTypeUtils.js');
delete require.cache[modulePath];
const fileTypeUtils = require(modulePath);

const { detectFileType, updateFileTypeStatus, getFileIcon, formatFileSize } = fileTypeUtils;

test('detectFileType categorizes extensions', () => {
  assert.strictEqual(detectFileType('main.c'), 'C');
  assert.strictEqual(detectFileType('main.cpp'), 'C++');
  assert.strictEqual(detectFileType('script.py'), 'Python');
  assert.strictEqual(detectFileType('README.md'), 'Markdown');
  assert.strictEqual(detectFileType(''), 'Plain Text');
});

test('updateFileTypeStatus writes to DOM element when present', () => {
  const element = { textContent: '' };
  global.document = { getElementById: () => element };
  updateFileTypeStatus('example.js');
  assert.strictEqual(element.textContent, 'JavaScript');
});

test('getFileIcon returns emoji and formatFileSize formats numbers', () => {
  // Known extensions return an <img> tag with emoji onerror fallback
  const jsIcon = getFileIcon('file.js');
  assert.ok(jsIcon.includes('javascript-original.svg'), 'js icon should reference SVG');
  assert.ok(jsIcon.includes("this.outerHTML='🟨'"), 'js icon should have emoji fallback');
  // Unknown extensions return the emoji directly
  assert.strictEqual(getFileIcon('unknown.xyz'), '📄');
  assert.strictEqual(formatFileSize(0), '0 Bytes');
  assert.strictEqual(formatFileSize(1024), '1 KB');
  assert.strictEqual(formatFileSize(1024 * 1024), '1 MB');
});

