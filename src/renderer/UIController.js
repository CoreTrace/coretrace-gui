;(function() {
// Manager classes and utilities are loaded via <script> tags in index.html
// and are available as globals: NotificationManager, MonacoEditorManager,
// TabManager, SearchManager, FileOperationsManager, DiagnosticsManager,
// StateManager, fileTypeUtils (window.detectFileType, etc.)

const appLaunchStartedAt = Date.now();
const appLaunchPerfStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;

function formatStartupTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

function runAfterFirstPaint(callback) {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    setTimeout(callback, 0);
    return;
  }

  window.requestAnimationFrame(() => {
    setTimeout(callback, 0);
  });
}

console.log(`[StartupTiming] App launch detected at ${formatStartupTimestamp(appLaunchStartedAt)}`);

/**
 * Main UI Controller - Coordinates all managers and components
 * 
 * This is the central coordinator for the entire application UI. It manages
 * the interaction between different managers and handles global UI state.
 * 
 * @class UIController
 * @author CTrace GUI Team
 * @version 1.0.0
 * 
 * @example
 * // UIController is automatically instantiated in the HTML
 * const uiController = new UIController();
 */
class UIController {
  /**
   * Creates an instance of UIController and initializes all managers.
   * 
   * @constructor
   * @memberof UIController
   */
  constructor() {
    /**
     * Notification manager instance
     * @type {NotificationManager}
     * @private
     */
    this.notificationManager = new NotificationManager();
    
    /**
     * Editor manager instance
     * @type {MonacoEditorManager}
     * @private
     */
    this.editorManager = new MonacoEditorManager();
    
    /**
     * Tab manager instance
     * @type {TabManager}
     * @private
     */
    this.tabManager = new TabManager(this.editorManager, this.notificationManager);
    
    /**
     * Search manager instance
     * @type {SearchManager}
     * @private
     */
    this.searchManager = new SearchManager(this.editorManager, this.notificationManager);
    
    /**
     * File operations manager instance
     * @type {FileOperationsManager}
     * @private
     */
    this.fileOpsManager = new FileOperationsManager(this.tabManager, this.notificationManager);

    /**
     * Diagnostics manager instance
     * @type {DiagnosticsManager}
     * @private
     */
    this.diagnosticsManager = new DiagnosticsManager(this.editorManager);

    /**
     * State manager instance for work loss prevention
     * @type {StateManager}
     * @private
     */
    this.stateManager = new StateManager(this.tabManager, this.editorManager, this.diagnosticsManager);

    /**
     * Terminal manager instance
     * @type {TerminalManager}
     * @private
     */
    this.terminalManager = new TerminalManager();
    this.performanceManager = new PerformanceManager();
    this.resizeManager = new ResizeManager();
    this.wslManager = new WSLManager(this);
    this.updaterManager = new UpdaterManager(this.notificationManager);
    this.ctraceRunner = new CTraceRunner(this);

    this.activeMenu = null;
    this.fileTreeContextMenu = null;
    this.autoSaveEnabled = false;
    this.autoSaveTimer = null;
    this.autoSaveDelay = 1000;
    this.wslAvailable = true;
    this.platform = 'unknown';

    this.activityBar = new ActivityBar(this);
    this.fileTree = new FileTree(this);
    this.editorPanel = new EditorPanel(this);
    this.assistantPanel = new AssistantPanel(this);


    this.init();
  }

  /**
   * Convert Windows path to WSL path
   * @param {string} windowsPath - Windows path (e.g., C:\Users\file.txt)
   * @returns {string} WSL path (e.g., /mnt/c/Users/file.txt)
   * @private
   */
  convertToWSLPath(windowsPath) {
    if (!windowsPath) return windowsPath;
    
    // Convert backslashes to forward slashes
    let wslPath = windowsPath.replace(/\\/g, '/');
    
    // Convert drive letter (C: -> /mnt/c)
    wslPath = wslPath.replace(/^([A-Z]):/i, (match, drive) => `/mnt/${drive.toLowerCase()}`);
    
    return wslPath;
  }

  /**
   * Initializes the UI Controller and sets up all necessary components.
   * 
   * This method is called automatically by the constructor and sets up:
   * - Event listeners for UI interactions
   * - Keyboard shortcuts
   * - Resizing functionality
   * - Menu systems
   * - UI components
   * - Manager interconnections
   * - File tree watcher
   * 
   * @memberof UIController
   * @private
   */
  init() {
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupResizing();
    this.setupMenus();
    this.setupUIComponents();

    // Connect managers
    this.connectManagers();

    // Initialize with explorer view and welcome screen
    this.showExplorer();
    this.tabManager.showWelcomeScreen();

    // Add refresh button event listener
    const refreshBtn = document.getElementById('refresh-file-tree');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshFileTree();
      });
    }

    // Set up state management for work loss prevention
    this.setupStateManagement();
    this.setupTitleBarControls();
    this.deferNonCriticalStartup();
  }

  /**
   * Update status bar app version label from package metadata.
   */
  async updateAppVersionLabel() {
    const versionEl = document.getElementById('tool_version');
    if (!versionEl) return;

    try {
      const appInfo = await window.api.getAppInfo();
      const appName = appInfo.name;
      const appVersion = appInfo.version;
      versionEl.textContent = `${appName} v${appVersion}`;
    } catch (error) {
      console.warn('Failed to load app version from package.json:', error);
    }
  }

  deferNonCriticalStartup() {
    runAfterFirstPaint(() => {
      this.updateAppVersionLabel();
      this.performanceManager.init();
      this.setupFileTreeWatcher();
      this.loadAutoSaveState();
      this.setupAutoSaveListener();
      this.setupFileTreeContextMenu();
      this.setupWSLStatusListener();
      this.setupUpdaterStatusListener();
      this.terminalManager.init();
    });
  }

  // --- PerformanceManager delegation ---
  togglePerformanceHud(forceVisible) {
    this.performanceManager.toggle(forceVisible);
  }


  updateBackendVersionLabel(releaseTag, statusText = '') {
    return this.updaterManager.updateBackendVersionLabel(releaseTag, statusText);
  }
  
  async refreshFileTree(silent = false) {
    return await this.fileTree.refreshFileTree(silent);
  }

  
  setupFileTreeWatcher() {
    return this.fileTree.setupFileTreeWatcher();
  }

  setupWSLStatusListener() {
    return this.wslManager.setupListeners();
  }

  setupUpdaterStatusListener() {
    return this.updaterManager.setupListeners();
  }

    updateWSLStatusIndicator(wslStatus) {
    return this.wslManager._updateIndicator(wslStatus);
  }

  showWSLSetupDialog(wslStatus) {
    return this.wslManager._showSetupDialog(wslStatus);
  }

  
  setupTitleBarControls() {
    return this.editorPanel.setupTitleBarControls();
  }

  /**
   * Connect managers and set up inter-manager communication
   */
  connectManagers() {
    // Set up tab manager callbacks
    this.tabManager.onLoadFullFile = (filePath) => {
      this.fileOpsManager.loadFullFile(filePath);
    };

    // Auto-save safety net: flush pending edits when switching/closing tabs.
    // (Auto-save debounce can otherwise be skipped if the user switches/close quickly.)
    this.tabManager.onBeforeTabSwitch = async (fromTabId) => {
      if (fromTabId) {
        await this.maybeAutoSaveTab(fromTabId);
      }
    };

    this.tabManager.onBeforeTabClose = async (tabId) => {
      if (tabId) {
        await this.maybeAutoSaveTab(tabId);
      }
    };

    // Set up search manager callbacks
    this.searchManager.openSearchResult = async (filePath, lineNumber) => {
      await this.openSearchResult(filePath, lineNumber);
    };

    // Update search manager with workspace path when workspace changes
    this.searchManager.setWorkspacePath(this.fileOpsManager.getCurrentWorkspacePath());

    // Set up editor content change tracking
    const wireEditorChangeListener = () => {
      try {
        // If Monaco editor is available, use its model change event
        const monacoEditor = this.editorManager.getMonacoInstance ? this.editorManager.getMonacoInstance() : null;
        if (monacoEditor && monacoEditor.onDidChangeModelContent) {
          console.log('[UIController] Wiring Monaco editor change listener');
          monacoEditor.onDidChangeModelContent(() => {
            if (this.tabManager.activeTabId) {
              const newContent = this.editorManager.getContent();
              this.tabManager.handleContentChange(this.tabManager.activeTabId, newContent);
              this.triggerAutoSave();
            }
          });
        } else if (this.editorManager.editor && this.editorManager.editor.addEventListener) {
          console.log('[UIController] Wiring legacy editor change listener');
          // Fallback for the legacy DOM-based editor
          this.editorManager.editor.addEventListener('input', () => {
            if (this.tabManager.activeTabId) {
              const newContent = this.editorManager.getContent();
              this.tabManager.handleContentChange(this.tabManager.activeTabId, newContent);
              this.triggerAutoSave();
            }
          });
        } else {
          console.warn('[UIController] Editor not ready yet, will retry after monaco-loaded event');
        }
      } catch (err) {
        console.warn('Failed to wire editor change listener:', err);
      }
    };

    // Try to wire immediately
    wireEditorChangeListener();

    // Also listen for monaco-loaded event in case editor wasn't ready yet
    window.addEventListener('monaco-loaded', () => {
      console.log('[UIController] Monaco loaded event received, re-wiring editor listener');
      setTimeout(() => {
        wireEditorChangeListener();
      }, 100);
    });
  }

  /**
   * Setup event listeners for UI components
   */
  setupEventListeners() {
    // Close dialogs when clicking outside
    document.addEventListener('click', (e) => {
      const searchWidget = document.getElementById('search-widget');
      const gotoDialog = document.getElementById('goto-dialog');
      
      if (searchWidget.classList.contains('visible') && 
          !searchWidget.contains(e.target)) {
        this.searchManager.closeSearchWidget();
      }
      
      if (gotoDialog.classList.contains('visible') && 
          !gotoDialog.contains(e.target)) {
        this.searchManager.closeGoToLineDialog();
      }
    });

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-item')) {
        this.hideAllMenus();
      }
    });

    // Close file tree context menu when clicking anywhere
    document.addEventListener('click', () => {
      this.hideFileTreeContextMenu();
    });

    // Close file tree context menu on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideFileTreeContextMenu();
      }
    });
  }

  
  setupFileTreeContextMenu() {
    return this.fileTree.setupFileTreeContextMenu();
  }

  
  promptForText(title, placeholder = '', defaultValue = '') {
    return this.fileTree.promptForText(title, placeholder, defaultValue);
  }


  showFileTreeContextMenu(x, y, items) {
    return this.fileTree.showFileTreeContextMenu(x, y, items);
  }


  hideFileTreeContextMenu() {
    return this.fileTree.hideFileTreeContextMenu();
  }

  async createFileInDirectory(directoryPath) {
    const fileName = await this.promptForText('New file', 'e.g. main.c');
    if (!fileName) return;

    try {
      const result = await window.api.invoke('create-file', directoryPath, fileName);
      if (result.success) {
        this.notificationManager.showSuccess(`Created file "${result.name}"`);
        await this.refreshFileTree(true);
      } else {
        this.notificationManager.showError('Failed to create file: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error creating file: ' + error.message);
    }
  }

  async createFolderInDirectory(directoryPath) {
    const folderName = await this.promptForText('New folder', 'e.g. include');
    if (!folderName) return;

    try {
      const result = await window.api.invoke('create-folder', directoryPath, folderName);
      if (result.success) {
        this.notificationManager.showSuccess(`Created folder "${result.name}"`);
        await this.refreshFileTree(true);
      } else {
        this.notificationManager.showError('Failed to create folder: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error creating folder: ' + error.message);
    }
  }

  async renamePath(targetPath, currentName = '') {
    if (!targetPath) return;
    const newName = await this.promptForText('Rename', '', currentName || '');
    if (!newName) return;

    try {
      const result = await window.api.invoke('rename-path', targetPath, newName);
      if (result.success) {
        // Update open tab if the renamed item is an open file
        if (result.isFile) {
          const tabId = this.tabManager.findTabByPath(targetPath);
          if (tabId) {
            this.tabManager.updateTabFile(tabId, result.newPath, result.name);
          }
        }
        this.notificationManager.showSuccess(`Renamed to "${result.name}"`);
        await this.refreshFileTree(true);
      } else {
        this.notificationManager.showError('Failed to rename: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error renaming: ' + error.message);
    }
  }

  async deletePath(targetPath, itemType) {
    if (!targetPath) return;
    const isFolder = itemType === 'directory';

    const ok = confirm(isFolder ? 'Delete this folder and all its contents?' : 'Delete this file?');
    if (!ok) return;

    // If deleting an open file, close the tab first (honor unsaved changes)
    if (!isFolder) {
      const tabId = this.tabManager.findTabByPath(targetPath);
      if (tabId) {
        const closed = await this.tabManager.closeTabById(tabId);
        if (!closed) return;
      }
    }

    try {
      const result = await window.api.invoke('delete-path', targetPath);
      if (result.success) {
        this.notificationManager.showSuccess('Deleted successfully');
        await this.refreshFileTree(true);
      } else {
        this.notificationManager.showError('Failed to delete: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error deleting: ' + error.message);
    }
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const searchWidget = document.getElementById('search-widget');
      const gotoDialog = document.getElementById('goto-dialog');
      const isSearchVisible = searchWidget.classList.contains('visible');
      const isGotoVisible = gotoDialog.classList.contains('visible');

      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.togglePerformanceHud();
        return;
      }

      // Handle Enter key
      if (e.key === 'Enter') {
        if (isSearchVisible) {
          e.preventDefault();
          this.searchManager.searchNext();
        } else if (isGotoVisible) {
          e.preventDefault();
          this.searchManager.performGoToLine();
        }
      }
      
      // Handle Escape key
      if (e.key === 'Escape') {
        if (isSearchVisible) {
          e.preventDefault();
          this.searchManager.closeSearchWidget();
        } else if (isGotoVisible) {
          e.preventDefault();
          this.searchManager.closeGoToLineDialog();
        }
      }

      // Handle F3/Shift+F3 for search navigation
      if (e.key === 'F3' && isSearchVisible) {
        e.preventDefault();
        if (e.shiftKey) {
          this.searchManager.searchPrev();
        } else {
          this.searchManager.searchNext();
        }
      }

      // File operations
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.fileOpsManager.saveFile();
      }
      
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        this.fileOpsManager.openFile();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        this.fileOpsManager.openWorkspace();
      }
      
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        this.tabManager.createNewFile();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.fileOpsManager.saveAsFile();
      }
      
      // UI navigation
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        this.toggleSidebar();
      }
      
      if (e.altKey && e.key === 'z') {
        e.preventDefault();
        this.editorManager.toggleWordWrap();
      }
      
      if (e.shiftKey && e.altKey && e.key === 'F') {
        e.preventDefault();
        const formatted = this.editorManager.formatCode();
        if (this.tabManager.activeTabId) {
          this.tabManager.handleContentChange(this.tabManager.activeTabId, formatted);
        }
      }
      
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (this.tabManager.activeTabId) {
          this.tabManager.closeTab(e, this.tabManager.activeTabId);
        }
      }
      
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        this.searchManager.showFindDialog();
      }
      
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        this.searchManager.showGoToLineDialog();
      }
      
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.tabManager.switchToNextTab();
      }
      
      // Tab navigation with Ctrl+PageUp/PageDown
      if (e.ctrlKey && e.key === 'PageDown') {
        e.preventDefault();
        this.tabManager.switchToNextTab();
      }
      
      if (e.ctrlKey && e.key === 'PageUp') {
        e.preventDefault();
        this.tabManager.switchToPreviousTab();
      }
      
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        this.toggleToolsPanel();
      }

      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        this.terminalManager.toggle();
        this._syncTerminalActivityIcon();
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        this.showSearch();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.showExplorer();
      }
    });
  }

  setupResizing() {
    return this.resizeManager.setup();
  }

  doResize(e) {
    return this.resizeManager._doResize(e);
  }

  stopResize() {
    return this.resizeManager._stopResize();
  }

  /**
   * Setup menu functionality
   */
  setupMenus() {
    window.toggleMenu = (menuId) => {
      const menu = document.getElementById(menuId);
      const dropdown = menu.querySelector('.dropdown-menu');
      
      if (this.activeMenu && this.activeMenu !== menuId) {
        this.hideAllMenus();
      }
      
      if (dropdown.classList.contains('show')) {
        this.hideAllMenus();
      } else {
        dropdown.classList.add('show');
        menu.classList.add('active');
        this.activeMenu = menuId;
      }
    };

    window.hideAllMenus = () => this.hideAllMenus();
    
    // Add click handlers to all dropdown items to stop propagation
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        // hideAllMenus will be called by the onclick handler in HTML
      });
    });
  }

  hideAllMenus() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
      menu.classList.remove('show');
    });
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
    });
    this.activeMenu = null;
  }

  /**
   * Setup UI component functions
   */
  setupUIComponents() {
    // Activity bar functions
    window.showExplorer = () => this.showExplorer();
    window.showSearch = () => this.showSearch();

    // File operations
    window.createNewFile = () => this.tabManager.createNewFile();
    window.openFile = () => this.fileOpsManager.openFile();
    window.openWorkspace = () => this.openWorkspace();
    window.closeWorkspace = () => this.fileOpsManager.closeWorkspace();
    window.saveFile = () => this.fileOpsManager.saveFile();
    window.saveAsFile = () => this.fileOpsManager.saveAsFile();
    window.autoSave = () => this.toggleAutoSave();
    window.openUpdateSettings = () => this.openUpdateSettingsModal();
    window.openBackendSettings = () => this.openBackendSettingsModal();

    // Setup auto save status bar click handler
    const autoSaveStatus = document.getElementById('autoSaveStatus');
    if (autoSaveStatus) {
      autoSaveStatus.onclick = () => this.toggleAutoSave();
    }
    window.closeCurrentTab = () => {
      if (this.tabManager.activeTabId) {
        this.tabManager.closeTab(new Event('click'), this.tabManager.activeTabId);
      }
    };

    // Editor operations
    window.formatCode = () => {
      const formatted = this.editorManager.formatCode();
      if (this.tabManager.activeTabId) {
        this.tabManager.handleContentChange(this.tabManager.activeTabId, formatted);
      }
    };
    window.toggleWordWrap = () => this.editorManager.toggleWordWrap();

    // Search operations
    window.showFindDialog = () => this.searchManager.showFindDialog();
    window.closeSearchWidget = () => this.searchManager.closeSearchWidget();
    window.searchNext = () => this.searchManager.searchNext();
    window.searchPrev = () => this.searchManager.searchPrev();
    window.showGoToLineDialog = () => this.searchManager.showGoToLineDialog();
    window.closeGoToLineDialog = () => this.searchManager.closeGoToLineDialog();
    window.performGoToLine = () => this.searchManager.performGoToLine();

    // UI navigation
    window.toggleSidebar = () => this.toggleSidebar();
    window.toggleToolsPanel = () => this.toggleToolsPanel();
    window.showToolsPanel = () => this.showToolsPanel();
    window.hideToolsPanel = () => this.hideToolsPanel();
    window.openCtracePanel = () => this.openCtracePanel();
    window.openAssistantPanel = () => this.openAssistantPanel();

    // Terminal panel
    window.toggleTerminalPanel = () => {
      this.terminalManager.toggle();
      this._syncTerminalActivityIcon();
    };
    window.terminalNew = () => this.terminalManager.createTerminal();
    window.terminalKill = () => {
      const id = this.terminalManager.activeId;
      if (id !== null) {
        const term = this.terminalManager.terminals.get(id);
        if (term && term.running) {
          window.api.invoke('terminal-kill-current', id).catch(() => {});
        }
      }
    };
    window.terminalToggleShellDropdown = () => this.terminalManager.toggleShellDropdown();

    // Visualyzer operations
    window.toggleVisualyzerPanel = () => this.toggleVisualyzerPanel();

    // CTrace helpers
    window.runCTrace = () => this.ctraceRunner.run();

    window.clearCTraceOutput = () => {
      this.diagnosticsManager.clear();
    };

    // Tab manager reference for global access
    window.tabManager = this.tabManager;
    
    // Diagnostics manager reference for global access
    window.diagnosticsManager = this.diagnosticsManager;
    window.searchManager = this.searchManager;
  }

  async openUpdateSettingsModal() {
    return this.updaterManager.openUpdateSettingsModal();
  }

  async openBackendSettingsModal() {
    return this.updaterManager.openBackendSettingsModal();
  }

  /**
   * Sync the terminal activity bar icon active state with panel visibility.
   */
  _syncTerminalActivityIcon() {
    const icon = document.getElementById('terminal-activity');
    if (!icon) return;
    if (this.terminalManager.isVisible()) {
      icon.classList.add('active');
    } else {
      icon.classList.remove('active');
    }
  }

  setActiveActivity(activityId) {
    return this.activityBar.setActiveActivity(activityId);
  }


  showExplorer() {
    return this.activityBar.showExplorer();
  }


  showSearch() {
    return this.activityBar.showSearch();
  }

  
  toggleSidebar() {
    return this.activityBar.toggleSidebar();
  }

  
  showToolsPanel() {
    return this.assistantPanel.showToolsPanel();
  }


  hideToolsPanel() {
    return this.assistantPanel.hideToolsPanel();
  }


  toggleToolsPanel() {
    return this.assistantPanel.toggleToolsPanel();
  }

  
  toggleVisualyzerPanel() {
    return this.assistantPanel.toggleVisualyzerPanel();
  }


  closeVisualyzer() {
    return this.assistantPanel.closeVisualyzer();
  }

  toggleToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      if (toolsPanel.classList.contains('active')) {
        this.hideToolsPanel();
      } else {
        this.showToolsPanel();
      }
    }
  }


  openAssistantPanel() {
    return this.assistantPanel.openAssistantPanel();
  }

  
  openCtracePanel() {
    return this.assistantPanel.openCtracePanel();
  }

  
  renderAssistantUI() {
    return this.assistantPanel.renderAssistantUI();
  }

  
  getAssistantConfig() {
    return this.assistantPanel.getAssistantConfig();
  }

  
  saveAssistantConfig(cfg) {
    return this.assistantPanel.saveAssistantConfig(cfg);
  }

  /**
   * Ensure assistant is configured; if not, show guided setup modal
   */
  async ensureAssistantConfigured() {
    const cfg = this.getAssistantConfig();
    if (cfg && cfg.provider) return cfg;
    // Show setup guide modal and wait for user to complete or cancel
    return new Promise((resolve) => {
      this.showAssistantSetupGuide(resolve);
    });
  }

  
  showAssistantSetupGuide(done) {
    return this.assistantPanel.showAssistantSetupGuide(done);
  }
  
  toggleAutoSave() {
    return this.editorPanel.toggleAutoSave();
  }

  
  updateAutoSaveStatus() {
    return this.editorPanel.updateAutoSaveStatus();
  }

  
  saveAutoSaveState() {
    return this.editorPanel.saveAutoSaveState();
  }

  
  loadAutoSaveState() {
    return this.editorPanel.loadAutoSaveState();
  }

  
  setupAutoSaveListener() {
    return this.editorPanel.setupAutoSaveListener();
  }

  
  triggerAutoSave() {
    return this.editorPanel.triggerAutoSave();
  }

  /**
   * Save a specific tab if it has unsaved changes and auto-save is enabled.
   * This is used to ensure edits are not lost on quick tab switches/closes.
   *
   * @param {string} tabId
   */
  async maybeAutoSaveTab(tabId) {
    if (!this.autoSaveEnabled) {
      console.log('[AutoSave] Skipped - auto-save is disabled');
      return;
    }
    if (!this.tabManager || !this.fileOpsManager) return;

    const tab = this.tabManager.getTab ? this.tabManager.getTab(tabId) : null;
    if (!tab || !tab.filePath) {
      console.log('[AutoSave] Skipped - no tab or no filePath', { hasTab: !!tab, filePath: tab?.filePath });
      return;
    }

    const isDirty = !!(tab.modified || tab.isDirty);
    if (!isDirty) {
      console.log('[AutoSave] Skipped - tab is clean', tab.fileName);
      return;
    }

    console.log('[AutoSave] Saving tab:', tab.fileName, 'modified:', tab.modified);
    try {
      if (typeof this.fileOpsManager.saveTabById === 'function') {
        await this.fileOpsManager.saveTabById(tabId, { silent: true, reason: 'autosave-tab' });
        console.log('[AutoSave] Save completed for:', tab.fileName);
      } else if (tabId === this.tabManager.activeTabId) {
        await this.fileOpsManager.saveFile({ silent: true, reason: 'autosave-active' });
        console.log('[AutoSave] Save completed (active tab):', tab.fileName);
      }
    } catch (error) {
      console.error('[AutoSave] Save failed:', error);
    }
  }

  /**
   * Setup state management for work loss prevention
   * Initializes state restoration and auto-save mechanisms
   */
  setupStateManagement() {
    // Restore state on startup with minimal delay
    setTimeout(async () => {
      try {
        const restored = await this.stateManager.restoreState();
        const sessionReadyAt = Date.now();
        const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : 0) - appLaunchPerfStartedAt;
        if (restored) {
          console.log('[StateManagement] Application state restored successfully');
          console.log(
            `[StartupTiming] Restored session ready at ${formatStartupTimestamp(sessionReadyAt)} ` +
            `(${Math.round(elapsedMs)}ms since launch)`
          );
          window.api.send('startup-ready', {
            restored: true,
            timestamp: sessionReadyAt,
            elapsedMs
          });
        } else {
          console.log('[StateManagement] No previous state found or restoration failed');
          window.api.send('startup-ready', {
            restored: false,
            timestamp: sessionReadyAt,
            elapsedMs
          });
        }
      } catch (error) {
        console.error('[StateManagement] Error restoring state:', error);
      }
    }, 100); // Reduced from 500ms to 100ms for faster perceived startup

    // Start auto-save for state
    this.stateManager.startAutoSave();
    console.log('[StateManagement] Auto-save started');

    // Listen for app-before-quit event from main process
    window.api.on('app-before-quit', async () => {
      console.log('[StateManagement] Received app-before-quit, saving state...');
      await this.stateManager.saveStateDebounced(true); // Immediate save
    });

    // Save state on visibility change (browser/app minimized or closed)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // User is leaving the page, save state
        this.stateManager.saveStateDebounced(true);
      }
    });

    // Save state when window is about to unload
    window.addEventListener('beforeunload', (e) => {
      // Attempt to save state synchronously (best effort)
      // Note: Modern browsers limit what can be done here
      this.stateManager.saveStateDebounced(true);
    });

    console.log('[StateManagement] State management setup complete');
  }

  /**
   * Open workspace and update search manager
   */
  async openWorkspace() {
    const result = await this.fileOpsManager.openWorkspace();
    if (result && result.success) {
      this.searchManager.setWorkspacePath(result.folderPath);
      try {
        window.api.invoke('watch-workspace', result.folderPath);
      } catch (_) {
        // Ignore watcher startup failures
      }
    }
  }

  /**
   * Open search result with proper line navigation
   * @param {string} filePath - File path
   * @param {number} lineNumber - Line number
   */
  async openSearchResult(filePath, lineNumber) {
    console.log('Opening search result:', filePath, 'at line', lineNumber);
    
    try {
      const normalizedPath = filePath.replace(/\\\\/g, '\\');
      
      const result = await window.api.invoke('read-file', normalizedPath);
      console.log('Search result read result:', result);
      
      if (result.success) {
        let tabId;
        
        if (result.warning === 'encoding') {
          console.log('Search result: Encoding warning detected, showing dialog...');
          const userChoice = await this.notificationManager.showEncodingWarningDialog();
          console.log('Search result: User choice:', userChoice);
          
          if (userChoice === 'no') {
            console.log('Search result: User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('Search result: User chose to open file anyway');
            const forceResult = await window.api.invoke('force-open-file', normalizedPath);
            console.log('Search result: Force open result:', forceResult);
            
            if (forceResult.success) {
              tabId = this.fileOpsManager.openFileInTab(normalizedPath, forceResult.content, forceResult.fileName, {
                isPartial: forceResult.isPartial,
                totalSize: forceResult.totalSize,
                loadedSize: forceResult.loadedSize,
                encodingWarning: forceResult.encodingWarning
              });
              
              this.notificationManager.showWarning(`Opened ${forceResult.fileName} at line ${lineNumber} with encoding warnings`);
            } else {
              this.notificationManager.showError('Failed to open file: ' + forceResult.error);
              return;
            }
          }
        } else {
          console.log('Search result: No warnings, opening file normally');
          tabId = this.fileOpsManager.openFileInTab(normalizedPath, result.content, result.fileName, {
            isPartial: result.isPartial,
            totalSize: result.totalSize,
            loadedSize: result.loadedSize,
            encodingWarning: result.encodingWarning
          });
          
          this.notificationManager.showSuccess(`Opened ${result.fileName} at line ${lineNumber}`);
        }
        
        // Wait for the tab to switch and editor to update, then jump to line
        setTimeout(() => {
          this.editorManager.jumpToLine(lineNumber);
        }, 200);
        
      } else {
        this.notificationManager.showError('Error opening file: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error opening search result:', error);
      this.notificationManager.showError('Error opening search result: ' + error.message);
    }
  }
}

// Initialize when DOM is loaded (guarded for Node test environments)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.uiController = new UIController();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIController;
}
})();
