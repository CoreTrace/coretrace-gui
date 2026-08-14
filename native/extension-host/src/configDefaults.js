// Host-internal (not part of the fake 'vscode' surface). Real VSCode
// serves workspace.getConfiguration() defaults from an extension's own
// declared `contributes.configuration.properties` -- so does this, read
// from the manifest at load time, rather than hand-guessing values.
const defaults = new Map();

export function registerConfigDefaults(properties) {
  for (const [key, schema] of Object.entries(properties ?? {})) {
    defaults.set(key, schema.default);
  }
}

export function hasConfigDefault(fullKey) {
  return defaults.has(fullKey);
}

export function getConfigDefault(fullKey) {
  return defaults.get(fullKey);
}
