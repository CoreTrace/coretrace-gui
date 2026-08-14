// Host-internal state (not part of the fake 'vscode' module surface).
// Stands in for a real synced document until Phase 3 wires the sidecar
// to the native editor's actual buffer.
import { TextDocument } from './vscode-shim/document.js';
import { TextEditor } from './vscode-shim/editor.js';
import { Selection } from './vscode-shim/selection.js';

let activeEditor = null;

export function setDocumentText(text) {
  const document = new TextDocument(text);
  const editor = new TextEditor(document);
  const lastLine = document.lineCount - 1;
  const lastLineLength = document.lineAt(lastLine).text.length;
  editor.selection = new Selection(0, 0, lastLine, lastLineLength);
  activeEditor = editor;
}

export function getDocumentText() {
  return activeEditor ? activeEditor.document.text : '';
}

export function getActiveEditor() {
  return activeEditor;
}
