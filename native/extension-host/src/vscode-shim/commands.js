// Backs vscode.commands with the same CommandRegistry the sidecar's IPC
// server dispatches invoke_command requests through, so a real extension's
// registerCommand calls become reachable from the native core.
export function createCommandsApi(registry) {
  return {
    registerCommand(id, handler) {
      registry.register(id, handler);
      return { dispose() {} };
    },
  };
}
