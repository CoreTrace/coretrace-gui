import { hasConfigDefault, getConfigDefault } from '../configDefaults.js';

// onDid* subscriptions are no-op stubs (never fire) -- enough for an
// extension's activate() to register a listener without crashing, not a
// claim that document/configuration change events actually work yet.
const noopEvent = () => ({ dispose() {} });

export function createWorkspaceApi() {
  return {
    getConfiguration(section) {
      const prefix = section ? `${section}.` : '';
      return {
        has(key) {
          return hasConfigDefault(`${prefix}${key}`);
        },
        get(key, defaultValue) {
          const full = `${prefix}${key}`;
          return hasConfigDefault(full) ? getConfigDefault(full) : defaultValue;
        },
        inspect(key) {
          const full = `${prefix}${key}`;
          return { defaultValue: hasConfigDefault(full) ? getConfigDefault(full) : undefined };
        },
      };
    },
    onDidChangeConfiguration: noopEvent,
    onDidChangeTextDocument: noopEvent,
    onDidOpenTextDocument: noopEvent,
    onDidCloseTextDocument: noopEvent,
    onDidSaveTextDocument: noopEvent,
  };
}
