;(function() {
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
  // Icons ship with the app (assets/icons/devicon, MIT) so the file tree works
  // offline and the page can keep a strict img-src policy.
  const iconMap = {
    js: '../assets/icons/devicon/javascript-original.svg',
    ts: '../assets/icons/devicon/typescript-original.svg',
    html: '../assets/icons/devicon/html5-original.svg',
    css: '../assets/icons/devicon/css3-original.svg',
    py: '../assets/icons/devicon/python-original.svg',
    cpp: '../assets/icons/devicon/cplusplus-original.svg',
    c: '../assets/icons/devicon/c-original.svg',
    cc: '../assets/icons/devicon/cplusplus-original.svg',
    cxx: '../assets/icons/devicon/cplusplus-original.svg',
    h: '../assets/icons/devicon/c-original.svg',
    java: '../assets/icons/devicon/java-original.svg',
    php: '../assets/icons/devicon/php-original.svg',
    go: '../assets/icons/devicon/go-original.svg',
    rs: '../assets/icons/devicon/rust-plain.svg',
    md: '../assets/icons/devicon/markdown-original.svg',
    json: '../assets/icons/devicon/json-original.svg',
    sh: '../assets/icons/devicon/bash-original.svg'
  };
  const fallbackIconMap = {
    js: '🟨',
    ts: '🔷',
    html: '🟧',
    css: '🎨',
    json: '📋',
    md: '📝',
    py: '🐍',
    cpp: '⚙️',
    c: '⚙️',
    h: '📄',
    java: '☕',
    php: '🐘',
    rb: '💎',
    go: '🐹',
    rs: '🦀',
    cc: '⚙️',
    cxx: '⚙️',
    hpp: '📄',
    hh: '📄',
    hxx: '📄'
  };

  if (iconMap[ext]) {
    const safeExt = ext.replace(/[^a-z0-9]/gi, '');
    return `<img src="${iconMap[ext]}" alt="${safeExt} icon" class="file-icon-svg" loading="lazy">`;
  }

  return fallbackIconMap[ext] || '📄';
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectFileType,
    updateFileTypeStatus,
    getFileIcon,
    formatFileSize
  };
}
})();