/**
 * Patches node-pty/binding.gyp to disable Spectre mitigation.
 *
 * node-pty sets 'SpectreMitigation': 'Spectre' in target_defaults for Windows.
 * VS 2019 Build Tools ships without Spectre-mitigated libs by default, causing
 * MSB8040 during electron-rebuild. Changing the value to 'false' in binding.gyp
 * fixes it at the source — before node-gyp configure regenerates the vcxproj files.
 *
 * Run automatically via the postinstall npm script.
 */

const fs = require('fs');
const path = require('path');

const bindingGyp = path.join(__dirname, '..', 'node_modules', 'node-pty', 'binding.gyp');

if (!fs.existsSync(bindingGyp)) {
  console.log('[patch-node-pty] binding.gyp not found — skipping.');
  process.exit(0);
}

const original = fs.readFileSync(bindingGyp, 'utf8');

// Replace 'Spectre' (or any non-false value) with 'false'
const updated = original.replace(
  /('SpectreMitigation'\s*:\s*)'[^']+'/g,
  "$1'false'"
);

if (updated === original) {
  console.log('[patch-node-pty] Nothing to patch (already clean).');
} else {
  fs.writeFileSync(bindingGyp, updated, 'utf8');
  console.log('[patch-node-pty] Patched binding.gyp: SpectreMitigation → false');
}
