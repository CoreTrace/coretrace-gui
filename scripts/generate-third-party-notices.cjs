// Writes src-tauri/THIRD_PARTY_NOTICES.txt: the license texts of every Rust crate and every
// production npm package the desktop app ships. MIT, BSD, ISC, Unicode and CDLA all require their
// text to travel with the binaries; the file is bundled as a resource (tauri.conf.json).
// Identical texts are printed once, followed by the packages that use them.
// Needs `npm ci` and a Cargo registry that can resolve src-tauri/Cargo.lock.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "src-tauri/THIRD_PARTY_NOTICES.txt");
const LICENSE_FILE = /^(licen[cs]e|copying|notice|thirdpartynotices)/i;

function licenseTexts(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile() && LICENSE_FILE.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => fs.readFileSync(path.join(dir, f.name), "utf8").replace(/\r\n/g, "\n").trim());
}

const packages = [];

// ponytail: every platform in Cargo.lock is listed (macOS crates too); over-inclusion is harmless.
const metadata = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--locked"], {
    cwd: path.join(root, "src-tauri"),
    maxBuffer: 256 * 1024 * 1024,
  }),
);
for (const p of metadata.packages) {
  if (p.source === null) continue; // the app itself
  packages.push({
    name: `${p.name} ${p.version}`,
    license: p.license || "see license file",
    url: p.repository || `https://crates.io/crates/${p.name}`,
    texts: licenseTexts(path.dirname(p.manifest_path)),
  });
}

const lock = require(path.join(root, "package-lock.json"));
for (const [key, p] of Object.entries(lock.packages)) {
  if (!key || p.dev || p.extraneous || p.link) continue;
  const dir = path.join(root, key);
  if (!fs.existsSync(dir)) throw new Error(`${key} is not installed; run npm ci first`);
  const name = key.split("node_modules/").pop();
  const pkg = require(path.join(dir, "package.json"));
  const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  packages.push({
    name: `${name} ${p.version}`,
    license: p.license || "see license file",
    url: repo || `https://www.npmjs.com/package/${name}`,
    texts: licenseTexts(dir),
  });
}

const groups = new Map();
const missing = [];
for (const p of packages) {
  if (p.texts.length === 0) missing.push(p);
  for (const text of p.texts) {
    const key = text.replace(/\s+/g, " ");
    if (!groups.has(key)) groups.set(key, { text, users: [] });
    groups.get(key).users.push(p.name);
  }
}

const rule = "=".repeat(78);
const sections = [
  "CoreTrace Desktop - third-party notices\n\n" +
    "CoreTrace Desktop is licensed under the Apache License, Version 2.0.\n" +
    "It includes the third-party software listed below. Source code for each\n" +
    "component, including the MPL-2.0 ones, is available at the address given.",
  "COMPONENTS\n\n" +
    packages
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `${p.name} (${p.license}) - ${p.url}`)
      .join("\n"),
  ...[...groups.values()].map((g) => `Used by: ${g.users.sort().join(", ")}\n\n${g.text}`),
];
if (missing.length) {
  sections.push(
    "The following components ship no license file; their declared license applies:\n\n" +
      missing.map((p) => `${p.name} (${p.license}) - ${p.url}`).join("\n"),
  );
}
fs.writeFileSync(out, sections.join(`\n\n${rule}\n\n`) + "\n");
console.log(
  `Wrote ${path.relative(root, out)}: ${packages.length} components, ` +
    `${groups.size} distinct texts, ${missing.length} without a license file`,
);
