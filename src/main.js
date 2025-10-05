/**
 * @fileoverview Main entry point for the CTrace GUI Electron application.
 * 
 * This file initializes the Electron app, creates the main window, and sets up
 * all IPC handlers for communication between the main and renderer processes.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');

// Import IPC handlers
const { setupFileHandlers } = require('./main/ipc/fileHandlers');
const { setupEditorHandlers } = require('./main/ipc/editorHandlers');
const { setupCtraceHandlers } = require('./main/ipc/ctraceHandlers');

/**
 * Creates and configures the main application window.
 * 
 * This function sets up the BrowserWindow with appropriate dimensions,
 * icon, and security settings. It loads the main HTML file and configures
 * the window appearance.
 * 
 * @function createWindow
 * @returns {BrowserWindow} The created main window instance
 * 
 * @example
 * const mainWindow = createWindow();
 */
function createWindow () {
  const iconPath = path.join(__dirname, '../assets/ctrace.png');
  const iconApp = nativeImage.createFromPath(iconPath);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: iconApp,
    frame: false,               // Custom frame for consistency across platforms
    titleBarStyle: 'hidden',    // Hide native title bar
    titleBarOverlay: {
      color: '#0d1117',         // Match VS Code dark theme
      symbolColor: '#ffffff',
      height: 30
    },
    webPreferences: {
      nodeIntegration: true,      // allows require() in renderer
      contextIsolation: false,    // disables security isolation
      webSecurity: false          // For loading local fonts
    }
  });

  win.loadFile('src/index.html');
  
  // Custom window controls for frameless window
  win.on('maximize', () => {
    win.webContents.send('window-maximized', true);
  });
  
  win.on('unmaximize', () => {
    win.webContents.send('window-maximized', false);
  });
  
  return win;
}

//hot reload
try {
  require('electron-reload')(__dirname, {
  electron: require(path.join(__dirname, '../node_modules/electron')),
  hardResetMethod: 'exit'
  });
} catch (e) {
  console.log("electron-reload not active");
}

/**
 * Sets up IPC handlers for custom window controls.
 * 
 * This function handles window minimize, maximize, and close operations
 * for the custom frameless window title bar.
 * 
 * @function setupWindowControls
 * @param {BrowserWindow} window - The main window instance
 */
function setupWindowControls(window) {
  const { ipcMain } = require('electron');
  
  // Window minimize
  ipcMain.on('window-minimize', () => {
    window.minimize();
  });
  
  // Window maximize/restore toggle
  ipcMain.on('window-maximize-toggle', () => {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  
  // Window close
  ipcMain.on('window-close', () => {
    window.close();
  });
}

// Global reference to main window
let mainWindow;

app.whenReady().then(() => {
  mainWindow = createWindow();
  
  // Setup IPC handlers
  setupFileHandlers(mainWindow);
  setupEditorHandlers();
  setupCtraceHandlers();
  setupWindowControls(mainWindow);
});
