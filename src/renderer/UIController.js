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

    this.performanceHud = null;
    this.performanceHudVisible = false;
    this.performanceHudAnimationFrame = null;
    this.performanceObserver = null;
    this.performanceSampleStartedAt = 0;
    this.performanceLastFrameAt = 0;
    this.performanceRuntimeInfo = { hardwareAcceleration: 'unknown' };
    this.liteEffectsEnabled = false;
    this.performanceStats = {
      fps: 0,
      frameMs: 0,
      maxFrameMs: 0,
      frameCount: 0,
      longTasks: 0,
      lastLongTaskMs: 0,
      domNodes: 0,
      memoryMb: null
    };

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
      this.setupPerformanceMonitor();
      this.setupFileTreeWatcher();
      this.loadAutoSaveState();
      this.setupAutoSaveListener();
      this.setupFileTreeContextMenu();
      this.setupWSLStatusListener();
      this.setupUpdaterStatusListener();
      this.terminalManager.init();
    });
  }

  setupPerformanceMonitor() {
    if (typeof document === 'undefined' || !document.body || this.performanceHud) return;

    try {
      this.liteEffectsEnabled = localStorage.getItem('liteEffectsEnabled') === 'true';
    } catch (_) {
      this.liteEffectsEnabled = false;
    }

    this.applyLiteEffects(this.liteEffectsEnabled, false);

    if (window.api && typeof window.api.getRuntimeInfo === 'function') {
      try {
        this.performanceRuntimeInfo = window.api.getRuntimeInfo() || this.performanceRuntimeInfo;
      } catch (_) {
        this.performanceRuntimeInfo = { hardwareAcceleration: 'unknown' };
      }
    }

    const hud = document.createElement('aside');
    hud.className = 'performance-hud';
    hud.innerHTML = `
      <div class="performance-hud-header">
        <span class="performance-hud-title">Performance</span>
        <div class="performance-hud-actions">
          <button type="button" class="performance-hud-btn" data-action="effects">Lite effects</button>
          <button type="button" class="performance-hud-btn" data-action="hide">Hide</button>
        </div>
      </div>
      <div class="performance-hud-grid">
        <div class="performance-hud-card"><span class="performance-hud-label">FPS</span><span class="performance-hud-value" data-metric="fps">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">Frame</span><span class="performance-hud-value" data-metric="frame">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">Long tasks</span><span class="performance-hud-value" data-metric="longTasks">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">DOM nodes</span><span class="performance-hud-value" data-metric="domNodes">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">JS heap</span><span class="performance-hud-value" data-metric="memory">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">GPU</span><span class="performance-hud-value" data-metric="gpu">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">Effects</span><span class="performance-hud-value" data-metric="effects">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">DPR</span><span class="performance-hud-value" data-metric="dpr">--</span></div>
      </div>
      <div class="performance-hud-note">Toggle with Ctrl+Alt+P. If Lite effects makes the UI feel much faster, the slowdown is likely compositing and blur related.</div>
    `;

    hud.querySelector('[data-action="effects"]').addEventListener('click', () => {
      this.applyLiteEffects(!this.liteEffectsEnabled);
    });
    hud.querySelector('[data-action="hide"]').addEventListener('click', () => {
      this.togglePerformanceHud(false);
    });

    document.body.appendChild(hud);
    this.performanceHud = hud;
    this.performanceHudMetrics = {
      fps: hud.querySelector('[data-metric="fps"]'),
      frame: hud.querySelector('[data-metric="frame"]'),
      longTasks: hud.querySelector('[data-metric="longTasks"]'),
      domNodes: hud.querySelector('[data-metric="domNodes"]'),
      memory: hud.querySelector('[data-metric="memory"]'),
      gpu: hud.querySelector('[data-metric="gpu"]'),
      effects: hud.querySelector('[data-metric="effects"]'),
      dpr: hud.querySelector('[data-metric="dpr"]')
    };
    this.performanceHudEffectsButton = hud.querySelector('[data-action="effects"]');
    this.renderPerformanceHud();
  }

  togglePerformanceHud(forceVisible) {
    if (!this.performanceHud) {
      this.setupPerformanceMonitor();
    }
    if (!this.performanceHud) return;

    const nextVisible = typeof forceVisible === 'boolean' ? forceVisible : !this.performanceHudVisible;
    this.performanceHudVisible = nextVisible;
    this.performanceHud.classList.toggle('visible', nextVisible);

    if (nextVisible) {
      this.startPerformanceSampling();
    } else {
      this.stopPerformanceSampling();
    }
  }

  startPerformanceSampling() {
    if (this.performanceHudAnimationFrame || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      this.renderPerformanceHud();
      return;
    }

    this.performanceStats.fps = 0;
    this.performanceStats.frameMs = 0;
    this.performanceStats.maxFrameMs = 0;
    this.performanceStats.frameCount = 0;
    this.performanceStats.longTasks = 0;
    this.performanceStats.lastLongTaskMs = 0;
    this.performanceSampleStartedAt = performance.now();
    this.performanceLastFrameAt = 0;

    if (typeof window.PerformanceObserver === 'function') {
      try {
        this.performanceObserver = new window.PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            this.performanceStats.longTasks += 1;
            this.performanceStats.lastLongTaskMs = Math.max(this.performanceStats.lastLongTaskMs, entry.duration || 0);
          });
        });
        this.performanceObserver.observe({ entryTypes: ['longtask'] });
      } catch (_) {
        this.performanceObserver = null;
      }
    }

    const sample = (timestamp) => {
      if (!this.performanceHudVisible) {
        this.performanceHudAnimationFrame = null;
        return;
      }

      if (this.performanceLastFrameAt) {
        const frameMs = timestamp - this.performanceLastFrameAt;
        this.performanceStats.frameMs = frameMs;
        this.performanceStats.maxFrameMs = Math.max(this.performanceStats.maxFrameMs, frameMs);
        this.performanceStats.frameCount += 1;
      }
      this.performanceLastFrameAt = timestamp;

      const elapsed = timestamp - this.performanceSampleStartedAt;
      if (elapsed >= 500) {
        this.performanceStats.fps = this.performanceStats.frameCount > 0
          ? (this.performanceStats.frameCount * 1000) / elapsed
          : 0;
        this.renderPerformanceHud();
        this.performanceSampleStartedAt = timestamp;
        this.performanceStats.frameCount = 0;
        this.performanceStats.maxFrameMs = this.performanceStats.frameMs;
        this.performanceStats.longTasks = 0;
        this.performanceStats.lastLongTaskMs = 0;
      }

      this.performanceHudAnimationFrame = window.requestAnimationFrame(sample);
    };

    this.performanceHudAnimationFrame = window.requestAnimationFrame(sample);
  }

  stopPerformanceSampling() {
    if (this.performanceHudAnimationFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this.performanceHudAnimationFrame);
    }
    this.performanceHudAnimationFrame = null;

    if (this.performanceObserver) {
      try {
        this.performanceObserver.disconnect();
      } catch (_) {
        // ignore observer shutdown failures
      }
      this.performanceObserver = null;
    }
  }

  applyLiteEffects(enabled, persist = true) {
    this.liteEffectsEnabled = !!enabled;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('lite-effects', this.liteEffectsEnabled);
    }

    if (persist) {
      try {
        localStorage.setItem('liteEffectsEnabled', JSON.stringify(this.liteEffectsEnabled));
      } catch (_) {
        // ignore persistence failures
      }
    }

    if (this.performanceHudEffectsButton) {
      this.performanceHudEffectsButton.textContent = this.liteEffectsEnabled ? 'Full effects' : 'Lite effects';
    }

    this.renderPerformanceHud();
  }

  renderPerformanceHud() {
    if (!this.performanceHudMetrics || typeof document === 'undefined') return;

    const domNodes = document.getElementsByTagName('*').length;
    const memoryInfo = typeof performance !== 'undefined' ? performance.memory : null;
    const memoryMb = memoryInfo && typeof memoryInfo.usedJSHeapSize === 'number'
      ? (memoryInfo.usedJSHeapSize / (1024 * 1024)).toFixed(1)
      : null;

    this.performanceHudMetrics.fps.textContent = this.performanceStats.fps ? `${Math.round(this.performanceStats.fps)}` : '--';
    this.performanceHudMetrics.frame.textContent = this.performanceStats.frameMs ? `${this.performanceStats.frameMs.toFixed(1)} ms` : '--';
    this.performanceHudMetrics.longTasks.textContent = this.performanceStats.lastLongTaskMs
      ? `${this.performanceStats.longTasks} / ${Math.round(this.performanceStats.lastLongTaskMs)} ms`
      : '0';
    this.performanceHudMetrics.domNodes.textContent = `${domNodes}`;
    this.performanceHudMetrics.memory.textContent = memoryMb ? `${memoryMb} MB` : 'n/a';
    this.performanceHudMetrics.gpu.textContent = String(this.performanceRuntimeInfo.hardwareAcceleration || 'unknown').toUpperCase();
    this.performanceHudMetrics.effects.textContent = this.liteEffectsEnabled ? 'Lite' : 'Full';
    this.performanceHudMetrics.dpr.textContent = `${window.devicePixelRatio || 1}`;
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
  
  async refreshFileTree(silent = false) {
    return await this.fileTree.refreshFileTree(silent);
  }

  
  setupFileTreeWatcher() {
    return this.fileTree.setupFileTreeWatcher();
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

  /**
   * Setup resizing functionality
   */
  setupResizing() {
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');
    this.boundDoResize = this.boundDoResize || this.doResize.bind(this);
    this.boundStopResize = this.boundStopResize || this.stopResize.bind(this);

    const startResize = (e, type) => {
      this.isResizing = true;
      this.resizeType = type;

      if (type === 'sidebar') {
        sidebar.style.transition = 'none';
      } else if (type === 'toolsPanel') {
        toolsPanel.style.transition = 'none';
      }

      document.addEventListener('mousemove', this.boundDoResize);
      document.addEventListener('mouseup', this.boundStopResize);
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
        const sidebarRect = sidebar.getBoundingClientRect();
        const newWidth = e.clientX - sidebarRect.left;
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
    
    document.removeEventListener('mousemove', this.boundDoResize);
    document.removeEventListener('mouseup', this.boundStopResize);
    
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

      // Block analysis if the file is known to be missing from disk
      if (this.tabManager.activeTabId && this.tabManager.isTabFileMissing(this.tabManager.activeTabId)) {
        resultsArea.innerHTML = `
          <div class="ctrace-error">
            <div class="error-icon">⚠️</div>
            <div class="error-text">File not found on disk</div>
            <div class="error-subtext">${currentFilePath}</div>
            <div class="error-help">The file was moved or deleted. Open its new location to analyze it.</div>
          </div>
        `;
        this.notificationManager.showError('File not found — analysis blocked');
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
   * Open backend settings modal — lets user locate a native ctrace.exe
   * to run analysis directly without WSL or the HTTP server.
   */
  async openBackendSettingsModal() {
    let currentPath = '';

    try {
      const result = await window.api.invoke('backend-get-settings');
      if (result && result.success && result.settings && result.settings.directBinaryPath) {
        currentPath = result.settings.directBinaryPath;
      }
    } catch (err) {
      console.warn('Failed to load backend settings:', err);
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #0d1117;
      color: #f0f6fc;
      padding: 24px;
      border-radius: 10px;
      width: 500px;
      border: 1px solid #30363d;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 8px 0; font-size: 18px;">Backend Settings</h3>
      <div style="font-size: 12px; color: #8b949e; margin-bottom: 18px; line-height: 1.5;">
        Optionally locate a native <code style="color:#79c0ff;">ctrace.exe</code> binary to run analysis
        directly on Windows — no WSL or HTTP server required.<br><br>
        When set, the GUI spawns the binary directly using CLI arguments.
        Clear the path to revert to the default WSL-backed server mode.
      </div>

      <label style="display:block; font-size:12px; margin-bottom:6px; color:#c9d1d9;">
        ctrace.exe path
      </label>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <input id="bs-binary-path" type="text"
          placeholder="e.g. C:\\tools\\ctrace.exe"
          style="flex:1; padding:8px; background:#161b22; color:#f0f6fc;
                 border:1px solid #30363d; border-radius:6px; font-size:12px;" />
        <button id="bs-browse"
          style="padding:8px 12px; background:#21262d; border:1px solid #30363d;
                 color:#f0f6fc; border-radius:6px; cursor:pointer; white-space:nowrap;">
          Browse…
        </button>
      </div>

      <div id="bs-mode-hint" style="font-size:11px; color:#8b949e; margin-bottom:16px;"></div>

      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="bs-clear"
          style="padding:8px 12px; background:#21262d; border:1px solid #30363d;
                 color:#f0f6fc; border-radius:6px; cursor:pointer;">
          Clear (use WSL mode)
        </button>
        <button id="bs-close"
          style="padding:8px 12px; background:#21262d; border:1px solid #30363d;
                 color:#f0f6fc; border-radius:6px; cursor:pointer;">
          Cancel
        </button>
        <button id="bs-save"
          style="padding:8px 12px; background:#238636; border:1px solid #2ea043;
                 color:#fff; border-radius:6px; cursor:pointer;">
          Save
        </button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const pathInput = dialog.querySelector('#bs-binary-path');
    const modeHint = dialog.querySelector('#bs-mode-hint');

    const updateHint = (val) => {
      if (val && val.trim()) {
        modeHint.style.color = '#3fb950';
        modeHint.textContent = 'Direct binary mode active — analysis will use this executable.';
      } else {
        modeHint.style.color = '#8b949e';
        modeHint.textContent = 'No path set — WSL server mode will be used (default).';
      }
    };

    pathInput.value = currentPath;
    updateHint(currentPath);
    pathInput.oninput = () => updateHint(pathInput.value);

    const closeModal = () => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    };

    dialog.querySelector('#bs-close').onclick = closeModal;

    dialog.querySelector('#bs-browse').onclick = async () => {
      try {
        const result = await window.api.invoke('backend-browse-binary');
        if (!result.canceled && result.filePath) {
          pathInput.value = result.filePath;
          updateHint(result.filePath);
        }
      } catch (err) {
        this.notificationManager.showError('Browse failed: ' + err.message);
      }
    };

    dialog.querySelector('#bs-clear').onclick = async () => {
      try {
        const result = await window.api.invoke('backend-save-settings', { directBinaryPath: '' });
        if (result && result.success) {
          this.notificationManager.showSuccess('Backend reset to WSL server mode.');
          closeModal();
        } else {
          this.notificationManager.showError(result.error || 'Failed to clear backend settings.');
        }
      } catch (err) {
        this.notificationManager.showError('Failed to clear: ' + err.message);
      }
    };

    dialog.querySelector('#bs-save').onclick = async () => {
      const val = pathInput.value.trim();
      try {
        const result = await window.api.invoke('backend-save-settings', { directBinaryPath: val });
        if (result && result.success) {
          if (val) {
            this.notificationManager.showSuccess('Direct binary mode enabled.');
          } else {
            this.notificationManager.showSuccess('Backend reset to WSL server mode.');
          }
          closeModal();
        } else {
          this.notificationManager.showError(result.error || 'Failed to save backend settings.');
        }
      } catch (err) {
        this.notificationManager.showError('Failed to save: ' + err.message);
      }
    };

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
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
