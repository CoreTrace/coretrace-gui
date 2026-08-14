import { getActiveEditor } from '../fakeEditorState.js';

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
  };
}
