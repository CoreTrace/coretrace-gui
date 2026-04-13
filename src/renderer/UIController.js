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
     * File tree context menu DOM element
     * @type {HTMLElement|null}
     * @private
     */
    this.fileTreeContextMenu = null;

    /**
     * Auto save enabled state
     * @type {boolean}
     * @private
     */
    this.autoSaveEnabled = false;

    /**
     * Auto save timer
     * @type {number|null}
     * @private
     */
    this.autoSaveTimer = null;

    /**
     * Auto save delay in milliseconds
     * @type {number}
     * @private
     */
    this.autoSaveDelay = 1000;

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
      this.setupFileTreeWatcher();
      this.loadAutoSaveState();
      this.setupAutoSaveListener();
      this.setupFileTreeContextMenu();
      this.setupWSLStatusListener();
      this.setupUpdaterStatusListener();
    });
  }

  /**
   * Update status bar backend version label using latest known release tag.
   * @param {string|null} releaseTag
   * @param {string} [statusText='']
   */
  updateBackendVersionLabel(releaseTag, statusText = '') {
    const backendEl = document.getElementById('backend_version');
    if (!backendEl) return;

    const normalizedTag = typeof releaseTag === 'string' && releaseTag.trim()
      ? releaseTag.trim()
      : null;

    if (normalizedTag) {
      backendEl.textContent = `CoreTrace latest: ${normalizedTag}`;
      backendEl.title = `Latest CoreTrace backend release: ${normalizedTag}`;
      return;
    }

    const fallback = statusText && String(statusText).trim() ? String(statusText).trim() : 'unknown';
    backendEl.textContent = `CoreTrace latest: ${fallback}`;
    backendEl.title = 'Latest CoreTrace backend release tag';
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
  async refreshFileTree(silent = false) {
    // Only refresh if workspace is open
    const workspacePath = this.fileOpsManager.getCurrentWorkspacePath();
    if (!workspacePath) {
      this.notificationManager.showWarning('No workspace open to refresh');
      return;
    }
    // Request updated file tree from main process
    try {
      const result = await window.api.invoke('get-file-tree', workspacePath);
      if (result.success) {
        const folderName = workspacePath.split(/[/\\]/).pop();
        this.fileOpsManager.updateWorkspaceUI(folderName, result.fileTree);
        if (!silent) {
          this.notificationManager.showSuccess('File tree refreshed');
        }
      } else {
        this.notificationManager.showError('Failed to refresh file tree: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error refreshing file tree: ' + error.message);
    }
  }

  /**
   * Setup file tree watcher to listen for automatic updates.
   * Debounces refreshes to avoid UI freezes on large workspaces.
   */
  setupFileTreeWatcher() {
    if (this._fileTreeWatcherInitialized) return;
    this._fileTreeWatcherInitialized = true;

    let refreshTimer = null;
    window.api.on('workspace-changed', (data) => {
      if (!data || !data.success) {
        if (data && data.error) {
          console.error('Error in workspace change notification:', data.error);
        }
        return;
      }

      const workspacePath = this.fileOpsManager.getCurrentWorkspacePath();
      if (!workspacePath) return;
      if (data.folderPath && data.folderPath !== workspacePath) return;

      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        this.refreshFileTree(true);
      }, 1200);
    });

    // Show a discrete loading indicator for slow workspace operations
    this._workspaceLoadingTimer = null;
    this._workspaceLoadingNotification = null;
    this._workspaceLoadingRequestId = null;

    window.api.on('workspace-loading', (data) => {
      if (!data || !data.status) return;

      // Only react for the active workspace.
      const workspacePath = this.fileOpsManager.getCurrentWorkspacePath();
      if (workspacePath && data.folderPath && data.folderPath !== workspacePath && data.operation !== 'open') {
        return;
      }

      if (data.status === 'start') {
        this._workspaceLoadingRequestId = data.requestId || null;
        clearTimeout(this._workspaceLoadingTimer);

        this._workspaceLoadingTimer = setTimeout(() => {
          if (this._workspaceLoadingNotification) return;
          const folderName = (data.folderPath || '').split(/[/\\]/).pop() || 'workspace';
          const label = data.operation === 'refresh'
            ? `Refreshing "${folderName}"...`
            : `Loading "${folderName}"...`;
          this._workspaceLoadingNotification = this.notificationManager.showLoading(label);
        }, 450);

        return;
      }

      if (data.status === 'end') {
        if (this._workspaceLoadingRequestId && data.requestId && data.requestId !== this._workspaceLoadingRequestId) {
          return;
        }

        clearTimeout(this._workspaceLoadingTimer);
        this._workspaceLoadingTimer = null;

        if (this._workspaceLoadingNotification) {
          this._workspaceLoadingNotification.dismiss();
          this._workspaceLoadingNotification = null;
        }

        this._workspaceLoadingRequestId = null;
      }
    });
  }

  /**
   * Setup WSL status listener to handle WSL availability updates
   */
  setupWSLStatusListener() {
    // Listen for WSL status updates from main process
    window.api.on('wsl-status', (data) => {
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
    window.api.on('wsl-install-response', (data) => {
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
    window.api.send('check-wsl-status');
  }

  /**
   * Setup updater status listener for notifications coming from main process
   */
  setupUpdaterStatusListener() {
    const indicator = document.getElementById('update-status-indicator');

    // Initial placeholder until the first backend update event arrives.
    this.updateBackendVersionLabel(null, 'checking...');

    const applyBackendStatus = (status) => {
      if (!status || !status.type) return;

      if (status.type === 'backend-checking-for-update') {
        this.updateBackendVersionLabel(null, 'checking...');
        return;
      }

      if (status.type === 'backend-update-not-available' || status.type === 'backend-update-installed') {
        const releaseTag = status.info && status.info.releaseTag ? status.info.releaseTag : null;
        this.updateBackendVersionLabel(releaseTag, releaseTag ? '' : 'up to date');
        return;
      }

      if (status.type === 'backend-error') {
        this.updateBackendVersionLabel(null, 'unavailable');
      }
    };

    window.api.invoke('backend-get-status')
      .then((res) => {
        if (res && res.success && res.status) {
          applyBackendStatus(res.status);
        }
      })
      .catch(() => {});

    const showIndicator = (state, html, title = '') => {
      if (!indicator) return;
      indicator.className = `update-status-indicator ${state}`;
      indicator.innerHTML = html;
      indicator.title = title;
      indicator.style.display = 'inline-flex';
      indicator.onclick = null;
    };

    const hideIndicator = () => {
      if (!indicator) return;
      indicator.style.display = 'none';
      indicator.className = 'update-status-indicator';
      indicator.onclick = null;
    };

    window.api.on('updater-status', (data) => {
      if (!data || !data.type) return;

      if (data.type === 'backend-checking-for-update' || data.type === 'backend-update-not-available' || data.type === 'backend-update-installed' || data.type === 'backend-error') {
        applyBackendStatus(data);
        if (data.type === 'backend-error') {
          console.warn('[BackendUpdater] Error:', data.message);
        }
        return;
      }

      if (data.type === 'checking-for-update') {
        showIndicator(
          'checking',
          '<span class="update-spinner"></span><span>Checking for updates…</span>',
          'Checking for updates'
        );
      } else if (data.type === 'update-available') {
        const version = data.info && data.info.version ? ` v${data.info.version}` : '';
        showIndicator(
          'update-available',
          `<span>↑</span><span>Update available${version} — downloading…</span>`,
          `Update${version} is downloading in the background`
        );
      } else if (data.type === 'download-progress') {
        const pct = data.percent != null ? ` ${Math.round(data.percent)}%` : '';
        const version = data.info && data.info.version ? ` v${data.info.version}` : '';
        showIndicator(
          'update-available',
          `<span>↑</span><span>Downloading${version}${pct}…</span>`,
          `Downloading update${version}`
        );
      } else if (data.type === 'update-not-available') {
        hideIndicator();
      } else if (data.type === 'update-downloaded') {
        const version = data.info && data.info.version ? ` v${data.info.version}` : '';
        showIndicator(
          'update-downloaded',
          `<span>✓</span><span>${version ? version.trim() : 'Update'} ready — restart to apply</span>`,
          `Click to restart and install${version}`
        );
        indicator.onclick = () => {
          window.api.invoke('updater-install-update').catch(() => {});
        };
      } else if (data.type === 'error') {
        hideIndicator();
        console.warn('[Updater] Error:', data.message);
      }
    });
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
        window.api.send('install-wsl');
        closeDialog();
        this.notificationManager.showInfo('WSL installation started. Please follow any prompts that appear.');
      };
    }

    const installUbuntuBtn = document.getElementById('install-ubuntu');
    if (installUbuntuBtn) {
      installUbuntuBtn.onclick = () => {
        window.api.send('install-wsl-distro', 'Ubuntu');
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
    // Setup IPC-based window controls (via secure preload bridge)
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        window.api.send('window-minimize');
      });
    }
    
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => {
        window.api.send('window-maximize-toggle');
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.api.send('window-close');
      });
    }
    
    // Listen for window state changes
    window.api.on('window-maximized', (isMaximized) => {
      document.body.classList.toggle('window-maximized', isMaximized);
    });
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

  /**
   * Setup a custom context menu for the explorer file tree.
   *
   * Requirements:
   * - Right click on empty area: New File.. / New Folder.. / Close Folder
   * - Right click on folder: New File.. / New Folder.. / Rename / Delete
   * - Right click on file: Rename / Delete
   * - Right click on workspace name: Close Folder
   */
  setupFileTreeContextMenu() {
    const workspaceFolderEl = document.getElementById('workspace-folder');
    const fileTreeElement = document.getElementById('file-tree');
    const workspaceNameEl = document.getElementById('workspace-name');
    const targetEl = workspaceFolderEl || fileTreeElement;
    if (!targetEl) return;

    // Context menu for workspace name
    if (workspaceNameEl) {
      workspaceNameEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const workspacePath = this.fileOpsManager.getCurrentWorkspacePath();
        if (!workspacePath) return;

        this.showFileTreeContextMenu(e.clientX, e.clientY, [{
          label: 'Close Folder',
          action: () => this.fileOpsManager.closeWorkspace()
        }]);
      });
    }

    targetEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // No workspace => no file operations
      const workspacePath = this.fileOpsManager.getCurrentWorkspacePath();
      if (!workspacePath) {
        this.notificationManager.showWarning('Open a workspace to use file operations');
        return;
      }

      const itemEl = e.target.closest('.file-tree-item');
      const itemType = itemEl ? itemEl.getAttribute('data-type') : null;
      const itemPath = itemEl ? (itemEl.getAttribute('data-path') || itemEl.getAttribute('data-file-path')) : null;
      const itemName = itemEl ? (itemEl.getAttribute('data-name') || '') : '';

      const menuItems = [];

      // Right click on empty area
      if (!itemEl) {
        menuItems.push({
          label: 'New file..',
          action: () => this.createFileInDirectory(workspacePath)
        });
        menuItems.push({
          label: 'New folder..',
          action: () => this.createFolderInDirectory(workspacePath)
        });
        menuItems.push({
          label: 'Close Folder',
          action: () => this.fileOpsManager.closeWorkspace()
        });
        menuItems.push({
          label: 'Close Folder',
          action: () => this.fileOpsManager.closeWorkspace()
        });
      } else if (itemType === 'directory') {
        // Folder menu
        menuItems.push({
          label: 'New file..',
          action: () => this.createFileInDirectory(itemPath)
        });
        menuItems.push({
          label: 'New folder..',
          action: () => this.createFolderInDirectory(itemPath)
        });
        menuItems.push({
          label: 'Rename',
          action: () => this.renamePath(itemPath, itemName)
        });
        menuItems.push({
          label: 'Delete',
          action: () => this.deletePath(itemPath, itemType)
        });
      } else {
        // File menu
        menuItems.push({
          label: 'Rename',
          action: () => this.renamePath(itemPath, itemName)
        });
        menuItems.push({
          label: 'Delete',
          action: () => this.deletePath(itemPath, itemType)
        });
      }

      this.showFileTreeContextMenu(e.clientX, e.clientY, menuItems);
    });
  }

  /**
   * Show a simple in-app input dialog (avoids relying on window.prompt).
   * @param {string} title
   * @param {string} [placeholder]
   * @param {string} [defaultValue]
   * @returns {Promise<string|null>}
   */
  promptForText(title, placeholder = '', defaultValue = '') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'input-dialog-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'input-dialog';

      const header = document.createElement('div');
      header.className = 'input-dialog-title';
      header.textContent = title;

      const input = document.createElement('input');
      input.className = 'input-dialog-input';
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = defaultValue || '';

      const actions = document.createElement('div');
      actions.className = 'input-dialog-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'input-dialog-button';
      cancelBtn.textContent = 'Cancel';

      const okBtn = document.createElement('button');
      okBtn.className = 'input-dialog-button primary';
      okBtn.textContent = 'OK';

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);

      dialog.appendChild(header);
      dialog.appendChild(input);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const cleanup = (value) => {
        overlay.remove();
        resolve(value);
      };

      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup(null);
      });

      okBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup(input.value);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(null);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          cleanup(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(null);
        }
      });

      // Focus synchronously (still inside the click handler user gesture)
      // so typing works reliably even if the editor has global key handlers.
      try {
        input.disabled = false;
        input.readOnly = false;
        input.focus();
        input.select();
      } catch (_) {
        // ignore
      }

      // Fallback focus in next frame
      requestAnimationFrame(() => {
        try {
          input.focus();
        } catch (_) {
          // ignore
        }
      });
    });
  }

  showFileTreeContextMenu(x, y, items) {
    this.hideFileTreeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    items.forEach(({ label, action }) => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideFileTreeContextMenu();
        action();
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Position within viewport
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    const posX = Math.max(8, Math.min(x, maxX));
    const posY = Math.max(8, Math.min(y, maxY));
    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';

    this.fileTreeContextMenu = menu;
  }

  hideFileTreeContextMenu() {
    if (this.fileTreeContextMenu) {
      this.fileTreeContextMenu.remove();
      this.fileTreeContextMenu = null;
    }
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

    // Visualyzer operations
    window.toggleVisualyzerPanel = () => this.toggleVisualyzerPanel();

    // CTrace helpers
    const stripAnsi = (input) => {
      if (!input || typeof input !== 'string') return input;
      const ansiRegex = /\x1b\[[0-9;]*m/g;
      return input.replace(ansiRegex, '');
    };

    window.runCTrace = async () => {
      const resultsArea = document.getElementById('ctrace-results-area');
      this.showToolsPanel();
      if (!resultsArea) {
        this.notificationManager.showError('CTrace results area not found');
        return;
      }

      const active = this.tabManager.getActiveTab();
      const currentFilePath = active && active.filePath ? active.filePath : null;
      if (!currentFilePath) {
        resultsArea.innerHTML = `
          <div class="ctrace-error">
            <div class="error-icon">⚠️</div>
            <div class="error-text">No active file to analyze</div>
            <div class="error-subtext">Please open a file first</div>
          </div>
        `;
        this.notificationManager.showWarning('Open a file to analyze with CTrace');
        return;
      }

      // Convert Windows path to WSL path for Linux binary
      const wslFilePath = this.convertToWSLPath(currentFilePath);
      
      // Clear previous diagnostics and show loading state
      this.diagnosticsManager.clear();
      resultsArea.innerHTML = `
        <div class="ctrace-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Analyzing ${this.diagnosticsManager.getFileName(currentFilePath)}...</div>
          <div class="loading-subtext">This may take a moment</div>
        </div>
      `;
      
      try {
        // Get custom arguments from input field
        const argsInput = document.getElementById('ctrace-args');
        const customArgs = argsInput ? argsInput.value.trim() : '';
        
        // Parse custom arguments (simple split by space, preserving quoted strings)
        let args = [];
        if (customArgs) {
          // Simple parsing - split by space but respect quotes
          const matches = customArgs.match(/(?:[^\s"]+|"[^"]*")+/g);
          if (matches) {
            args = matches.map(arg => arg.replace(/^"(.*)"$/, '$1'));
          }
        }
        
        // Always prepend --input parameter as first argument
        args.unshift(`--input=${wslFilePath}`);
        
        console.log("invoke run-ctrace with WSL path:", wslFilePath);
        console.log("Custom arguments:", args);
        const result = await window.api.invoke('run-ctrace', args);
        console.log("after exec result");
        console.log(result);
        if (result && result.success) {
          console.log("result.output");
          console.log(result.output);
          
          // Check if output is empty
          if (!result.output || result.output.trim() === '') {
            resultsArea.innerHTML = `
              <div class="ctrace-error">
                <div class="error-icon">⚠️</div>
                <div class="error-text">No Output from CTrace</div>
                <div class="error-details">CTrace completed successfully but produced no output. This might indicate:</div>
                <div class="error-help">
                  • The file may not be supported by CTrace<br>
                  • The analysis produced no diagnostics<br>
                  • Check that your custom arguments are correct<br>
                  • Try adding <code>--sarif-format</code> for JSON output
                </div>
              </div>
            `;
            this.notificationManager.showWarning('CTrace produced no output');
            return;
          }
          
          // Try to parse as JSON for diagnostics
          const isParsed = this.diagnosticsManager.parseOutput(result.output);
          
          if (isParsed) {
            // Display diagnostics with rich UI
            await this.diagnosticsManager.displayDiagnostics();
            this.notificationManager.showSuccess('CTrace analysis completed');
          } else {
            // Fallback to plain text output
            resultsArea.innerHTML = `
              <div class="ctrace-raw-output">
                <div class="raw-output-header">
                  <span>Raw Output</span>
                </div>
                <pre class="raw-output-content">${this.diagnosticsManager.escapeHtml(result.output)}</pre>
              </div>
            `;
            this.notificationManager.showSuccess('CTrace completed');
          }
        } else {
          const details = (result && (result.stderr || result.output || result.error)) || 'Unknown error';
          
          // Check if this is a WSL setup error and provide helpful UI
          if (details.includes('WSL') && details.includes('distributions')) {
            resultsArea.innerHTML = `
              <div class="ctrace-error">
                <div class="error-icon">⚠️</div>
                <div class="error-text">WSL Setup Required</div>
                <div class="error-details">${stripAnsi(details)}</div>
                <div class="error-help">
                  <strong>Quick Setup:</strong><br>
                  1. Open PowerShell as Administrator<br>
                  2. Run: <code>wsl --install Ubuntu</code><br>
                  3. Restart when prompted<br>
                  4. Restart this application
                </div>
              </div>
            `;
            this.notificationManager.showWarning('WSL setup required');
          } else {
            resultsArea.innerHTML = `
              <div class="ctrace-error">
                <div class="error-icon">❌</div>
                <div class="error-text">CTrace Error</div>
                <pre class="error-details">${stripAnsi(details)}</pre>
              </div>
            `;
            this.notificationManager.showError('Failed to run CTrace');
          }
        }
      } catch (err) {
        resultsArea.innerHTML = `
          <div class="ctrace-error">
            <div class="error-icon">❌</div>
            <div class="error-text">Exception</div>
            <pre class="error-details">${err.message}</pre>
          </div>
        `;
        this.notificationManager.showError('Error invoking CTrace');
      }
    };

    window.clearCTraceOutput = () => {
      this.diagnosticsManager.clear();
    };

    // Tab manager reference for global access
    window.tabManager = this.tabManager;
    
    // Diagnostics manager reference for global access
    window.diagnosticsManager = this.diagnosticsManager;
    window.searchManager = this.searchManager;
  }

  /**
   * Open update settings modal to configure release channel (main/beta)
   */
  async openUpdateSettingsModal() {
    let currentChannel = 'main';

    try {
      const result = await window.api.invoke('updater-get-settings');
      if (result && result.success && result.settings && result.settings.channel) {
        currentChannel = result.settings.channel;
      }
    } catch (error) {
      console.warn('Failed to load updater settings:', error);
    }

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
      background: #0d1117;
      color: #f0f6fc;
      padding: 20px;
      border-radius: 10px;
      width: 440px;
      border: 1px solid #30363d;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 12px 0; font-size: 18px;">Update Settings</h3>
      <div style="font-size: 12px; color: #8b949e; margin-bottom: 14px; line-height: 1.5;">
        Choose which update stream to receive.
      </div>

      <label for="update-release-channel" style="display:block; font-size:12px; margin-bottom:6px; color:#c9d1d9;">Release channel</label>
      <select id="update-release-channel" style="width:100%; padding:8px; background:#161b22; color:#f0f6fc; border:1px solid #30363d; border-radius:6px; margin-bottom:8px;">
        <option value="main">Main (stable)</option>
        <option value="beta">Beta (pre-release)</option>
      </select>

      <div style="font-size: 11px; color: #8b949e; margin-bottom: 16px;">
        Beta may include pre-release builds and unstable changes.
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="check-updates-now" style="padding:8px 12px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer;">Check now</button>
        <button id="close-update-settings" style="padding:8px 12px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer;">Close</button>
        <button id="save-update-settings" style="padding:8px 12px; background:#238636; border:1px solid #2ea043; color:#fff; border-radius:6px; cursor:pointer;">Save</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const channelSelect = dialog.querySelector('#update-release-channel');
    if (channelSelect) {
      channelSelect.value = currentChannel === 'beta' ? 'beta' : 'main';
    }

    const closeModal = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    };

    const closeBtn = dialog.querySelector('#close-update-settings');
    if (closeBtn) {
      closeBtn.onclick = closeModal;
    }

    const checkBtn = dialog.querySelector('#check-updates-now');
    if (checkBtn) {
      checkBtn.onclick = async () => {
        try {
          const result = await window.api.invoke('updater-check-now');
          if (result && result.success) {
            this.notificationManager.showInfo('Update check started. You will be notified if an update is available.');
          } else {
            this.notificationManager.showWarning(result && result.error ? result.error : 'Unable to check for updates.');
          }
        } catch (error) {
          this.notificationManager.showError('Failed to check updates: ' + error.message);
        }
      };
    }

    const saveBtn = dialog.querySelector('#save-update-settings');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const selectedChannel = channelSelect ? channelSelect.value : 'main';

        try {
          const result = await window.api.invoke('updater-set-channel', selectedChannel);
          if (result && result.success) {
            this.notificationManager.showSuccess(`Update channel saved: ${selectedChannel}`);
            closeModal();
          } else {
            this.notificationManager.showError(result && result.error ? result.error : 'Failed to save update channel');
          }
        } catch (error) {
          this.notificationManager.showError('Failed to save update settings: ' + error.message);
        }
      };
    }

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
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
    window.api.send('open-visualyzer');
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
    
    // If already in assistant mode and panel is visible, hide it
    if (this._toolsPanelMode === 'assistant' && toolsPanel && toolsPanel.classList.contains('active')) {
      this.hideToolsPanel();
      return;
    }
    
    // Ensure assistant is configured at least once before opening
    const ensure = this.ensureAssistantConfigured();
    Promise.resolve(ensure).then(() => {
      if (toolsPanel) {
        // Mark that we're in assistant mode
        this._toolsPanelMode = 'assistant';
        this.showToolsPanel();
        // Inject assistant chat UI into tools panel
        this.renderAssistantUI();
      }
    });
  }

  /**
   * Open CTrace Tools panel with original content
   */
  openCtracePanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    
    // If already in ctrace mode and panel is visible, hide it
    if (this._toolsPanelMode === 'ctrace' && toolsPanel && toolsPanel.classList.contains('active')) {
      this.hideToolsPanel();
      return;
    }
    
    if (toolsPanel) {
      // Mark that we're in ctrace mode
      this._toolsPanelMode = 'ctrace';
      // Restore original CTrace content if we have it saved
      if (this._toolsPanelOriginal) {
        const header = toolsPanel.querySelector('.tools-panel-header');
        const content = toolsPanel.querySelector('.tools-panel-content');
        if (header && this._toolsPanelOriginal.headerHTML) {
          header.innerHTML = this._toolsPanelOriginal.headerHTML;
        }
        if (content && this._toolsPanelOriginal.contentHTML) {
          content.innerHTML = this._toolsPanelOriginal.contentHTML;
        }
      }
      this.showToolsPanel();
    }
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
      
      // Extract and store original code blocks with language info
      const textWithPlaceholders = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const trimmedCode = code.trim();
        codeBlocks.push({ code: trimmedCode, lang: lang || '' });
        return `__CODE_BLOCK_${codeIndex++}__`;
      });
      
      // Escape HTML
      let html = textWithPlaceholders.replace(/&/g, '&amp;')
                                     .replace(/</g, '&lt;')
                                     .replace(/>/g, '&gt;');
      
      // Replace code block placeholders with rendered HTML
      codeIndex = 0;
      html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const blockData = codeBlocks[parseInt(index)];
        const originalCode = blockData.code;
        const lang = blockData.lang.toLowerCase();
        
        // Store original code in base64 to avoid any escaping issues
        const base64Code = btoa(unescape(encodeURIComponent(originalCode)));
        
        // Apply syntax highlighting for C/C++ code
        let displayCode;
        if (lang === 'c' || lang === 'cpp' || lang === 'c++') {
          // Use syntax highlighter
          const { applySyntaxHighlight } = window.syntaxHighlighter;
          const fileType = lang === 'c' ? 'C' : 'C++';
          displayCode = applySyntaxHighlight(originalCode, fileType);
        } else {
          // No highlighting - just escape HTML
          displayCode = originalCode.replace(/&/g, '&amp;')
                                     .replace(/</g, '&lt;')
                                     .replace(/>/g, '&gt;');
        }
        
        const langLabel = lang ? `<span style="position:absolute; top:8px; left:12px; font-size:10px; color:#7d8590; text-transform:uppercase; font-weight:600;">${lang}</span>` : '';
        
        return `<div style="position:relative; margin:8px 0;">
          ${langLabel}
          <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
            <button class="code-copy-btn" data-code-b64="${base64Code}" style="padding:4px 8px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:4px; cursor:pointer; font-size:11px;">Copy</button>
            <button class="code-replace-btn" data-code-b64="${base64Code}" style="padding:4px 8px; background:#238636; border:1px solid #2ea043; color:#fff; border-radius:4px; cursor:pointer; font-size:11px;">Replace</button>
          </div>
          <pre style="background:#0d1117; padding:12px; border-radius:6px; overflow-x:auto; padding-top:${lang ? '28px' : '12px'};"><code style="font-family:Consolas,Monaco,'Courier New',monospace; font-size:13px; color:#c9d1d9;">${displayCode}</code></pre>
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
      try {
        const monacoEditor = this.editorManager.getMonacoInstance ? this.editorManager.getMonacoInstance() : null;
        if (monacoEditor) {
          const selection = monacoEditor.getSelection();
          const model = monacoEditor.getModel();
          if (selection && model) {
            const selectedText = model.getValueInRange(selection);
            if (selectedText) {
              capturedSelection = selectedText;
              const startLine = selection.startLineNumber;
              const endLine = selection.endLineNumber;
              const activeTab = this.tabManager.getActiveTab();
              const fileName = activeTab && activeTab.fileName ? activeTab.fileName : 'Untitled';
              capturedLineInfo = startLine === endLine ? `${fileName}: ${startLine}` : `${fileName}: ${startLine}-${endLine}`;
              contextText.textContent = capturedLineInfo;
              contextIndicator.style.display = 'block';
            }
          }
        } else {
          // Fallback for legacy textarea editor
          const editor = this.editorManager.editor;
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          const selection = editor.value.substring(start, end);
          if (selection) {
            capturedSelection = selection;
            const textBeforeStart = editor.value.substring(0, start);
            const textBeforeEnd = editor.value.substring(0, end);
            const startLine = (textBeforeStart.match(/\n/g) || []).length + 1;
            const endLine = (textBeforeEnd.match(/\n/g) || []).length + 1;
            const activeTab = this.tabManager.getActiveTab();
            const fileName = activeTab && activeTab.fileName ? activeTab.fileName : 'Untitled';
            if (startLine === endLine) {
              capturedLineInfo = `${fileName}: ${startLine}`;
            } else {
              capturedLineInfo = `${fileName}: ${startLine}-${endLine}`;
            }
            contextText.textContent = capturedLineInfo;
            contextIndicator.style.display = 'block';
          }
        }
      } catch (err) {
        console.warn('Error capturing selection for assistant context:', err);
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
        const result = await window.api.invoke('assistant-chat', {
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
            window.api.clipboard.writeText(code);
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
          try {
            const monacoEditor = this.editorManager.getMonacoInstance ? this.editorManager.getMonacoInstance() : null;
            if (monacoEditor) {
              const model = monacoEditor.getModel();
              const selection = monacoEditor.getSelection();
              let rangeObj = null;
              let actionLabel = 'Inserted!';

              if (selection && typeof selection.isEmpty === 'function' ? !selection.isEmpty() : (selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn)) {
                rangeObj = {
                  startLineNumber: selection.startLineNumber,
                  startColumn: selection.startColumn,
                  endLineNumber: selection.endLineNumber,
                  endColumn: selection.endColumn
                };
                actionLabel = 'Replaced!';
              } else {
                const pos = monacoEditor.getPosition();
                rangeObj = { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column };
                actionLabel = 'Inserted!';
              }

              monacoEditor.executeEdits('assistant', [{ range: rangeObj, text: code, forceMoveMarkers: true }]);
              // Update tab state
              if (this.tabManager.activeTabId && model) {
                this.tabManager.handleContentChange(this.tabManager.activeTabId, model.getValue());
              }
              btn.textContent = actionLabel;
              setTimeout(() => btn.textContent = 'Replace', 2000);
              monacoEditor.focus();
            } else {
              // Fallback to legacy textarea editor
              const editor = this.editorManager.editor;
              const start = editor.selectionStart;
              const end = editor.selectionEnd;
              if (start !== end) {
                // Replace selected text
                const before = editor.value.substring(0, start);
                const after = editor.value.substring(end);
                editor.value = before + code + after;
                if (this.tabManager.activeTabId) {
                  this.tabManager.handleContentChange(this.tabManager.activeTabId, editor.value);
                }
                btn.textContent = 'Replaced!';
                setTimeout(() => btn.textContent = 'Replace', 2000);
              } else {
                const before = editor.value.substring(0, start);
                const after = editor.value.substring(start);
                editor.value = before + code + after;
                if (this.tabManager.activeTabId) {
                  this.tabManager.handleContentChange(this.tabManager.activeTabId, editor.value);
                }
                btn.textContent = 'Inserted!';
                setTimeout(() => btn.textContent = 'Replace', 2000);
              }
              editor.focus();
            }
          } catch (err) {
            console.error('Error replacing/inserting code from assistant:', err);
            btn.textContent = 'Error';
            setTimeout(() => btn.textContent = 'Replace', 2000);
          }
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
        extra.appendChild(makeInputRow('Model Name', 'external-model', 'gpt-4'));
        extra.appendChild(makeInputRow('System prompt (optional)', 'system-prompt', 'You are a helpful assistant...'));
        
        // Pre-fill with saved values
        setTimeout(() => {
          const providerSelect = document.getElementById('external-provider');
          const apiKeyInput = document.getElementById('external-api-key');
          const modelInput = document.getElementById('external-model');
          const systemInput = document.getElementById('system-prompt');
          if (providerSelect && existingConfig.externalProvider) {
            providerSelect.value = existingConfig.externalProvider;
          }
          if (apiKeyInput && existingConfig.apiKey) {
            apiKeyInput.value = existingConfig.apiKey;
          }
          if (modelInput && existingConfig.model) {
            modelInput.value = existingConfig.model;
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
                const result = await window.api.invoke('select-llm-file');
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
        const model = document.getElementById('external-model');
        
        cfg.externalProvider = prov ? prov.value : 'ChatGPT5';
        cfg.apiKey = key ? key.value.trim() : '';
        cfg.model = model ? model.value.trim() : '';

        // Map UI selection to backend provider ID
        if (cfg.externalProvider === 'Deepseek') {
          cfg.providerId = 'deepseek';
          if (!cfg.model) cfg.model = 'deepseek-chat';
        } else if (cfg.externalProvider === 'ChatGPT5') {
          cfg.providerId = 'openai';
          if (!cfg.model) cfg.model = 'gpt-4';
        } else {
          // Default to openai for compatibility if not specified
          cfg.providerId = 'openai';
          if (!cfg.model) cfg.model = 'gpt-4';
        }

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
      try { window.api.send('assistant-config-updated', cfg); } catch (_) {}
      closeModal(cfg);
    };

    // Dismiss modal when clicking outside the dialog
    modal.onclick = (e) => { if (e.target === modal) closeModal(null); };
  }
  /**
   * Toggle auto save feature
   */
  toggleAutoSave() {
    this.autoSaveEnabled = !this.autoSaveEnabled;
    this.updateAutoSaveStatus();
    this.saveAutoSaveState();
    
    const statusMsg = this.autoSaveEnabled ? 'Auto Save enabled' : 'Auto Save disabled';
    this.notificationManager.showSuccess(statusMsg);
  }

  /**
   * Update auto save status in the status bar
   */
  updateAutoSaveStatus() {
    const statusElement = document.getElementById('autoSaveStatus');
    if (statusElement) {
      if (this.autoSaveEnabled) {
        statusElement.style.display = 'inline-block';
        statusElement.textContent = '💾 Auto Save: ON';
        statusElement.style.background = 'rgba(31, 111, 235, 0.15)';
        statusElement.style.color = '#58a6ff';
      } else {
        statusElement.style.display = 'none';
      }
    }
  }

  /**
   * Save auto save state to localStorage
   */
  saveAutoSaveState() {
    try {
      localStorage.setItem('autoSaveEnabled', JSON.stringify(this.autoSaveEnabled));
    } catch (error) {
      console.error('Failed to save auto save state:', error);
    }
  }

  /**
   * Load auto save state from localStorage
   */
  loadAutoSaveState() {
    try {
      const saved = localStorage.getItem('autoSaveEnabled');
      if (saved !== null) {
        this.autoSaveEnabled = JSON.parse(saved);
        this.updateAutoSaveStatus();
      }
    } catch (error) {
      console.error('Failed to load auto save state:', error);
    }
  }

  /**
   * Setup auto save listener for editor content changes
   */
  setupAutoSaveListener() {
    // Listen to editor content changes via Monaco
    if (this.editorManager && this.editorManager.editor) {
      this.editorManager.editor.onDidChangeModelContent(() => {
        this.triggerAutoSave();
      });
    } else {
      // If Monaco isn't ready yet, wait for it
      window.addEventListener('monaco-loaded', () => {
        setTimeout(() => {
          if (this.editorManager && this.editorManager.editor) {
            this.editorManager.editor.onDidChangeModelContent(() => {
              this.triggerAutoSave();
            });
          }
        }, 500);
      });
    }
  }

  /**
   * Trigger auto save with debounce
   */
  triggerAutoSave() {
    if (!this.autoSaveEnabled) return;
    
    // Clear existing timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    
    // Set new timer
    this.autoSaveTimer = setTimeout(async () => {
      const currentTab = this.tabManager.getActiveTab();
      const isDirty = !!(currentTab && (currentTab.modified || currentTab.isDirty));
      if (currentTab && currentTab.filePath && isDirty) {
        try {
          await this.fileOpsManager.saveFile({ silent: true, reason: 'autosave' });
          console.log('Auto-saved:', currentTab.fileName);
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, this.autoSaveDelay);
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
