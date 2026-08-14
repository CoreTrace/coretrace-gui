import Module from 'node:module';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

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
  const requireFromExtension = createRequire(manifestPath);
  const mainPath = path.resolve(extensionDir, manifest.main);

  const extensionModule = requireFromExtension(mainPath);
  const context = { subscriptions: [] };
  extensionModule.activate(context);
  return { manifest, context };
}
