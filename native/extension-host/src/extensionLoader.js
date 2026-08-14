import Module from 'node:module';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { Memento } from './vscode-shim/memento.js';
import { Uri } from './vscode-shim/uri.js';
import { registerConfigDefaults } from './configDefaults.js';

let originalLoad = null;

// Real VSCode intercepts `require('vscode')` the same way: patch the
// CJS loader rather than trying to publish a fake 'vscode' npm package.
export function installVscodeShim(vscodeApi) {
  if (!originalLoad) {
    originalLoad = Module._load;
  }
  Module._load = function patchedLoad(request) {
    if (request === 'vscode') {
      return vscodeApi;
    }
    return originalLoad.apply(this, arguments);
  };
}

export function loadExtension(extensionDir) {
  const manifestPath = path.join(extensionDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  registerConfigDefaults(manifest.contributes?.configuration?.properties);

  const context = {
    subscriptions: [],
    workspaceState: new Memento(),
    globalState: new Memento(),
    extensionPath: extensionDir,
    extensionUri: Uri.file(extensionDir),
  };

  // Plenty of real extensions ship no code at all: themes, TextMate
  // grammars, snippets, and extension packs are pure manifest data.
  // Treating `main` as mandatory made those crash the loader with an
  // opaque `paths[1] must be of type string` from path.resolve.
  if (!manifest.main) {
    return { manifest, context, activated: false, reason: 'declarative extension (no main entry point)' };
  }

  const requireFromExtension = createRequire(manifestPath);
  const extensionModule = requireFromExtension(path.resolve(extensionDir, manifest.main));

  if (typeof extensionModule.activate !== 'function') {
    return { manifest, context, activated: false, reason: 'no activate() export' };
  }

  extensionModule.activate(context);
  return { manifest, context, activated: true };
}
