/**
 * Detect file type based on file extension
 * @param {string} filename - The filename to analyze
 * @returns {string} - The detected file type
 */
function detectFileType(filename) {
  if (!filename) return "Plain Text";
  const lower = filename.toLowerCase();
  
  if (lower === "cmakelists.txt" || lower.endsWith(".cmake")) return "CMake";
  if (lower.endsWith(".c")) return "C";
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx")) return "C++";
  if (lower.endsWith(".h") || lower.endsWith(".hpp") || lower.endsWith(".hh") || lower.endsWith(".hxx")) return "C/C++ Header";
  if (lower.endsWith(".js")) return "JavaScript";
  if (lower.endsWith(".ts")) return "TypeScript";
  if (lower.endsWith(".py")) return "Python";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.endsWith(".md")) return "Markdown";
  if (lower.endsWith(".txt")) return "Plain Text";
  
  return "Plain Text";
}

/**
 * Update file type status in the status bar
 * @param {string} filename - The filename to analyze
 */
function updateFileTypeStatus(filename) {
  const type = detectFileType(filename);
  const el = document.getElementById("fileType");
  if (el) el.textContent = type;
}

/**
 * Get file icon based on extension
 * @param {string} filename - The filename
 * @returns {string} - Unicode emoji for file icon
 */
function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const iconMap = {
    'js': '🟨',
    'ts': '🔷',
    'html': '🟧',
    'css': '🎨',
    'json': '📋',
    'md': '📝',
    'py': '🐍',
    'cpp': '⚙️',
    'c': '⚙️',
    'h': '📄',
    'java': '☕',
    'php': '🐘',
    'rb': '💎',
    'go': '🐹',
    'rs': '🦀'
  };
  return iconMap[ext] || '📄';
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Make functions available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.detectFileType = detectFileType;
  window.updateFileTypeStatus = updateFileTypeStatus;
  window.getFileIcon = getFileIcon;
  window.formatFileSize = formatFileSize;
}

module.exports = {
  detectFileType,
  updateFileTypeStatus,
  getFileIcon,
  formatFileSize
};