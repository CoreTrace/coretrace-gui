const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Check if WSL is available and has distributions installed
 * @returns {Promise<Object>} WSL status object with properties: available (boolean), hasDistros (boolean), error (string)
 */
async function checkWSLAvailability() {
  return new Promise((resolve) => {
    // First check if WSL command exists
    const statusChild = spawn('wsl', ['--status'], { stdio: 'pipe' });
    
    let statusOutput = '';
    let statusError = '';
    
    statusChild.stdout.on('data', (data) => {
      statusOutput += data.toString();
    });
    
    statusChild.stderr.on('data', (data) => {
      statusError += data.toString();
    });
    
    statusChild.on('error', () => {
      resolve({ available: false, hasDistros: false, error: 'WSL is not installed' });
    });
    
    statusChild.on('close', (statusCode) => {
      if (statusCode !== 0) {
        resolve({ available: false, hasDistros: false, error: 'WSL is not available' });
        return;
      }
      
      // WSL exists, now check for installed distributions
      const listChild = spawn('wsl', ['--list', '--quiet'], { stdio: 'pipe' });
      
      let listOutput = '';
      
      listChild.stdout.on('data', (data) => {
        listOutput += data.toString();
      });
      
      listChild.on('error', () => {
        resolve({ available: true, hasDistros: false, error: 'Cannot check WSL distributions' });
      });
      
      listChild.on('close', (listCode) => {
        const distributions = listOutput.trim().split('\n').filter(line => line.trim().length > 0);
        const hasDistros = distributions.length > 0 && !listOutput.includes('no installed distributions');
        
        if (!hasDistros) {
          const errorMsg = statusError.includes('no installed distributions') || listOutput.includes('no installed distributions')
            ? 'WSL is installed but no Linux distributions are available'
            : 'No WSL distributions found';
          resolve({ available: true, hasDistros: false, error: errorMsg });
        } else {
          resolve({ available: true, hasDistros: true });
        }
      });
      
      // Timeout for list command
      setTimeout(() => {
        listChild.kill();
        resolve({ available: true, hasDistros: false, error: 'Timeout checking WSL distributions' });
      }, 5000);
    });
    
    // Timeout for status command
    setTimeout(() => {
      statusChild.kill();
      resolve({ available: false, hasDistros: false, error: 'Timeout checking WSL status' });
    }, 5000);
  });
}

/**
 * Setup IPC handlers for running the ctrace binary
 */
function setupCtraceHandlers() {
  ipcMain.handle('run-ctrace', async (event, args = []) => {
    // Always use the Linux binary 'ctrace' (no .exe extension)
    // On Windows, this will be executed through WSL
    const binaryName = 'ctrace';
    
    // Resolve binary in dev and production (packaged) locations
    let binPath;
    
    if (process.resourcesPath) {
      // In packaged app, binary is in extraResources
      binPath = path.join(process.resourcesPath, 'bin', binaryName);
    } else {
      // In development, binary is in the project bin directory
      // __dirname is .../src/main/ipc, so project root bin is ../../../bin/ctrace
      binPath = path.join(__dirname, '../../../bin', binaryName);
    }

    async function resolveBinary() {
      try {
        await fs.access(binPath);
        return binPath;
      } catch (error) {
        console.error(`Binary not found at ${binPath}:`, error.message);
        return null;
      }
    }

    try {
      const resolvedBinPath = await resolveBinary();
      if (!resolvedBinPath) {
        const platform = os.platform();
        const platformInfo = platform === 'win32' ? ' (Linux binary executed via WSL)' : '';
        const checkedPath = process.resourcesPath ? 
          path.join(process.resourcesPath, 'bin', binaryName) : 
          path.join(__dirname, '../../../bin', binaryName);
        return { 
          success: false, 
          error: `ctrace binary not found at: ${checkedPath}${platformInfo}` 
        };
      }

      // On Windows, check if WSL is available before proceeding
      if (os.platform() === 'win32') {
        const wslStatus = await checkWSLAvailability();
        if (!wslStatus.available || !wslStatus.hasDistros) {
          let errorMessage = 'CTrace requires WSL (Windows Subsystem for Linux) to run on Windows.\n\n';
          
          if (!wslStatus.available) {
            errorMessage += 'WSL is not installed. Please install WSL by running:\n';
            errorMessage += '• Open PowerShell as Administrator\n';
            errorMessage += '• Run: wsl --install\n';
            errorMessage += '• Restart your computer when prompted\n\n';
          } else if (!wslStatus.hasDistros) {
            errorMessage += 'WSL is installed but no Linux distributions are available.\n\n';
            errorMessage += 'To fix this:\n';
            errorMessage += '• Run: wsl --list --online (to see available distributions)\n';
            errorMessage += '• Run: wsl --install Ubuntu (or another distribution)\n';
            errorMessage += '• Follow the setup instructions\n\n';
          }
          
          errorMessage += 'After setup, restart the application to use CTrace.';
          
          if (wslStatus.error) {
            errorMessage += `\n\nDetailed error: ${wslStatus.error}`;
          }
          
          return { 
            success: false, 
            error: errorMessage
          };
        }
      }

      return await new Promise((resolve) => {
        console.log('args', args);
        
        let command, commandArgs;
        
        // Check if we're on Windows (we always have a Linux binary now)
        if (os.platform() === 'win32') {
          // On Windows, use WSL to execute the Linux binary
          console.log('Windows detected, using WSL to execute ctrace');
          console.log('Binary path:', resolvedBinPath);
          
          // Convert Windows path to WSL path
          const wslPath = resolvedBinPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`);
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
          console.log('WSL command:', command, commandArgs);
        } else {
          // On Linux/Mac, use the binary directly
          command = resolvedBinPath;
          commandArgs = Array.isArray(args) ? args : [];
          console.log('Direct execution:', command, commandArgs);
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
          let errorMessage = err.message;
          
          // Provide more helpful error messages for WSL-related issues
          if (os.platform() === 'win32' && command === 'wsl') {
            if (err.code === 'ENOENT') {
              errorMessage = 'WSL (Windows Subsystem for Linux) is not installed or not available in PATH. Please install WSL to use CTrace.';
            } else if (err.code === 'EACCES') {
              errorMessage = 'Permission denied when trying to execute WSL. Please check WSL installation and permissions.';
            } else {
              errorMessage = `WSL execution failed: ${err.message}`;
            }
          }
          
          resolve({ success: false, error: errorMessage });
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
