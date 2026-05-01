;(function() {
/**
 * File Operations Manager - Handles all file operations via IPC communication.
 * 
 * This manager provides a high-level interface for file and workspace operations,
 * including opening files/workspaces, saving files, and managing the file tree.
 * It communicates with the main process through IPC to perform actual file system operations.
 * 
 * @class FileOperationsManager
 * @author CTrace GUI Team
 * @version 1.0.0
 * 
 * @example
 * const fileOpsManager = new FileOperationsManager(tabManager, notificationManager);
 * await fileOpsManager.openWorkspace();
 */
class FileOperationsManager {
  /**
   * Creates an instance of FileOperationsManager.
   * 
   * @constructor
   * @memberof FileOperationsManager
   * @param {TabManager} tabManager - Tab manager instance for handling file tabs
   * @param {NotificationManager} notificationManager - Notification manager for user feedback
   */
  constructor(tabManager, notificationManager) {
    /**
     * Tab manager instance
     * @type {TabManager}
     * @private
     */
    this.tabManager = tabManager;
    
    /**
     * Notification manager instance
     * @type {NotificationManager}
     * @private
     */
    this.notificationManager = notificationManager;
    
    /**
     * Currently opened workspace path
     * @type {string|null}
     * @private
     */
    this.currentWorkspacePath = null;

    this._fileTreeNodeData = new WeakMap();
    this._fileTreeClickHandler = this._fileTreeClickHandler.bind(this);
    this._fileTreeClickHandlerAttached = false;
    this._selectedFileTreeItem = null;
  }

  /**
   * Opens a workspace folder dialog and loads the selected folder.
   * 
   * This method displays a folder selection dialog to the user, and if a folder
   * is selected, it loads the folder structure and updates the UI to display
   * the file tree. It also starts watching the workspace for file changes.
   * 
   * @async
   * @memberof FileOperationsManager
   * @returns {Promise<Object|undefined>} Result object with folder info, or undefined if canceled
   * 
   * @example
   * const result = await fileOpsManager.openWorkspace();
   * if (result && result.success) {
   *   console.log('Workspace opened:', result.folderPath);
   * }
   */
  async openWorkspace() {
    try {
      const result = await window.api.invoke('open-folder-dialog');
      
      if (result.success) {
        this.currentWorkspacePath = result.folderPath;
        const folderName = result.folderPath.split(/[/\\]/).pop();
        
        // Update workspace UI
        this.updateWorkspaceUI(folderName, result.fileTree);
        
        this.notificationManager.showSuccess(`Workspace "${folderName}" opened successfully`);
        
        return result;
      } else if (!result.canceled) {
        this.notificationManager.showError('Failed to open workspace: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error opening workspace: ' + error.message);
    }
  }

  /**
   * Close the current workspace
   * Clears the workspace path and resets the file tree UI.
   * 
   * @example
   * fileOpsManager.closeWorkspace();
   */
  closeWorkspace() {
    if (!this.currentWorkspacePath) {
      this.notificationManager.showWarning('No workspace is currently open');
      return;
    }

    const workspaceName = this.currentWorkspacePath.split(/[/\\]/).pop();
    this.currentWorkspacePath = null;

    // Clear workspace UI
    const workspaceFolder = document.getElementById('workspace-folder');
    const noWorkspace = document.getElementById('no-workspace');
    const fileTreeElement = document.getElementById('file-tree');

    if (workspaceFolder) {
      workspaceFolder.style.display = 'none';
    }

    if (noWorkspace) {
      noWorkspace.style.display = 'block';
    }

    if (fileTreeElement) {
      fileTreeElement.innerHTML = '';
    }

    if (window.uiController && window.uiController.searchManager) {
      window.uiController.searchManager.setWorkspacePath(null);
      window.uiController.searchManager.clearSearchResults();
    }

    this.notificationManager.showSuccess(`Workspace "${workspaceName}" closed`);
  }

  /**
   * Open single file
   */
  async openFile() {
    try {
      console.log('Opening file dialog...');
      const result = await window.api.invoke('open-file-dialog');
      console.log('Open file result:', result);
      
      if (result.success) {
        console.log('File opened successfully, checking for warnings...');
        if (result.warning === 'large-file') {
          const sizeStr = this.formatFileSize(result.totalSize);
          const userChoice = await this.notificationManager.showLargeFileWarningDialog(result.fileName, sizeStr);
          if (userChoice === 'cancel') return;
          const largeResult = await window.api.invoke('read-large-file', result.filePath);
          if (largeResult.success && largeResult.warning !== 'encoding') {
            this.openFileInTab(result.filePath, largeResult.content, largeResult.fileName, {
              isPartial: largeResult.isPartial,
              totalSize: largeResult.totalSize,
              loadedSize: largeResult.loadedSize
            });
            this.notificationManager.showInfo(`Large file "${largeResult.fileName}" partially loaded (${this.formatFileSize(largeResult.loadedSize)} of ${sizeStr})`);
          } else if (largeResult.warning === 'encoding') {
            const encChoice = await this.notificationManager.showEncodingWarningDialog();
            if (encChoice === 'yes') {
              const forceResult = await window.api.invoke('force-open-file', result.filePath);
              if (forceResult.success) {
                this.openFileInTab(result.filePath, forceResult.content, forceResult.fileName, {
                  isPartial: forceResult.isPartial,
                  totalSize: forceResult.totalSize,
                  loadedSize: forceResult.loadedSize,
                  encodingWarning: forceResult.encodingWarning
                });
                this.notificationManager.showWarning(`File "${forceResult.fileName}" opened with encoding warnings`);
              } else {
                this.notificationManager.showError('Failed to open file: ' + forceResult.error);
              }
            }
          } else {
            this.notificationManager.showError('Failed to open file: ' + largeResult.error);
          }
          return result;
        } else if (result.warning === 'encoding') {
          console.log('Encoding warning detected, showing dialog...');
          const userChoice = await this.notificationManager.showEncodingWarningDialog();
          console.log('User choice:', userChoice);

          if (userChoice === 'no') {
            console.log('User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('User chose to open file anyway');
            const forceResult = await window.api.invoke('force-open-file', result.filePath);
            console.log('Force open result:', forceResult);

            if (forceResult.success) {
              this.openFileInTab(forceResult.filePath, forceResult.content, forceResult.fileName, {
                isPartial: forceResult.isPartial,
                totalSize: forceResult.totalSize,
                loadedSize: forceResult.loadedSize,
                encodingWarning: forceResult.encodingWarning
              });
              this.notificationManager.showWarning(`File "${forceResult.fileName}" opened with encoding warnings`);
            } else {
              this.notificationManager.showError('Failed to open file: ' + forceResult.error);
            }
          }
        } else {
          console.log('No warnings, opening file normally');
          this.openFileInTab(result.filePath, result.content, result.fileName, {
            isPartial: result.isPartial,
            totalSize: result.totalSize,
            loadedSize: result.loadedSize
          });

          if (result.isPartial) {
            this.notificationManager.showInfo(`Large file "${result.fileName}" partially loaded (${this.formatFileSize(result.loadedSize)} of ${this.formatFileSize(result.totalSize)})`);
          } else {
            this.notificationManager.showSuccess(`File "${result.fileName}" opened successfully`);
          }
        }

        return result;
      } else if (!result.canceled) {
        this.notificationManager.showError('Failed to open file: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.notificationManager.showError('Error opening file: ' + error.message);
    }
  }

  /**
   * Open file in tab
   * @param {string} filePath - File path
   * @param {string} content - File content
   * @param {string} fileName - File name
   * @param {Object} fileInfo - File metadata
   */
  openFileInTab(filePath, content, fileName, fileInfo = {}) {
    // Check if file is already open
    const existingTabId = this.tabManager.findTabByPath(filePath);
    if (existingTabId) {
      this.tabManager.switchToTab(existingTabId);
      return existingTabId;
    }
    
    // Create new tab
    const tabId = this.tabManager.createTab(fileName, filePath, content, fileInfo);
    this.tabManager.switchToTab(tabId);
    return tabId;
  }

  /**
   * Save current file
   */
  async saveFile(options = {}) {
    try {
      const currentTab = this.tabManager.getActiveTab();
      if (!currentTab) {
        // Create a new file if none exists
        this.tabManager.createNewFile();
        await new Promise(resolve => setTimeout(resolve, 100));
        return await this.saveFile(options);
      }
      
      // Update current tab content from editor
      currentTab.content = this.tabManager.editorManager.getContent();
      
      if (currentTab.filePath) {
        const result = await window.api.invoke('save-file', currentTab.filePath, currentTab.content);
        if (result.success) {
          this.tabManager.markTabClean(this.tabManager.activeTabId);
          // File was saved successfully — clear any missing flag
          if (this.tabManager.activeTabId) {
            this.tabManager.markTabMissing(this.tabManager.activeTabId, false);
          }
          if (!options.silent) {
            this.notificationManager.showSuccess('File saved successfully');
          }
          return result;
        } else {
          // If save failed because the file no longer exists, mark tab as missing
          if (result.error && result.error.includes('ENOENT') && this.tabManager.activeTabId) {
            this.tabManager.markTabMissing(this.tabManager.activeTabId, true);
            this.notificationManager.showError('File not found on disk — it may have been moved or deleted');
          } else {
            this.notificationManager.showError('Failed to save file: ' + result.error);
          }
        }
      } else {
        // Save as new file (untitled -> actual file)
        const result = await this.saveAsFile();
        // Syntax highlighting is already updated in saveAsFile
        return result;
      }
    } catch (error) {
      this.notificationManager.showError('Error saving file: ' + error.message);
    }
  }

  /**
   * Save a specific tab by id.
   * Useful for auto-save on tab close when the tab is not active.
   *
   * @param {string} tabId
   * @param {{silent?: boolean, reason?: string}} [options]
   */
  async saveTabById(tabId, options = {}) {
    try {
      if (!this.tabManager || typeof this.tabManager.getTab !== 'function') {
        return;
      }

      const tab = this.tabManager.getTab(tabId);
      if (!tab) return;

      // Avoid Save As dialogs during auto-save.
      if (!tab.filePath) return;

      const content = tabId === this.tabManager.activeTabId
        ? this.tabManager.editorManager.getContent()
        : tab.content;

      const result = await window.api.invoke('save-file', tab.filePath, content);
      if (result.success) {
        tab.content = content;
        this.tabManager.markTabClean(tabId);
        if (!options.silent) {
          this.notificationManager.showSuccess('File saved successfully');
        }
        return result;
      }

      this.notificationManager.showError('Failed to save file: ' + (result.error || 'Unknown error'));
      return result;
    } catch (error) {
      this.notificationManager.showError('Error saving file: ' + error.message);
    }
  }

  /**
   * Save file as
   */
  async saveAsFile() {
    try {
      const currentTab = this.tabManager.getActiveTab();
      if (!currentTab) {
        this.notificationManager.showWarning('No file to save');
        return;
      }
      
      currentTab.content = this.tabManager.editorManager.getContent();
      
      const result = await window.api.invoke('save-file-as', currentTab.content);
      if (result.success) {
        this.tabManager.updateTabFile(this.tabManager.activeTabId, result.filePath, result.fileName);
        this.tabManager.markTabClean(this.tabManager.activeTabId);
        
        // Update file type and trigger syntax highlighting
        this.tabManager.editorManager.setFileType(result.fileName);
        
        this.notificationManager.showSuccess(`File saved as "${result.fileName}"`);
        return result;
      } else if (!result.canceled) {
        this.notificationManager.showError('Failed to save file: ' + result.error);
      }
    } catch (error) {
      this.notificationManager.showError('Error saving file: ' + error.message);
    }
  }

  /**
   * Read file from file tree
   * @param {string} filePath - File path to read
   */
  async readFileFromTree(filePath) {
    try {
      console.log('Reading file from tree:', filePath);
      const result = await window.api.invoke('read-file', filePath);
      console.log('File tree read result:', result);
      
      if (result.success) {
        if (result.warning === 'large-file') {
          const sizeStr = this.formatFileSize(result.totalSize);
          const userChoice = await this.notificationManager.showLargeFileWarningDialog(result.fileName, sizeStr);
          if (userChoice === 'cancel') return;
          const largeResult = await window.api.invoke('read-large-file', filePath);
          if (largeResult.success && largeResult.warning !== 'encoding') {
            const tabId = this.openFileInTab(filePath, largeResult.content, largeResult.fileName, {
              isPartial: largeResult.isPartial,
              totalSize: largeResult.totalSize,
              loadedSize: largeResult.loadedSize
            });
            this.notificationManager.showInfo(`Large file "${largeResult.fileName}" partially loaded (${this.formatFileSize(largeResult.loadedSize)} of ${sizeStr})`);
            return tabId;
          } else if (largeResult.warning === 'encoding') {
            const encChoice = await this.notificationManager.showEncodingWarningDialog();
            if (encChoice === 'yes') {
              const forceResult = await window.api.invoke('force-open-file', filePath);
              if (forceResult.success) {
                const tabId = this.openFileInTab(filePath, forceResult.content, forceResult.fileName, {
                  isPartial: forceResult.isPartial,
                  totalSize: forceResult.totalSize,
                  loadedSize: forceResult.loadedSize,
                  encodingWarning: forceResult.encodingWarning
                });
                this.notificationManager.showWarning(`File "${forceResult.fileName}" opened with encoding warnings`);
                return tabId;
              } else {
                this.notificationManager.showError('Failed to open file: ' + forceResult.error);
              }
            }
          } else {
            this.notificationManager.showError('Failed to open file: ' + largeResult.error);
          }
        } else if (result.warning === 'encoding') {
          console.log('File tree: Encoding warning detected, showing dialog...');
          const userChoice = await this.notificationManager.showEncodingWarningDialog();
          console.log('File tree: User choice:', userChoice);

          if (userChoice === 'no') {
            console.log('File tree: User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('File tree: User chose to open file anyway');
            const forceResult = await window.api.invoke('force-open-file', filePath);
            console.log('File tree: Force open result:', forceResult);

            if (forceResult.success) {
              const tabId = this.openFileInTab(filePath, forceResult.content, forceResult.fileName, {
                isPartial: forceResult.isPartial,
                totalSize: forceResult.totalSize,
                loadedSize: forceResult.loadedSize,
                encodingWarning: forceResult.encodingWarning
              });

              this.notificationManager.showWarning(`File "${forceResult.fileName}" opened with encoding warnings`);
              return tabId;
            } else {
              this.notificationManager.showError('Failed to open file: ' + forceResult.error);
            }
          }
        } else {
          // Normal file opening - no encoding issues
          console.log('File tree: No warnings, opening file normally');
          const tabId = this.openFileInTab(filePath, result.content, result.fileName, {
            isPartial: result.isPartial,
            totalSize: result.totalSize,
            loadedSize: result.loadedSize,
            encodingWarning: result.encodingWarning
          });

          return tabId;
        }
      } else {
        this.notificationManager.showError('Failed to open file: ' + result.error);
      }
    } catch (error) {
      this.notificationManager.showError('Error opening file: ' + error.message);
    }
  }

  /**
   * Load the next 1 MB chunk of a partially loaded file
   * @param {string} filePath - File path
   * @param {number} offset - Byte offset to read from
   */
  async loadNextChunk(filePath, offset) {
    if (!filePath || !this.tabManager.activeTabId) return;

    const btn = document.getElementById('partial-load-more-btn');
    if (btn) btn.disabled = true;

    try {
      const result = await window.api.invoke('read-file-chunk', filePath, offset);

      if (result.success) {
        const currentTab = this.tabManager.getActiveTab();
        if (currentTab) {
          const currentContent = this.tabManager.editorManager.getContent();
          const newContent = currentContent + result.content;
          await this.tabManager.editorManager.setContent(newContent);

          currentTab.content = newContent;
          currentTab.fileInfo = {
            ...currentTab.fileInfo,
            loadedSize: result.newOffset,
            isPartial: result.isMore
          };

          // Update banner and status bar
          this.tabManager._updatePartialBanner(currentTab);
          this.tabManager.updateFileStatus(currentTab);

          const loadedMB = (result.newOffset / (1024 * 1024)).toFixed(1);
          const totalMB = (result.totalSize / (1024 * 1024)).toFixed(1);
          if (result.isMore) {
            this.notificationManager.showInfo(`Loaded ${loadedMB} MB of ${totalMB} MB`);
          } else {
            this.notificationManager.showSuccess(`Full file loaded (${loadedMB} MB)`);
          }
        }
      } else {
        this.notificationManager.showError('Failed to load chunk: ' + result.error);
        if (btn) btn.disabled = false;
      }
    } catch (error) {
      this.notificationManager.showError('Error loading chunk: ' + error.message);
      if (btn) btn.disabled = false;
    }
  }

  /**
   * Load full file (for partially loaded large files)
   * @param {string} filePath - File path
   */
  async loadFullFile(filePath) {
    if (!filePath || !this.tabManager.activeTabId) return;
    
    try {
      this.notificationManager.showInfo('Loading full file...');
      const result = await window.api.invoke('force-load-full-file', filePath);
      
      if (result.success) {
        const currentTab = this.tabManager.getActiveTab();
        if (currentTab) {
          // Update tab content and file info
          currentTab.content = result.content;
          currentTab.fileInfo = {
            ...currentTab.fileInfo,
            isPartial: false,
            loadedSize: result.totalSize,
            totalSize: result.totalSize
          };
          
          // Update editor content
          await this.tabManager.editorManager.setContent(result.content);
          
          // Update tab appearance to remove warning
          const tabElement = document.querySelector(`[data-tab-id="${this.tabManager.activeTabId}"]`);
          if (tabElement) {
            const tabLabel = tabElement.querySelector('.tab-label');
            if (tabLabel) {
              tabLabel.innerHTML = currentTab.fileName; // Remove warning indicator
            }
          }
          
          this.notificationManager.showSuccess(`Full file loaded (${Math.round(result.totalSize / 1024)}KB)`);
        }
      } else {
        this.notificationManager.showError('Failed to load full file: ' + result.error);
      }
    } catch (error) {
      console.error(`[loadFullFile] Failed to load "${filePath}": ${error.message}`);
      this.notificationManager.showError('Error loading full file: ' + error.message);
    }
  }

  /**
   * Update workspace UI
   * @param {string} folderName - Folder name
   * @param {Array} fileTree - File tree structure
   */
  updateWorkspaceUI(folderName, fileTree) {
    const workspaceName = document.getElementById('workspace-name');
    const workspaceFolder = document.getElementById('workspace-folder');
    const noWorkspace = document.getElementById('no-workspace');
    const fileTreeElement = document.getElementById('file-tree');
    
    if (workspaceName) {
      workspaceName.textContent = folderName.toUpperCase();
    }
    
    if (workspaceFolder) {
      workspaceFolder.style.display = 'block';
    }
    
    if (noWorkspace) {
      noWorkspace.style.display = 'none';
    }
    
    if (fileTreeElement && fileTree) {
      if (!this._fileTreeClickHandlerAttached) {
        fileTreeElement.addEventListener('click', this._fileTreeClickHandler);
        this._fileTreeClickHandlerAttached = true;
      }
      this.renderFileTree(fileTree, fileTreeElement);
    }
  }

  _fileTreeClickHandler(event) {
    const container = document.getElementById('file-tree');
    if (!container) return;

    const itemElement = event.target && event.target.closest
      ? event.target.closest('.file-tree-item')
      : null;
    if (!itemElement) return;

    const item = this._fileTreeNodeData.get(itemElement);
    if (!item) return;

    if (item.type === 'directory') {
      const isExpanded = itemElement.getAttribute('data-expanded') === 'true';

      if (!isExpanded) {
        const childContainer = document.createElement('div');
        childContainer.setAttribute('data-parent-path', item.path);
        itemElement.parentNode.insertBefore(childContainer, itemElement.nextSibling);
        
        // Lazy load directory contents if not already loaded
        if (!item.children) {
          this.loadDirectoryContents(item, childContainer, itemElement);
        } else {
          this.renderFileTree(item.children, childContainer, (parseInt(itemElement.getAttribute('data-level') || '0', 10) + 1));
        }

        const icon = itemElement.querySelector('.icon');
        if (icon) icon.textContent = '📂';
        itemElement.setAttribute('data-expanded', 'true');
      } else {
        const nextSibling = itemElement.nextSibling;
        if (nextSibling && nextSibling.getAttribute && nextSibling.getAttribute('data-parent-path') === item.path) {
          nextSibling.remove();
        }
        const icon = itemElement.querySelector('.icon');
        if (icon) icon.textContent = '📁';
        itemElement.setAttribute('data-expanded', 'false');
      }

      return;
    }

    if (item.type === 'file') {
      this.readFileFromTree(item.path).then(tabId => {
        if (!tabId) return;
        if (this._selectedFileTreeItem) {
          this._selectedFileTreeItem.classList.remove('selected');
        }
        itemElement.classList.add('selected');
        this._selectedFileTreeItem = itemElement;
      });
    }
  }

  /**
   * Load directory contents on demand (lazy loading)
   * @param {Object} item - Directory item
   * @param {Element} container - Container to render into
   * @param {Element} itemElement - The directory element
   */
  async loadDirectoryContents(item, container, itemElement) {
    const level = parseInt(itemElement.getAttribute('data-level') || '0', 10) + 1;
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.style.marginLeft = (level * 16) + 'px';
    loadingDiv.style.color = '#7d8590';
    loadingDiv.style.fontSize = '11px';
    loadingDiv.style.padding = '2px 8px';
    loadingDiv.textContent = 'Loading...';
    container.appendChild(loadingDiv);
    
    try {
      const result = await window.api.invoke('get-directory-contents', item.path);
      
      // Remove loading indicator
      loadingDiv.remove();
      
      if (result.success) {
        // Store children in the item
        item.children = result.contents;
        
        // Render the children
        this.renderFileTree(result.contents, container, level);
        
        // Update icon
        const icon = itemElement.querySelector('.icon');
        if (icon) icon.textContent = '📂';
        itemElement.setAttribute('data-expanded', 'true');
      } else {
        // Show error
        loadingDiv.textContent = 'Error loading directory';
        loadingDiv.style.color = '#f85149';
      }
    } catch (error) {
      console.error(`[loadDirectoryContents] Failed to load "${item.path}": ${error.message}`);
      loadingDiv.textContent = `Error loading "${item.name}": ${error.message}`;
      loadingDiv.style.color = '#f85149';
    }
  }

  /**
   * Render file tree
   * @param {Array} tree - File tree structure
   * @param {Element} container - Container element
   * @param {number} level - Nesting level
   */
  renderFileTree(tree, container = null, level = 0) {
    if (!container) {
      container = document.getElementById('file-tree');
    }
    
    if (!container) return;
    
    if (level === 0) {
      container.textContent = '';
      this._selectedFileTreeItem = null;
    }

    const CHUNK_SIZE = 250;
    const raf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 0);
    const renderChunk = (startIndex) => {
      const fragment = document.createDocumentFragment();

      for (let i = startIndex; i < Math.min(startIndex + CHUNK_SIZE, tree.length); i++) {
        const item = tree[i];
        const itemElement = document.createElement('div');
        itemElement.style.marginLeft = (level * 16) + 'px';
        itemElement.className = 'file-tree-item';
        itemElement.setAttribute('data-path', item.path);
        itemElement.setAttribute('data-type', item.type);
        itemElement.setAttribute('data-name', item.name);
        itemElement.setAttribute('data-level', String(level));

        this._fileTreeNodeData.set(itemElement, item);

        if (item.type === 'directory') {
          itemElement.setAttribute('data-expanded', 'false');
          itemElement.innerHTML = `
            <span class="icon">📁</span>
            <span class="name">${item.name}</span>
          `;
        } else {
          const fileIcon = this.getFileIcon(item.name);
          itemElement.innerHTML = `
            <span class="icon">${fileIcon}</span>
            <span class="name">${item.name}</span>
          `;
        }

        fragment.appendChild(itemElement);
      }

      container.appendChild(fragment);

      if (startIndex + CHUNK_SIZE < tree.length) {
        raf(() => renderChunk(startIndex + CHUNK_SIZE));
      }
    };

    renderChunk(0);
  }

  /**
   * Get file icon based on extension
   * @param {string} filename - Filename
   * @returns {string} - File icon markup or emoji
   */
  getFileIcon(filename) {
    if (typeof window !== 'undefined' && typeof window.getFileIcon === 'function') {
      return window.getFileIcon(filename);
    }

    const ext = filename.split('.').pop().toLowerCase();
    const fallbackIconMap = {
      js: '🟨',
      ts: '🔷',
      html: '🟧',
      css: '🎨',
      json: '📋',
      md: '📝',
      py: '🐍',
      cpp: '⚙️',
      c: '⚙️',
      cc: '⚙️',
      cxx: '⚙️',
      h: '📄',
      hpp: '📄',
      hh: '📄',
      hxx: '📄',
      java: '☕',
      php: '🐘',
      rb: '💎',
      go: '🐹',
      rs: '🦀',
      sh: '📜'
    };

    return fallbackIconMap[ext] || '📄';
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} - Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get current workspace path
   * @returns {string|null} - Current workspace path
   */
  getCurrentWorkspacePath() {
    return this.currentWorkspacePath;
  }
}

if (typeof window !== 'undefined') {
  window.FileOperationsManager = FileOperationsManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileOperationsManager;
}
})();
