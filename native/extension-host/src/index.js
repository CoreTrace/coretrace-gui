import { CommandRegistry } from './commandRegistry.js';
import { startServer } from './server.js';

const PORT = 7331;

const registry = new CommandRegistry();

// Stand-in for a real extension registering a command via the
// `vscode.commands.registerCommand` shim (not built yet — Phase 3).
registry.register('coretrace.spike.echo', (...args) => ({ echoed: args }));

startServer(PORT, registry);
console.log(`extension-host spike listening on 127.0.0.1:${PORT}`);
