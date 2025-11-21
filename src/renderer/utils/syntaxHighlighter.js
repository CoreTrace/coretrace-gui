/**
 * Syntax Highlighter for C/C++ code
 * Provides syntax highlighting with proper color coding for different token types
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
 * Highlight C/C++ syntax
 * @param {string} code - The code to highlight
 * @returns {string} - HTML with syntax highlighting
 */
function highlightCppSyntax(code) {
  if (!code) return '';
  
  let result = '';
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
      result += `<span style="color:#6a9955">${escapeHtml(comment)}</span>`;
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
      result += `<span style="color:#6a9955">${escapeHtml(comment)}</span>`;
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
      result += `<span style="color:#ce9178">${escapeHtml(str)}</span>`;
      continue;
    }
    
    // Preprocessor directives
    if (char === '#') {
      let directive = '#';
      i++;
      // Get the directive name
      while (i < code.length && /[a-zA-Z_]/.test(code[i])) {
        directive += code[i];
        i++;
      }
      result += `<span style="color:#c586c0">${escapeHtml(directive)}</span>`;
      
      // For #include, highlight the file path
      if (directive.includes('include')) {
        while (i < code.length && /\s/.test(code[i])) {
          result += code[i];
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
          result += `<span style="color:#ce9178">${escapeHtml(path)}</span>`;
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
      // Check for number suffixes (f, L, u, etc.)
      if (i < code.length && /[fFlLuU]/.test(code[i])) {
        num += code[i];
        i++;
      }
      result += `<span style="color:#b5cea8">${escapeHtml(num)}</span>`;
      continue;
    }
    
    // Identifiers, keywords, types, and function names
    if (/[a-zA-Z_]/.test(char)) {
      let word = '';
      let startIdx = i;
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        word += code[i];
        i++;
      }
      
      // Skip whitespace to check for function call
      let j = i;
      while (j < code.length && /\s/.test(code[j])) j++;
      
      const isFunction = code[j] === '(';
      
      if (C_CPP_KEYWORDS.has(word)) {
        result += `<span style="color:#569cd6">${escapeHtml(word)}</span>`;
      } else if (C_CPP_TYPES.has(word)) {
        result += `<span style="color:#4ec9b0">${escapeHtml(word)}</span>`;
      } else if (isFunction) {
        result += `<span style="color:#dcdcaa">${escapeHtml(word)}</span>`;
      } else if (/^[A-Z_][A-Z0-9_]*$/.test(word)) {
        // MACRO/CONSTANT (all caps)
        result += `<span style="color:#4fc1ff">${escapeHtml(word)}</span>`;
      } else {
        // Regular identifier/variable
        result += `<span style="color:#9cdcfe">${escapeHtml(word)}</span>`;
      }
      continue;
    }
    
    // Operators and special characters
    if ('+-*/%=<>!&|^~?:'.includes(char)) {
      result += `<span style="color:#d4d4d4">${escapeHtml(char)}</span>`;
      i++;
      continue;
    }
    
    // Everything else (whitespace, brackets, etc.)
    result += escapeHtml(char);
    i++;
  }
  
  return result;
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    highlightCppSyntax,
    applySyntaxHighlight,
    escapeHtml
  };
}

// Make available globally
if (typeof window !== 'undefined') {
  window.syntaxHighlighter = {
    highlightCppSyntax,
    applySyntaxHighlight,
    escapeHtml
  };
}
