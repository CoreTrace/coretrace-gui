/**
 * @fileoverview Registry of filesystem locations the renderer may act on.
 *
 * Paths enter this registry only from main-process sources: native file
 * dialogs and the persisted session state. The renderer can ask to read,
 * write, watch or delete a path, but it cannot introduce a new one on its own.
 */

const path = require('path');

const trustedRoots = new Set();
const trustedFiles = new Set();

/**
 * Canonical comparison key for a path (resolved, case-folded on Windows).
 * @param {string} targetPath
 * @returns {string}
 */
function pathKey(targetPath) {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Mark a directory as an allowed workspace root. */
function trustWorkspaceRoot(folderPath) {
  if (isNonEmptyString(folderPath)) trustedRoots.add(pathKey(folderPath));
}

/** Mark a single file as allowed even when it lies outside the workspace. */
function trustFile(filePath) {
  if (isNonEmptyString(filePath)) trustedFiles.add(pathKey(filePath));
}

function isTrustedWorkspaceRoot(folderPath) {
  return isNonEmptyString(folderPath) && trustedRoots.has(pathKey(folderPath));
}

function isTrustedFile(filePath) {
  return isNonEmptyString(filePath) && trustedFiles.has(pathKey(filePath));
}

/** True when both paths refer to the same location. */
function isSamePath(a, b) {
  return isNonEmptyString(a) && isNonEmptyString(b) && pathKey(a) === pathKey(b);
}

module.exports = {
  trustWorkspaceRoot,
  trustFile,
  isTrustedWorkspaceRoot,
  isTrustedFile,
  isSamePath
};
