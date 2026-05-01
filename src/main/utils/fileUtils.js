const fs = require('fs').promises;
const path = require('path');

// File size limit for initial display (1MB)
const FILE_SIZE_LIMIT = 1024 * 1024;

// Files larger than this threshold trigger a UI warning before opening (5MB)
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

/**
 * Check if file is UTF-8 encoded
 * @param {Buffer} buffer - File buffer to check
 * @returns {boolean} - True if file is UTF-8
 */
function isValidUTF8(buffer) {
  // If file is empty, consider it UTF-8
  if (buffer.length === 0) {
    return true;
  }
  
  // Check for excessive null bytes (binary indicator)
  let nullCount = 0;
  const sampleSize = Math.min(buffer.length, 1024); // Check first 1KB
  
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) {
      nullCount++;
    }
  }
  
  // If more than 1% null bytes, likely binary
  if (nullCount / sampleSize > 0.01) {
    console.log(`Detected binary file: ${nullCount}/${sampleSize} null bytes`);
    return false;
  }
  
  // Try to convert to UTF-8 and check for replacement characters
  const text = buffer.toString('utf8');
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  
  // If more than 1% replacement characters, likely binary/non-UTF8
  if (replacementCount / text.length > 0.01) {
    console.log(`Detected non-UTF8: ${replacementCount}/${text.length} replacement chars`);
    return false;
  }
  
  // Check for font file signatures
  if (text.includes('FFTM') || text.includes('GDEF') || text.includes('glyf') || 
      text.includes('cmap') || text.includes('fpgm') || text.includes('gasp') ||
      text.includes('DSIG') || text.includes('GSUB') || text.includes('GPOS')) {
    console.log('Detected font file by signature');
    return false;
  }
  
  // Check for high percentage of non-printable characters
  let nonPrintableCount = 0;
  const checkLength = Math.min(text.length, 1000);
  
  for (let i = 0; i < checkLength; i++) {
    const code = text.charCodeAt(i);
    // Count chars that are not printable ASCII, common whitespace, or extended ASCII
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintableCount++;
    }
  }
  
  // If more than 10% non-printable characters, likely binary
  if (nonPrintableCount / checkLength > 0.1) {
    console.log(`Detected binary: ${nonPrintableCount}/${checkLength} non-printable chars`);
    return false;
  }
  
  return true;
}

/**
 * Detect file encoding — reads at most FILE_SIZE_LIMIT bytes so large files
 * never fully load into memory.
 * @param {string} filePath - Path to the file
 * @returns {Object} - File info with encoding and size data
 */
async function detectFileEncoding(filePath) {
  const stat = await fs.stat(filePath);
  const size = stat.size;

  if (size === 0) {
    return { isUTF8: true, size: 0, buffer: Buffer.alloc(0) };
  }

  const readSize = Math.min(size, FILE_SIZE_LIMIT);
  const fd = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(readSize);
    const { bytesRead } = await fd.read(buffer, 0, readSize, 0);
    const sliced = buffer.slice(0, bytesRead);
    const isUTF8 = isValidUTF8(sliced);
    console.log(`File: ${filePath}, Size: ${size}, ReadSize: ${readSize}, IsUTF8: ${isUTF8}`);
    console.log(`First 100 bytes:`, sliced.slice(0, 100).toString('hex'));
    return { isUTF8, size, buffer: sliced };
  } finally {
    await fd.close();
  }
}

const DEFAULT_IGNORED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  '.next',
  '.cache',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'My Music',
  'My Pictures',
  'My Videos',
  '$RECYCLE.BIN',
  'System Volume Information'
]);

const MAX_ENTRIES_PER_DIR = 5000;

function shouldIgnoreTreeEntry(name) {
  if (!name) return true;
  if (name.startsWith('.')) return true;
  return DEFAULT_IGNORED_DIR_NAMES.has(name);
}

/**
 * Build file tree for directory.
 *
 * `loadChildren` supports two modes:
 * - boolean: `true` loads one level of directory children, `false` keeps children lazy (`null`)
 * - number: max depth to recursively load (0 = current level only)
 *
 * @param {string} dirPath - Directory path
 * @param {boolean|number} loadChildren - Child loading mode or depth
 * @returns {Array} - File tree structure
 */
async function buildFileTree(dirPath, loadChildren = true) {
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    const tree = [];

    let processedCount = 0;

    for (const dirent of dirents) {
      if (processedCount >= MAX_ENTRIES_PER_DIR) break;
      const name = dirent.name;

      if (shouldIgnoreTreeEntry(name)) {
        continue;
      }

      // Avoid potential symlink loops and reduce I/O.
      if (dirent.isSymbolicLink && dirent.isSymbolicLink()) {
        continue;
      }

      processedCount++;
      const itemPath = path.join(dirPath, name);

      if (dirent.isDirectory()) {
        let children = null;

        // Backward compatibility: callers may pass a numeric depth.
        if (typeof loadChildren === 'number') {
          if (loadChildren > 0) {
            children = await buildFileTree(itemPath, loadChildren - 1);
          }
        } else if (loadChildren === true) {
          // Boolean true loads one level only.
          children = await buildFileTree(itemPath, false);
        }

        tree.push({
          name,
          path: itemPath,
          type: 'directory',
          hasChildren: true, // Mark that it has potential children
          children // `null` means lazily loaded
        });
      } else if (dirent.isFile()) {
        tree.push({
          name,
          path: itemPath,
          type: 'file'
        });
      }
    }

    tree.sort((a, b) => {
      // Directories first, then files
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    return tree;
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn(`[buildFileTree] Permission denied (${error.code}) reading directory: "${path.normalize(dirPath)}"`);
      return [];
    }
    console.error(`[buildFileTree] Failed to read directory "${path.normalize(dirPath)}": [${error.code || 'ERR'}] ${error.message}`);
    return [];
  }
}

