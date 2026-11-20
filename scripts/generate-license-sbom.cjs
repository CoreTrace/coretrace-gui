// Flat CycloneDX inventory of resolved Cargo and production npm components.
const fs = require("node:fs");
const path = require("node:path");
const { packages, root } = require("./desktop-license-packages.cjs");
const desktop = require("../src-tauri/tauri.conf.json");
const byUrl = new Map();

for (const { ecosystem, name, version, license } of packages) {
  const encodedName = name.split("/").map(encodeURIComponent).join("/");
  const purl = `pkg:${ecosystem}/${encodedName}@${encodeURIComponent(version)}`;
  const component = { type: "library", name, version, purl };
  if (license !== "see license file") {
    // Older Cargo manifests use a slash to express a choice of licenses.
    component.licenses = [{ expression: license.replace(/\s*\/\s*/g, " OR ") }];
  }
  byUrl.set(purl, component);
}

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: desktop.productName,
      version: desktop.version,
      licenses: [{ license: { id: "Apache-2.0" } }],
    },
  },
  components: [...byUrl.keys()].sort().map((purl) => byUrl.get(purl)),
};
fs.writeFileSync(
  path.join(root, "docs/gui-sbom.cdx.json"),
  JSON.stringify(sbom, null, 2) + "\n",
);
console.log(`Wrote docs/gui-sbom.cdx.json (${byUrl.size} components)`);
