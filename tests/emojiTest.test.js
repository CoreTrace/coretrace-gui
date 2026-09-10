const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const modulePath = path.join(__dirname, '../src/renderer/utils/emojiTest.js');

test('testEmojiSupport inspects DOM and returns metadata', () => {
  const originalPlatform = os.platform();
  const platformMock = test.mock.method(os, 'platform', () => 'testos');

  const createdElements = [];
  const bodyChildren = [];

  global.document = {
    createElement: () => {
      const element = { style: {}, textContent: '' };
      createdElements.push(element);
      return element;
    },
    body: {
      appendChild: (el) => bodyChildren.push({ type: 'append', el }),
      removeChild: (el) => bodyChildren.push({ type: 'remove', el })
    }
  };
  global.window = {
    getComputedStyle: () => ({ fontFamily: 'Mock Font' })
  };

  delete require.cache[modulePath];
  const { testEmojiSupport } = require(modulePath);

  const result = testEmojiSupport();
  assert.strictEqual(result.platform, 'testos');
  assert.ok(result.supportedEmojis.includes('📁'));
  assert.strictEqual(result.fontFamily, 'Mock Font');
  assert.strictEqual(createdElements.length, 1);
  assert.deepStrictEqual(bodyChildren.map((entry) => entry.type), ['append', 'remove']);

  platformMock.mock.restore();
});

