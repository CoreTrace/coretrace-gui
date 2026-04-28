class EditorPanel {
  constructor(ui) {
    this.ui = ui;
  }

/**
   * Toggle auto save feature
   */
  toggleAutoSave() {
    this.ui.autoSaveEnabled = !this.ui.autoSaveEnabled;
    this.ui.updateAutoSaveStatus();
    this.ui.saveAutoSaveState();
    
    const statusMsg = this.ui.autoSaveEnabled ? 'Auto Save enabled' : 'Auto Save disabled';
    this.ui.notificationManager.showSuccess(statusMsg);
  }

/**
   * Update auto save status in the status bar
   */
  updateAutoSaveStatus() {
    const statusElement = document.getElementById('autoSaveStatus');
    if (statusElement) {
      if (this.ui.autoSaveEnabled) {
        statusElement.style.display = 'inline-block';
        statusElement.textContent = 'Auto Save: ON';
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
      localStorage.setItem('autoSaveEnabled', JSON.stringify(this.ui.autoSaveEnabled));
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
        this.ui.autoSaveEnabled = JSON.parse(saved);
        this.ui.updateAutoSaveStatus();
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
    if (this.ui.editorManager && this.ui.editorManager.editor) {
      this.ui.editorManager.editor.onDidChangeModelContent(() => {
        this.ui.triggerAutoSave();
      });
    } else {
      // If Monaco isn't ready yet, wait for it
      window.addEventListener('monaco-loaded', () => {
        setTimeout(() => {
          if (this.ui.editorManager && this.ui.editorManager.editor) {
            this.ui.editorManager.editor.onDidChangeModelContent(() => {
              this.ui.triggerAutoSave();
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
    if (!this.ui.autoSaveEnabled) return;
    
    // Clear existing timer
    if (this.ui.autoSaveTimer) {
      clearTimeout(this.ui.autoSaveTimer);
    }
    
    // Set new timer
    this.ui.autoSaveTimer = setTimeout(async () => {
      const currentTab = this.ui.tabManager.getActiveTab();
      const isDirty = !!(currentTab && (currentTab.modified || currentTab.isDirty));
      if (currentTab && currentTab.filePath && isDirty) {
        try {
          await this.ui.fileOpsManager.saveFile({ silent: true, reason: 'autosave' });
          console.log('Auto-saved:', currentTab.fileName);
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, this.ui.autoSaveDelay);
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

}

if (typeof window !== 'undefined') window.EditorPanel = EditorPanel;
if (typeof module !== 'undefined') module.exports = EditorPanel;