/**
 * Search in files within directory
 * @param {string} dirPath - Directory path to search
 * @param {string} searchTerm - Search term
 * @param {number} maxResults - Maximum results to return
 * @returns {Array} - Search results
 */
async function searchInDirectory(dirPath, searchTerm, maxResults = 100) {
  const results = [];
  const searchRegex = new RegExp(searchTerm, 'gi');
  
  async function searchRecursively(currentPath, depth = 0) {
    if (depth > 5 || results.length >= maxResults) return;
    
    try {
      const items = await fs.readdir(currentPath);
      
      for (const item of items) {
        if (results.length >= maxResults) break;
        
        // Skip hidden files and common build directories
        if (item.startsWith('.') || ['node_modules', 'dist', 'build', '.git'].includes(item)) {
          continue;
        }
        
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          await searchRecursively(itemPath, depth + 1);
        } else if (stats.isFile()) {
          // Skip known binary extensions immediately (fast path)
          const ext = path.extname(item).toLowerCase();
          const binaryExtensions = new Set([
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
            '.pdf', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
            '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a',
            '.wasm', '.class', '.jar', '.war', '.ear',
            '.mp3', '.mp4', '.wav', '.ogg', '.flac', '.mkv', '.avi', '.mov',
            '.ttf', '.otf', '.woff', '.woff2', '.eot',
            '.db', '.sqlite', '.sqlite3',
            '.pyc', '.pyo',
            '.node'
          ]);

          if (binaryExtensions.has(ext)) continue;

          try {
            // Binary detection: sample the first 1 KB before reading the whole file
            const fd = await fs.open(itemPath, 'r');
            const sampleBuf = Buffer.alloc(1024);
            const { bytesRead } = await fd.read(sampleBuf, 0, 1024, 0);
            await fd.close();
            if (bytesRead > 0 && !isValidUTF8(sampleBuf.slice(0, bytesRead))) {
              continue; // binary file — skip
            }
          } catch {
            continue; // can't sample — skip
          }

          try {
            const content = await fs.readFile(itemPath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, lineNumber) => {
              const matches = line.match(searchRegex);
              if (matches) {
                results.push({
                  file: itemPath,
                  fileName: item,
                  line: lineNumber + 1,
                  content: line.trim(),
                  matches: matches.length
                });
              }
            });
          } catch (error) {
            // Skip files that can't be read as text (binary, locked, permission-denied, etc.)
            console.warn(`[searchInDirectory] Skipping unreadable file "${path.normalize(itemPath)}": [${error.code || 'ERR'}] ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.error(`[searchInDirectory] Failed to read directory "${path.normalize(currentPath)}": [${error.code || 'ERR'}] ${error.message}`);
    }
  }
  
  await searchRecursively(dirPath);
  return results;
}

/**
 * Validates that a path is contained within the given workspace directory.
 *
 * Both paths are resolved to their absolute, normalized forms before comparison
 * to neutralize path traversal sequences (".."), mixed separators, and
 * URL-encoded characters that could be used to escape the workspace root.
 *
 * @param {string} targetPath - The path to validate (may be relative or contain "..").
 * @param {string} workspacePath - The workspace root that targetPath must reside within.
 * @returns {{ valid: boolean, resolvedPath: string }} Whether the path is safe and its resolved absolute form.
 */
function validatePathInWorkspace(targetPath, workspacePath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return { valid: false, resolvedPath: '' };
  }
  if (!workspacePath || typeof workspacePath !== 'string') {
    return { valid: false, resolvedPath: '' };
  }

  const resolvedTarget    = path.resolve(targetPath);
  const resolvedWorkspace = path.resolve(workspacePath);

  // Append the platform separator to prevent prefix-collision attacks where a
  // directory name is a strict prefix of another (e.g. /workspace vs /workspace-extra).
  const workspacePrefix = resolvedWorkspace.endsWith(path.sep)
    ? resolvedWorkspace
    : resolvedWorkspace + path.sep;

  // NTFS (Windows) paths are case-insensitive; normalise before comparing.
  const norm = process.platform === 'win32'
    ? (p) => p.toLowerCase()
    : (p) => p;

  const valid =
    norm(resolvedTarget) === norm(resolvedWorkspace) ||
    norm(resolvedTarget).startsWith(norm(workspacePrefix));

  return { valid, resolvedPath: resolvedTarget };
}

module.exports = {
  detectFileEncoding,
  buildFileTree,
  searchInDirectory,
  isValidUTF8,
  validatePathInWorkspace,
  FILE_SIZE_LIMIT,
  LARGE_FILE_THRESHOLD
};