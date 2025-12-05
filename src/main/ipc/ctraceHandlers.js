const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const net = require('net');
const { v4: uuidv4 } = require('uuid');

/**
 * Check if socat is installed in WSL, install if needed
 * @returns {Promise<boolean>} True if socat is available or successfully installed
 */
async function ensureSocatInstalled() {
  return new Promise((resolve) => {
    // Check if socat is installed
    const checkChild = spawn('wsl', ['which', 'socat'], { stdio: 'pipe' });
    
    checkChild.on('close', (code) => {
      if (code === 0) {
        console.log('✅ socat is already installed in WSL');
        resolve(true);
        return;
      }
      
      console.log('📦 socat not found, attempting to install...');
      
      // Attempt to install socat using wsl --user root (no password needed)
      const installChild = spawn('wsl', [
        '--user', 'root',
        'bash', '-c',
        'apt-get update -qq && apt-get install -y socat'
      ], { stdio: 'inherit' });
      
      installChild.on('close', (installCode) => {
        if (installCode === 0) {
          console.log('✅ socat installed successfully');
          resolve(true);
        } else {
          console.error('❌ Failed to install socat. Please run: wsl --user root apt-get install socat');
          resolve(false);
        }
      });
      
      installChild.on('error', () => {
        console.error('❌ Error installing socat');
        resolve(false);
      });
      
      setTimeout(() => {
        installChild.kill();
        resolve(false);
      }, 60000); // 60 second timeout for installation
    });
    
    checkChild.on('error', () => {
      resolve(false);
    });
    
    setTimeout(() => {
      checkChild.kill();
      resolve(false);
    }, 5000);
  });
}

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
        // WSL outputs in UTF-16LE on Windows, decode properly and remove null bytes
        listOutput += data.toString('utf16le').replace(/\x00/g, '');
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
 * Get Windows host IP address from WSL perspective
 * @returns {Promise<string>} Windows host IP address
 */
async function getWindowsHostIP() {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl', ['ip', 'route', 'show', 'default'], {
      stdio: 'pipe'
    });
    
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0 && output) {
        // Parse the output: "default via 172.30.240.1 dev eth0 proto kernel"
        // Extract the IP address (third field)
        const match = output.match(/default\s+via\s+(\d+\.\d+\.\d+\.\d+)/);
        if (match && match[1]) {
          const ip = match[1];
          console.log(`Windows host IP from WSL: ${ip}`);
          resolve(ip);
        } else {
          reject(new Error(`Failed to parse IP from output: ${output}`));
        }
      } else {
        reject(new Error('Failed to get Windows host IP'));
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
    
    setTimeout(() => {
      child.kill();
      reject(new Error('Timeout getting Windows host IP'));
    }, 5000);
  });
}

/**
 * Wait for socket file to exist in WSL
 * @param {string} socketPath - Path to socket file in WSL
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<boolean>} True if socket exists
 */
