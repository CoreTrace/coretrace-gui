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

    // Maintain visual selection when editor loses focus
    this.setupPersistentSelection();

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
   * Setup persistent selection highlighting (like VS Code)
   * Keeps selection visually highlighted even when editor loses focus
   */
  setupPersistentSelection() {
    // Create a canvas to measure text and draw highlights
    const editorArea = document.getElementById('editor-area');
    if (!editorArea) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '12px JetBrains Mono, monospace';
    
    // Create highlight overlay that will contain absolute positioned divs
    const highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'selection-highlight-overlay';
    highlightOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    `;
    
    // Insert overlay after gutter but before editor
    const gutter = document.getElementById('gutter');
    if (gutter && gutter.nextSibling) {
      editorArea.insertBefore(highlightOverlay, gutter.nextSibling);
    } else {
      editorArea.appendChild(highlightOverlay);
    }
    
    // Make editor background transparent so overlay shows through
    this.editor.style.position = 'relative';
    this.editor.style.zIndex = '1';
    this.editor.style.background = 'transparent';
    
    let savedSelection = null;
    
    const updateHighlight = () => {
      highlightOverlay.innerHTML = '';
      
      if (!savedSelection || !this.editor.value) {
        return;
      }
      
      const { start, end } = savedSelection;
      const text = this.editor.value;
      const lines = text.split('\n');
      
      // Get editor dimensions and position
      const editorRect = this.editor.getBoundingClientRect();
      const editorAreaRect = editorArea.getBoundingClientRect();
      const gutterWidth = 61; // gutter width + border
      const lineHeight = 20;
      const paddingLeft = 20;
      const paddingTop = 20;
      
      // Calculate which lines contain the selection
      let charCount = 0;
      let startLine = -1, startCol = -1;
      let endLine = -1, endCol = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        
        if (startLine === -1 && charCount + lineLength >= start) {
          startLine = i;
          startCol = start - charCount;
        }
        
        if (endLine === -1 && charCount + lineLength >= end) {
          endLine = i;
          endCol = end - charCount;
          break;
        }
        
        charCount += lineLength + 1; // +1 for newline
      }
      
      if (startLine === -1 || endLine === -1) return;
      
      // Draw highlight rectangles for each line in selection
      for (let line = startLine; line <= endLine; line++) {
        const lineText = lines[line];
        let colStart = (line === startLine) ? startCol : 0;
        let colEnd = (line === endLine) ? endCol : lineText.length;
        
        // Measure text width to get exact position
        const beforeText = lineText.substring(0, colStart);
        const selectedText = lineText.substring(colStart, colEnd);
        
        const startX = ctx.measureText(beforeText).width;
        const width = ctx.measureText(selectedText).width;
        
        // Create highlight div for this line
        const highlight = document.createElement('div');
        highlight.style.cssText = `
          position: absolute;
          left: ${gutterWidth + paddingLeft + startX}px;
          top: ${paddingTop + (line * lineHeight) - this.editor.scrollTop}px;
          width: ${width + 2}px;
          height: ${lineHeight}px;
          background: #3a3d41;
          pointer-events: none;
        `;
        
        highlightOverlay.appendChild(highlight);
      }
    };
    
    // Save selection when editor loses focus
    this.editor.addEventListener('blur', () => {
      const start = this.editor.selectionStart;
      const end = this.editor.selectionEnd;
      if (start !== end) {
        savedSelection = { start, end };
        updateHighlight();
      }
    });
    
    // Clear highlight when editor gains focus
    this.editor.addEventListener('focus', () => {
      if (savedSelection) {
        // Restore the selection
        this.editor.setSelectionRange(savedSelection.start, savedSelection.end);
      }
      savedSelection = null;
      highlightOverlay.innerHTML = '';
    });
    
    // Update highlight position on scroll
    this.editor.addEventListener('scroll', () => {
      if (savedSelection) {
        updateHighlight();
      }
    });
    
    // Clear on text change
    this.editor.addEventListener('input', () => {
      if (savedSelection) {
        savedSelection = null;
        highlightOverlay.innerHTML = '';
      }
    });
  }
  
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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