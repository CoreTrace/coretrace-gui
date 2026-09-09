import { randomBytes } from 'node:crypto';
import { CommandRegistry } from './commandRegistry.js';
import { startServer } from './server.js';
import { createVscodeShim } from './vscode-shim/index.js';
import { installVscodeShim, loadExtension } from './extensionLoader.js';
import { listInstalledExtensionDirs } from './extensionsDirectory.js';

// Port 0 (default) asks the OS for a free port and prints it back via
// the READY line below -- how the Rust supervisor learns which port to
// connect to. --port <n> / PORT env var override for manual dev runs
// (e.g. `PORT=7331 node src/index.js` to match the old Phase 0 examples).
const portArg = process.argv.find((arg) => arg.startsWith('--port='));
const requestedPort = portArg ? Number(portArg.slice('--port='.length)) : Number(process.env.PORT || 0);

// The Rust supervisor hands the shared secret over the environment; a manual
// dev run gets a fresh one printed so it can be passed back to the examples.
let token = process.env.CORETRACE_HOST_TOKEN;
if (!token) {
  token = randomBytes(32).toString('hex');
  console.log(`TOKEN ${token}`);
}

const registry = new CommandRegistry();
installVscodeShim(createVscodeShim(registry));

const extensionDirs = listInstalledExtensionDirs();
for (const extensionDir of extensionDirs) {
  try {
    const { manifest, activated, reason } = loadExtension(extensionDir);
    const id = `${manifest.publisher ?? ''}.${manifest.name}@${manifest.version}`;
    console.log(activated ? `loaded extension: ${id}` : `loaded extension (inactive): ${id} -- ${reason}`);
  } catch (err) {
    console.error(`failed to load extension at ${extensionDir}: ${err.message}`);
  }
}
if (extensionDirs.length === 0) {
  console.log('no installed extensions found');
}

startServer(requestedPort, registry, (actualPort) => {
  // The Rust supervisor greps stdout for this exact line -- keep the
  // format stable (see native/crates/ipc/src/supervisor.rs).
  console.log(`READY ${actualPort}`);
}, token);