async function waitForSocketFile(socketPath, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const exists = await new Promise((resolve) => {
      const child = spawn('wsl', ['test', '-S', socketPath], { stdio: 'pipe' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
      setTimeout(() => {
        child.kill();
        resolve(false);
      }, 1000);
    });
    
    if (exists) {
      console.log(`✅ Socket file ready: ${socketPath}`);
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.warn(`⚠️ Socket file not ready after ${timeout}ms: ${socketPath}`);
  return false;
}

/**
 * Setup IPC handlers for running the ctrace binary with socket IPC
 */
function setupCtraceHandlers() {
  ipcMain.handle('run-ctrace', async (event, args = []) => {
    // Always use the Linux binary 'ctrace' (no .exe extension)
    // On Windows, this will be executed through WSL
    const binaryName = 'ctrace';
    const wslSocketPath = '/tmp/ctrace.sock'; // Socket path inside WSL
    let server = null;
    let socatProcess = null;
    let ctraceProcess = null;
    let tcpPort = null;
    
    // Clean up all resources on exit
    const cleanup = () => {
      try {
        console.log('Starting cleanup of IPC resources...');
        
        // Close TCP server
        if (server) {
          server.close();
          console.log('✅ TCP server closed');
        }
        
        // Kill socat bridge process
        if (socatProcess && !socatProcess.killed) {
          socatProcess.kill('SIGTERM');
          console.log('✅ socat bridge terminated');
        }
        
        // Kill ctrace process
        if (ctraceProcess && !ctraceProcess.killed) {
          ctraceProcess.kill('SIGTERM');
          console.log('✅ ctrace process terminated');
        }
        
        // Clean up socket file in WSL
        if (os.platform() === 'win32') {
          spawn('wsl', ['rm', '-f', wslSocketPath]);
          console.log(`✅ Removed WSL socket file: ${wslSocketPath}`);
        }
        
        console.log('✅ Cleanup completed successfully');
        console.log('----------------------------------------');
        console.log('🚀 ctrace IPC session has ended');
        console.log('----------------------------------------');
      } catch (error) {
        console.error('❌ Error during cleanup:', error);
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
      console.log(`📦 Packaged mode - looking for binary at: ${binPath}`);
      console.log(`📂 Resources path: ${process.resourcesPath}`);
    } else {
      // In development, binary is in the project bin directory
      // __dirname is .../src/main/ipc, so project root bin is ../../../bin/ctrace
      binPath = path.join(__dirname, '../../../bin', binaryName);
      console.log(`🔧 Development mode - looking for binary at: ${binPath}`);
      console.log(`📂 __dirname: ${__dirname}`);
    }

    async function resolveBinary() {
      try {
        await fs.access(binPath);
        console.log(`✅ Binary found at: ${binPath}`);
        return binPath;
      } catch (error) {
        console.error(`❌ Binary not found at ${binPath}:`, error.message);
        
        // Try to list the directory contents for debugging
        try {
          const dir = path.dirname(binPath);
          const files = await fs.readdir(dir);
          console.error(`📁 Directory contents of ${dir}:`, files);
        } catch (listError) {
          console.error(`❌ Could not list directory: ${listError.message}`);
        }
        
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
        
        // Additional debug info
        let debugInfo = `\n\nDebug Info:\n`;
        debugInfo += `- process.resourcesPath: ${process.resourcesPath || 'undefined'}\n`;
        debugInfo += `- __dirname: ${__dirname}\n`;
        debugInfo += `- Checked path: ${checkedPath}\n`;
        
        return { 
          success: false, 
          error: `ctrace binary not found at: ${checkedPath}${platformInfo}${debugInfo}` 
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

      return await new Promise(async (resolve, reject) => {
        console.log('Setting up TCP-based IPC bridge...');
        
        // On Windows, check and ensure socat is installed
        if (os.platform() === 'win32') {
          const socatAvailable = await ensureSocatInstalled();
          if (!socatAvailable) {
            cleanup();
            reject({ 
              success: false, 
              error: 'socat is required but not installed. Please install it in WSL: sudo apt-get install socat' 
            });
            return;
          }
        }
        
        // Create and configure the TCP server
        server = net.createServer((socket) => {
          let outputBuffer = '';
          
          socket.on('data', (data) => {
            const dataStr = data.toString();
            outputBuffer += dataStr;
            console.log('📥 Received data from ctrace:');
            console.log(dataStr);

            // Forward data to renderer as it comes in
            if (event && event.sender && !event.sender.isDestroyed()) {
              event.sender.send('ctrace-output', dataStr);
            }
          });
          
          socket.on('end', () => {
            console.log('📭 Connection closed by ctrace');
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
            console.error('❌ Socket error:', err);
            cleanup();
            reject({ success: false, error: `Socket error: ${err.message}` });
          });
        });
        
        // Handle server errors
        server.on('error', (err) => {
          console.error('❌ Server error:', err);
          cleanup();
          reject({ success: false, error: `Server error: ${err.message}` });
        });
        
        // Start listening on TCP with random port
        server.listen(0, '0.0.0.0', async () => {
          tcpPort = server.address().port;
          console.log(`🌐 TCP server listening on 0.0.0.0:${tcpPort}`);
          
          try {
            // Prepare command and arguments
            let command, commandArgs;
            const binaryArgs = ['--ipc', 'socket', '--ipc-path', wslSocketPath, ...(Array.isArray(args) ? args : [])];
            
            if (os.platform() === 'win32') {
              // On Windows, use WSL with socat bridge
              console.log('🪟 Windows detected, setting up socat bridge...');
              
              // Get Windows host IP from WSL perspective
              const windowsHostIP = await getWindowsHostIP();
              console.log(`🔗 Windows host IP: ${windowsHostIP}`);
              
              // Step 1: Start socat bridge
              const socatCommand = `rm -f ${wslSocketPath}; socat UNIX-LISTEN:${wslSocketPath},fork,reuseaddr TCP:${windowsHostIP}:${tcpPort}`;
              console.log(`🌉 Starting socat bridge: ${socatCommand}`);
              
              socatProcess = spawn('wsl', ['bash', '-c', socatCommand], {
                stdio: ['ignore', 'pipe', 'pipe']
              });
              
              socatProcess.stdout.on('data', (data) => {
                console.log(`[socat] ${data.toString().trim()}`);
              });
              
              socatProcess.stderr.on('data', (data) => {
                console.error(`[socat error] ${data.toString().trim()}`);
              });
              
              socatProcess.on('error', (err) => {
                console.error('❌ Error spawning socat:', err);
                cleanup();
                reject({ success: false, error: `Failed to start socat bridge: ${err.message}` });
              });
              
              socatProcess.on('exit', (code, signal) => {
                console.log(`⚠️ socat bridge exited with code ${code} and signal ${signal}`);
              });
              
              // Step 2: Wait for socket file to be ready
              console.log(`⏳ Waiting for socket file to be ready...`);
              const socketReady = await waitForSocketFile(wslSocketPath, 5000);
              
              if (!socketReady) {
                cleanup();
                reject({ 
                  success: false, 
                  error: 'Socket file not ready after timeout. socat bridge may have failed.' 
                });
                return;
              }
              
              // Step 3: Start ctrace binary
              const wslPath = resolvedBinPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => 
                `/mnt/${drive.toLowerCase()}`);
              
              command = 'wsl';
              commandArgs = [wslPath, ...binaryArgs];
              console.log('🚀 Starting ctrace:', command, commandArgs);
            } else {
              // On Linux/Mac, use the binary directly (legacy path, not using TCP bridge)
              command = resolvedBinPath;
              commandArgs = binaryArgs;
              console.log('🐧 Direct execution:', command, commandArgs);
            }
            
            // Set up ctrace process
            ctraceProcess = spawn(command, commandArgs, {
              stdio: ['ignore', 'pipe', 'pipe']
            });
            
            // Handle process output (for logging)
            ctraceProcess.stdout.on('data', (data) => {
              console.log(`[ctrace stdout] ${data.toString().trim()}`);
            });
            
            ctraceProcess.stderr.on('data', (data) => {
              console.error(`[ctrace stderr] ${data.toString().trim()}`);
            });
            
            ctraceProcess.on('error', (err) => {
              console.error('❌ Error spawning ctrace:', err);
              cleanup();
              reject({ success: false, error: `Failed to start ctrace: ${err.message}` });
            });
            
            ctraceProcess.on('exit', (code, signal) => {
              console.log(`ctrace exited with code ${code} and signal ${signal}`);
              if (code !== 0 && code !== null) {
                cleanup();
                reject({ 
                  success: false, 
                  error: `ctrace exited with code ${code}` 
                });
              }
            });
          } catch (error) {
            console.error('❌ Error in bridge setup:', error);
            cleanup();
            reject({ success: false, error: error.message });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupCtraceHandlers };
