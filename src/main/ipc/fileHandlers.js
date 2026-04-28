/**
 * @fileoverview IPC handlers for file operations in the main process.
 * 
 * This module provides all IPC handlers for file system operations including
 * opening files/folders, saving files, reading file content, and managing
 * file system watching for automatic UI updates.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const { detectFileEncoding, buildFileTree, searchInDirectory, FILE_SIZE_LIMIT } = require('../utils/fileUtils');

const FILE_TREE_MAX_DEPTH = 3;

/**
 * File watcher instance for monitoring workspace changes
 * @type {chokidar.FSWatcher|null}
 * @private
 */
let fileWatcher = null;

/**
 * Currently watched workspace path
 * @type {string|null}
 * @private
 */
let currentWatchPath = null;

let workspaceLoadingSeq = 0;

/**
 * Sets up all IPC handlers for file operations.
 * 
 * This function registers all IPC handlers that the renderer process can invoke
 * for file operations. It handles folder dialogs, file dialogs, saving files,
 * reading files, and file tree operations.
 * 
 * @function setupFileHandlers
 * @param {BrowserWindow} mainWindow - Main window reference for dialogs
 * 
 * @example
 * setupFileHandlers(mainWindow);
 */
function setupFileHandlers(mainWindow) {
  // Open folder dialog
  ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      const requestId = ++workspaceLoadingSeq;
      try {
        try {
          mainWindow.webContents.send('workspace-loading', {
            status: 'start',
            operation: 'open',
            folderPath,
            requestId
          });
        } catch (_) {}

        const fileTree = await buildFileTree(folderPath, FILE_TREE_MAX_DEPTH);

        // Start watching the workspace for changes
        startWatchingWorkspace(folderPath, mainWindow, FILE_TREE_MAX_DEPTH);

        try {
          mainWindow.webContents.send('workspace-loading', {
            status: 'end',
            operation: 'open',
            folderPath,
            requestId,
            success: true
          });
        } catch (_) {}
        
        return {
          success: true,
          folderPath,
          fileTree
        };
      } catch (error) {
        try {
          mainWindow.webContents.send('workspace-loading', {
            status: 'end',
            operation: 'open',
            folderPath,
            requestId,
            success: false,
            error: error.message
          });
        } catch (_) {}
        return {
          success: false,
          error: error.message
        };
      }
    }
    
    return { success: false, canceled: true };
  });

  // Check if a file path exists on disk (lightweight, no content read)
  ipcMain.handle('check-file-exists', async (_event, filePath) => {
    if (!filePath) return { exists: false };
    try {
      await fs.access(filePath);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  });

  // Get file tree for refresh (now uses lazy loading)
  ipcMain.handle('get-file-tree', async (event, folderPath) => {
    const requestId = ++workspaceLoadingSeq;
    try {
      try {
        mainWindow.webContents.send('workspace-loading', {
          status: 'start',
          operation: 'refresh',
          folderPath,
          requestId
        });
      } catch (_) {}

      const fileTree = await buildFileTree(folderPath, false); // Lazy load

      try {
        mainWindow.webContents.send('workspace-loading', {
          status: 'end',
          operation: 'refresh',
          folderPath,
          requestId,
          success: true
        });
      } catch (_) {}
      return {
        success: true,
        fileTree
      };
    } catch (error) {
      try {
        mainWindow.webContents.send('workspace-loading', {
          status: 'end',
          operation: 'refresh',
          folderPath,
          requestId,
          success: false,
          error: error.message
        });
      } catch (_) {}
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Get directory contents for lazy loading
  ipcMain.handle('get-directory-contents', async (event, dirPath) => {
    try {
      const contents = await buildFileTree(dirPath, false);
      return {
        success: true,
        contents
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Start watching a workspace (renderer may request this after opening)
  ipcMain.handle('watch-workspace', async (event, folderPath) => {
    try {
      if (!folderPath) {
        return { success: false, error: 'No folder path provided' };
      }
      startWatchingWorkspace(folderPath, mainWindow, FILE_TREE_MAX_DEPTH);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Open file dialog
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'py', 'cpp', 'c', 'h'] }
      ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      try {
        const fileInfo = await detectFileEncoding(filePath);
        
        if (!fileInfo.isUTF8) {
          // File is not UTF-8, return warning info
          return {
            success: true,
            warning: 'encoding',
            filePath,
            fileName: path.basename(filePath),
            message: 'This file appears to contain non-UTF8 characters. Opening it may cause display issues or data corruption.'
          };
        }
        
        let content;
        let isPartial = false;
        
        if (fileInfo.size > FILE_SIZE_LIMIT) {
          // File is large, load only first part
          const partialBuffer = fileInfo.buffer.slice(0, FILE_SIZE_LIMIT);
          content = partialBuffer.toString('utf8');
          isPartial = true;
        } else {
          // File is small enough, load entirely
          content = fileInfo.buffer.toString('utf8');
        }
        
        return {
          success: true,
          filePath,
          content,
          fileName: path.basename(filePath),
          isPartial,
          totalSize: fileInfo.size,
          loadedSize: isPartial ? FILE_SIZE_LIMIT : fileInfo.size
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
    
    return { success: false, canceled: true };
  });

  // Select local LLM (GGUF) model file
  ipcMain.handle('select-llm-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'GGUF / Model Files', extensions: ['gguf', 'bin', 'pt', 'ggml', 'onnx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, filePath: result.filePaths[0] };
    }

    return { success: false, canceled: true };
  });

  // Save file
  ipcMain.handle('save-file', async (event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Save file as
  ipcMain.handle('save-file-as', async (event, content) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'TypeScript', extensions: ['ts'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'CSS', extensions: ['css'] }
      ]
    });
    
    if (!result.canceled) {
      try {
        await fs.writeFile(result.filePath, content, 'utf8');
        return {
          success: true,
          filePath: result.filePath,
          fileName: path.basename(result.filePath)
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    
    return { success: false, canceled: true };
  });

  // Create a new empty file in a directory
  ipcMain.handle('create-file', async (event, directoryPath, fileName) => {
    try {
      if (!directoryPath) return { success: false, error: 'No directory provided' };
      if (!fileName || typeof fileName !== 'string') return { success: false, error: 'Invalid file name' };

      const trimmed = fileName.trim();
      if (!trimmed || trimmed === '.' || trimmed === '..') {
        return { success: false, error: 'Invalid file name' };
      }
      if (trimmed.includes('/') || trimmed.includes('\\')) {
        return { success: false, error: 'File name must not contain path separators' };
      }

      const newPath = path.join(directoryPath, trimmed);

      await fs.writeFile(newPath, '', { encoding: 'utf8', flag: 'wx' });

      return { success: true, path: newPath, name: trimmed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Create a new folder in a directory
  ipcMain.handle('create-folder', async (event, directoryPath, folderName) => {
    try {
      if (!directoryPath) return { success: false, error: 'No directory provided' };
      if (!folderName || typeof folderName !== 'string') return { success: false, error: 'Invalid folder name' };

      const trimmed = folderName.trim();
      if (!trimmed || trimmed === '.' || trimmed === '..') {
        return { success: false, error: 'Invalid folder name' };
      }
      if (trimmed.includes('/') || trimmed.includes('\\')) {
        return { success: false, error: 'Folder name must not contain path separators' };
      }

      const newPath = path.join(directoryPath, trimmed);
      await fs.mkdir(newPath);

      return { success: true, path: newPath, name: trimmed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Rename a file or folder
  ipcMain.handle('rename-path', async (event, targetPath, newName) => {
    try {
      if (!targetPath) return { success: false, error: 'No target path provided' };
      if (!newName || typeof newName !== 'string') return { success: false, error: 'Invalid new name' };

      const trimmed = newName.trim();
      if (!trimmed || trimmed === '.' || trimmed === '..') {
        return { success: false, error: 'Invalid new name' };
      }
      if (trimmed.includes('/') || trimmed.includes('\\')) {
        return { success: false, error: 'Name must not contain path separators' };
      }

      const stats = await fs.lstat(targetPath);
      const newPath = path.join(path.dirname(targetPath), trimmed);
      await fs.rename(targetPath, newPath);

      return { success: true, newPath, name: trimmed, isFile: stats.isFile() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Delete a file or folder (recursive for folders)
  ipcMain.handle('delete-path', async (event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: 'No target path provided' };

      const stats = await fs.lstat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Read file content
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const fileInfo = await detectFileEncoding(filePath);
      
      if (!fileInfo.isUTF8) {
        // File is not UTF-8, return warning info
        return {
          success: true,
          warning: 'encoding',
          filePath,
          fileName: path.basename(filePath),
          message: 'This file appears to contain non-UTF8 characters. Opening it may cause display issues or data corruption.'
        };
      }
      
      let content;
      let isPartial = false;
      
      if (fileInfo.size > FILE_SIZE_LIMIT) {
        // File is large, load only first part
        const partialBuffer = fileInfo.buffer.slice(0, FILE_SIZE_LIMIT);
        content = partialBuffer.toString('utf8');
        isPartial = true;
      } else {
        // File is small enough, load entirely
        content = fileInfo.buffer.toString('utf8');
      }
      
      return {
        success: true,
        content,
        fileName: path.basename(filePath),
        isPartial,
        totalSize: fileInfo.size,
        loadedSize: isPartial ? FILE_SIZE_LIMIT : fileInfo.size
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Load complete file (for large files that were partially loaded)
  ipcMain.handle('load-complete-file', async (event, filePath) => {
    try {
      const fileInfo = await detectFileEncoding(filePath);
      
      if (!fileInfo.isUTF8) {
        return {
          success: false,
          error: 'File contains non-UTF8 characters and cannot be safely loaded.'
        };
      }
      
      const content = fileInfo.buffer.toString('utf8');
      
      return {
        success: true,
        content,
        fileName: path.basename(filePath),
        isPartial: false,
        totalSize: fileInfo.size,
        loadedSize: fileInfo.size
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Force open file (ignore encoding warnings)
  ipcMain.handle('force-open-file', async (event, filePath) => {
    try {
      const fileInfo = await detectFileEncoding(filePath);
      
      let content;
      let isPartial = false;
      
      // Try to read as UTF-8, may have some garbled characters
      if (fileInfo.size > FILE_SIZE_LIMIT) {
        const partialBuffer = fileInfo.buffer.slice(0, FILE_SIZE_LIMIT);
        try {
          content = partialBuffer.toString('utf8');
        } catch (error) {
          // If UTF-8 fails, try latin1 as fallback
          content = partialBuffer.toString('latin1');
        }
        isPartial = true;
      } else {
        try {
          content = fileInfo.buffer.toString('utf8');
        } catch (error) {
          // If UTF-8 fails, try latin1 as fallback
          content = fileInfo.buffer.toString('latin1');
        }
      }
      
      return {
        success: true,
        content,
        fileName: path.basename(filePath),
        isPartial,
        totalSize: fileInfo.size,
        loadedSize: isPartial ? FILE_SIZE_LIMIT : fileInfo.size,
        encodingWarning: !fileInfo.isUTF8
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Search in files
  ipcMain.handle('search-in-files', async (event, searchTerm, folderPath) => {
    try {
      const results = await searchInDirectory(folderPath, searchTerm);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler to force load full file (bypass size limits)
  ipcMain.handle('force-load-full-file', async (event, filePath) => {
    try {
      const buffer = await fs.readFile(filePath);
      const content = buffer.toString('utf8');
      
      return {
        success: true,
        content,
        totalSize: buffer.length,
        fileName: path.basename(filePath)
      };
    } catch (error) {
      console.error('Error force loading full file:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });
}

/**
 * Start watching workspace for file changes
 * @param {string} workspacePath - Path to watch
 * @param {BrowserWindow} mainWindow - Main window reference
 */
function startWatchingWorkspace(workspacePath, mainWindow, watchDepth = FILE_TREE_MAX_DEPTH) {
  // Stop existing watcher if any
  stopWatchingWorkspace();
  
  currentWatchPath = workspacePath;
  
  // Create new watcher
  fileWatcher = chokidar.watch(workspacePath, {
    ignoreInitial: true,
    ignored: [
      /(^|[\/\\])\../, // ignore hidden files
      /node_modules/,  // ignore node_modules
      /\.git/,         // ignore git metadata
      /dist/,
      /build/,
      /out/,
      /coverage/,
      /\.next/,
      /\.cache/,
      /target/,
      /vendor/,
      /__pycache__/,
      /\.venv/,
      /venv/,
      /My Music/,      // ignore Windows system folders
      /My Pictures/,
      /My Videos/,
      /\$RECYCLE\.BIN/,
      /System Volume Information/
    ],
    depth: watchDepth, // keep consistent with file tree depth
    ignorePermissionErrors: true // ignore permission errors
  });
  
  // Debounce function to avoid too many updates
  let updateTimeout;
  let lastChangedPath = null;
  const debouncedUpdate = (changedPath) => {
    clearTimeout(updateTimeout);
    lastChangedPath = changedPath || lastChangedPath;
    updateTimeout = setTimeout(async () => {
      try {
        // Avoid rebuilding and sending the entire file tree on every FS event.
        // The renderer can decide when to refresh and pull a new tree.
        mainWindow.webContents.send('workspace-changed', {
          success: true,
          folderPath: workspacePath,
          changedPath: lastChangedPath
        });
      } catch (error) {
        console.error('Error updating file tree:', error);
      }
    }, 750); // 750ms debounce
  };
  
  // Listen for file system events
  fileWatcher
    .on('add', debouncedUpdate)
    .on('unlink', debouncedUpdate)
    .on('addDir', debouncedUpdate)
    .on('unlinkDir', debouncedUpdate)
    .on('error', error => console.error('File watcher error:', error));
  
  console.log('Started watching workspace:', workspacePath);
}

/**
 * Stop watching current workspace
 */
function stopWatchingWorkspace() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    console.log('Stopped watching workspace:', currentWatchPath);
  }
  currentWatchPath = null;
}

module.exports = { setupFileHandlers };