class FileTree {
  constructor(ui) {
    this.ui = ui;
  }

/**
   * Setup file tree watcher to listen for automatic updates.
   * Debounces refreshes to avoid UI freezes on large workspaces.
   */
  setupFileTreeWatcher() {
    if (this.ui._fileTreeWatcherInitialized) return;
    this.ui._fileTreeWatcherInitialized = true;

    let refreshTimer = null;
    window.api.on('workspace-changed', (data) => {
      if (!data || !data.success) {
        if (data && data.error) {
          console.error('Error in workspace change notification:', data.error);
        }
        return;
      }

      const workspacePath = this.ui.fileOpsManager.getCurrentWorkspacePath();
      if (!workspacePath) return;
      if (data.folderPath && data.folderPath !== workspacePath) return;

      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        this.ui.refreshFileTree(true);
      }, 1200);
    });

    // Show a discrete loading indicator for slow workspace operations
    this.ui._workspaceLoadingTimer = null;
    this.ui._workspaceLoadingNotification = null;
    this.ui._workspaceLoadingRequestId = null;

    window.api.on('workspace-loading', (data) => {
      if (!data || !data.status) return;

      // Only react for the active workspace.
      const workspacePath = this.ui.fileOpsManager.getCurrentWorkspacePath();
      if (workspacePath && data.folderPath && data.folderPath !== workspacePath && data.operation !== 'open') {
        return;
      }

      if (data.status === 'start') {
        this.ui._workspaceLoadingRequestId = data.requestId || null;
        clearTimeout(this.ui._workspaceLoadingTimer);

        this.ui._workspaceLoadingTimer = setTimeout(() => {
          if (this.ui._workspaceLoadingNotification) return;
          const folderName = (data.folderPath || '').split(/[/\\]/).pop() || 'workspace';
          const label = data.operation === 'refresh'
            ? `Refreshing "${folderName}"...`
            : `Loading "${folderName}"...`;
          this.ui._workspaceLoadingNotification = this.ui.notificationManager.showLoading(label);
        }, 450);

        return;
      }

      if (data.status === 'end') {
        if (this.ui._workspaceLoadingRequestId && data.requestId && data.requestId !== this.ui._workspaceLoadingRequestId) {
          return;
        }

        clearTimeout(this.ui._workspaceLoadingTimer);
        this.ui._workspaceLoadingTimer = null;

        if (this.ui._workspaceLoadingNotification) {
          this.ui._workspaceLoadingNotification.dismiss();
          this.ui._workspaceLoadingNotification = null;
        }

        this.ui._workspaceLoadingRequestId = null;
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

        const workspacePath = this.ui.fileOpsManager.getCurrentWorkspacePath();
        if (!workspacePath) return;

        this.ui.showFileTreeContextMenu(e.clientX, e.clientY, [{
          label: 'Close Folder',
          action: () => this.ui.fileOpsManager.closeWorkspace()
        }]);
      });
    }

    targetEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // No workspace => no file operations
      const workspacePath = this.ui.fileOpsManager.getCurrentWorkspacePath();
      if (!workspacePath) {
        this.ui.notificationManager.showWarning('Open a workspace to use file operations');
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
          action: () => this.ui.createFileInDirectory(workspacePath)
        });
        menuItems.push({
          label: 'New folder..',
          action: () => this.ui.createFolderInDirectory(workspacePath)
        });
        menuItems.push({
          label: 'Close Folder',
          action: () => this.ui.fileOpsManager.closeWorkspace()
        });
        menuItems.push({
          label: 'Close Folder',
          action: () => this.ui.fileOpsManager.closeWorkspace()
        });
      } else if (itemType === 'directory') {
        // Folder menu
        menuItems.push({
          label: 'New file..',
          action: () => this.ui.createFileInDirectory(itemPath)
        });
        menuItems.push({
          label: 'New folder..',
          action: () => this.ui.createFolderInDirectory(itemPath)
        });
        menuItems.push({
          label: 'Rename',
          action: () => this.ui.renamePath(itemPath, itemName)
        });
        menuItems.push({
          label: 'Delete',
          action: () => this.ui.deletePath(itemPath, itemType)
        });
      } else {
        // File menu
        menuItems.push({
          label: 'Rename',
          action: () => this.ui.renamePath(itemPath, itemName)
        });
        menuItems.push({
          label: 'Delete',
          action: () => this.ui.deletePath(itemPath, itemType)
        });
      }

      this.ui.showFileTreeContextMenu(e.clientX, e.clientY, menuItems);
    });
  }

  showFileTreeContextMenu(x, y, items) {
    this.ui.hideFileTreeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    items.forEach(({ label, action }) => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ui.hideFileTreeContextMenu();
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

    this.ui.fileTreeContextMenu = menu;
  }

  hideFileTreeContextMenu() {
    if (this.ui.fileTreeContextMenu) {
      this.ui.fileTreeContextMenu.remove();
      this.ui.fileTreeContextMenu = null;
    }
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
    const workspacePath = this.ui.fileOpsManager.getCurrentWorkspacePath();
    if (!workspacePath) {
      this.ui.notificationManager.showWarning('No workspace open to refresh');
      return;
    }
    // Request updated file tree from main process
    try {
      const result = await window.api.invoke('get-file-tree', workspacePath);
      if (result.success) {
        const folderName = workspacePath.split(/[/\\]/).pop();
        this.ui.fileOpsManager.updateWorkspaceUI(folderName, result.fileTree);
        if (!silent) {
          this.ui.notificationManager.showSuccess('File tree refreshed');
        }
      } else {
        this.ui.notificationManager.showError('Failed to refresh file tree: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      this.ui.notificationManager.showError('Error refreshing file tree: ' + error.message);
    }
  }

}

window.FileTree = FileTree;
