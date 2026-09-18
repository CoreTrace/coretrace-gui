const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const tauri = require(path.join(root, "src-tauri/tauri.conf.json"));
const cargo = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
const rustVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
assert.equal(tauri.version, pkg.version, "Tauri and npm versions must match");
assert.equal(rustVersion, pkg.version, "Rust and npm versions must match");
if (process.env.GITHUB_REF_TYPE === "tag") {
  assert.equal(
    process.env.GITHUB_REF_NAME,
    `v${pkg.version}`,
    "Release tag must match the desktop version",
  );
}
console.log(`Desktop version verified: ${pkg.version}`);
