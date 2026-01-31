/**
 * Monaco Editor Manager - Handles Monaco editor integration and functionality
 */

const { detectFileType } = require('../utils/fileTypeUtils');

class MonacoEditorManager {
  constructor() {
    this.editor = null;
    this.lineCounter = document.getElementById('lineCounter');
    this.currentFileType = 'Plain Text';
    this.currentFilePath = null;
    this.editorContainer = document.getElementById('editor');
    this.initializationPromise = this.init();
  }

  async init() {
    console.log('MonacoEditorManager: Starting initialization');
    console.log('MonacoEditorManager: Editor container:', this.editorContainer);
    
    if (!this.editorContainer) {
      console.error('Editor container not found');
      return;
    }

    // Wait for Monaco to be loaded (from global window.monaco)
    console.log('MonacoEditorManager: Waiting for Monaco...');
    await this.waitForMonaco();

    if (!window.monaco) {
      console.error('Monaco Editor not loaded');
      return;
    }

    console.log('MonacoEditorManager: Creating editor instance');
    // Create Monaco Editor instance
    this.editor = window.monaco.editor.create(this.editorContainer, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, 'Cascadia Code', monospace",
      lineHeight: 20,
      minimap: {
        enabled: true,
        scale: 1,
        showSlider: 'mouseover'
      },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false
      },
      renderLineHighlight: 'all',
      renderWhitespace: 'selection',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      mouseWheelZoom: true,
      padding: {
        top: 0,
        bottom: 0
      },
      bracketPairColorization: {
        enabled: true
      },
      guides: {
        bracketPairs: false,
        bracketPairsHorizontal: false,
        highlightActiveBracketPair: true,
        indentation: true,
        highlightActiveIndentation: false
      },
      lineNumbers: 'on',
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'mouseover',
      wordWrap: 'off',
      wrappingIndent: 'indent',
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: true,
      trimAutoWhitespace: true,
      formatOnPaste: true,
      formatOnType: true,
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoIndent: 'full',
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'none',
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false
      },
      wordBasedSuggestions: 'matchingDocuments',
      wordBasedSuggestionsMode: 'matchingDocuments',
      suggest: {
        showWords: true,
        showSnippets: false,
        showClasses: true,
        showFunctions: true,
        showVariables: true,
        showKeywords: true,
        localityBonus: true,
        shareSuggestSelections: false,
        showIcons: true,
        maxVisibleSuggestions: 12,
        filteredTypes: { 'keyword': false, 'snippet': true }
      }
    });

    // Update status bar on cursor position change
    this.editor.onDidChangeCursorPosition(() => {
      this.updateStatusBar();
    });

    // Update status bar on selection change
    this.editor.onDidChangeCursorSelection(() => {
      this.updateStatusBar();
    });

    // Initialize status bar
    this.updateStatusBar();

    console.log('Monaco Editor initialized successfully');
    console.log('Monaco editor instance:', this.editor);
  }

  /**
   * Wait for Monaco to be loaded from the global scope
   */
  async waitForMonaco() {
    return new Promise((resolve) => {
      if (window.monaco) {
        console.log('Monaco already loaded');
        resolve();
        return;
      }
      
      // Listen for the monaco-loaded event
      const onMonacoLoaded = () => {
        console.log('Monaco loaded via event');
        window.removeEventListener('monaco-loaded', onMonacoLoaded);
        resolve();
      };
      window.addEventListener('monaco-loaded', onMonacoLoaded);
      
      // Also poll as a fallback
      const checkInterval = setInterval(() => {
        if (window.monaco) {
          clearInterval(checkInterval);
          window.removeEventListener('monaco-loaded', onMonacoLoaded);
          console.log('Monaco loaded via polling');
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        window.removeEventListener('monaco-loaded', onMonacoLoaded);
        console.error('Monaco Editor failed to load within timeout');
        resolve();
      }, 10000);
    });
  }

  /**
   * Update status bar with cursor position
   */
  updateStatusBar() {
    if (!this.editor || !this.lineCounter) return;

    const position = this.editor.getPosition();
    const selection = this.editor.getSelection();
    
    if (!position) return;

    const line = position.lineNumber;
    const col = position.column;

    if (selection && !selection.isEmpty()) {
      const model = this.editor.getModel();
      if (model) {
        const selectedText = model.getValueInRange(selection);
        const selectedLines = selectedText.split('\n').length;
        this.lineCounter.textContent = `Ln ${line}, Col ${col} (${selectedText.length} chars, ${selectedLines} lines selected)`;
      }
    } else {
      this.lineCounter.textContent = `Ln ${line}, Col ${col}`;
    }
  }

  /**
   * Jump to specific line in editor
   * @param {number} lineNumber - Line number to jump to
   */
  jumpToLine(lineNumber) {
    if (!this.editor) {
      console.error('Editor not initialized');
      return;
    }

    const model = this.editor.getModel();
    if (!model) return;

    const totalLines = model.getLineCount();
    if (lineNumber > totalLines) {
      console.warn(`Line number ${lineNumber} exceeds file length (${totalLines} lines)`);
      lineNumber = totalLines;
    }

    // Set cursor position
    this.editor.setPosition({ lineNumber, column: 1 });
    
    // Scroll to line and center it
    this.editor.revealLineInCenter(lineNumber);
    
    // Focus editor
    this.editor.focus();

    console.log(`Jumped to line ${lineNumber}`);
  }

  /**
   * Format code
   */
  async formatCode() {
    if (!this.editor) return;

    const action = this.editor.getAction('editor.action.formatDocument');
    if (action) {
      await action.run();
      return this.getContent();
    }
    
    return this.getContent();
  }

  /**
   * Toggle word wrap
   */
  toggleWordWrap() {
    if (!this.editor || !window.monaco) return;

    const currentWrap = this.editor.getOption(window.monaco.editor.EditorOption.wordWrap);
    const newWrap = currentWrap === 'off' ? 'on' : 'off';
    this.editor.updateOptions({ wordWrap: newWrap });
  }

  /**
   * Get editor content
   * @returns {string} - Current editor content
   */
  getContent() {
    if (!this.editor) return '';
    const model = this.editor.getModel();
    return model ? model.getValue() : '';
  }

  /**
   * Set editor content
   * @param {string} content - Content to set
   */
  async setContent(content) {
    console.log('MonacoEditorManager.setContent called with content length:', content ? content.length : 0);
    await this.initializationPromise;
    console.log('MonacoEditorManager.setContent: Initialization complete, editor:', this.editor);
    
    if (!this.editor) {
      console.error('MonacoEditorManager.setContent: Editor not initialized');
      return;
    }

    const model = this.editor.getModel();
    console.log('MonacoEditorManager.setContent: Got model:', model);
    
    if (model) {
      model.setValue(content || '');
      console.log('MonacoEditorManager.setContent: Content set successfully');
      this.updateStatusBar();
      
      // Force layout update in case container was hidden when editor was created
      setTimeout(() => {
        if (this.editor) {
          this.editor.layout();
          console.log('MonacoEditorManager.setContent: Layout updated');
        }
      }, 100);
    } else {
      console.error('MonacoEditorManager.setContent: No model available');
    }
  }

  /**
   * Set file type and update language
   * @param {string} filename - The filename to detect type from
   */
  async setFileType(filename) {
    await this.initializationPromise;
    if (!this.editor) return;

    this.currentFileType = detectFileType(filename);
    this.currentFilePath = filename;

    // Map file types to Monaco languages
    const languageMap = {
      'C': 'c',
      'C++': 'cpp',
      'C/C++ Header': 'cpp',
      'JavaScript': 'javascript',
      'TypeScript': 'typescript',
      'Python': 'python',
      'Java': 'java',
      'JSON': 'json',
      'HTML': 'html',
      'CSS': 'css',
      'Markdown': 'markdown',
      'XML': 'xml',
      'YAML': 'yaml',
      'Shell Script': 'shell',
      'SQL': 'sql',
      'Makefile': 'makefile',
      'Plain Text': 'plaintext'
    };

    const monacoLanguage = languageMap[this.currentFileType] || 'plaintext';
    
    const model = this.editor.getModel();
    if (model && window.monaco) {
      window.monaco.editor.setModelLanguage(model, monacoLanguage);
    }

    console.log(`Set language to ${monacoLanguage} for file type ${this.currentFileType}`);
  }

  /**
   * Show find/replace widget
   */
  showFindDialog() {
    if (!this.editor) return;
    this.editor.trigger('', 'actions.find');
  }

  /**
   * Focus the editor
   */
  focus() {
    if (this.editor) {
      this.editor.focus();
    }
  }

  /**
   * Dispose the editor
   */
  dispose() {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }

  /**
   * Get Monaco editor instance (for advanced operations)
   * @returns {monaco.editor.IStandaloneCodeEditor} Monaco editor instance
   */
  getMonacoInstance() {
    return this.editor;
  }
}

module.exports = MonacoEditorManager;
