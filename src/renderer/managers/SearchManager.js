;(function() {
class SearchManager {
  constructor(editorManager, notificationManager) {
    this.editorManager = editorManager;
    this.notificationManager = notificationManager;
    this.searchTimeout = null;
    this.init();
  }

  init() {
    this.setupSidebarSearch();
  }

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

      const result = await window.api.invoke('search-in-files', searchTerm, this.currentWorkspacePath);

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

      const escapedPath = file.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      html += `<div class="search-result-item" style="display: flex; flex-direction: column;">`;
      html += `<div class="search-result-file" onclick="window.searchManager.openSearchResult('${escapedPath}', ${fileResults[0].line})" style="margin-bottom: 4px;">${fileName}</div>`;
      html += `<div class="search-result-line" style="margin-bottom: 6px;">${relativePath} • ${fileResults.length} result${fileResults.length > 1 ? 's' : ''}</div>`;

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

  clearSearchResults() {
    const searchResults = document.getElementById('search-results');
    if (searchResults) {
      searchResults.innerHTML = '';
    }
  }

  async openSearchResult(filePath, lineNumber) {
    console.log('Open search result requested:', filePath, 'at line', lineNumber);
  }

  setWorkspacePath(workspacePath) {
    this.currentWorkspacePath = workspacePath;
  }
}

if (typeof window !== 'undefined') {
  window.SearchManager = SearchManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchManager;
}
})();
