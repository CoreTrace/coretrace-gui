// Import manager classes
const NotificationManager = require('./managers/NotificationManager');
const EditorManager = require('./managers/EditorManager');
const TabManager = require('./managers/TabManager');
const SearchManager = require('./managers/SearchManager');
const FileOperationsManager = require('./managers/FileOperationsManager');

// Import utilities
const fileTypeUtils = require('./utils/fileTypeUtils');

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
     * @type {EditorManager}
     * @private
     */
    this.editorManager = new EditorManager();
    
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
     * Flag indicating if UI is being resized
     * @type {boolean}
     * @private
     */
    this.isResizing = false;
    
    /**
     * Type of resize operation (sidebar, toolsPanel)
     * @type {string|null}
     * @private
     */
    this.resizeType = null;
    
    /**
     * Currently active menu
     * @type {string|null}
     * @private
     */
    this.activeMenu = null;

    /**
     * WSL availability status
     * @type {boolean}
     * @private
     */
    this.wslAvailable = true;

    /**
     * Current platform
     * @type {string}
     * @private
     */
    this.platform = 'unknown';

    this.init();
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

    // Set up file system watcher for auto-refresh
    this.setupFileTreeWatcher();
    
    // Set up custom title bar controls
    this.setupTitleBarControls();
    
    // Set up WSL status listener
    this.setupWSLStatusListener();
  }
  /**
   * Set up file system watcher to auto-refresh file tree
   */
  setupFileTreeWatcher() {
    const workspacePath = this.fileOpsManager.getCurrentWorkspacePath();
    if (!workspacePath) return;
    // Listen for file system change events from main process
    window.ipcRenderer.on('workspace-changed', (event, changedPath) => {
      // Only refresh if the change is in the current workspace
      if (changedPath && changedPath.startsWith(workspacePath)) {
        this.refreshFileTree();
      }
    });
    // Request main process to start watching
    window.ipcRenderer.invoke('watch-workspace', workspacePath);
  }
  /**
   * Refreshes the file tree in the explorer view.
   * 
   * This method manually triggers a refresh of the file tree to show any
   * new files or folders that may have been added to the workspace. It
   * communicates with the main process to get an updated file tree structure.
   * 
   * @async
   * @memberof UIController
   * @throws {Error} When file tree refresh fails
   * 
   * @example
   * // Refresh is typically triggered by the refresh button
   * await uiController.refreshFileTree();
   */
  async refreshFileTree() {
    // Only refresh if workspace is open
    const workspacePath = this.fileOpsManager.getCurrentWorkspacePath();
    if (!workspacePath) {
      this.notificationManager.showWarning('No workspace open to refresh');
      return;
    }
    // Request updated file tree from main process
    try {
      const result = await window.ipcRenderer.invoke('get-file-tree', workspacePath);
      if (result.success) {
        const folderName = workspacePath.split(/[/\\]/).pop();
        this.fileOpsManager.updateWorkspaceUI(folderName, result.fileTree);
        this.notificationManager.showSuccess('File tree refreshed');
      } else {
        this.notificationManager.showError('Failed to refresh file tree: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error refreshing file tree: ' + error.message);
    }
  }

  /**
   * Setup file tree watcher to listen for automatic updates
   */
  setupFileTreeWatcher() {
    // Listen for workspace changes from file watcher in main process
    window.ipcRenderer.on('workspace-changed', (event, data) => {
      if (data.success) {
        const folderName = data.folderPath.split(/[/\\]/).pop();
        this.fileOpsManager.updateWorkspaceUI(folderName, data.fileTree);
        console.log('File tree auto-refreshed due to file system changes');
      } else {
        console.error('Error in workspace change notification:', data.error);
      }
    });
  }

  /**
   * Setup WSL status listener to handle WSL availability updates
   */
  setupWSLStatusListener() {
    // Listen for WSL status updates from main process
    window.ipcRenderer.on('wsl-status', (event, data) => {
      this.wslAvailable = data.available && data.hasDistros;
      
      if (this.platform === 'win32') {
        // Update WSL status indicator in UI
        this.updateWSLStatusIndicator(data);
        
        if (!data.available) {
          this.notificationManager.showWarning(
            'WSL is not installed. CTrace requires WSL on Windows. Please install WSL to access all functionality.'
          );
          console.warn('WSL not detected on Windows platform');
        } else if (!data.hasDistros) {
          this.notificationManager.showWarning(
            'WSL is installed but no Linux distributions are available. Please install a distribution (e.g., Ubuntu) to use CTrace.'
          );
          console.warn('WSL detected but no distributions installed');
        } else {
          console.log('WSL is available and ready with distributions');
        }
      }
    });

    // Listen for WSL installation dialog responses
    window.ipcRenderer.on('wsl-install-response', (event, data) => {
      if (data.action === 'install') {
        this.notificationManager.showInfo(
          'WSL installation initiated. Please follow the installation prompts and restart the application when complete.'
        );
      } else if (data.action === 'cancel') {
        this.notificationManager.showWarning(
          'WSL installation cancelled. Some features may be limited without WSL.'
        );
      }
    });

    // Request initial WSL status check
    window.ipcRenderer.send('check-wsl-status');
  }

  /**
   * Update WSL status indicator in the UI
   * @param {Object} wslStatus - WSL status object with available, hasDistros, and error properties
   */
  updateWSLStatusIndicator(wslStatus) {
    // Find or create WSL status indicator
    let statusEl = document.getElementById('wsl-status-indicator');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'wsl-status-indicator';
      statusEl.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: bold;
        color: white;
        z-index: 1000;
        cursor: pointer;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(statusEl);
    }

    // Update status based on WSL state
    if (!wslStatus.available) {
      statusEl.textContent = '❌ WSL Not Installed';
      statusEl.style.backgroundColor = '#ff4757';
      statusEl.title = 'WSL is not installed. Click for installation instructions.';
    } else if (!wslStatus.hasDistros) {
      statusEl.textContent = '⚠️ WSL No Distributions';
      statusEl.style.backgroundColor = '#ffa502';
      statusEl.title = 'WSL is installed but no Linux distributions are available. Click for setup instructions.';
    } else {
      statusEl.textContent = '✅ WSL Ready';
      statusEl.style.backgroundColor = '#2ed573';
      statusEl.title = 'WSL is ready and available for CTrace';
      
      // Auto-hide the indicator after 3 seconds if everything is working
      setTimeout(() => {
        if (statusEl && statusEl.textContent.includes('✅')) {
          statusEl.style.opacity = '0.3';
        }
      }, 3000);
    }

    // Add click handler for help
    statusEl.onclick = () => {
      if (!wslStatus.available || !wslStatus.hasDistros) {
        this.showWSLSetupDialog(wslStatus);
      }
    };
  }

  /**
   * Show WSL setup dialog with detailed instructions
   * @param {Object} wslStatus - Current WSL status
   */
  showWSLSetupDialog(wslStatus) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 10px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    `;

    let instructions = '';
    if (!wslStatus.available) {
      instructions = `
        <h3>🔧 Install WSL (Windows Subsystem for Linux)</h3>
        <p>CTrace requires WSL to run on Windows. Follow these steps:</p>
        <ol>
          <li><strong>Open PowerShell as Administrator</strong>
            <br><small>Right-click Start button → "Windows PowerShell (Admin)"</small>
          </li>
          <li><strong>Run the installation command:</strong>
            <br><code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace;">wsl --install</code>
          </li>
          <li><strong>Restart your computer</strong> when prompted</li>
          <li><strong>Follow the Ubuntu setup</strong> (create username/password)</li>
          <li><strong>Restart this application</strong> to use CTrace</li>
        </ol>
      `;
    } else {
      instructions = `
        <h3>📦 Install a Linux Distribution</h3>
        <p>WSL is installed but you need a Linux distribution to run CTrace:</p>
        <ol>
          <li><strong>Open PowerShell</strong> (no need for Admin)</li>
          <li><strong>List available distributions:</strong>
            <br><code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace;">wsl --list --online</code>
          </li>
          <li><strong>Install Ubuntu (recommended):</strong>
            <br><code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace;">wsl --install Ubuntu</code>
          </li>
          <li><strong>Follow the setup instructions</strong> (create username/password)</li>
          <li><strong>Restart this application</strong> to use CTrace</li>
        </ol>
      `;
    }

    dialog.innerHTML = `
      ${instructions}
      <div style="margin-top: 20px; text-align: right;">
        ${!wslStatus.available ? `
          <button id="auto-install-wsl" style="
            padding: 10px 20px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
          ">Install Automatically</button>
        ` : wslStatus.available && !wslStatus.hasDistros ? `
          <button id="install-ubuntu" style="
            padding: 10px 20px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
          ">Install Ubuntu</button>
        ` : ''}
        <button id="close-wsl-dialog" style="
          padding: 10px 20px;
          background: #007acc;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        ">Got it!</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Close dialog handlers
    const closeDialog = () => {
      document.body.removeChild(modal);
    };

    document.getElementById('close-wsl-dialog').onclick = closeDialog;
    modal.onclick = (e) => {
      if (e.target === modal) closeDialog();
    };

    // Installation button handlers
    const autoInstallBtn = document.getElementById('auto-install-wsl');
    if (autoInstallBtn) {
      autoInstallBtn.onclick = () => {
        window.ipcRenderer.send('install-wsl');
        closeDialog();
        this.notificationManager.showInfo('WSL installation started. Please follow any prompts that appear.');
      };
    }

    const installUbuntuBtn = document.getElementById('install-ubuntu');
    if (installUbuntuBtn) {
      installUbuntuBtn.onclick = () => {
        window.ipcRenderer.send('install-wsl-distro', 'Ubuntu');
        closeDialog();
        this.notificationManager.showInfo('Ubuntu installation started. Please follow the setup instructions.');
      };
    }
  }

  /**
   * Setup custom title bar controls for frameless window.
   * 
   * This method handles the custom window controls (minimize, maximize, close)
   * and window state management for the frameless window.
   * 
   * @memberof UIController
   * @private
   */
  setupTitleBarControls() {
    const { remote } = require('electron');
    const currentWindow = remote ? remote.getCurrentWindow() : require('electron').remote?.getCurrentWindow();
    
    // If remote is not available, use IPC
    if (!currentWindow) {
      // Setup IPC-based window controls
      const minimizeBtn = document.getElementById('minimize-btn');
      const maximizeBtn = document.getElementById('maximize-btn');
      const closeBtn = document.getElementById('close-btn');
      
      if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
          window.ipcRenderer.send('window-minimize');
        });
      }
      
      if (maximizeBtn) {
        maximizeBtn.addEventListener('click', () => {
          window.ipcRenderer.send('window-maximize-toggle');
        });
      }
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          window.ipcRenderer.send('window-close');
        });
      }
      
      // Listen for window state changes
      window.ipcRenderer.on('window-maximized', (event, isMaximized) => {
        document.body.classList.toggle('window-maximized', isMaximized);
      });
      
      return;
    }
    
    // Direct window control (if remote is available)
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        currentWindow.minimize();
      });
    }
    
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => {
        if (currentWindow.isMaximized()) {
          currentWindow.unmaximize();
        } else {
          currentWindow.maximize();
        }
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        currentWindow.close();
      });
    }
    
    // Update maximize button icon based on window state
    const updateMaximizeButton = () => {
      document.body.classList.toggle('window-maximized', currentWindow.isMaximized());
    };
    
    currentWindow.on('maximize', updateMaximizeButton);
    currentWindow.on('unmaximize', updateMaximizeButton);
    
    // Initial state
    updateMaximizeButton();
  }

  /**
   * Connect managers and set up inter-manager communication
   */
  connectManagers() {
    // Set up tab manager callbacks
    this.tabManager.onLoadFullFile = (filePath) => {
      this.fileOpsManager.loadFullFile(filePath);
    };

    // Set up search manager callbacks
    this.searchManager.openSearchResult = async (filePath, lineNumber) => {
      await this.openSearchResult(filePath, lineNumber);
    };

    // Update search manager with workspace path when workspace changes
    this.searchManager.setWorkspacePath(this.fileOpsManager.getCurrentWorkspacePath());

    // Set up editor content change tracking
    this.editorManager.editor.addEventListener('input', () => {
      if (this.tabManager.activeTabId) {
        const newContent = this.editorManager.getContent();
        this.tabManager.handleContentChange(this.tabManager.activeTabId, newContent);
      }
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
      
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        this.toggleToolsPanel();
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

  /**
   * Setup resizing functionality
   */
  setupResizing() {
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');

    const startResize = (e, type) => {
      this.isResizing = true;
      this.resizeType = type;
      
      if (type === 'sidebar') {
        sidebar.style.transition = 'none';
      } else if (type === 'toolsPanel') {
        toolsPanel.style.transition = 'none';
      }
      
      document.addEventListener('mousemove', this.doResize.bind(this));
      document.addEventListener('mouseup', this.stopResize.bind(this));
      e.preventDefault();
      
      document.body.style.userSelect = 'none';
    };

    window.initSidebarResize = (e) => startResize(e, 'sidebar');
    window.initToolsPanelResize = (e) => startResize(e, 'toolsPanel');
  }

  doResize(e) {
    if (!this.isResizing) return;
    
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');
    
    requestAnimationFrame(() => {
      if (this.resizeType === 'sidebar') {
        const containerRect = sidebar.parentElement.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const minWidth = 180;
        const maxWidth = window.innerWidth * 0.5;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          sidebar.style.width = newWidth + 'px';
        }
      } else if (this.resizeType === 'toolsPanel') {
        const containerRect = toolsPanel.parentElement.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        const minWidth = 200;
        const maxWidth = window.innerWidth * 0.6;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          toolsPanel.style.width = newWidth + 'px';
        }
      }
    });
  }

  stopResize() {
    this.isResizing = false;
    
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');
    
    if (this.resizeType === 'sidebar') {
      sidebar.style.transition = '';
    } else if (this.resizeType === 'toolsPanel') {
      toolsPanel.style.transition = '';
    }
    
    document.body.style.userSelect = '';
    
    document.removeEventListener('mousemove', this.doResize.bind(this));
    document.removeEventListener('mouseup', this.stopResize.bind(this));
    
    this.resizeType = null;
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
    window.saveFile = () => this.fileOpsManager.saveFile();
    window.saveAsFile = () => this.fileOpsManager.saveAsFile();
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
  window.openAssistantPanel = () => this.openAssistantPanel();

    // Visualyzer operations
    window.toggleVisualyzerPanel = () => this.toggleVisualyzerPanel();

    // CTrace helpers
    const stripAnsi = (input) => {
      if (!input || typeof input !== 'string') return input;
      const ansiRegex = /\x1b\[[0-9;]*m/g;
      return input.replace(ansiRegex, '');
    };

    window.runCTrace = async () => {
      const outEl = document.getElementById('ctrace-output');
      this.showToolsPanel();
      if (!outEl) {
        this.notificationManager.showError('CTrace output panel not found');
        return;
      }

      const active = this.tabManager.getActiveTab();
      const currentFilePath = active && active.filePath ? active.filePath : null;
      if (!currentFilePath) {
        outEl.textContent = 'No active file to analyze. Open a file first.';
        this.notificationManager.showWarning('Open a file to analyze with CTrace');
        return;
      }

      outEl.textContent = `Running ctrace on: ${currentFilePath}`;
      try {
        let args = [];
        args.push(`--input=${currentFilePath}`);
        args.push("--static");
        args.push("--sarif-format");
        const result = await window.ipcRenderer.invoke('run-ctrace', args);
        if (result && result.success) {
          outEl.textContent = stripAnsi(result.output || '(no output)');
          this.notificationManager.showSuccess('CTrace completed successfully');
        } else {
          const details = (result && (result.stderr || result.output || result.error)) || 'Unknown error';
          
          // Check if this is a WSL setup error and provide helpful UI
          if (details.includes('WSL') && details.includes('distributions')) {
            outEl.innerHTML = `
              <div style="color: #ff6b6b; font-weight: bold; margin-bottom: 10px;">⚠️ WSL Setup Required</div>
              <div style="white-space: pre-wrap; font-family: monospace; font-size: 12px; line-height: 1.4;">${stripAnsi(details)}</div>
              <div style="margin-top: 15px; padding: 10px; background: #f0f8ff; border: 1px solid #007acc; border-radius: 4px;">
                <div style="font-weight: bold; color: #007acc; margin-bottom: 5px;">Quick Setup:</div>
                <div style="font-size: 12px; color: #333;">
                  1. Open PowerShell as Administrator<br>
                  2. Run: <code style="background: #e6e6e6; padding: 2px 4px; border-radius: 2px;">wsl --install Ubuntu</code><br>
                  3. Restart when prompted and follow setup instructions<br>
                  4. Restart this application
                </div>
              </div>
            `;
            this.notificationManager.showWarning('WSL setup required - see output panel for instructions');
          } else {
            outEl.textContent = `Error running ctrace:\n${stripAnsi(details)}`;
            this.notificationManager.showError('Failed to run CTrace');
          }
        }
        // Auto-scroll to bottom
        outEl.scrollTop = outEl.scrollHeight;
      } catch (err) {
        outEl.textContent = `Exception: ${err.message}`;
        this.notificationManager.showError('Error invoking CTrace');
      }
    };

    window.clearCTraceOutput = () => {
      const outEl = document.getElementById('ctrace-output');
      if (outEl) outEl.textContent = '';
    };

    window.copyCTraceOutput = () => {
      const outEl = document.getElementById('ctrace-output');
      if (!outEl) return;
      const text = outEl.textContent || '';
      try {
        // Prefer Electron clipboard if available via require
        const { clipboard } = require('electron');
        clipboard.writeText(text);
        this.notificationManager.showSuccess('Output copied to clipboard');
      } catch (_) {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => this.notificationManager.showSuccess('Output copied to clipboard'))
            .catch(() => this.notificationManager.showError('Failed to copy output'));
        } else {
          this.notificationManager.showError('Clipboard not available');
        }
      }
    };

    // Tab manager reference for global access
    window.tabManager = this.tabManager;
    window.searchManager = this.searchManager;
  }

  /**
   * Activity bar management
   */
  setActiveActivity(activityId) {
    document.querySelectorAll('.activity-item').forEach(item => {
      item.classList.remove('active');
    });
    const element = document.getElementById(activityId);
    if (element) {
      element.classList.add('active');
    }
  }

  showExplorer() {
    this.setActiveActivity('explorer-activity');
    const sidebarTitle = document.getElementById('sidebar-title');
    const explorerView = document.getElementById('explorer-view');
    const searchView = document.getElementById('search-view');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarTitle) sidebarTitle.textContent = 'Explorer';
    if (explorerView) explorerView.style.display = 'block';
    if (searchView) searchView.style.display = 'none';
    if (sidebar && sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
  }

  showSearch() {
    this.setActiveActivity('search-activity');
    const sidebarTitle = document.getElementById('sidebar-title');
    const explorerView = document.getElementById('explorer-view');
    const searchView = document.getElementById('search-view');
    const sidebar = document.getElementById('sidebar');
    const searchInput = document.getElementById('sidebar-search-input');
    
    if (sidebarTitle) sidebarTitle.textContent = 'Search';
    if (explorerView) explorerView.style.display = 'none';
    if (searchView) searchView.style.display = 'block';
    if (sidebar && sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
    setTimeout(() => searchInput && searchInput.focus(), 100);
  }

  /**
   * Sidebar toggle
   */
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    if (sidebar.style.width === '0px' || sidebar.style.display === 'none') {
      sidebar.style.width = '280px';
      sidebar.style.display = 'flex';
    } else {
      sidebar.style.width = '0px';
      setTimeout(() => {
        sidebar.style.display = 'none';
      }, 200);
    }
  }

  /**
   * Tools panel management
   */
  showToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      toolsPanel.style.display = 'flex';
      toolsPanel.offsetHeight; // Force reflow
      toolsPanel.classList.add('active');
    }
  }

  hideToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      toolsPanel.classList.remove('active');
      setTimeout(() => {
        toolsPanel.style.display = 'none';
      }, 200);
    }
  }

  toggleToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      if (toolsPanel.style.display === 'none' || !toolsPanel.classList.contains('active')) {
        this.showToolsPanel();
      } else {
        this.hideToolsPanel();
      }
    }
  }

  /**
   * Visualyzer panel management
   */
  toggleVisualyzerPanel() {
    // Open visualyzer in a separate window
    window.ipcRenderer.send('open-visualyzer');
  }

  closeVisualyzer() {
    // This method is no longer needed since visualyzer is in separate window
    // Kept for backward compatibility
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
    const toolsPanel = document.getElementById('toolsPanel');
    // Ensure assistant is configured at least once before opening
    const ensure = this.ensureAssistantConfigured();
    Promise.resolve(ensure).then(() => {
      if (toolsPanel) {
        this.showToolsPanel();
        // Inject assistant chat UI into tools panel
        this.renderAssistantUI();
      }
    });
  }

  /**
   * Inject a simple chat UI into the tools panel (like VSCode Copilot sidebar)
   */
  renderAssistantUI() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (!toolsPanel) return;

    // Save original content so we can restore it later
    if (!this._toolsPanelOriginal) {
      const header = toolsPanel.querySelector('.tools-panel-header');
      const content = toolsPanel.querySelector('.tools-panel-content');
      this._toolsPanelOriginal = {
        headerHTML: header ? header.innerHTML : null,
        contentHTML: content ? content.innerHTML : null
      };
    }

    const header = toolsPanel.querySelector('.tools-panel-header');
    const content = toolsPanel.querySelector('.tools-panel-content');
    if (!header || !content) return;

    // Update header title
    const titleSpan = header.querySelector('span');
    if (titleSpan) titleSpan.textContent = 'Assistant';

    // Build assistant UI
    const cfg = this.getAssistantConfig() || { provider: 'none' };
    
    // Get display name for the assistant
    let displayName = 'Not configured';
    if (cfg.provider === 'local' && cfg.localModelPath) {
      // Extract filename from path and remove .gguf extension
      const pathParts = cfg.localModelPath.replace(/\\/g, '/').split('/');
      const filename = pathParts[pathParts.length - 1];
      displayName = filename.replace(/\.gguf$/i, '');
    } else if (cfg.provider === 'external') {
      displayName = cfg.externalProvider || 'External';
    } else if (cfg.provider === 'ollama') {
      displayName = 'Ollama';
    } else if (cfg.provider !== 'none') {
      displayName = cfg.provider;
    }

    content.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%;">
        <div style="padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:space-between">
          <div style="font-size:13px; color:#c9d1d9">Assistant — ${displayName}</div>
          <div style="display:flex; gap:8px; align-items:center">
            <button id="assistant-settings" style="padding:6px 8px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer; font-size:12px">Settings</button>
          </div>
        </div>
        <div id="assistant-messages" style="flex:1; padding:12px; overflow:auto; background:linear-gradient(#0b0f14, #051018);">
          <!-- messages go here -->
        </div>
        <div style="padding:10px; border-top:1px solid rgba(255,255,255,0.03);">
          <div id="context-indicator" style="display:none; padding:6px 8px; margin-bottom:8px; background:#1a1f2e; border:1px solid #2b3036; border-radius:4px; font-size:11px; color:#8b949e; font-family:monospace;">
            <span id="context-text"></span>
            <button id="context-clear" style="margin-left:8px; padding:2px 6px; background:transparent; border:1px solid #30363d; color:#8b949e; border-radius:3px; cursor:pointer; font-size:10px;">✕</button>
          </div>
          <div style="display:flex; gap:8px; align-items:flex-end">
            <textarea id="assistant-input" placeholder="Ask the assistant..." style="flex:1; min-height:44px; max-height:120px; resize:none; padding:8px; border-radius:6px; border:1px solid #2b3036; background:#0d1117; color:#fff"></textarea>
            <button id="assistant-send" style="padding:10px; background:transparent; color:#8b949e; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:color 0.2s;" title="Send message (Enter)" onmouseover="this.style.color='#c9d1d9'" onmouseout="this.style.color='#8b949e'">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    // Helper to append messages with typing effect
    const addMessage = (who, text, options = {}) => {
      const container = document.getElementById('assistant-messages');
      if (!container) return;
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '12px';
      const bubble = document.createElement('div');
      bubble.style.padding = '10px 12px';
      bubble.style.borderRadius = '8px';
      bubble.style.maxWidth = '90%';
      bubble.style.lineHeight = '1.4';
      
      if (who === 'user') {
        bubble.style.background = '#0b5fff';
        bubble.style.color = '#fff';
        bubble.style.marginLeft = 'auto';
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.textContent = text;
        wrap.appendChild(bubble);
        container.appendChild(wrap);
        container.scrollTop = container.scrollHeight;
      } else {
        bubble.style.background = '#111319';
        bubble.style.color = '#e6edf3';
        bubble.style.marginRight = 'auto';
        wrap.appendChild(bubble);
        container.appendChild(wrap);
        
        // Return the bubble element for typing effects
        if (options.typing) {
          return bubble;
        }
        
        // Render markdown for assistant messages
        bubble.innerHTML = renderMarkdown(text);
        container.scrollTop = container.scrollHeight;
      }
    };

    // Typing effect for assistant messages
    const typeMessage = async (bubble, text, speed = 0.1) => { // Changed from 20 to 10ms (faster). Increase for slower, decrease for faster
      const container = document.getElementById('assistant-messages');
      let currentText = '';
      
      for (let i = 0; i < text.length; i++) {
        currentText += text[i];
        bubble.innerHTML = renderMarkdown(currentText);
        if (container) container.scrollTop = container.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, speed));
      }
    };

    // Animated thinking indicator
    const addThinkingMessage = () => {
      const bubble = addMessage('assistant', '', { typing: true });
      if (!bubble) return null;
      
      let dotCount = 0;
      const thinkingInterval = setInterval(() => {
        dotCount = (dotCount % 3) + 1;
        bubble.textContent = 'Thinking' + '.'.repeat(dotCount);
        const container = document.getElementById('assistant-messages');
        if (container) container.scrollTop = container.scrollHeight;
      }, 400);
      
      return { bubble, interval: thinkingInterval };
    };

    // Remove thinking message
    const removeThinkingMessage = (thinkingData) => {
      if (!thinkingData) return;
      clearInterval(thinkingData.interval);
      const container = document.getElementById('assistant-messages');
      if (container && thinkingData.bubble && thinkingData.bubble.parentElement) {
        container.removeChild(thinkingData.bubble.parentElement);
      }
    };

    // Simple markdown renderer
    const renderMarkdown = (text) => {
      // Trim leading/trailing whitespace to avoid extra newlines
      text = text.trim();
      
      // Store original code blocks before any processing
      const codeBlocks = [];
      let codeIndex = 0;
      
      // Extract and store original code blocks
      const textWithPlaceholders = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const trimmedCode = code.trim();
        codeBlocks.push(trimmedCode);
        return `__CODE_BLOCK_${codeIndex++}__`;
      });
      
      // Escape HTML
      let html = textWithPlaceholders.replace(/&/g, '&amp;')
                                     .replace(/</g, '&lt;')
                                     .replace(/>/g, '&gt;');
      
      // Replace code block placeholders with rendered HTML
      codeIndex = 0;
      html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const originalCode = codeBlocks[parseInt(index)];
        // Store original code in base64 to avoid any escaping issues
        const base64Code = btoa(unescape(encodeURIComponent(originalCode)));
        const escapedForDisplay = originalCode.replace(/&/g, '&amp;')
                                               .replace(/</g, '&lt;')
                                               .replace(/>/g, '&gt;');
        return `<div style="position:relative; margin:8px 0;">
          <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
            <button class="code-copy-btn" data-code-b64="${base64Code}" style="padding:4px 8px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:4px; cursor:pointer; font-size:11px;">Copy</button>
            <button class="code-replace-btn" data-code-b64="${base64Code}" style="padding:4px 8px; background:#238636; border:1px solid #2ea043; color:#fff; border-radius:4px; cursor:pointer; font-size:11px;">Replace</button>
          </div>
          <pre style="background:#0d1117; padding:12px; border-radius:6px; overflow-x:auto;"><code style="font-family:Consolas,Monaco,'Courier New',monospace; font-size:13px; color:#c9d1d9;">${escapedForDisplay}</code></pre>
        </div>`;
      });
      
      // Inline code (`code`)
      html = html.replace(/`([^`]+)`/g, '<code style="background:#21262d; padding:2px 6px; border-radius:3px; font-family:Consolas,Monaco,monospace; font-size:13px; color:#f0f6fc;">$1</code>');
      
      // Bold (**text** or __text__)
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      
      // Italic (*text* or _text_)
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
      
      // Headers (### text)
      html = html.replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 8px 0; font-size:16px; font-weight:600; color:#f0f6fc;">$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2 style="margin:14px 0 10px 0; font-size:18px; font-weight:600; color:#f0f6fc;">$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1 style="margin:16px 0 12px 0; font-size:20px; font-weight:600; color:#f0f6fc;">$1</h1>');
      
      // Lists (- item or * item or 1. item)
      html = html.replace(/^- (.+)$/gm, '<li style="margin-left:20px;">$1</li>');
      html = html.replace(/^\* (.+)$/gm, '<li style="margin-left:20px;">$1</li>');
      html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px; list-style-type:decimal;">$1</li>');
      
      // Wrap consecutive <li> in <ul>
      html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
        return `<ul style="margin:8px 0; padding-left:0;">${match}</ul>`;
      });
      
      // Line breaks (preserve double newlines as paragraphs)
      html = html.replace(/\n\n/g, '<br><br>');
      
      return html;
    };

    // Prefill a small welcome message with typing effect (only first time)
    const providerName = cfg.provider === 'external' ? (cfg.externalProvider || 'External') : cfg.provider;
    const welcomeText = `Hi — I'm your assistant. Using: ${providerName}. Ask me something or open Settings to change providers.`;
    
    // Check if welcome message has been shown before
    const hasShownWelcome = sessionStorage.getItem('assistantWelcomeShown');
    
    if (!hasShownWelcome) {
      // First time - show typing effect (faster speed: 8ms per character)
      const welcomeBubble = addMessage('assistant', '', { typing: true });
      if (welcomeBubble) {
        typeMessage(welcomeBubble, welcomeText, 8);
      }
      sessionStorage.setItem('assistantWelcomeShown', 'true');
    } else {
      // Already shown - display instantly
      addMessage('assistant', welcomeText);
    }

    // Wire up send button
    const sendBtn = document.getElementById('assistant-send');
    const inputEl = document.getElementById('assistant-input');
    const settingsBtn = document.getElementById('assistant-settings');
    const contextIndicator = document.getElementById('context-indicator');
    const contextText = document.getElementById('context-text');
    const contextClearBtn = document.getElementById('context-clear');

    // Capture selection before it's lost when user clicks on input
    let capturedSelection = '';
    let capturedLineInfo = '';
    
    inputEl.addEventListener('focus', () => {
      const editor = this.editorManager.editor;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const selection = editor.value.substring(start, end);
      
      if (selection) {
        capturedSelection = selection;
        
        // Calculate line numbers
        const textBeforeStart = editor.value.substring(0, start);
        const textBeforeEnd = editor.value.substring(0, end);
        const startLine = (textBeforeStart.match(/\n/g) || []).length + 1;
        const endLine = (textBeforeEnd.match(/\n/g) || []).length + 1;
        
        // Get current file name
        const activeTab = this.tabManager.getActiveTab();
        const fileName = activeTab && activeTab.fileName ? activeTab.fileName : 'Untitled';
        
        // Format context info
        if (startLine === endLine) {
          capturedLineInfo = `${fileName}: ${startLine}`;
        } else {
          capturedLineInfo = `${fileName}: ${startLine}-${endLine}`;
        }
        
        // Show context indicator
        contextText.textContent = capturedLineInfo;
        contextIndicator.style.display = 'block';
      }
    });

    // Handle Enter key to send message (Shift+Enter for new line)
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Clear captured selection when input loses focus without sending
    inputEl.addEventListener('blur', () => {
      // Small delay to allow send button click to process
      setTimeout(() => {
        if (!inputEl.value.trim()) {
          capturedSelection = '';
          capturedLineInfo = '';
          contextIndicator.style.display = 'none';
        }
      }, 200);
    });

    // Clear button handler
    contextClearBtn.onclick = () => {
      capturedSelection = '';
      capturedLineInfo = '';
      contextIndicator.style.display = 'none';
    };

    sendBtn.onclick = async () => {
      const text = (inputEl.value || '').trim();
      if (!text) return;
      
      // Use captured selection as context
      let context = '';
      if (capturedSelection) {
        context = `\n\n[Context - Selected Code]:\n\`\`\`\n${capturedSelection}\n\`\`\`\n\n`;
      }
      
      // Clear captured selection and hide indicator after using it
      capturedSelection = '';
      capturedLineInfo = '';
      contextIndicator.style.display = 'none';
      
      // Combine user message with context
      const fullMessage = context ? context + text : text;
      
      // Display only user's text in UI
      addMessage('user', text);
      inputEl.value = '';

      // Get current assistant config
      const cfg = this.getAssistantConfig();
      if (!cfg || cfg.provider === 'none' || cfg.skipped) {
        const bubble = addMessage('assistant', '', { typing: true });
        if (bubble) {
          await typeMessage(bubble, 'Assistant not configured. Please click the settings icon ⚙️ to set up your provider.', 15);
        }
        return;
      }

      // Show animated thinking indicator
      const thinkingData = addThinkingMessage();

      try {
        // All providers go through IPC (main process)
        const result = await window.ipcRenderer.invoke('assistant-chat', {
          provider: cfg.provider,
          message: fullMessage,
          config: cfg
        });

        // Remove the thinking message
        removeThinkingMessage(thinkingData);

        if (result && result.success) {
          const bubble = addMessage('assistant', '', { typing: true });
          if (bubble) {
            await typeMessage(bubble, result.reply, 20);
            
            // Attach event listeners to code action buttons after rendering
            setTimeout(() => {
              attachCodeActionListeners();
            }, 100);
          }
        } else {
          const errorMsg = result && result.error ? result.error : 'Unknown error occurred';
          const bubble = addMessage('assistant', '', { typing: true });
          if (bubble) {
            await typeMessage(bubble, `❌ Error: ${errorMsg}`, 15);
          }
        }
      } catch (err) {
        // Remove thinking message
        removeThinkingMessage(thinkingData);
        
        console.error('Assistant chat error:', err);
        const bubble = addMessage('assistant', '', { typing: true });
        if (bubble) {
          await typeMessage(bubble, `❌ Error: ${err.message || 'Failed to communicate with assistant'}`, 15);
        }
      }
    };

    // Helper to attach event listeners to code action buttons
    const attachCodeActionListeners = () => {
      const container = document.getElementById('assistant-messages');
      if (!container) return;
      
      // Copy button handlers
      container.querySelectorAll('.code-copy-btn').forEach(btn => {
        btn.onclick = () => {
          const base64Code = btn.getAttribute('data-code-b64');
          const code = decodeURIComponent(escape(atob(base64Code)));
          
          try {
            const { clipboard } = require('electron');
            clipboard.writeText(code);
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 2000);
          } catch (_) {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(code)
                .then(() => {
                  btn.textContent = 'Copied!';
                  setTimeout(() => btn.textContent = 'Copy', 2000);
                })
                .catch(() => alert('Failed to copy code'));
            }
          }
        };
      });
      
      // Replace button handlers
      container.querySelectorAll('.code-replace-btn').forEach(btn => {
        btn.onclick = () => {
          const base64Code = btn.getAttribute('data-code-b64');
          const code = decodeURIComponent(escape(atob(base64Code)));
          
          const editor = this.editorManager.editor;
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          
          if (start !== end) {
            // Replace selected text
            const before = editor.value.substring(0, start);
            const after = editor.value.substring(end);
            editor.value = before + code + after;
            
            // Update tab state
            if (this.tabManager.activeTabId) {
              this.tabManager.handleContentChange(this.tabManager.activeTabId, editor.value);
            }
            
            btn.textContent = 'Replaced!';
            setTimeout(() => btn.textContent = 'Replace', 2000);
          } else {
            // Insert at cursor position
            const before = editor.value.substring(0, start);
            const after = editor.value.substring(start);
            editor.value = before + code + after;
            
            // Update tab state
            if (this.tabManager.activeTabId) {
              this.tabManager.handleContentChange(this.tabManager.activeTabId, editor.value);
            }
            
            btn.textContent = 'Inserted!';
            setTimeout(() => btn.textContent = 'Replace', 2000);
          }
          
          // Focus editor
          editor.focus();
        };
      });
    };

    settingsBtn.onclick = () => {
      // Open the assistant setup modal for reconfiguration
      this.showAssistantSetupGuide((cfg) => {
        // Re-render assistant UI to reflect changes
        this.renderAssistantUI();
      });
    };
  }

  /**
   * Retrieve assistant configuration from localStorage
   * @returns {Object|null}
   */
  getAssistantConfig() {
    try {
      const raw = localStorage.getItem('assistantConfig');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to parse assistantConfig from localStorage', err);
      return null;
    }
  }

  /**
   * Save assistant configuration to localStorage
   * @param {Object} cfg
   */
  saveAssistantConfig(cfg) {
    try {
      localStorage.setItem('assistantConfig', JSON.stringify(cfg));
      this.notificationManager.showSuccess('Assistant settings saved');
    } catch (err) {
      console.error('Failed to save assistantConfig', err);
      this.notificationManager.showError('Failed to save assistant settings');
    }
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

  /**
   * Render a first-time setup modal for Assistant configuration.
   * Calls the done callback with saved config or null if cancelled.
   */
  showAssistantSetupGuide(done) {
    // Load existing config to pre-fill form
    const existingConfig = this.getAssistantConfig() || {};
    
    // Modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10001;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      width: 720px; max-width: 95%; background: #fff; border-radius:8px; padding:20px; box-shadow:0 8px 30px rgba(0,0,0,0.3);
      font-family: sans-serif; color: #222;
    `;

    dialog.innerHTML = `
      <h2 style="margin-top:0">Assistant setup</h2>
      <p>Choose how you'd like to connect the Assistant. You can use Ollama, an external API (ChatGPT5, Deepseek, or other), or point to a local GGUF model on your machine.</p>
      <div style="display:flex; gap:12px; margin-top:12px;">
        <label style="flex:1; border:1px solid #e2e2e2; padding:12px; border-radius:6px; cursor:pointer;" id="assist-opt-ollama">
          <input type="radio" name="assist-provider" value="ollama" style="margin-right:8px"> Ollama (local or remote)
          <div style="font-size:12px; color:#555; margin-top:6px">Connect to an Ollama server (default: http://localhost:11434)</div>
        </label>
        <label style="flex:1; border:1px solid #e2e2e2; padding:12px; border-radius:6px; cursor:pointer;" id="assist-opt-external">
          <input type="radio" name="assist-provider" value="external" style="margin-right:8px"> External API
          <div style="font-size:12px; color:#555; margin-top:6px">Use ChatGPT5, Deepseek or other hosted APIs (requires API key)</div>
        </label>
        <label style="flex:1; border:1px solid #e2e2e2; padding:12px; border-radius:6px; cursor:pointer;" id="assist-opt-local">
          <input type="radio" name="assist-provider" value="local" style="margin-right:8px"> Local GGUF model
          <div style="font-size:12px; color:#555; margin-top:6px">Point to a GGUF model file on your computer</div>
        </label>
      </div>

      <div id="assist-extra" style="margin-top:16px"></div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
        <button id="assist-skip" style="padding:8px 12px; background:transparent; border:1px solid #cfcfcf; border-radius:6px; cursor:pointer">Skip for now</button>
        <button id="assist-cancel" style="padding:8px 12px; background:#ddd; border:none; border-radius:6px; cursor:pointer">Cancel</button>
        <button id="assist-save" style="padding:8px 12px; background:#007acc; color:white; border:none; border-radius:6px; cursor:pointer">Save</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const extra = dialog.querySelector('#assist-extra');

    const clearExtra = () => { extra.innerHTML = ''; };

    const makeInputRow = (labelText, inputId, placeholder = '') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-top:8px;';
      row.innerHTML = `
        <label style="font-size:13px; color:#333">${labelText}</label>
        <input id="${inputId}" style="padding:8px; border:1px solid #e2e2e2; border-radius:4px; font-size:13px" placeholder="${placeholder}">
      `;
      return row;
    };

    const providerRadios = dialog.querySelectorAll('input[name="assist-provider"]');
    const optOllama = dialog.querySelector('#assist-opt-ollama');
    const optExternal = dialog.querySelector('#assist-opt-external');
    const optLocal = dialog.querySelector('#assist-opt-local');

    const selectProvider = (value) => {
      providerRadios.forEach(r => r.checked = (r.value === value));
      optOllama.style.borderColor = value === 'ollama' ? '#007acc' : '#e2e2e2';
      optExternal.style.borderColor = value === 'external' ? '#007acc' : '#e2e2e2';
      optLocal.style.borderColor = value === 'local' ? '#007acc' : '#e2e2e2';

      clearExtra();
      if (value === 'ollama') {
        extra.appendChild(makeInputRow('Ollama host (include protocol)', 'ollama-host', 'http://localhost:11434'));
        extra.appendChild(makeInputRow('System prompt (optional)', 'system-prompt', 'You are a helpful assistant...'));
        
        // Pre-fill with saved values
        setTimeout(() => {
          const hostInput = document.getElementById('ollama-host');
          const systemInput = document.getElementById('system-prompt');
          if (hostInput && existingConfig.ollamaHost) {
            hostInput.value = existingConfig.ollamaHost;
          }
          if (systemInput && existingConfig.systemPrompt) {
            systemInput.value = existingConfig.systemPrompt;
          }
        }, 0);
      } else if (value === 'external') {
        const selRow = document.createElement('div');
        selRow.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:8px;';
        selRow.innerHTML = `
          <label style="font-size:13px">Provider</label>
          <select id="external-provider" style="padding:6px; border:1px solid #e2e2e2; border-radius:4px">
            <option value="ChatGPT5">ChatGPT5</option>
            <option value="Deepseek">Deepseek</option>
            <option value="Other">Other</option>
          </select>
        `;
        extra.appendChild(selRow);
        extra.appendChild(makeInputRow('API Key', 'external-api-key', 'sk-...'));
        extra.appendChild(makeInputRow('System prompt (optional)', 'system-prompt', 'You are a helpful assistant...'));
        
        // Pre-fill with saved values
        setTimeout(() => {
          const providerSelect = document.getElementById('external-provider');
          const apiKeyInput = document.getElementById('external-api-key');
          const systemInput = document.getElementById('system-prompt');
          if (providerSelect && existingConfig.externalProvider) {
            providerSelect.value = existingConfig.externalProvider;
          }
          if (apiKeyInput && existingConfig.apiKey) {
            apiKeyInput.value = existingConfig.apiKey;
          }
          if (systemInput && existingConfig.systemPrompt) {
            systemInput.value = existingConfig.systemPrompt;
          }
        }, 0);
      } else if (value === 'local') {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:8px;';
        row.innerHTML = `
          <input id="local-model-path" placeholder="Select GGUF model file..." style="flex:1; padding:8px; border:1px solid #e2e2e2; border-radius:4px" readonly>
          <button id="local-browse" style="padding:8px 10px; border-radius:4px; border:none; background:#007acc; color:white; cursor:pointer">Browse</button>
        `;
        extra.appendChild(row);

        // Browse handler using IPC
        setTimeout(() => {
          const browseBtn = document.getElementById('local-browse');
          const pathInput = document.getElementById('local-model-path');
          
          // Pre-fill with saved value
          if (pathInput && existingConfig.localModelPath) {
            pathInput.value = existingConfig.localModelPath;
          }
          
          if (browseBtn) {
            browseBtn.onclick = async () => {
              try {
                const result = await window.ipcRenderer.invoke('select-llm-file');
                if (result && result.filePath) {
                  pathInput.value = result.filePath;
                }
              } catch (err) {
                console.error('Error selecting model file', err);
                this.notificationManager.showError('Unable to open file selector');
              }
            };
          }
        }, 0);
        
        // Add context size configuration
        const contextRow = document.createElement('div');
        contextRow.style.cssText = 'margin-top:12px;';
        contextRow.innerHTML = `
          <label style="display:block; margin-bottom:4px; color:#333; font-size:13px">Context Size (tokens):</label>
          <input id="context-size" type="number" placeholder="8192" style="width:100%; padding:8px; border:1px solid #e2e2e2; border-radius:4px" value="8192" min="512" max="32768">
          <div style="margin-top:4px; font-size:11px; color:#666">Lower values use less VRAM. Recommended: 2048-8192. Default model max: 40960</div>
        `;
        extra.appendChild(contextRow);
        
        // Add GPU layers configuration
        const gpuRow = document.createElement('div');
        gpuRow.style.cssText = 'margin-top:12px;';
        gpuRow.innerHTML = `
          <label style="display:block; margin-bottom:4px; color:#333; font-size:13px">GPU Layers (0 = CPU only, -1 = all layers):</label>
          <input id="gpu-layers" type="number" placeholder="0" style="width:100%; padding:8px; border:1px solid #e2e2e2; border-radius:4px" value="0">
          <div style="margin-top:4px; font-size:11px; color:#666">Higher values offload more layers to GPU for faster inference. Use -1 to offload all layers.</div>
        `;
        extra.appendChild(gpuRow);
        
        // Add system prompt field for local models too
        extra.appendChild(makeInputRow('System prompt (optional)', 'system-prompt', 'You are a helpful assistant...'));
        
        // Pre-fill all settings
        setTimeout(() => {
          const systemInput = document.getElementById('system-prompt');
          const gpuLayersInput = document.getElementById('gpu-layers');
          const contextSizeInput = document.getElementById('context-size');
          
          if (systemInput && existingConfig.systemPrompt) {
            systemInput.value = existingConfig.systemPrompt;
          }
          if (gpuLayersInput && existingConfig.gpuLayers !== undefined) {
            gpuLayersInput.value = existingConfig.gpuLayers;
          }
          if (contextSizeInput && existingConfig.contextSize !== undefined) {
            contextSizeInput.value = existingConfig.contextSize;
          }
        }, 0);
      }
    };

    // Click handlers for the option cards as well
    optOllama.onclick = () => selectProvider('ollama');
    optExternal.onclick = () => selectProvider('external');
    optLocal.onclick = () => selectProvider('local');

    // Pre-select provider based on saved config, or default to external
    const savedProvider = existingConfig.provider && existingConfig.provider !== 'none' 
      ? existingConfig.provider 
      : 'external';
    selectProvider(savedProvider);

    // Buttons
    const btnSave = dialog.querySelector('#assist-save');
    const btnCancel = dialog.querySelector('#assist-cancel');
    const btnSkip = dialog.querySelector('#assist-skip');

    const closeModal = (result) => {
      try { document.body.removeChild(modal); } catch (_) {}
      if (done) done(result);
    };

    btnCancel.onclick = () => closeModal(null);
    btnSkip.onclick = () => {
      // Save a lightweight config indicating user skipped
      const cfg = { provider: 'none', skipped: true };
      this.saveAssistantConfig(cfg);
      closeModal(cfg);
    };

    btnSave.onclick = () => {
      const selected = Array.from(providerRadios).find(r => r.checked);
      if (!selected) {
        this.notificationManager.showError('Please select a provider');
        return;
      }
      const provider = selected.value;
      const cfg = { provider };
      
      // Get system prompt if it exists
      const systemPromptEl = document.getElementById('system-prompt');
      if (systemPromptEl && systemPromptEl.value.trim()) {
        cfg.systemPrompt = systemPromptEl.value.trim();
      }
      
      if (provider === 'ollama') {
        const hostEl = document.getElementById('ollama-host');
        cfg.ollamaHost = hostEl && hostEl.value ? hostEl.value.trim() : 'http://localhost:11434';
      } else if (provider === 'external') {
        const prov = document.getElementById('external-provider');
        const key = document.getElementById('external-api-key');
        cfg.externalProvider = prov ? prov.value : 'ChatGPT5';
        cfg.apiKey = key ? key.value.trim() : '';
        if (!cfg.apiKey) {
          this.notificationManager.showError('Please enter an API key for the external provider');
          return;
        }
      } else if (provider === 'local') {
        const pathEl = document.getElementById('local-model-path');
        const gpuLayersEl = document.getElementById('gpu-layers');
        const contextSizeEl = document.getElementById('context-size');
        
        cfg.localModelPath = pathEl ? pathEl.value : '';
        if (!cfg.localModelPath) {
          this.notificationManager.showError('Please choose a local GGUF model file');
          return;
        }
        
        // Save GPU layers setting (default to 0 if not specified)
        cfg.gpuLayers = gpuLayersEl && gpuLayersEl.value !== '' ? parseInt(gpuLayersEl.value, 10) : 0;
        
        // Save context size setting (default to 8192 if not specified)
        cfg.contextSize = contextSizeEl && contextSizeEl.value !== '' ? parseInt(contextSizeEl.value, 10) : 8192;
      }

      // Persist and close
      this.saveAssistantConfig(cfg);
      // Notify main process in case it needs to warm things up
      try { window.ipcRenderer.send('assistant-config-updated', cfg); } catch (_) {}
      closeModal(cfg);
    };

    // Dismiss modal when clicking outside the dialog
    modal.onclick = (e) => { if (e.target === modal) closeModal(null); };
  }
  /**
   * Open workspace and update search manager
   */
  async openWorkspace() {
    const result = await this.fileOpsManager.openWorkspace();
    if (result && result.success) {
      this.searchManager.setWorkspacePath(result.folderPath);
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
      
      const result = await window.ipcRenderer.invoke('read-file', normalizedPath);
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
            const forceResult = await window.ipcRenderer.invoke('force-open-file', normalizedPath);
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
        
        // Switch to explorer view and wait for editor to be ready
        this.showExplorer();
        
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.uiController = new UIController();
});

module.exports = UIController;