// Throwaway probe, not production code: attempts to activate() the
// clang diagnostics/completion extension against the current
// vscode-shim -- the languages.*/DiagnosticCollection API shape neither
// earlier spike extension exercised. Run with:
//   node native/extension-host/spike-extension-diagnostics/try-load.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CommandRegistry } from '../src/commandRegistry.js';
import { createVscodeShim } from '../src/vscode-shim/index.js';
import { installVscodeShim, loadExtension } from '../src/extensionLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.join(__dirname, 'unpacked', 'extension');

const shim = createVscodeShim(new CommandRegistry());
const realCreateDiagnosticCollection = shim.languages.createDiagnosticCollection;
shim.languages.createDiagnosticCollection = (name) => {
  console.log(`languages.createDiagnosticCollection("${name}") called`);
  return realCreateDiagnosticCollection(name);
};
const realRegisterCompletionItemProvider = shim.languages.registerCompletionItemProvider;
shim.languages.registerCompletionItemProvider = (...args) => {
  console.log('languages.registerCompletionItemProvider(...) called');
  return realRegisterCompletionItemProvider(...args);
};

installVscodeShim(shim);

try {
  const { manifest } = loadExtension(extensionDir);
  console.log(`activated: ${manifest.publisher ?? 'mitaki28'}.${manifest.name}@${manifest.version}`);
} catch (err) {
  console.error(`activation failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
