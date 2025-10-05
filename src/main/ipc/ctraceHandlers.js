const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Setup IPC handlers for running the ctrace binary
 */
function setupCtraceHandlers() {
  ipcMain.handle('run-ctrace', async (event, args = []) => {
    // Determine binary name based on platform
    const platform = os.platform();
    const binaryName = platform === 'win32' ? 'ctrace.exe' : 'ctrace';
    
    // Resolve binary in dev and production (packaged) locations
    // __dirname is .../src/main/ipc, so project root bin is ../../bin/ctrace
    const devPath = path.join(__dirname, '../../../bin', binaryName);
    const prodPath = path.join(process.resourcesPath || '', 'bin', binaryName);
    
    // Alternative: platform-specific paths
    const devPlatformPath = path.join(__dirname, '../../../bin', platform, binaryName);
    const prodPlatformPath = path.join(process.resourcesPath || '', 'bin', platform, binaryName);

    async function resolveBinary() {
      // Try platform-specific paths first
      try {
        await fs.access(devPlatformPath);
        return devPlatformPath;
      } catch (_) {
        try {
          await fs.access(prodPlatformPath);
          return prodPlatformPath;
        } catch (__) {
          // Fallback to generic paths
          try {
            await fs.access(devPath);
            return devPath;
          } catch (___) {
            try {
              await fs.access(prodPath);
              return prodPath;
            } catch (____) {
              return null;
            }
          }
        }
      }
    }

    try {
      const binPath = await resolveBinary();
      if (!binPath) {
        return { success: false, error: `ctrace binary not found at: ${devPath} or ${prodPath}` };
      }

      return await new Promise((resolve) => {
        console.log('args', args);
        
        let command, commandArgs;
        
        // Check if we're on Windows and have a Linux binary (need WSL)
        const isWindowsWithLinuxBinary = os.platform() === 'win32' && !binPath.endsWith('.exe');
        
        if (isWindowsWithLinuxBinary) {
          // Convert Windows path to WSL path
          const wslPath = binPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`);
          command = 'wsl';
          
          // Convert arguments with Windows paths to WSL paths
          const convertedArgs = (Array.isArray(args) ? args : []).map(arg => {
            // Convert paths in arguments like --input=C:\path\to\file
            if (typeof arg === 'string' && arg.includes(':\\')) {
              return arg.replace(/([A-Z]):\\/g, (match, drive) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, '/');
            }
            return arg;
          });
          
          commandArgs = [wslPath, ...convertedArgs];
        } else {
          // On Linux/Mac, or Windows with .exe binary, use directly
          command = binPath;
          commandArgs = Array.isArray(args) ? args : [];
        }
        
        const child = spawn(command, commandArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, output: stdout, exitCode: code });
          } else {
            resolve({ success: false, error: `ctrace exited with code ${code}`, stderr, output: stdout, exitCode: code });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupCtraceHandlers };
