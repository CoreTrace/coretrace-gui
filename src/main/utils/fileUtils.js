const fs = require('fs').promises;
const path = require('path');

// File size limit for initial display (1MB)
const FILE_SIZE_LIMIT = 1024 * 1024;

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
 * Detect file encoding
 * @param {string} filePath - Path to the file
 * @returns {Object} - File info with encoding and size data
 */
async function detectFileEncoding(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const isUTF8 = isValidUTF8(buffer);
    console.log(`File: ${filePath}, Size: ${buffer.length}, IsUTF8: ${isUTF8}`);
    console.log(`First 100 bytes:`, buffer.slice(0, 100).toString('hex'));
    return {
      isUTF8,
      size: buffer.length,
      buffer
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Build file tree for directory
 * @param {string} dirPath - Directory path
 * @param {number} maxDepth - Maximum depth to traverse
 * @param {number} currentDepth - Current depth (internal use)
 * @returns {Array} - File tree structure
 */
async function buildFileTree(dirPath, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return null;
  
  try {
    const items = await fs.readdir(dirPath);
    const tree = [];
    
    for (const item of items) {
      // Skip hidden files, common build directories, and Windows system folders
      if (item.startsWith('.') || 
          ['node_modules', 'dist', 'build', '.git', 'My Music', 'My Pictures', 'My Videos', '$RECYCLE.BIN', 'System Volume Information'].includes(item)) {
        continue;
      }
      
      const itemPath = path.join(dirPath, item);
      
      try {
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          const children = await buildFileTree(itemPath, maxDepth, currentDepth + 1);
          tree.push({
            name: item,
            path: itemPath,
            type: 'directory',
            children: children || []
          });
        } else {
          tree.push({
            name: item,
            path: itemPath,
            type: 'file'
          });
        }
      } catch (itemError) {
        // Skip items that cause permission errors or other access issues
        if (itemError.code === 'EPERM' || itemError.code === 'EACCES' || itemError.code === 'ENOENT') {
          console.warn(`Skipping inaccessible item: ${itemPath} (${itemError.code})`);
          continue;
        }
        // Re-throw unexpected errors
        throw itemError;
      }
    }
    
    return tree.sort((a, b) => {
      // Directories first, then files
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    // Handle directory-level permission errors
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn(`Permission denied accessing directory: ${dirPath}`);
      return [];
    }
    console.error('Error building file tree:', error);
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
          // Only search in text files
          const ext = path.extname(item).toLowerCase();
          const textExtensions = ['.txt', '.js', '.ts', '.html', '.css', '.json', '.md', '.py', '.cpp', '.c', '.h', '.java', '.php', '.rb', '.go', '.rs'];
          
          if (textExtensions.includes(ext) || !ext) {
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
              // Skip files that can't be read as text
            }
          }
        }
      }
    } catch (error) {
      console.error('Error searching directory:', error);
    }
  }
  
  await searchRecursively(dirPath);
  return results;
}

module.exports = {
  detectFileEncoding,
  buildFileTree,
  searchInDirectory,
  isValidUTF8,
  FILE_SIZE_LIMIT
};