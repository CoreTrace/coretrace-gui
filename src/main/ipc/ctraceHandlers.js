const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const net = require('net');
const { v4: uuidv4 } = require('uuid');

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
 * Create a temporary socket file path
 */
function createTempSocketPath() {
  const tmpDir = os.tmpdir();
  const socketName = `ctrace-${uuidv4()}.sock`;
  return path.join(tmpDir, socketName);
}

/**
 * Setup IPC handlers for running the ctrace binary with socket IPC
 */
function setupCtraceHandlers() {
  ipcMain.handle('run-ctrace', async (event, args = []) => {
    // Always use the Linux binary 'ctrace' (no .exe extension)
    // On Windows, this will be executed through WSL
    const binaryName = 'ctrace';
    const socketPath = createTempSocketPath();
    let server = null;
    
    // Clean up socket file on exit
    const cleanup = () => {
      if (server) {
        try {
          console.log('Starting cleanup of IPC resources...');
          server.close();
          if (fsSync.existsSync(socketPath)) {
            console.log(`Removing socket file: ${socketPath}`);
            fsSync.unlinkSync(socketPath);
          }
          console.log('✅ Cleanup completed successfully');
          console.log('----------------------------------------');
          console.log('🚀 ctrace IPC session has ended');
          console.log('----------------------------------------');
        } catch (error) {
          console.error('❌ Error during cleanup:', error);
        }
      }
    };

    // Handle process exit
    process.on('exit', cleanup);
    process.on('SIGINT', () => process.exit());
    process.on('SIGTERM', () => process.exit());

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

      return await new Promise((resolve, reject) => {
        console.log('Setting up socket IPC at:', socketPath);
        
        // Create and configure the server
        server = net.createServer((socket) => {

          let outputBuffer = '';
          
          socket.on('data', (data) => {
            const dataStr = data.toString();
            outputBuffer += dataStr;
            console.log('data');
            console.log(data);
            console.log('dataStr');
            console.log(dataStr);
            console.log('outputBuffer');
            console.log(outputBuffer);

            // Forward data to renderer as it comes in
            if (event && event.sender && !event.sender.isDestroyed()) {
              event.sender.send('ctrace-output', dataStr);
            }
          });
          
          socket.on('end', () => {
            // Send final output and completion status
            if (event && event.sender && !event.sender.isDestroyed()) {
              event.sender.send('ctrace-complete', { 
                success: true, 
                output: outputBuffer 
              });
            }
            cleanup();
            resolve({ success: true, output: outputBuffer });
          });
          
          socket.on('error', (err) => {
            console.error('Socket error:', err);
            cleanup();
            reject({ success: false, error: `Socket error: ${err.message}` });
          });
        });
        
        // Handle server errors
        server.on('error', (err) => {
          console.error('Server error:', err);
          cleanup();
          reject({ success: false, error: `Server error: ${err.message}` });
        });
        
        // Start listening on the socket
        server.listen(socketPath, () => {
          console.log('Server listening on', socketPath);
          
          // Prepare command and arguments
          let command, commandArgs;
          const binaryArgs = ['--ipc', 'socket', '--ipc-path', socketPath, ...(Array.isArray(args) ? args : [])];
          
          if (os.platform() === 'win32') {
            // On Windows, use WSL to execute the Linux binary
            console.log('Windows detected, using WSL to execute ctrace');
            const wslPath = resolvedBinPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => 
              `/mnt/${drive.toLowerCase()}`);
            
            command = 'wsl';
            commandArgs = [wslPath, ...binaryArgs];
            console.log('WSL command:', command, commandArgs);
          } else {
            // On Linux/Mac, use the binary directly
            command = resolvedBinPath;
            commandArgs = binaryArgs;
            console.log('Direct execution:', command, commandArgs);
          }
          
          // Set up process
          const child = spawn(command, commandArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
          });
          
          // Handle process output (for logging)
          child.stdout.on('data', (data) => {
            console.log(`[test]\n`);
            console.log(`----------------------------\n`);
            console.log(`[${data}]\n`);
            console.log(`----------------------------\n`);
          });
          
          child.stderr.on('data', (data) => {
            console.error(`[ctrace error] ${data}`);
          });
          
          child.on('error', (err) => {
            console.error('Error spawning process:', err);
            cleanup();
            reject({ success: false, error: `Failed to start process: ${err.message}` });
          });
          
          child.on('exit', (code, signal) => {
            console.log(`Process exited with code ${code} and signal ${signal}`);
            if (code !== 0) {
              cleanup();
              reject({ 
                success: false, 
                error: `Process exited with code ${code}` 
              });
            }
          });
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupCtraceHandlers };
