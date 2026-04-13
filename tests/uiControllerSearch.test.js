const test = require('node:test');
const assert = require('node:assert/strict');

const UIController = require('../src/renderer/UIController');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('openSearchResult keeps the search sidebar active', async () => {
  let showExplorerCalls = 0;
  let jumpedToLine = null;

  global.window = {
    api: {
      async invoke(channel, ...args) {
        if (channel === 'read-file') {
          assert.deepStrictEqual(args, ['/tmp/demo.txt']);
          return {
            success: true,
            fileName: 'demo.txt',
            content: 'line 1\nline 2\nline 3'
          };
        }

        throw new Error(`Unexpected invoke channel: ${channel}`);
      }
    }
  };

  const fakeController = {
    notificationManager: {
      showSuccess() {},
      showError() {},
      showWarning() {},
      async showEncodingWarningDialog() {
        return 'yes';
      }
    },
    fileOpsManager: {
      openFileInTab(filePath, content, fileName) {
        assert.equal(filePath, '/tmp/demo.txt');
        assert.equal(fileName, 'demo.txt');
        assert.equal(content, 'line 1\nline 2\nline 3');
        return 'tab_1';
      }
    },
    editorManager: {
      jumpToLine(lineNumber) {
        jumpedToLine = lineNumber;
      }
    },
    showExplorer() {
      showExplorerCalls += 1;
    }
  };

  await UIController.prototype.openSearchResult.call(fakeController, '/tmp/demo.txt', 2);
  await sleep(250);

  assert.equal(showExplorerCalls, 0);
  assert.equal(jumpedToLine, 2);

  delete global.window;
});
