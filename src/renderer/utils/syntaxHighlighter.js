/**
 * Scalable Syntax Highlighter for C/C++ code
 * Provides real-time syntax highlighting with optimized performance for large files
 */

/**
 * C/C++ Keywords
 */
const C_CPP_KEYWORDS = new Set([
  // C keywords
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
  // C++ keywords
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'atomic_cancel', 'atomic_commit',
  'atomic_noexcept', 'bitand', 'bitor', 'bool', 'catch', 'char8_t', 'char16_t',
  'char32_t', 'class', 'compl', 'concept', 'const_cast', 'consteval', 'constexpr',
  'constinit', 'co_await', 'co_return', 'co_yield', 'decltype', 'delete', 'dynamic_cast',
  'explicit', 'export', 'false', 'friend', 'inline', 'mutable', 'namespace', 'new',
  'noexcept', 'not', 'not_eq', 'nullptr', 'operator', 'or', 'or_eq', 'private',
  'protected', 'public', 'reflexpr', 'reinterpret_cast', 'requires', 'static_assert',
  'static_cast', 'synchronized', 'template', 'this', 'thread_local', 'throw', 'true',
  'try', 'typeid', 'typename', 'using', 'virtual', 'wchar_t', 'xor', 'xor_eq',
  // Common preprocessor
  'define', 'undef', 'include', 'ifdef', 'ifndef', 'if', 'elif', 'else', 'endif',
  'error', 'pragma', 'line'
]);

/**
 * C/C++ Types (commonly used standard library types)
 */
const C_CPP_TYPES = new Set([
  'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
  'size_t', 'ssize_t', 'ptrdiff_t', 'intptr_t', 'uintptr_t',
  'string', 'vector', 'map', 'set', 'list', 'deque', 'queue',
  'stack', 'array', 'unordered_map', 'unordered_set',
  'shared_ptr', 'unique_ptr', 'weak_ptr', 'optional', 'variant',
  'FILE', 'nullptr_t', 'std', 'iostream', 'fstream'
]);

/**
 * Escape HTML special characters
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
 * @returns {Array} - Array of tokens with type and value
 */
function tokenizeCpp(code) {
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
      
      if (C_CPP_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (C_CPP_TYPES.has(word)) {
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
 * @returns {string} - HTML string
 */
function tokensToHtml(tokens) {
  const colorMap = {
    comment: '#6a9955',
    string: '#ce9178',
    preprocessor: '#c586c0',
    number: '#b5cea8',
    keyword: '#569cd6',
    type: '#4ec9b0',
    function: '#dcdcaa',
    constant: '#4fc1ff',
    identifier: '#9cdcfe',
    operator: '#d4d4d4',
    plain: '#d4d4d4'
  };
  
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
 * @returns {string} - HTML with syntax highlighting
 */
function highlightCppSyntax(code) {
  if (!code) return '';
  
  const tokens = tokenizeCpp(code);
  return tokensToHtml(tokens);
}

/**
 * Apply syntax highlighting to editor based on file type
 * @param {string} code - The code to highlight
 * @param {string} fileType - The detected file type
 * @returns {string} - HTML with syntax highlighting
 */
function applySyntaxHighlight(code, fileType) {
  if (!code) return '';
  
  // Only apply highlighting for C/C++ files
  if (fileType === 'C' || fileType === 'C++' || fileType === 'C/C++ Header') {
    return highlightCppSyntax(code);
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
  return fileType === 'C' || fileType === 'C++' || fileType === 'C/C++ Header';
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
