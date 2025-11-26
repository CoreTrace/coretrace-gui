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
      const result = await window.ipcRenderer.invoke('open-folder-dialog');
      
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
   * Open single file
   */
  async openFile() {
    try {
      console.log('Opening file dialog...');
      const result = await window.ipcRenderer.invoke('open-file-dialog');
      console.log('Open file result:', result);
      
      if (result.success) {
        console.log('File opened successfully, checking for warnings...');
        if (result.warning === 'encoding') {
          console.log('Encoding warning detected, showing dialog...');
          const userChoice = await this.notificationManager.showEncodingWarningDialog();
          console.log('User choice:', userChoice);
          
          if (userChoice === 'no') {
            console.log('User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('User chose to open file anyway');
            const forceResult = await window.ipcRenderer.invoke('force-open-file', result.filePath);
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
  async saveFile() {
    try {
      const currentTab = this.tabManager.getActiveTab();
      if (!currentTab) {
        // Create a new file if none exists
        this.tabManager.createNewFile();
        await new Promise(resolve => setTimeout(resolve, 100));
        return await this.saveFile();
      }
      
      // Update current tab content from editor
      currentTab.content = this.tabManager.editorManager.getContent();
      
      if (currentTab.filePath) {
        const result = await window.ipcRenderer.invoke('save-file', currentTab.filePath, currentTab.content);
        if (result.success) {
          this.tabManager.markTabClean(this.tabManager.activeTabId);
          this.notificationManager.showSuccess('File saved successfully');
          return result;
        } else {
          this.notificationManager.showError('Failed to save file: ' + result.error);
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
      
      const result = await window.ipcRenderer.invoke('save-file-as', currentTab.content);
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
      const result = await window.ipcRenderer.invoke('read-file', filePath);
      console.log('File tree read result:', result);
      
      if (result.success) {
        if (result.warning === 'encoding') {
          console.log('File tree: Encoding warning detected, showing dialog...');
          const userChoice = await this.notificationManager.showEncodingWarningDialog();
          console.log('File tree: User choice:', userChoice);
          
          if (userChoice === 'no') {
            console.log('File tree: User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('File tree: User chose to open file anyway');
            const forceResult = await window.ipcRenderer.invoke('force-open-file', filePath);
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
   * Load full file (for partially loaded large files)
   * @param {string} filePath - File path
   */
  async loadFullFile(filePath) {
    if (!filePath || !this.tabManager.activeTabId) return;
    
    try {
      this.notificationManager.showInfo('Loading full file...');
      const result = await window.ipcRenderer.invoke('force-load-full-file', filePath);
      
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
          this.tabManager.editorManager.setContent(result.content);
          
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
      console.error('Error loading full file:', error);
      this.notificationManager.showError('Error loading full file');
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
      this.renderFileTree(fileTree, fileTreeElement);
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
      container.innerHTML = '';
    }
    
    tree.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.style.marginLeft = (level * 16) + 'px';
      
      if (item.type === 'directory') {
        itemElement.className = 'file-tree-item';
        itemElement.innerHTML = `
          <span class="icon">📁</span>
          <span class="name">${item.name}</span>
        `;
        
        let expanded = false;
        let childContainer = null;
        
        itemElement.addEventListener('click', () => {
          if (!expanded && item.children) {
            childContainer = document.createElement('div');
            itemElement.parentNode.insertBefore(childContainer, itemElement.nextSibling);
            this.renderFileTree(item.children, childContainer, level + 1);
            itemElement.querySelector('.icon').textContent = '📂';
            expanded = true;
          } else if (expanded && childContainer) {
            childContainer.remove();
            itemElement.querySelector('.icon').textContent = '📁';
            expanded = false;
          }
        });
      } else {
        itemElement.className = 'file-tree-item';
        itemElement.setAttribute('data-file-path', item.path);
        const fileIcon = this.getFileIcon(item.name);
        itemElement.innerHTML = `
          <span class="icon">${fileIcon}</span>
          <span class="name">${item.name}</span>
        `;
        
        itemElement.addEventListener('click', async () => {
          const tabId = await this.readFileFromTree(item.path);
          if (tabId) {
            // Highlight selected file
            document.querySelectorAll('.file-tree-item').forEach(el => el.classList.remove('selected'));
            itemElement.classList.add('selected');
          }
        });
      }
      
      container.appendChild(itemElement);
    });
  }

  /**
   * Get file icon based on extension
   * @param {string} filename - Filename
   * @returns {string} - File icon emoji
   */
  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'js': '🟨',
      'ts': '🔷',
      'html': '🟧',
      'css': '🎨',
      'json': '📋',
      'md': '📝',
      'py': '🐍',
      'cpp': '⚙️',
      'c': '⚙️',
      'h': '📄',
      'java': '☕',
      'php': '🐘',
      'rb': '💎',
      'go': '🐹',
      'rs': '🦀'
    };
    return iconMap[ext] || '📄';
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

module.exports = FileOperationsManager;