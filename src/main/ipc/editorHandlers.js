const { ipcMain } = require('electron');
const { exec } = require('child_process');

/**
 * Setup IPC handlers for editor operations
 */
function setupEditorHandlers() {
  // Open editor listener
  ipcMain.on('open-editor', () => {
    console.log("button clicked !");
    let command;

    switch (process.platform) {
      case 'win32': // Windows
        command = 'notepad';
        break;
      case 'darwin': // macOS
        command = 'open -a TextEdit';
        break;
      case 'linux': // Linux
        command = 'x-terminal-emulator -e nano'; // or just 'nano' if terminal already open
        break;
      default:
        console.warn(`[open-editor] Unsupported platform: ${process.platform}`);
        return;
    }

    exec(command, (err) => {
      if (err) {
        console.error(`[open-editor] Failed to launch external editor on ${process.platform} (command: "${command}"): [${err.code || 'ERR'}] ${err.message}`);
      }
    });
  });
}

module.exports = { setupEditorHandlers };