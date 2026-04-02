;(function() {
/**
 * Tab Manager - Handles all tab operations including creation, switching, and closing.
 * 
 * This manager provides a complete tab interface similar to modern code editors,
 * allowing users to work with multiple files simultaneously. It manages tab state,
 * coordinates with the editor manager, and handles file modifications tracking.
 * 
 * @class TabManager
 * @author CTrace GUI Team
 * @version 1.0.0
 * 
 * @example
 * const tabManager = new TabManager(editorManager, notificationManager);
 * const tabId = tabManager.createTab('example.js', '/path/to/example.js', 'console.log("Hello")');
 */
class TabManager {
  /**
   * Creates an instance of TabManager.
   * 
   * @constructor
   * @memberof TabManager
   * @param {EditorManager} editorManager - Editor manager instance for content management
   * @param {NotificationManager} notificationManager - Notification manager for user feedback
   */
  constructor(editorManager, notificationManager) {
    /**
     * Editor manager instance
     * @type {EditorManager}
     * @private
     */
    this.editorManager = editorManager;
    
    /**
     * Notification manager instance
     * @type {NotificationManager}
     * @private
     */
    this.notificationManager = notificationManager;
    
    /**
     * Counter for generating unique tab IDs
     * @type {number}
     * @private
     */
    this.tabIdCounter = 0;
    
    /**
     * Currently active tab ID
     * @type {string|null}
     */
    this.activeTabId = null;
    
    /**
     * Map of open tabs with their data
     * @type {Map<string, Object>}
     * @private
     */
    this.openTabs = new Map();
    
    /**
     * DOM element containing the tabs
     * @type {HTMLElement}
     * @private
     */
    this.tabsContainer = document.getElementById('tabs-container');
    
    // Create inner wrapper for proper scrolling
    if (this.tabsContainer && !this.tabsContainer.querySelector('.tabs-inner-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'tabs-inner-wrapper';
      this.tabsContainer.appendChild(wrapper);
      this.tabsInnerWrapper = wrapper;
    } else {
      this.tabsInnerWrapper = this.tabsContainer.querySelector('.tabs-inner-wrapper');
    }
    
    /**
     * Welcome screen DOM element
     * @type {HTMLElement}
     * @private
     */
    this.welcomeScreen = document.getElementById('welcome-screen');
    
    /**
     * Editor area DOM element
     * @type {HTMLElement}
     * @private
     */
    this.editorArea = document.getElementById('editor-area');

    /**
     * Optional async callback fired before switching tabs.
     * @type {(fromTabId: (string|null), toTabId: string) => Promise<void>|null}
     */
    this.onBeforeTabSwitch = null;

    /**
     * Optional async callback fired before closing a tab.
     * @type {(tabId: string) => Promise<void>|null}
     */
    this.onBeforeTabClose = null;
  }

  /**
   * Create a new tab
   * @param {string} fileName - Tab file name
   * @param {string} filePath - File path (optional)
   * @param {string} content - File content
   * @param {Object} fileInfo - File metadata
   * @returns {string} - Tab ID
   */
  createTab(fileName, filePath = null, content = '', fileInfo = {}) {
    // Show editor area if this is the first tab
    if (this.openTabs.size === 0) {
      this.showEditor();
    }
    
    const tabId = 'tab_' + (++this.tabIdCounter);
    
    // Create tab data
    this.openTabs.set(tabId, {
      filePath: filePath,
      content: content,
      modified: false,
      fileName: fileName,
      fileInfo: fileInfo // Store file metadata
    });

    // Create tab element
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.setAttribute('data-tab-id', tabId);
    tabElement.setAttribute('data-file-path', filePath || '');
    
    // Add warning indicator if file has encoding issues or is partial
    const warningIndicator = (fileInfo.encodingWarning || fileInfo.isPartial) ? 
      `<span class="tab-warning" title="${fileInfo.encodingWarning ? 'Encoding Warning' : ''}${fileInfo.isPartial ? 'File Partially Loaded' : ''}">⚠️</span>` : '';
    
    tabElement.innerHTML = `
      <div class="tab-label">${fileName}${warningIndicator}</div>
      <div class="tab-close" onclick="window.tabManager.closeTab(event, '${tabId}')">×</div>
    `;
    
    tabElement.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.switchToTab(tabId);
      }
    });
    
    const targetContainer = this.tabsInnerWrapper || this.tabsContainer;
    targetContainer.appendChild(tabElement);
    return tabId;
  }

  /**
   * Switch to a specific tab
   * @param {string} tabId - Tab ID to switch to
   */
  async switchToTab(tabId) {
    // Save current tab content FIRST (before auto-save callback) if we have an active tab
    if (this.activeTabId && this.openTabs.has(this.activeTabId)) {
      const currentTab = this.openTabs.get(this.activeTabId);
      currentTab.content = this.editorManager.getContent();
    }

    // Give consumers a chance to flush pending edits (e.g., auto-save) before switching.
    if (typeof this.onBeforeTabSwitch === 'function') {
      try {
        await this.onBeforeTabSwitch(this.activeTabId, tabId);
      } catch (err) {
        console.warn('TabManager onBeforeTabSwitch failed:', err);
      }
    }

    // Update active tab
    this.activeTabId = tabId;
    const newTab = this.openTabs.get(tabId);
    
    if (newTab) {
      // Update editor
      await this.editorManager.setContent(newTab.content);
      
      // Set file type for syntax highlighting
      if (newTab.fileName) {
        await this.editorManager.setFileType(newTab.fileName);
      }
      
      // Update tab appearance
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.add('active');
      }
      
      // Update file tree selection
      if (newTab.filePath) {
        document.querySelectorAll('.file-tree-item').forEach(el => el.classList.remove('selected'));
        const fileTreeItem = document.querySelector(`[data-file-path="${newTab.filePath}"]`);
        if (fileTreeItem) {
          fileTreeItem.classList.add('selected');
        }
      }

      // Emit tab switch event for other components
      this.onTabSwitch(newTab);
    }
  }

  /**
   * Close a tab
   * @param {Event} event - Click event
   * @param {string} tabId - Tab ID to close
   */
  closeTab(event, tabId) {
    event.stopPropagation();

    // Fire and forget (UI click handler can't await).
    void this.closeTabById(tabId);
  }

  /**
   * Close a tab by id (non-click workflows)
   * @param {string} tabId - Tab ID to close
   * @param {boolean} [force=false] - If true, close even if modified
   * @returns {boolean} - True if closed, false if user canceled
   */
  async closeTabById(tabId, force = false) {
    const tab = this.openTabs.get(tabId);
    if (!tab) return true;

    // Sync content from editor if closing the active tab
    if (tabId === this.activeTabId) {
      tab.content = this.editorManager.getContent();
      console.log('[TabManager] Synced content from editor for tab:', tab.fileName, 'modified:', tab.modified);
    }

    // Give consumers a chance to flush pending edits (e.g., auto-save) before close confirmation.
    if (typeof this.onBeforeTabClose === 'function') {
      console.log('[TabManager] Calling onBeforeTabClose for:', tab.fileName);
      try {
        await this.onBeforeTabClose(tabId);
        console.log('[TabManager] onBeforeTabClose completed for:', tab.fileName, 'modified now:', tab.modified);
      } catch (err) {
        console.warn('TabManager onBeforeTabClose failed:', err);
      }
    }

    // Re-fetch tab state in case auto-save cleaned it
    const updatedTab = this.openTabs.get(tabId);
    if (!updatedTab) return true;

    // Check if modified
    if (updatedTab.modified && !force) {
      console.log('[TabManager] Tab still modified after auto-save, prompting user:', updatedTab.fileName);
      const result = confirm(`${updatedTab.fileName} has unsaved changes. Do you want to close it anyway?`);
      if (!result) return false;
    }

    // Remove tab element
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
      tabElement.remove();
    }

    // Remove from data
    this.openTabs.delete(tabId);

    // If closing active tab, switch to another tab or show welcome screen
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.openTabs.keys());
      if (remainingTabs.length > 0) {
        await this.switchToTab(remainingTabs[remainingTabs.length - 1]);
      } else {
        this.activeTabId = null;
        this.showWelcomeScreen();
      }
    }

    return true;
  }

  /**
   * Get a tab by id.
   * @param {string} tabId
   * @returns {Object|null}
   */
  getTab(tabId) {
    return this.openTabs.get(tabId) || null;
  }

  /**
   * Mark tab as modified
   * @param {string} tabId - Tab ID
   */
  markTabModified(tabId) {
    const tab = this.openTabs.get(tabId);
    if (tab && !tab.modified) {
      tab.modified = true;
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.add('modified');
      }
    }
  }

  /**
   * Mark tab as clean (not modified)
   * @param {string} tabId - Tab ID
   */
  markTabClean(tabId) {
    const tab = this.openTabs.get(tabId);
    if (tab && tab.modified) {
      tab.modified = false;
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.remove('modified');
      }
    }
  }

  /**
   * Check if file is already open in a tab
   * @param {string} filePath - File path to check
   * @returns {string|null} - Tab ID if found, null otherwise
   */
  findTabByPath(filePath) {
    for (const [tabId, tab] of this.openTabs) {
      if (tab.filePath === filePath) {
        return tabId;
      }
    }
    return null;
  }

  /**
   * Get current active tab
   * @returns {Object|null} - Active tab data or null
   */
  getActiveTab() {
    return this.activeTabId ? this.openTabs.get(this.activeTabId) : null;
  }

  /**
   * Update tab file info (for file operations)
   * @param {string} tabId - Tab ID
   * @param {string} filePath - New file path
   * @param {string} fileName - New file name
   */
  updateTabFile(tabId, filePath, fileName) {
    const tab = this.openTabs.get(tabId);
    if (tab) {
      tab.filePath = filePath;
      tab.fileName = fileName;
      
      // Update tab label
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        const labelElement = tabElement.querySelector('.tab-label');
        if (labelElement) {
          labelElement.textContent = fileName;
        }
        tabElement.setAttribute('data-file-path', filePath);
      }
    }
  }

  /**
   * Show welcome screen
   */
  showWelcomeScreen() {
    this.welcomeScreen.style.display = 'flex';
    this.editorArea.style.display = 'none';
    this.tabsContainer.style.display = 'none';
  }

  /**
   * Show editor
   */
  showEditor() {
    this.welcomeScreen.style.display = 'none';
    this.editorArea.style.display = 'flex';
    this.tabsContainer.style.display = 'flex';
    
    // Trigger Monaco layout update after showing editor area
    setTimeout(() => {
      if (this.editorManager && this.editorManager.editor) {
        this.editorManager.editor.layout();
        console.log('TabManager: Triggered Monaco layout update after showing editor');
      }
    }, 50);
  }

  /**
   * Handle tab content changes (for modification tracking)
   * @param {string} tabId - Tab ID
   * @param {string} newContent - New content
   */
  handleContentChange(tabId, newContent) {
    const tab = this.openTabs.get(tabId);
    if (tab && tab.content !== newContent) {
      tab.content = newContent;
      this.markTabModified(tabId);
    }
  }

  /**
   * Callback for when tab switches (for other components to listen to)
   * @param {Object} tabData - Tab data
   */
  onTabSwitch(tabData) {
    // Update file type in status bar if file type utils are available
    if (window.updateFileTypeStatus) {
      window.updateFileTypeStatus(tabData.fileName);
    }
    
    // Update file status
    this.updateFileStatus(tabData);
  }

  /**
   * Update file status indicator
   * @param {Object} tabData - Tab data
   */
  updateFileStatus(tabData) {
    const fileStatusElement = document.getElementById('fileStatus');
    if (fileStatusElement && tabData.fileInfo) {
      const { fileInfo } = tabData;
      let statusText = 'UTF-8';
      let statusStyle = '';
      
      if (fileInfo.encodingWarning) {
        statusText = '⚠️ Non-UTF8';
        statusStyle = 'color: #f85149; cursor: pointer;';
        fileStatusElement.title = 'File may contain non-UTF8 characters';
      } else if (fileInfo.isPartial) {
        const loadedKB = Math.round(fileInfo.loadedSize / 1024);
        const totalKB = Math.round(fileInfo.totalSize / 1024);
        statusText = `📄 Partial (${loadedKB}KB/${totalKB}KB)`;
        statusStyle = 'color: #f0883e; cursor: pointer;';
        fileStatusElement.title = 'Click to load full file';
        fileStatusElement.onclick = () => this.onLoadFullFile(tabData.filePath);
      } else {
        statusText = 'UTF-8';
        statusStyle = '';
        fileStatusElement.onclick = null;
        fileStatusElement.title = '';
      }
      
      fileStatusElement.textContent = statusText;
      fileStatusElement.style.cssText = statusStyle;
    }
  }

  /**
   * Callback for loading full file (to be implemented by parent)
   * @param {string} filePath - File path to load
   */
  onLoadFullFile(filePath) {
    // This will be set by the main UI controller
    console.log('Load full file requested for:', filePath);
  }

  /**
   * Create a new untitled file tab
   * @returns {string} - New tab ID
   */
  createNewFile() {
    const fileName = 'untitled-' + (this.tabIdCounter + 1);
    const tabId = this.createTab(fileName);
    this.switchToTab(tabId);
    this.editorManager.focus();
    return tabId;
  }

  /**
   * Switch to next tab
   */
  switchToNextTab() {
    const tabIds = Array.from(this.openTabs.keys());
    if (tabIds.length > 0 && this.activeTabId) {
      const currentIndex = tabIds.indexOf(this.activeTabId);
      const nextIndex = (currentIndex + 1) % tabIds.length;
      this.switchToTab(tabIds[nextIndex]);
      this.scrollTabIntoView(tabIds[nextIndex]);
    }
  }

  /**
   * Switch to previous tab
   */
  switchToPreviousTab() {
    const tabIds = Array.from(this.openTabs.keys());
    if (tabIds.length > 0 && this.activeTabId) {
      const currentIndex = tabIds.indexOf(this.activeTabId);
      const previousIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      this.switchToTab(tabIds[previousIndex]);
      this.scrollTabIntoView(tabIds[previousIndex]);
    }
  }

  /**
   * Scroll a tab into view
   * @param {string} tabId - Tab ID to scroll into view
   */
  scrollTabIntoView(tabId) {
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement && this.tabsContainer) {
      // Get positions relative to the container
      const containerRect = this.tabsContainer.getBoundingClientRect();
      const tabRect = tabElement.getBoundingClientRect();
      
      // Calculate scroll position to center the tab
      const scrollLeft = tabElement.offsetLeft - (this.tabsContainer.offsetWidth / 2) + (tabElement.offsetWidth / 2);
      
      // Smooth scroll within the tabs container only
      this.tabsContainer.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      });
    }
  }

  /**
   * Get all open tabs count
   * @returns {number} - Number of open tabs
   */
  getTabCount() {
    return this.openTabs.size;
  }
}

window.TabManager = TabManager;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TabManager;
}
})();