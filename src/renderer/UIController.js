// Import manager classes
const NotificationManager = require('./managers/NotificationManager');
const EditorManager = require('./managers/EditorManager');
const TabManager = require('./managers/TabManager');
const SearchManager = require('./managers/SearchManager');
const FileOperationsManager = require('./managers/FileOperationsManager');
const VisualyzerManager = require('./managers/VisualyzerManager');

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
     * Visualyzer manager instance
     * @type {VisualyzerManager}
     * @private
     */
    this.visualyzerManager = new VisualyzerManager();

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
    window.toggleVisualyzerPanel = () => this.toggleVisualyzerPanel();
    window.showVisualyzerPanel = () => this.showVisualyzerPanel();
    window.hideVisualyzerPanel = () => this.hideVisualyzerPanel();
    window.closeVisualyzer = () => this.hideVisualyzer();
    
    // Visualyzer controls
    window.visualyzerZoomIn = () => this.visualyzerManager.zoomIn();
    window.visualyzerZoomOut = () => this.visualyzerManager.zoomOut();
    window.visualyzerResetZoom = () => this.visualyzerManager.resetZoom();
    window.visualyzerClear = () => this.visualyzerManager.clear();

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
        if (!toolsPanel.classList.contains('active')) {
          toolsPanel.style.display = 'none';
        }
      }, 300);
    }
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

  /**
   * Toggle Visualyzer panel visibility
   */
  toggleVisualyzerPanel() {
    const visualyzerArea = document.getElementById('visualyzer-area');
    if (visualyzerArea) {
      if (visualyzerArea.style.display !== 'none') {
        this.hideVisualyzer();
      } else {
        this.showVisualyzer();
      }
    }
  }

  /**
   * Show Visualyzer in main area
   */
  showVisualyzer() {
    const visualyzerArea = document.getElementById('visualyzer-area');
    const welcomeScreen = document.getElementById('welcome-screen');
    const editorArea = document.getElementById('editor-area');
    
    if (visualyzerArea) {
      // Hide other main area views
      if (welcomeScreen) welcomeScreen.style.display = 'none';
      if (editorArea) editorArea.style.display = 'none';
      
      // Show visualyzer
      visualyzerArea.style.display = 'flex';
    }
  }

  /**
   * Hide Visualyzer and show welcome screen
   */
  hideVisualyzer() {
    const visualyzerArea = document.getElementById('visualyzer-area');
    const welcomeScreen = document.getElementById('welcome-screen');
    
    if (visualyzerArea) {
      visualyzerArea.style.display = 'none';
    }
    
    // Show welcome screen if no tabs are open
    if (this.tabManager.tabs.length === 0 && welcomeScreen) {
      welcomeScreen.style.display = 'flex';
    }
  }

  /**
   * Show Visualyzer panel
   */
  showVisualyzerPanel() {
    this.showVisualyzer();
  }

  /**
   * Hide Visualyzer panel
   */
  hideVisualyzerPanel() {
    this.hideVisualyzer();
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