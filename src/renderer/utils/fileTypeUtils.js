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
  const iconMap = {
    js: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
    ts: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg',
    html: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg',
    css: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg',
    py: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg',
    cpp: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg',
    c: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg',
    cc: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg',
    cxx: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg',
    h: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg',
    java: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg',
    php: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg',
    go: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg',
    rs: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-plain.svg',
    md: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg',
    json: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/json/json-original.svg',
    sh: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg'
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
    return `<img src="${iconMap[ext]}" alt="${safeExt} icon" class="file-icon-svg" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='${fallbackIconMap[ext] || '📄'}'">`;
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