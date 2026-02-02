/**
 * @fileoverview IPC handlers for application state persistence
 * 
 * Provides handlers for saving, loading, and managing application state
 * for work loss prevention. State is stored as JSON in the user's data directory.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const { ipcMain, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');

/**
 * Get the path to the state file in the user's data directory
 * @returns {string} Full path to state file
 */
function getStatePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'app-state.json');
}

/**
 * Get the path to the backup state file
 * @returns {string} Full path to backup state file
 */
function getBackupStatePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'app-state.backup.json');
}

/**
 * Setup IPC handlers for state management operations
 * 
 * Registers the following IPC handlers:
 * - save-app-state: Save current application state
 * - load-app-state: Load saved application state
 * - clear-app-state: Clear saved state
 * - get-state-info: Get information about saved state
 * 
 * @function setupStateHandlers
 */
function setupStateHandlers() {
  /**
   * Save application state to disk
   * Creates a backup of the previous state before saving
   */
  ipcMain.handle('save-app-state', async (event, state) => {
    try {
      const statePath = getStatePath();
      const backupPath = getBackupStatePath();
      
      // Create backup of existing state if it exists
      try {
        await fs.access(statePath);
        await fs.copyFile(statePath, backupPath);
        console.log('[StateHandlers] Created backup of existing state');
      } catch (err) {
        // No existing state to backup, that's okay
      }
      
      // Save new state
      const stateJson = JSON.stringify(state, null, 2);
      await fs.writeFile(statePath, stateJson, 'utf8');
      
      console.log('[StateHandlers] State saved successfully:', {
        path: statePath,
        size: stateJson.length,
        tabCount: state.tabs?.length || 0
      });
      
      return { success: true };
    } catch (error) {
      console.error('[StateHandlers] Error saving state:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Load application state from disk
   * Attempts to load from backup if main state file is corrupted
   */
  ipcMain.handle('load-app-state', async () => {
    const statePath = getStatePath();
    const backupPath = getBackupStatePath();
    
    /**
     * Try to load and parse a state file
     * @param {string} filePath - Path to state file
     * @returns {Object|null} Parsed state or null if error
     */
    async function tryLoadState(filePath) {
      try {
        const stateJson = await fs.readFile(filePath, 'utf8');
        const state = JSON.parse(stateJson);
        
        // Validate state structure
        if (!state || typeof state !== 'object') {
          console.warn('[StateHandlers] Invalid state structure');
          return null;
        }
        
        console.log('[StateHandlers] State loaded successfully:', {
          path: filePath,
          version: state.version,
          timestamp: state.timestamp,
          tabCount: state.tabs?.length || 0
        });
        
        return state;
      } catch (error) {
        console.warn('[StateHandlers] Error loading state from', filePath, ':', error.message);
        return null;
      }
    }
    
    // Try to load main state file
    let state = await tryLoadState(statePath);
    
    // If main state failed, try backup
    if (!state) {
      console.log('[StateHandlers] Attempting to load backup state...');
      state = await tryLoadState(backupPath);
    }
    
    if (state) {
      return { success: true, state: state };
    } else {
      return { success: false, error: 'No valid state found' };
    }
  });

  /**
   * Clear saved application state
   * Removes both main and backup state files
   */
  ipcMain.handle('clear-app-state', async () => {
    try {
      const statePath = getStatePath();
      const backupPath = getBackupStatePath();
      
      // Remove main state file
      try {
        await fs.unlink(statePath);
        console.log('[StateHandlers] Removed main state file');
      } catch (err) {
        // File might not exist, that's okay
      }
      
      // Remove backup state file
      try {
        await fs.unlink(backupPath);
        console.log('[StateHandlers] Removed backup state file');
      } catch (err) {
        // File might not exist, that's okay
      }
      
      return { success: true };
    } catch (error) {
      console.error('[StateHandlers] Error clearing state:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get information about saved state without loading it
   * Useful for checking if state exists and when it was last saved
   */
  ipcMain.handle('get-state-info', async () => {
    try {
      const statePath = getStatePath();
      
      try {
        const stats = await fs.stat(statePath);
        const stateJson = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(stateJson);
        
        return {
          success: true,
          info: {
            exists: true,
            size: stats.size,
            modified: stats.mtime,
            version: state.version,
            timestamp: state.timestamp,
            tabCount: state.tabs?.length || 0,
            hasDiagnostics: !!state.diagnostics
          }
        };
      } catch (error) {
        return {
          success: true,
          info: {
            exists: false
          }
        };
      }
    } catch (error) {
      console.error('[StateHandlers] Error getting state info:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[StateHandlers] State management IPC handlers registered');
}

module.exports = { setupStateHandlers };
