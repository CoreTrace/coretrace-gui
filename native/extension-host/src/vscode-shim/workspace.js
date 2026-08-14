// onDid* subscriptions are no-op stubs (never fire) -- enough for an
// extension's activate() to register a listener without crashing, not a
// claim that document/configuration change events actually work yet.
const noopEvent = () => ({ dispose() {} });

export function createWorkspaceApi() {
  return {
    getConfiguration() {
      return { get: (_key, defaultValue) => defaultValue };
    },
    onDidChangeConfiguration: noopEvent,
    onDidChangeTextDocument: noopEvent,
    onDidOpenTextDocument: noopEvent,
    onDidCloseTextDocument: noopEvent,
    onDidSaveTextDocument: noopEvent,
  };
}
