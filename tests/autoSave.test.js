const test = require('node:test');
const assert = require('node:assert/strict');

const UIController = require('../src/renderer/UIController');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('triggerAutoSave saves when active tab is modified', async () => {
  let saveCalls = 0;

  const fakeController = {
    autoSaveEnabled: true,
    autoSaveTimer: null,
    autoSaveDelay: 10,
    tabManager: {
      getActiveTab() {
        return {
          filePath: 'C:/tmp/example.txt',
          fileName: 'example.txt',
          modified: true
        };
      }
    },
    fileOpsManager: {
      async saveFile(options) {
        assert.ok(options && options.silent, 'expected autosave to call saveFile({silent:true})');
        saveCalls += 1;
      }
    }
  };

  UIController.prototype.triggerAutoSave.call(fakeController);
  await sleep(30);

  assert.equal(saveCalls, 1);
});

test('triggerAutoSave does not save when active tab is clean', async () => {
  let saveCalls = 0;

  const fakeController = {
    autoSaveEnabled: true,
    autoSaveTimer: null,
    autoSaveDelay: 10,
    tabManager: {
      getActiveTab() {
        return {
          filePath: 'C:/tmp/example.txt',
          fileName: 'example.txt',
          modified: false
        };
      }
    },
    fileOpsManager: {
      async saveFile() {
        saveCalls += 1;
      }
    }
  };

  UIController.prototype.triggerAutoSave.call(fakeController);
  await sleep(30);

  assert.equal(saveCalls, 0);
});
