// The AppImage bundler picks its icon with `icons.filter(i => i.width ==
// i.height).max_by_key(width).expect(...)`, so a bundle.icon list whose PNGs
// are all non-square aborts the Linux build — and only at tag time, once the
// release job runs, long after every push-time check has passed. This runs
// with the other checks so the list is verified on every push instead.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tauriDir = path.join(root, "src-tauri");
const icons = require(path.join(tauriDir, "tauri.conf.json")).bundle.icon;

assert.ok(
  Array.isArray(icons) && icons.length > 0,
  "bundle.icon must list at least one icon",
);

// Width and height are the two big-endian 32-bit fields of the IHDR chunk,
// which the PNG spec requires to come first: 8-byte signature, 4-byte chunk
// length, 4-byte "IHDR", then the dimensions.
function pngSize(file) {
  const head = Buffer.alloc(24);
  const fd = fs.openSync(file, "r");
  try {
    assert.equal(
      fs.readSync(fd, head, 0, 24, 0),
      24,
      `${file} is too short to be a PNG`,
    );
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(head.toString("ascii", 12, 16), "IHDR", `${file} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const squares = [];
for (const icon of icons) {
  const file = path.resolve(tauriDir, icon);
  assert.ok(
    fs.existsSync(file),
    `bundle.icon lists ${icon}, which does not exist`,
  );
  if (path.extname(file).toLowerCase() !== ".png") continue;
  const { width, height } = pngSize(file);
  if (width === height) squares.push(`${icon} (${width}x${height})`);
}

assert.ok(
  squares.length > 0,
  "bundle.icon needs at least one square PNG, or the AppImage bundle aborts with " +
    '"couldn\'t find a square icon to use as AppImage icon"',
);

console.log(
  `Bundle icons verified: ${icons.length} listed, square PNGs: ${squares.join(", ")}`,
);
