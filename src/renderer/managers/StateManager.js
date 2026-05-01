;(function() {
/**
 * State Manager - Handles application state persistence for work loss prevention
 * 
 * This manager saves and restores the complete application state including:
 * - All open tabs with their content
 * - Active tab selection
 * - Last analysis results
 * - Editor state (cursor position, scroll, etc.)
 * 
 * State is automatically saved on various events and restored on application startup.
 * 
 * @class StateManager
 * @author CTrace GUI Team
 * @version 1.0.0
 */
class StateManager {
  /**
   * Creates an instance of StateManager.
   * 
   * @constructor
   * @memberof StateManager
   * @param {TabManager} tabManager - Tab manager instance
   * @param {MonacoEditorManager} editorManager - Editor manager instance
   * @param {DiagnosticsManager} diagnosticsManager - Diagnostics manager instance
   */
  constructor(tabManager, editorManager, diagnosticsManager) {
    this.tabManager = tabManager;
    this.editorManager = editorManager;
    this.diagnosticsManager = diagnosticsManager;
    
    /**
     * Auto-save interval in milliseconds (default: 30 seconds)
     * @type {number}
     * @private
     */
    this.autoSaveInterval = 30000;
    
    /**
     * Auto-save timer reference
     * @type {number|null}
     * @private
     */
    this.autoSaveTimer = null;
    
    /**
     * Flag to track if state is being saved
     * @type {boolean}
     * @private
     */
    this.isSaving = false;
    
    /**
     * Last saved state timestamp
     * @type {Date|null}
     * @private
     */
    this.lastSaveTime = null;

    /**
     * Debounce timer for save operations
     * @type {number|null}
     * @private
     */
    this.saveDebounceTimer = null;

    /**
     * Debounce delay in milliseconds
     * @type {number}
     * @private
     */
    this.saveDebounceDelay = 2000;
  }

  /**
   * Start auto-save mechanism
   * Automatically saves state at regular intervals
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      return; // Already running
    }
    
    console.log('[StateManager] Starting auto-save with interval:', this.autoSaveInterval, 'ms');
    
    this.autoSaveTimer = setInterval(async () => {
      await this.saveState();
    }, this.autoSaveInterval);
  }

  /**
   * Stop auto-save mechanism
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log('[StateManager] Auto-save stopped');
    }
  }

  /**
   * Save state with debouncing to avoid excessive saves
   * @param {boolean} immediate - If true, save immediately without debouncing
   */
  async saveStateDebounced(immediate = false) {
    if (immediate) {
      if (this.saveDebounceTimer) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = null;
      }
      await this.saveState();
      return;
    }

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      await this.saveState();
      this.saveDebounceTimer = null;
    }, this.saveDebounceDelay);
  }

  /**
   * Collect current application state
   * @returns {Object} Current application state
   * @private
   */
  async collectState() {
    const state = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      tabs: [],
      activeTabId: null,
      workspacePath: null,
      diagnostics: null,
      editorState: null
    };

    // Collect all open tabs with their content
    if (this.tabManager.openTabs && this.tabManager.openTabs.size > 0) {
      // Save current editor content to active tab first
      if (this.tabManager.activeTabId) {
        const activeTab = this.tabManager.openTabs.get(this.tabManager.activeTabId);
        if (activeTab) {
          activeTab.content = this.editorManager.getContent();
        }
      }

      // Collect all tabs
      for (const [tabId, tabData] of this.tabManager.openTabs) {
        state.tabs.push({
          tabId: tabId,
          fileName: tabData.fileName,
          filePath: tabData.filePath,
          content: tabData.content,
          modified: tabData.modified,
          fileInfo: tabData.fileInfo || {}
        });
      }

      state.activeTabId = this.tabManager.activeTabId;
    }

    // Collect editor state (cursor position, scroll, etc.)
    if (this.editorManager.editor) {
      const position = this.editorManager.editor.getPosition();
      const scrollTop = this.editorManager.editor.getScrollTop();
      const scrollLeft = this.editorManager.editor.getScrollLeft();
      
      state.editorState = {
        position: position ? {
          lineNumber: position.lineNumber,
          column: position.column
        } : null,
        scrollTop: scrollTop,
        scrollLeft: scrollLeft
      };
    }
    // Collect current workspace path
    if (window.uiController && window.uiController.fileOpsManager) {
      state.workspacePath = window.uiController.fileOpsManager.getCurrentWorkspacePath();
    }
    // Collect last analysis results
    if (this.diagnosticsManager.currentDiagnostics) {
      state.diagnostics = {
        metadata: this.diagnosticsManager.currentMetadata,
        functions: this.diagnosticsManager.currentFunctions,
        diagnostics: this.diagnosticsManager.currentDiagnostics,
        severityFilter: this.diagnosticsManager.currentSeverityFilter
      };
    }

    return state;
  }

  /**
   * Save current application state to disk
   * @returns {Promise<boolean>} Success status
   */
  async saveState() {
    if (this.isSaving) {
      console.log('[StateManager] Save already in progress, skipping');
      return false;
    }

    this.isSaving = true;

    try {
      const state = await this.collectState();
      
      // Always save state, even if there are no tabs (to clear previous state)
      console.log('[StateManager] Saving state:', {
        tabCount: state.tabs.length,
        activeTabId: state.activeTabId,
        hasDiagnostics: !!state.diagnostics
      });

      // Save to disk via IPC
      const result = await window.api.invoke('save-app-state', state);
      
      if (result.success) {
        this.lastSaveTime = new Date();
        // console.log('[StateManager] State saved successfully at', this.lastSaveTime.toLocaleTimeString());
        return true;
      } else {
        console.error('[StateManager] Failed to save state:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[StateManager] Error saving state:', error);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Restore application state from disk
   * @returns {Promise<boolean>} Success status
   */
  async restoreState() {
    try {
      console.log('[StateManager] Attempting to restore state...');
      
      const result = await window.api.invoke('load-app-state');
      
      if (!result.success || !result.state) {
        console.log('[StateManager] No saved state found or load failed');
        return false;
      }

      const state = result.state;
      console.log('[StateManager] Loaded state:', {
        version: state.version,
        timestamp: state.timestamp,
        tabCount: state.tabs?.length || 0,
        hasDiagnostics: !!state.diagnostics
      });

      // Restore tabs
      if (state.tabs && state.tabs.length > 0) {
        console.log('[StateManager] Restoring', state.tabs.length, 'tabs...');
        
        // Counter to continue from where we left off
        let maxTabId = 0;
        for (const tab of state.tabs) {
          const match = tab.tabId.match(/tab_(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxTabId) maxTabId = num;
          }
        }
        
        // Set the counter so new tabs don't conflict with restored tabs
        this.tabManager.tabIdCounter = maxTabId;
        
        // Restore each tab
        for (const tabData of state.tabs) {
          // Use the exact tab ID from saved state
          const restoredTabId = tabData.tabId;
          
          // Create the tab using internal method to preserve tab ID
          if (this.tabManager.openTabs.size === 0) {
            this.tabManager.showEditor();
          }
          
          // Manually create tab with preserved ID
          this.tabManager.openTabs.set(restoredTabId, {
            filePath: tabData.filePath,
            content: tabData.content,
            modified: tabData.modified,
            fileName: tabData.fileName,
            fileInfo: tabData.fileInfo || {}
          });

          // Create tab element
          const tabElement = document.createElement('div');
          tabElement.className = 'tab';
          tabElement.setAttribute('data-tab-id', restoredTabId);
          tabElement.setAttribute('data-file-path', tabData.filePath || '');
          
          const warningIndicator = (tabData.fileInfo?.encodingWarning || tabData.fileInfo?.isPartial) ? 
            `<span class="tab-warning" title="${tabData.fileInfo.encodingWarning ? 'Encoding Warning' : ''}${tabData.fileInfo.isPartial ? 'File Partially Loaded' : ''}">⚠️</span>` : '';
          
          tabElement.innerHTML = `
            <div class="tab-label">${tabData.fileName}${warningIndicator}</div>
            <div class="tab-close" onclick="window.tabManager.closeTab(event, '${restoredTabId}')">×</div>
          `;
          
          tabElement.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
              this.tabManager.switchToTab(restoredTabId);
            }
          });
          
          this.tabManager.tabsContainer.appendChild(tabElement);
          
          // Mark as modified if it was modified
          if (tabData.modified) {
            tabElement.classList.add('modified');
          }
        }

        // Restore active tab
        if (state.activeTabId && this.tabManager.openTabs.has(state.activeTabId)) {
          await this.tabManager.switchToTab(state.activeTabId);
          
          // Restore editor state
          if (state.editorState) {
            setTimeout(() => {
              if (state.editorState.position && this.editorManager.editor) {
                this.editorManager.editor.setPosition(state.editorState.position);
                this.editorManager.editor.revealPositionInCenter(state.editorState.position);
              }
              
              if (this.editorManager.editor) {
                if (typeof state.editorState.scrollTop === 'number') {
                  this.editorManager.editor.setScrollTop(state.editorState.scrollTop);
                }
                if (typeof state.editorState.scrollLeft === 'number') {
                  this.editorManager.editor.setScrollLeft(state.editorState.scrollLeft);
                }
              }
            }, 100); // Small delay to ensure editor is ready
          }
        } else if (state.tabs.length > 0) {
          // If no active tab or active tab not found, switch to first tab
          await this.tabManager.switchToTab(state.tabs[0].tabId);
        }
      }

      // Restore workspace if one was open
      if (state.workspacePath) {
        console.log('[StateManager] Restoring workspace:', state.workspacePath);
        try {
          // Use IPC to open the workspace
          const result = await window.api.invoke('get-file-tree', state.workspacePath);
          if (result.success && window.uiController && window.uiController.fileOpsManager) {
            const folderName = state.workspacePath.split(/[\/\\]/).pop();
            window.uiController.fileOpsManager.currentWorkspacePath = state.workspacePath;
            window.uiController.fileOpsManager.updateWorkspaceUI(folderName, result.fileTree);
            if (window.uiController.searchManager) {
              window.uiController.searchManager.setWorkspacePath(state.workspacePath);
            }
            console.log('[StateManager] Workspace restored successfully');
          }
        } catch (error) {
          console.error('[StateManager] Failed to restore workspace:', error);
        }
      }

      // Restore diagnostics
      if (state.diagnostics) {
        console.log('[StateManager] Restoring diagnostics...');
        this.diagnosticsManager.currentMetadata = state.diagnostics.metadata;
        this.diagnosticsManager.currentFunctions = state.diagnostics.functions;
        this.diagnosticsManager.currentDiagnostics = state.diagnostics.diagnostics;
        this.diagnosticsManager.currentSeverityFilter = state.diagnostics.severityFilter || 'ALL';
        
        // Display diagnostics
        await this.diagnosticsManager.displayDiagnostics();
      }

      // Async: check each restored tab's file and mark missing ones visually.
      // Don't await — let the UI show first, then apply warnings.
      if (state.tabs && state.tabs.length > 0) {
        this._checkRestoredFilesExist(state.tabs);
      }

      console.log('[StateManager] State restored successfully');
      return true;
    } catch (error) {
      console.error('[StateManager] Error restoring state:', error);
      return false;
    }
  }

  /**
   * Async post-restore check: for each tab that has a file path, verify the
   * file still exists on disk. Marks missing ones visually via TabManager.
   * @param {Array} tabs - Restored tab data array
   */
  async _checkRestoredFilesExist(tabs) {
    // Run all checks in parallel instead of sequentially to avoid blocking startup.
    const checks = tabs
      .filter(tabData => tabData.filePath && tabData.tabId)
      .map(async (tabData) => {
        try {
          const res = await window.api.invoke('check-file-exists', tabData.filePath);
          if (!res.exists) {
            this.tabManager.markTabMissing(tabData.tabId, true);
          }
        } catch {
          // IPC unavailable, skip silently
        }
      });
    await Promise.all(checks);
  }

  /**
   * Clear saved state from disk
   * @returns {Promise<boolean>} Success status
   */
  async clearState() {
    try {
      console.log('[StateManager] Clearing saved state...');
      const result = await window.api.invoke('clear-app-state');
      
      if (result.success) {
        console.log('[StateManager] State cleared successfully');
        return true;
      } else {
        console.error('[StateManager] Failed to clear state:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[StateManager] Error clearing state:', error);
      return false;
    }
  }

  /**
   * Get information about the last saved state
   * @returns {Promise<Object|null>} State info or null if no state exists
   */
  async getStateInfo() {
    try {
      const result = await window.api.invoke('get-state-info');
      return result.success ? result.info : null;
    } catch (error) {
      console.error('[StateManager] Error getting state info:', error);
      return null;
    }
  }
}

window.StateManager = StateManager;
// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateManager;
}
})();
