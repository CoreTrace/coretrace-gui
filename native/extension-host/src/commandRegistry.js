// Stand-in for the `vscode.commands` registry a real extension-API shim
// would provide. Phase 0 just proves one "extension" can register a
// command and have it invoked from the native UI round-trip.

export class CommandRegistry {
  constructor() {
    this.commands = new Map();
  }

  register(name, handler) {
    this.commands.set(name, handler);
  }

  invoke(name, args) {
    const handler = this.commands.get(name);
    if (!handler) {
      throw new Error(`no command registered: ${name}`);
    }
    return handler(...args);
  }

  list() {
    return Array.from(this.commands.keys());
  }
}
