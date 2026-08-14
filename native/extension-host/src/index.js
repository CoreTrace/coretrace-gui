import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CommandRegistry } from './commandRegistry.js';
import { startServer } from './server.js';
import { createVscodeShim } from './vscode-shim/index.js';
import { installVscodeShim, loadExtension } from './extensionLoader.js';

const PORT = 7331;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPIKE_EXTENSION_DIR = path.join(__dirname, '..', 'spike-extension', 'unpacked', 'extension');

const registry = new CommandRegistry();
registry.register('coretrace.spike.echo', (...args) => ({ echoed: args }));

installVscodeShim(createVscodeShim(registry));

try {
  const { manifest } = loadExtension(SPIKE_EXTENSION_DIR);
  console.log(`loaded real extension: ${manifest.publisher}.${manifest.name}@${manifest.version}`);
} catch (err) {
  console.error(
    `could not load spike extension from ${SPIKE_EXTENSION_DIR} ` +
      `(see extension-host/spike-extension/README.md to fetch it): ${err.message}`,
  );
}

startServer(PORT, registry);
console.log(`extension-host spike listening on 127.0.0.1:${PORT}`);
