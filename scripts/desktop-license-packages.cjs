// Resolve the same locked components for attribution and the license SBOM.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

const packages = [];

// Keep all Cargo targets so the inventory covers each supported desktop.
const metadata = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--locked"], {
    cwd: path.join(root, "src-tauri"),
    maxBuffer: 256 * 1024 * 1024,
  }),
);
for (const p of metadata.packages) {
  if (p.source === null) continue; // the app itself
  packages.push({
    name: p.name,
    version: p.version,
    ecosystem: "cargo",
    license: p.license || "see license file",
    url: p.repository || `https://crates.io/crates/${p.name}`,
    dir: path.dirname(p.manifest_path),
  });
}

const lock = require(path.join(root, "package-lock.json"));
for (const [key, p] of Object.entries(lock.packages)) {
  if (!key || p.dev || p.extraneous || p.link) continue;
  const dir = path.join(root, key);
  if (!fs.existsSync(dir))
    throw new Error(`${key} is not installed; run npm ci first`);
  const name = key.split("node_modules/").pop();
  const pkg = require(path.join(dir, "package.json"));
  const repo =
    typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  packages.push({
    name,
    version: p.version,
    ecosystem: "npm",
    license: p.license || "see license file",
    url: repo || `https://www.npmjs.com/package/${name}`,
    dir,
  });
}

module.exports = { packages, root };
