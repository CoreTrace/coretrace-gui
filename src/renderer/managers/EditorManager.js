/**
 * Editor Manager - Handles editor functionality like gutter, status bar, formatting
 */
class EditorManager {
  constructor() {
    this.editor = document.getElementById('editor');
    this.gutter = document.getElementById('gutter');
    this.lineCounter = document.getElementById('lineCounter');
    this.init();
  }

  init() {
    if (!this.editor || !this.gutter || !this.lineCounter) return;

    // Make TAB key insert tab character in editor
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        // Insert tab character at cursor
        this.editor.setRangeText('\t', start, end, 'end');
        // Update gutter and status bar
        this.updateGutter();
        this.updateStatusBar();
      }
    });

    // Enhanced input handler
    this.editor.addEventListener('input', () => {
      this.updateAll();
    });

    this.editor.addEventListener('scroll', () => this.syncScroll());
    this.editor.addEventListener('click', () => this.updateStatusBar());
    this.editor.addEventListener('keyup', () => this.updateStatusBar());
    this.editor.addEventListener('select', () => this.updateStatusBar());
    
    // Handle cursor movement with arrow keys, page up/down, etc.
    this.editor.addEventListener('selectionchange', () => this.updateStatusBar());
    
    // Initialize
    this.updateAll();
  }

  /**
   * Enhanced gutter line numbers with proper formatting (like VS Code)
   */
  updateGutter() {
    if (!this.editor || !this.gutter) return;
    
    const lines = this.editor.value.split('\n').length;
    const maxDigits = Math.max(2, lines.toString().length);
    let gutterContent = '';
    
    // Create line numbers vertically (one per line)
    for (let i = 1; i <= lines; i++) {
      gutterContent += i.toString().padStart(maxDigits, ' ') + '\n';
    }
    
    // Remove the last newline and set content
    this.gutter.textContent = gutterContent.slice(0, -1);
    
    // Update gutter width based on content
    const charWidth = 8; // Approximate character width in monospace font
    this.gutter.style.width = Math.max(60, (maxDigits + 2) * charWidth) + 'px';
  }

  /**
   * Enhanced status bar with cursor position tracking
   */
  updateStatusBar() {
    if (!this.editor || !this.lineCounter) return;
    
    const value = this.editor.value;
    const selectionStart = this.editor.selectionStart;
    const selectionEnd = this.editor.selectionEnd;
    
    // Calculate line and column correctly
    const beforeCursor = value.substring(0, selectionStart);
    const lines = beforeCursor.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    
    if (selectionStart !== selectionEnd) {
      const selectedLength = Math.abs(selectionEnd - selectionStart);
      const selectedText = value.substring(Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd));
      const selectedLines = selectedText.split('\n').length - 1;
      this.lineCounter.textContent = `Ln ${line}, Col ${col} (${selectedLength} chars, ${selectedLines + 1} lines selected)`;
    } else {
      this.lineCounter.textContent = `Ln ${line}, Col ${col}`;
    }
  }

  /**
   * Sync gutter scroll with editor
   */
  syncScroll() {
    if (this.gutter && this.editor) {
      this.gutter.scrollTop = this.editor.scrollTop;
    }
  }

  /**
   * Update all editor components
   */
  updateAll() {
    this.updateGutter();
    this.updateStatusBar();
  }

  /**
   * Jump to specific line in editor
   * @param {number} lineNumber - Line number to jump to
   */
  jumpToLine(lineNumber) {
    console.log('Jumping to line:', lineNumber);
    
    if (!this.editor) {
      console.error('Editor not found');
      return;
    }
    
    const lines = this.editor.value.split('\n');
    console.log('Total lines in editor:', lines.length);
    
    if (lineNumber > lines.length) {
      console.warn('Line number exceeds file length');
      return;
    }
    
    let position = 0;
    
    // Calculate character position of the target line
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      position += lines[i].length + 1; // +1 for newline character
    }
    
    console.log('Calculated position:', position);
    
    // Set cursor position
    this.editor.focus();
    this.editor.setSelectionRange(position, position);
    
    // Calculate and set scroll position
    const lineHeight = 20; // Approximate line height
    const targetScrollTop = Math.max(0, (lineNumber - 10) * lineHeight);
    
    this.editor.scrollTop = targetScrollTop;
    
    // Update status bar
    this.updateStatusBar();
    
    // Highlight the line temporarily
    const endOfLinePosition = position + (lines[lineNumber - 1] ? lines[lineNumber - 1].length : 0);
    setTimeout(() => {
      this.editor.setSelectionRange(position, endOfLinePosition);
    }, 50);
    
    console.log('Successfully jumped to line:', lineNumber);
  }

  /**
   * Enhanced formatting
   */
  formatCode() {
    if (!this.editor) return;
    
    const lines = this.editor.value.split('\n');
    let indentLevel = 0;
    const formatted = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.endsWith('{') || trimmed.endsWith(':')) {
        const result = '  '.repeat(indentLevel) + trimmed;
        indentLevel++;
        return result;
      } else if (trimmed.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
        return '  '.repeat(indentLevel) + trimmed;
      } else {
        return '  '.repeat(indentLevel) + trimmed;
      }
    }).join('\n');
    
    this.editor.value = formatted;
    this.updateAll();
    
    return formatted;
  }

  /**
   * Toggle word wrap
   */
  toggleWordWrap() {
    if (!this.editor) return;
    
    this.editor.style.whiteSpace = this.editor.style.whiteSpace === 'pre-wrap' ? 'pre' : 'pre-wrap';
  }

  /**
   * Get editor content
   * @returns {string} - Current editor content
   */
  getContent() {
    return this.editor ? this.editor.value : '';
  }

  /**
   * Set editor content
   * @param {string} content - Content to set
   */
  setContent(content) {
    if (this.editor) {
      this.editor.value = content;
      this.updateAll();
    }
  }

  /**
   * Focus the editor
   */
  focus() {
    if (this.editor) {
      this.editor.focus();
    }
  }
}

module.exports = EditorManager;