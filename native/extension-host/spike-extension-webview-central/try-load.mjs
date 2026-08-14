// Throwaway probe: activate() the CSV table editor, then invoke its core
// command (edit-csv.edit) to see what happens when a webview-CENTRAL
// extension's whole reason to exist actually runs -- not just registers.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CommandRegistry } from '../src/commandRegistry.js';
import { createVscodeShim } from '../src/vscode-shim/index.js';
import { installVscodeShim, loadExtension } from '../src/extensionLoader.js';
import { setDocumentText } from '../src/fakeEditorState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.join(__dirname, 'unpacked', 'extension');

const registry = new CommandRegistry();
const shim = createVscodeShim(registry);
let capturedPanel = null;
const realCreateWebviewPanel = shim.window.createWebviewPanel;
shim.window.createWebviewPanel = (...args) => {
  capturedPanel = realCreateWebviewPanel(...args);
  return capturedPanel;
};
installVscodeShim(shim);

try {
  const { manifest } = loadExtension(extensionDir);
  console.log(`activated: ${manifest.publisher ?? 'janisdd'}.${manifest.name}@${manifest.version}`);
} catch (err) {
  console.error(`activation failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}

setDocumentText('a,b,c\n1,2,3', 'C:\\fake\\data.csv', 'csv');

try {
  const result = registry.invoke('edit-csv.edit', []);
  console.log(`invoke edit-csv.edit -> ok, result: ${JSON.stringify(result)}`);
  const html = capturedPanel?.webview.html ?? '';
  console.log(`panel.webview.html length: ${html.length}`);
  console.log(`panel.webview.html looks like real HTML: ${html.includes('<html') || html.includes('<!DOCTYPE')}`);
} catch (err) {
  console.log(`invoke edit-csv.edit -> threw: ${err.message}`);
  console.log(err.stack);
}
