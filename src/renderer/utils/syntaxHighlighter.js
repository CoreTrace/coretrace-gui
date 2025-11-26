/**
 * Scalable Syntax Highlighter for C/C++ code
 * Provides real-time syntax highlighting with optimized performance for large files
 */

// Load syntax configuration
const syntaxConfig = require('./syntax-config.json');

// Cache for language configurations
let languageCache = {};

/**
 * Get language configuration
 * @param {string} fileType - The file type
 * @returns {Object} - Language configuration
 */
function getLanguageConfig(fileType) {
  // Check cache first
  if (languageCache[fileType]) {
    return languageCache[fileType];
  }
  
  // Find matching language config
  for (const [langKey, config] of Object.entries(syntaxConfig)) {
    if (config.fileTypes.includes(fileType)) {
      // Convert arrays to Sets for faster lookup
      const processedConfig = {
        ...config,
        keywords: new Set(config.keywords),
        types: new Set(config.types),
        preprocessor: new Set(config.preprocessor)
      };
      languageCache[fileType] = processedConfig;
      return processedConfig;
    }
  }
  
  return null;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Tokenize C/C++ code for highlighting
 * @param {string} code - The code to tokenize
 * @param {Object} langConfig - Language configuration
 * @returns {Array} - Array of tokens with type and value
 */
function tokenizeCpp(code, langConfig) {
  const tokens = [];
  let i = 0;
  
  while (i < code.length) {
    const char = code[i];
    
    // Single-line comment
    if (code.substr(i, 2) === '//') {
      let comment = '//';
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        comment += code[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    
    // Multi-line comment
    if (code.substr(i, 2) === '/*') {
      let comment = '/*';
      i += 2;
      while (i < code.length && code.substr(i, 2) !== '*/') {
        comment += code[i];
        i++;
      }
      if (code.substr(i, 2) === '*/') {
        comment += '*/';
        i += 2;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }
    
    // String literals
    if (char === '"' || char === "'") {
      const quote = char;
      let str = quote;
      i++;
      while (i < code.length) {
        if (code[i] === '\\' && i + 1 < code.length) {
          str += code[i] + code[i + 1];
          i += 2;
        } else if (code[i] === quote) {
          str += quote;
          i++;
          break;
        } else {
          str += code[i];
          i++;
        }
      }
      tokens.push({ type: 'string', value: str });
      continue;
    }
    
    // Preprocessor directives
    if (char === '#') {
      let directive = '#';
      i++;
      while (i < code.length && /[a-zA-Z_]/.test(code[i])) {
        directive += code[i];
        i++;
      }
      tokens.push({ type: 'preprocessor', value: directive });
      
      // For #include, capture the file path
      if (directive.includes('include')) {
        while (i < code.length && /\s/.test(code[i])) {
          tokens.push({ type: 'whitespace', value: code[i] });
          i++;
        }
        if (i < code.length && (code[i] === '<' || code[i] === '"')) {
          const endChar = code[i] === '<' ? '>' : '"';
          let path = code[i];
          i++;
          while (i < code.length && code[i] !== endChar && code[i] !== '\n') {
            path += code[i];
            i++;
          }
          if (i < code.length && code[i] === endChar) {
            path += code[i];
            i++;
          }
          tokens.push({ type: 'string', value: path });
        }
      }
      continue;
    }
    
    // Numbers
    if (/\d/.test(char) || (char === '.' && i + 1 < code.length && /\d/.test(code[i + 1]))) {
      let num = char;
      i++;
      while (i < code.length && /[\d.xXa-fA-F]/.test(code[i])) {
        num += code[i];
        i++;
      }
      // Check for number suffixes
      if (i < code.length && /[fFlLuU]/.test(code[i])) {
        num += code[i];
        i++;
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }
    
    // Identifiers, keywords, types
    if (/[a-zA-Z_]/.test(char)) {
      let word = '';
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        word += code[i];
        i++;
      }
      
      // Skip whitespace to check for function call
      let j = i;
      while (j < code.length && /\s/.test(code[j])) j++;
      
      const isFunction = code[j] === '(';
      
      if (langConfig.keywords.has(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (langConfig.types.has(word)) {
        tokens.push({ type: 'type', value: word });
      } else if (isFunction) {
        tokens.push({ type: 'function', value: word });
      } else if (/^[A-Z_][A-Z0-9_]*$/.test(word)) {
        tokens.push({ type: 'constant', value: word });
      } else {
        tokens.push({ type: 'identifier', value: word });
      }
      continue;
    }
    
    // Operators
    if ('+-*/%=<>!&|^~?:'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }
    
    // Everything else
    tokens.push({ type: 'plain', value: char });
    i++;
  }
  
  return tokens;
}

/**
 * Convert tokens to HTML
 * @param {Array} tokens - Array of tokens
 * @param {Object} langConfig - Language configuration
 * @returns {string} - HTML string
 */
function tokensToHtml(tokens, langConfig) {
  const colorMap = langConfig.colors;
  
  return tokens.map(token => {
    const color = colorMap[token.type] || colorMap.plain;
    if (token.type === 'whitespace' || token.type === 'plain') {
      return escapeHtml(token.value);
    }
    return `<span style="color:${color}">${escapeHtml(token.value)}</span>`;
  }).join('');
}

/**
 * Highlight C/C++ syntax (optimized version)
 * @param {string} code - The code to highlight
 * @param {string} fileType - The file type
 * @returns {string} - HTML with syntax highlighting
 */
function highlightCppSyntax(code, fileType) {
  if (!code) return '';
  
  const langConfig = getLanguageConfig(fileType);
  if (!langConfig) return escapeHtml(code);
  
  const tokens = tokenizeCpp(code, langConfig);
  return tokensToHtml(tokens, langConfig);
}

/**
 * Apply syntax highlighting to editor based on file type
 * @param {string} code - The code to highlight
 * @param {string} fileType - The detected file type
 * @returns {string} - HTML with syntax highlighting
 */
function applySyntaxHighlight(code, fileType) {
  if (!code) return '';
  
  const langConfig = getLanguageConfig(fileType);
  
  // Apply highlighting if language config found
  if (langConfig) {
    return highlightCppSyntax(code, fileType);
  }
  
  // For other file types, return escaped HTML
  return escapeHtml(code);
}

/**
 * Check if file type should have syntax highlighting
 * @param {string} fileType - The file type to check
 * @returns {boolean} - True if highlighting should be applied
 */
function shouldHighlight(fileType) {
  return getLanguageConfig(fileType) !== null;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    highlightCppSyntax,
    applySyntaxHighlight,
    shouldHighlight,
    escapeHtml,
    tokenizeCpp,
    tokensToHtml
  };
}

// Make available globally
if (typeof window !== 'undefined') {
  window.syntaxHighlighter = {
    highlightCppSyntax,
    applySyntaxHighlight,
    shouldHighlight,
    escapeHtml,
    tokenizeCpp,
    tokensToHtml
  };
}
