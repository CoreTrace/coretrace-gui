const test = require('node:test');
const assert = require('node:assert/strict');

test('restoreState syncs restored workspace into SearchManager', async () => {
  const searchManager = {
    setWorkspacePathCalls: [],
    setWorkspacePath(workspacePath) {
      this.setWorkspacePathCalls.push(workspacePath);
    }
  };

  const fileOpsManager = {
    currentWorkspacePath: null,
    updateWorkspaceUICalls: [],
    updateWorkspaceUI(folderName, fileTree) {
      this.updateWorkspaceUICalls.push({ folderName, fileTree });
    }
  };

  global.window = {
    api: {
      async invoke(channel, ...args) {
        if (channel === 'load-app-state') {
          return {
            success: true,
            state: {
              version: '1.0.0',
              timestamp: new Date().toISOString(),
              tabs: [],
              workspacePath: '/tmp/demo-workspace'
            }
          };
        }

        if (channel === 'get-file-tree') {
          assert.deepStrictEqual(args, ['/tmp/demo-workspace']);
          return {
            success: true,
            fileTree: [{ name: 'README.md', path: '/tmp/demo-workspace/README.md', type: 'file' }]
          };
        }

        throw new Error(`Unexpected invoke channel: ${channel}`);
      }
    },
    uiController: {
      fileOpsManager,
      searchManager
    }
  };

  const StateManager = require('../src/renderer/managers/StateManager');

  const stateManager = new StateManager(
    {
      openTabs: new Map(),
      tabsContainer: { appendChild() {} },
      showEditor() {},
      switchToTab: async () => {},
      tabIdCounter: 0
    },
    { editor: null },
    {}
  );

  const restored = await stateManager.restoreState();

  assert.equal(restored, true);
  assert.equal(fileOpsManager.currentWorkspacePath, '/tmp/demo-workspace');
  assert.deepStrictEqual(fileOpsManager.updateWorkspaceUICalls, [
    {
      folderName: 'demo-workspace',
      fileTree: [{ name: 'README.md', path: '/tmp/demo-workspace/README.md', type: 'file' }]
    }
  ]);
  assert.deepStrictEqual(searchManager.setWorkspacePathCalls, ['/tmp/demo-workspace']);

  delete require.cache[require.resolve('../src/renderer/managers/StateManager')];
  delete global.window;
});
