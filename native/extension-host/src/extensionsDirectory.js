import fs from 'node:fs';
import path from 'node:path';

// Mirrors crates/extensions/src/installed.rs::extensions_dir() -- must
// stay in sync, this is where the Rust side installs .vsix contents to.
export function extensionsDirectory() {
  const appData = process.env.APPDATA || '.coretrace-appdata';
  return path.join(appData, 'coretrace', 'extensions');
}

// Each installed extension is a directory containing an unpacked .vsix
// (i.e. a package.json at its root).
export function listInstalledExtensionDirs(dir = extensionsDirectory()) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name))
    .filter((extensionDir) => fs.existsSync(path.join(extensionDir, 'package.json')));
}
