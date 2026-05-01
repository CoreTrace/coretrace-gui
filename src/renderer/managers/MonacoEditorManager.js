;(function() {
/**
 * Monaco Editor Manager - Handles Monaco editor integration and functionality
 */

const detectFileType = (typeof window !== 'undefined' && window.detectFileType) || (typeof require === 'function' ? require('../utils/fileTypeUtils').detectFileType : null);

class MonacoEditorManager {
  constructor() {
    this.editor = null;
    this.lineCounter = document.getElementById('lineCounter');
    this.currentFileType = 'Plain Text';
    this.currentFilePath = null;
    this.editorContainer = document.getElementById('editor');
    this.initializationPromise = this.init();

    // Toggle in DevTools console: window.__CTRACE_DEBUG_SUGGEST__ = true
    // (kept false by default to avoid noisy logs)
    if (typeof window !== 'undefined' && window.__CTRACE_DEBUG_SUGGEST__ === undefined) {
      window.__CTRACE_DEBUG_SUGGEST__ = false;
    }
  }

  installSuggestWidgetDebug() {
    try {
      if (!window || !document) return;

      const shouldDebug = () => Boolean(window.__CTRACE_DEBUG_SUGGEST__);
      let lastLogAt = 0;

      const ensureDebugStyle = (enabled) => {
        const id = 'ctrace-suggest-debug-style';
        const existing = document.getElementById(id);
        if (!enabled) {
          if (existing) existing.remove();
          return;
        }
        if (existing) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
          .monaco-editor .suggest-widget { z-index: 99999 !important; }
          .monaco-editor .suggest-widget * { outline: 1px solid rgba(0,255,255,0.25) !important; }
          .monaco-editor .suggest-widget .monaco-list-row { background: rgba(255,0,0,0.12) !important; }
          .monaco-editor .suggest-widget .label-name { background: rgba(0,255,0,0.12) !important; }
          .monaco-editor .suggest-widget .label-description { background: rgba(0,0,255,0.10) !important; }
        `;
        document.head.appendChild(style);
      };

      const dumpEl = (label, el) => {
        if (!el) {
          console.log(`[suggest-debug] ${label}: <null>`);
          return;
        }
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        console.log(`[suggest-debug] ${label}`, {
          tag: el.tagName,
          className: el.className,
          textContent: (el.textContent || '').slice(0, 200),
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          opacity: cs.opacity,
          visibility: cs.visibility,
          display: cs.display,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          webkitTextFillColor: cs.webkitTextFillColor,
          filter: cs.filter
        });
      };

      const dumpSuggestWidget = () => {
        const now = Date.now();
        if (now - lastLogAt < 500) return;
        lastLogAt = now;

        ensureDebugStyle(shouldDebug());

        const widget = document.querySelector('.monaco-editor .suggest-widget');
        if (!widget) return;

        console.group('[suggest-debug] suggest-widget');
        dumpEl('widget', widget);

        const list = widget.querySelector('.monaco-list');
        const rowsContainer = widget.querySelector('.monaco-list-rows');
        dumpEl('list', list);
        dumpEl('rowsContainer', rowsContainer);

        // Show a short HTML snippet to detect weird overlays or missing children.
        const html = widget.innerHTML || '';
        console.log('[suggest-debug] widget.innerHTML (head):', html.slice(0, 800));

        // Try to introspect Monaco's suggest controller (best-effort; private API).
        try {
          const controller = this.editor && this.editor.getContribution
            ? this.editor.getContribution('editor.contrib.suggestController')
            : null;
          if (controller) {
            const c = controller;
            const completionModel = c._model && (c._model._completionModel || c._model.completionModel || c._model._completionModel);
            const items = completionModel && completionModel.items ? completionModel.items : null;
            console.log('[suggest-debug] suggestController keys:', Object.keys(c));
            console.log('[suggest-debug] completion items length:', Array.isArray(items) ? items.length : null);
            if (Array.isArray(items) && items.length) {
              const sample = items.slice(0, 5).map(it => {
                const s = it && (it.suggestion || it);
                return {
                  label: s && s.label,
                  kind: s && s.kind,
                  detail: s && s.detail
                };
              });
              console.log('[suggest-debug] completion sample:', sample);
            }
          } else {
            console.log('[suggest-debug] suggestController: <null>');
          }
        } catch (e) {
          console.log('[suggest-debug] suggestController introspection failed:', String(e && e.message ? e.message : e));
        }

        // Try to locate rows and label text.
        const rows = widget.querySelectorAll('.monaco-list-row');
        console.log(`[suggest-debug] rows: ${rows.length}`);
        rows.forEach((row, idx) => {
          dumpEl(`row[${idx}]`, row);
          const labelName = row.querySelector('.monaco-icon-label .label-name') || row.querySelector('.label-name');
          const labelDesc = row.querySelector('.monaco-icon-label .label-description') || row.querySelector('.label-description');
          dumpEl(`row[${idx}].label-name`, labelName);
          dumpEl(`row[${idx}].label-description`, labelDesc);

          // Detect overlays: what element is actually "on top" of the label area?
          const probe = (el, probeLabel) => {
            if (!el) return;
            const r = el.getBoundingClientRect();
            const cx = Math.max(0, r.left + Math.min(r.width / 2, r.width - 1));
            const cy = Math.max(0, r.top + Math.min(r.height / 2, r.height - 1));
            const topEl = document.elementFromPoint(cx, cy);
            console.log(`[suggest-debug] ${probeLabel}.elementFromPoint`, {
              center: { x: cx, y: cy },
              topTag: topEl ? topEl.tagName : null,
              topClass: topEl ? topEl.className : null,
              topText: topEl ? (topEl.textContent || '').slice(0, 80) : null
            });

            // Dump child nodes to see if text is in a span and potentially styled differently.
            try {
              const children = Array.from(el.childNodes || []).map(n => {
                if (n.nodeType === Node.TEXT_NODE) {
                  return { type: 'text', text: (n.textContent || '').slice(0, 80) };
                }
                if (n.nodeType === Node.ELEMENT_NODE) {
                  const cs = window.getComputedStyle(n);
                  return {
                    type: 'element',
                    tag: n.tagName,
                    className: n.className,
                    text: (n.textContent || '').slice(0, 80),
                    color: cs.color,
                    webkitTextFillColor: cs.webkitTextFillColor,
                    opacity: cs.opacity,
                    display: cs.display,
                    visibility: cs.visibility,
                    fontSize: cs.fontSize
                  };
                }
                return { type: `node:${n.nodeType}` };
              });
              console.log(`[suggest-debug] ${probeLabel}.childNodes`, children);
            } catch (e) {
              console.log(`[suggest-debug] ${probeLabel}.childNodes failed`, String(e && e.message ? e.message : e));
            }
          };

          probe(labelName, `row[${idx}].label-name`);
        });

        console.groupEnd();
      };

      // Observe DOM changes; Monaco toggles/updates this widget dynamically.
      const observer = new MutationObserver((mutations) => {
        if (!shouldDebug()) return;
        for (const m of mutations) {
          if (m.type === 'childList' || m.type === 'attributes') {
            dumpSuggestWidget();
            break;
          }
        }
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });

      // Expose a manual trigger.
      window.__ctraceDumpSuggestWidget = dumpSuggestWidget;
      window.__ctraceSuggestDebugStyle = (enabled) => ensureDebugStyle(Boolean(enabled));
    } catch (e) {
      console.warn('Failed to install suggest-widget debug:', e);
    }
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

    // Define a theme with explicit suggest-widget colors. In some Electron/CSS setups,
    // the suggest dropdown can appear with invisible text unless these are set via theme.
    try {
      window.monaco.editor.defineTheme('ctrace-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#0d1117',
          'editor.foreground': '#f0f6fc',
          'editorLineNumber.foreground': '#6e7681',
          'editorLineNumber.activeForeground': '#f0f6fc',

          // Professional suggest widget theme
          'editorSuggestWidget.background': '#1e1e1e',
          'editorSuggestWidget.foreground': '#cccccc',
          'editorSuggestWidget.border': '#3e3e42',
          'editorSuggestWidget.selectedBackground': '#37373d',
          'editorSuggestWidget.highlightForeground': '#0097fb',

          'editorHoverWidget.background': '#1e1e1e',
          'editorHoverWidget.foreground': '#cccccc',
          'editorHoverWidget.border': '#3e3e42'
        }
      });
    } catch (e) {
      console.warn('Failed to define Monaco theme:', e);
    }

    console.log('MonacoEditorManager: Creating editor instance');
    // Create Monaco Editor instance
    this.editor = window.monaco.editor.create(this.editorContainer, {
      value: '',
      language: 'plaintext',
      theme: 'ctrace-dark',
      automaticLayout: true,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, 'Cascadia Code', monospace",
      lineHeight: 20,
      // VS Code-like suggest widget sizing (supported by Monaco; ignored if unavailable)
      suggestFontSize: 13,
      suggestLineHeight: 22,
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
      tabSize: 4,
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
      },
      fixedOverflowWidgets: true
    });

    // Debugging for "blank" autocomplete dropdown.
    this.installSuggestWidgetDebug();

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

      let timeoutId;

      const cleanup = () => {
        clearInterval(checkInterval);
        clearTimeout(timeoutId);
        window.removeEventListener('monaco-loaded', onMonacoLoaded);
      };

      const onMonacoLoaded = () => {
        console.log('Monaco loaded via event');
        cleanup();
        resolve();
      };
      window.addEventListener('monaco-loaded', onMonacoLoaded);

      const checkInterval = setInterval(() => {
        if (window.monaco) {
          console.log('Monaco loaded via polling');
          cleanup();
          resolve();
        }
      }, 100);

      timeoutId = setTimeout(() => {
        cleanup();
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

if (typeof window !== 'undefined') {
  window.MonacoEditorManager = MonacoEditorManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MonacoEditorManager;
}
})();
