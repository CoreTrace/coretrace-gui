/**
 * Search Manager - Handles search functionality
 */
class SearchManager {
  constructor(editorManager, notificationManager) {
    this.editorManager = editorManager;
    this.notificationManager = notificationManager;
    this.currentSearchMatches = [];
    this.currentMatchIndex = -1;
    this.searchTimeout = null;
    this.init();
  }

  init() {
    this.setupSearchWidget();
    this.setupGoToLineDialog();
    this.setupSidebarSearch();
  }

  /**
   * Setup search widget functionality
   */
  setupSearchWidget() {
    const widgetSearchInput = document.getElementById('widget-search-input');
    if (widgetSearchInput) {
      widgetSearchInput.addEventListener('input', (e) => {
        this.performLiveSearch(e.target.value);
      });
    }
  }

  /**
   * Setup go to line dialog
   */
  setupGoToLineDialog() {
    // Event handlers will be attached by the UI controller
  }

  /**
   * Setup sidebar search
   */
  setupSidebarSearch() {
    const searchInput = document.getElementById('sidebar-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim();
        
        if (this.searchTimeout) {
          clearTimeout(this.searchTimeout);
        }
        
        if (searchTerm.length >= 2 && this.currentWorkspacePath) {
          this.searchTimeout = setTimeout(() => {
            this.performWorkspaceSearch(searchTerm);
          }, 300);
        } else {
          this.clearSearchResults();
        }
      });
    }
  }

  /**
   * Show find dialog
   */
  showFindDialog() {
    const widget = document.getElementById('search-widget');
    const input = document.getElementById('widget-search-input');
    widget.classList.add('visible');
    input.focus();
    input.select();
  }

  /**
   * Close search widget
   */
  closeSearchWidget() {
    const widget = document.getElementById('search-widget');
    widget.classList.remove('visible');
    this.clearSearchHighlights();
    this.currentSearchMatches = [];
    this.currentMatchIndex = -1;
    this.updateSearchResults();
  }

  /**
   * Perform live search in current document
   * @param {string} searchText - Text to search for
   */
  performLiveSearch(searchText) {
    this.clearSearchHighlights();
    this.currentSearchMatches = [];
    this.currentMatchIndex = -1;

    if (!searchText.trim()) {
      this.updateSearchResults();
      return;
    }

    const text = this.editorManager.getContent();
    
    if (!text) {
      this.updateSearchResults();
      return;
    }

    try {
      const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        this.currentSearchMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        });
        
        // Prevent infinite loops with zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }

      if (this.currentSearchMatches.length > 0) {
        this.currentMatchIndex = 0;
        this.highlightAllMatches();
      }
    } catch (e) {
      console.warn('Invalid search regex:', e);
    }

    this.updateSearchResults();
  }

  /**
   * Search next match
   */
  searchNext() {
    if (this.currentSearchMatches.length === 0) return;
    
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.currentSearchMatches.length;
    this.highlightAllMatches();
    this.focusOnCurrentMatch();
    this.updateSearchResults();
  }

  /**
   * Search previous match
   */
  searchPrev() {
    if (this.currentSearchMatches.length === 0) return;
    
    this.currentMatchIndex = this.currentMatchIndex <= 0 
      ? this.currentSearchMatches.length - 1 
      : this.currentMatchIndex - 1;
    this.highlightAllMatches();
    this.focusOnCurrentMatch();
    this.updateSearchResults();
  }

  /**
   * Update search results display
   */
  updateSearchResults() {
    const resultsText = document.getElementById('search-results-text');
    const prevBtn = document.getElementById('search-prev');
    const nextBtn = document.getElementById('search-next');

    if (!resultsText || !prevBtn || !nextBtn) return;

    if (this.currentSearchMatches.length === 0) {
      resultsText.textContent = 'No results';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else {
      resultsText.textContent = `${this.currentMatchIndex + 1} of ${this.currentSearchMatches.length}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }
  }

  /**
   * Focus on current match
   */
  focusOnCurrentMatch() {
    if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.currentSearchMatches.length) {
      const match = this.currentSearchMatches[this.currentMatchIndex];
      const monacoEditor = this.editorManager.getMonacoInstance ? this.editorManager.getMonacoInstance() : null;

      if (monacoEditor) {
        const model = monacoEditor.getModel();
        if (model) {
          const startPos = model.getPositionAt(match.start);
          const endPos = model.getPositionAt(match.end);
          const range = {
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column
          };
          monacoEditor.focus();
          monacoEditor.setSelection(range);
          monacoEditor.revealRangeInCenter(range);
          return;
        }
      }

      // Fallback to legacy textarea editor
      const editor = this.editorManager.editor;
      editor.focus();
      editor.setSelectionRange(match.start, match.end);
      // Scroll to make the match visible
      const lines = editor.value.substring(0, match.start).split('\n');
      const lineNumber = lines.length;
      const approximateLineHeight = 20;
      const targetScrollTop = (lineNumber - 5) * approximateLineHeight;
      editor.scrollTop = Math.max(0, targetScrollTop);
      setTimeout(() => {
        if (editor.setSelectionRange) {
          editor.setSelectionRange(match.start, match.end);
        }
      }, 10);
    }
  }

  /**
   * Highlight all matches
   */
  highlightAllMatches() {
    // For now, we'll keep it simple and just highlight the current match when navigating
  }

  /**
   * Clear search highlights
   */
  clearSearchHighlights() {
    // Clear any visual highlights if implemented
  }

  /**
   * Show go to line dialog
   */
  showGoToLineDialog() {
    const dialog = document.getElementById('goto-dialog');
    const input = document.getElementById('goto-input');
    
    // Set max value based on current content
    const text = this.editorManager.getContent();
    if (text) {
      const lineCount = text.split('\n').length;
      input.max = lineCount;
    }
    
    dialog.classList.add('visible');
    input.focus();
    input.select();
  }

  /**
   * Close go to line dialog
   */
  closeGoToLineDialog() {
    const dialog = document.getElementById('goto-dialog');
    dialog.classList.remove('visible');
  }

  /**
   * Perform go to line
   */
  performGoToLine() {
    const input = document.getElementById('goto-input');
    const lineNumber = parseInt(input.value);
    
    if (!lineNumber || lineNumber < 1) {
      this.notificationManager.showError('Please enter a valid line number');
      return;
    }
    
    const text = this.editorManager.getContent();
    if (text) {
      const lines = text.split('\n');
      
      if (lineNumber > lines.length) {
        this.notificationManager.showError(`Line ${lineNumber} does not exist. Maximum line is ${lines.length}`);
        return;
      }
      
      this.editorManager.jumpToLine(lineNumber);
      this.notificationManager.showSuccess(`Jumped to line ${lineNumber}`);
    } else {
      this.notificationManager.showError('No file is currently open');
    }
    
    this.closeGoToLineDialog();
  }

  /**
   * Perform workspace search
   * @param {string} searchTerm - Term to search for
   */
  async performWorkspaceSearch(searchTerm) {
    if (!this.currentWorkspacePath) {
      this.displaySearchResults([], searchTerm);
      return;
    }

    try {
      const searchResults = document.getElementById('search-results');
      if (searchResults) {
        searchResults.innerHTML = '<div style="color: #7d8590; padding: 12px; text-align: center;">Searching...</div>';
      }
      
      const result = await window.ipcRenderer.invoke('search-in-files', searchTerm, this.currentWorkspacePath);
      
      if (result.success) {
        this.displaySearchResults(result.results, searchTerm);
      } else {
        const searchResults = document.getElementById('search-results');
        if (searchResults) {
          searchResults.innerHTML = '<div style="color: #f85149; padding: 12px;">Search failed: ' + result.error + '</div>';
        }
      }
    } catch (error) {
      const searchResults = document.getElementById('search-results');
      if (searchResults) {
        searchResults.innerHTML = '<div style="color: #f85149; padding: 12px;">Search error: ' + error.message + '</div>';
      }
    }
  }

  /**
   * Display search results in sidebar
   * @param {Array} results - Search results
   * @param {string} searchTerm - Search term
   */
  displaySearchResults(results, searchTerm) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) return;

    if (results.length === 0) {
      searchResults.innerHTML = '<div style="color: #7d8590; padding: 12px; text-align: center;">No results found</div>';
      return;
    }

    const groupedResults = {};
    results.forEach(result => {
      if (!groupedResults[result.file]) {
        groupedResults[result.file] = [];
      }
      groupedResults[result.file].push(result);
    });

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    
    Object.keys(groupedResults).forEach(file => {
      const fileResults = groupedResults[file];
      const fileName = file.split(/[/\\]/).pop();
      const relativePath = file.replace(this.currentWorkspacePath, '').replace(/^[/\\]/, '');
      
      // Escape the file path properly for onclick
      const escapedPath = file.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      
      html += `<div class="search-result-item" style="display: flex; flex-direction: column;">`;
      html += `<div class="search-result-file" onclick="window.searchManager.openSearchResult('${escapedPath}', ${fileResults[0].line})" style="margin-bottom: 4px;">${fileName}</div>`;
      html += `<div class="search-result-line" style="margin-bottom: 6px;">${relativePath} • ${fileResults.length} result${fileResults.length > 1 ? 's' : ''}</div>`;
      
      // Show each line result individually in vertical layout
      html += '<div style="display: flex; flex-direction: column; gap: 2px;">';
      fileResults.forEach(result => {
        const highlightedContent = result.content.replace(
          new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          match => `<span class="search-highlight">${match}</span>`
        );
        html += `<div class="search-result-content" onclick="window.searchManager.openSearchResult('${escapedPath}', ${result.line}); event.stopPropagation();" style="display: block; margin: 2px 0; padding: 4px 6px; cursor: pointer; border-radius: 3px; background: #161b22; border-left: 2px solid #1f6feb;" onmouseover="this.style.background='#30363d'" onmouseout="this.style.background='#161b22'">`;
        html += `<div style="color: #7d8590; font-size: 10px; margin-bottom: 2px;">Line ${result.line}:</div>`;
        html += `<div style="font-family: monospace; font-size: 11px;">${highlightedContent}</div>`;
        html += `</div>`;
      });
      html += '</div>';
      
      html += '</div>';
    });
    
    html += '</div>';
    searchResults.innerHTML = html;
  }

  /**
   * Clear search results
   */
  clearSearchResults() {
    const searchResults = document.getElementById('search-results');
    if (searchResults) {
      searchResults.innerHTML = '';
    }
  }

  /**
   * Open search result (to be implemented by parent controller)
   * @param {string} filePath - File path
   * @param {number} lineNumber - Line number
   */
  async openSearchResult(filePath, lineNumber) {
    // This will be implemented by the main controller
    console.log('Open search result requested:', filePath, 'at line', lineNumber);
  }

  /**
   * Set current workspace path
   * @param {string} workspacePath - Workspace path
   */
  setWorkspacePath(workspacePath) {
    this.currentWorkspacePath = workspacePath;
  }
}

module.exports = SearchManager;