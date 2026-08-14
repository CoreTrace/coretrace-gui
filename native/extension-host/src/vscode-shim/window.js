import { getActiveEditor } from '../fakeEditorState.js';

// See workspace.js's noopEvent comment -- same deal, no real firing yet.
const noopEvent = () => ({ dispose() {} });

export function createWindowApi() {
  return {
    get activeTextEditor() {
      return getActiveEditor();
    },
    showQuickPick(items) {
      return Promise.resolve(items[0]);
    },
    showInformationMessage(message) {
      return Promise.resolve(message);
    },
    onDidChangeActiveTextEditor: noopEvent,
    onDidChangeTextEditorSelection: noopEvent,
    onDidChangeVisibleTextEditors: noopEvent,
    // No webview rendering surface exists in this architecture (see
    // native/docs/phase0-status.md's webview caveat). The provider
    // registers so activate() succeeds and the extension's non-webview
    // features keep working, but resolveWebviewView is never called --
    // the view itself will never actually render.
    registerWebviewViewProvider() {
      return { dispose() {} };
    },
  };
}
