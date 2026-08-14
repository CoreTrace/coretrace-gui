// Backs vscode.commands with the same CommandRegistry the sidecar's IPC
// server dispatches invoke_command requests through, so a real extension's
// registerCommand calls become reachable from the native core.
export function createCommandsApi(registry) {
  return {
    registerCommand(id, handler) {
      registry.register(id, handler);
      return { dispose() {} };
    },
    registerTextEditorCommand(id, handler) {
      registry.register(id, handler);
      return { dispose() {} };
    },
    executeCommand(id, ...args) {
      try {
        return Promise.resolve(registry.invoke(id, args));
      } catch {
        // Likely a VSCode built-in command (e.g. 'setContext') this shim
        // doesn't implement -- resolve rather than reject so fire-and-
        // forget callers don't crash the extension.
        return Promise.resolve(undefined);
      }
    },
  };
}
