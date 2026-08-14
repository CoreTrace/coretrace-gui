// Throwaway probe, not production code: attempts to activate() the
// webview-based docs-view extension against the current vscode-shim and
// reports exactly what's missing. Run with:
//   node native/extension-host/spike-extension-webview/try-load.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CommandRegistry } from '../src/commandRegistry.js';
import { createVscodeShim } from '../src/vscode-shim/index.js';
import { installVscodeShim, loadExtension } from '../src/extensionLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.join(__dirname, 'unpacked', 'extension');

const registry = new CommandRegistry();
installVscodeShim(createVscodeShim(registry));

try {
  const { manifest } = loadExtension(extensionDir);
  console.log(`activated: ${manifest.publisher}.${manifest.name}@${manifest.version}`);
} catch (err) {
  console.error(`activation failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}

for (const command of ['docsView.documentationView.pin', 'docsView.documentationView.unpin']) {
  try {
    const result = registry.invoke(command, []);
    console.log(`invoke ${command} -> ok, result: ${JSON.stringify(result)}`);
  } catch (err) {
    console.log(`invoke ${command} -> threw: ${err.message}`);
  }
}
