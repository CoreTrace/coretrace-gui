const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const net = require('net');
const { v4: uuidv4 } = require('uuid');

// ==========================================
// HELPER FUNCTIONS (Windows/WSL Specific)
// ==========================================

async function ensureSocatInstalled() {
  return new Promise((resolve) => {
    const checkChild = spawn('wsl', ['which', 'socat'], { stdio: 'pipe' });
    checkChild.on('close', (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }
      console.log('📦 socat not found in WSL, attempting to install...');
      const installChild = spawn('wsl', ['--user', 'root', 'bash', '-c', 'apt-get update -qq && apt-get install -y socat'], { stdio: 'inherit' });
      installChild.on('close', (installCode) => resolve(installCode === 0));
      installChild.on('error', () => resolve(false));
    });
    checkChild.on('error', () => resolve(false));
  });
}

async function checkWSLAvailability() {
  return new Promise((resolve) => {
    const statusChild = spawn('wsl', ['--status'], { stdio: 'pipe' });
    let output = '';
    
    statusChild.stdout.on('data', d => output += d.toString());
    statusChild.on('error', () => resolve({ available: false, hasDistros: false, error: 'WSL not installed' }));
    
    statusChild.on('close', (code) => {
      if (code !== 0) return resolve({ available: false, hasDistros: false });
      
      const listChild = spawn('wsl', ['--list', '--quiet'], { stdio: 'pipe' });
      let listOut = '';
      listChild.stdout.on('data', d => listOut += d.toString('utf16le').replace(/\x00/g, ''));
      
      listChild.on('close', () => {
        const hasDistros = listOut.trim().length > 0 && !listOut.includes('no installed distributions');
        resolve({ available: true, hasDistros });
      });
      listChild.on('error', () => resolve({ available: true, hasDistros: false }));
    });
  });
}

async function getWindowsHostIP() {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl', ['ip', 'route', 'show', 'default'], { stdio: 'pipe' });
    let output = '';
    child.stdout.on('data', d => output += d.toString());
    child.on('close', (code) => {
      const match = output.match(/default\s+via\s+(\d+\.\d+\.\d+\.\d+)/);
      if (code === 0 && match && match[1]) resolve(match[1]);
      else reject(new Error('Could not determine Host IP from WSL'));
    });
  });
}

async function waitForSocketFile(socketPath, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const exists = await new Promise(r => {
      const c = spawn('wsl', ['test', '-S', socketPath]);
      c.on('close', code => r(code === 0));
    });
    if (exists) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

// ==========================================
// MAIN HANDLER
// ==========================================

function setupCtraceHandlers() {
  ipcMain.handle('run-ctrace', async (event, args = []) => {
    const binaryName = 'ctrace';
    let server = null;
    let processes = []; // Track processes to kill on cleanup

    // 1. Resolve Binary Path
    let binPath;
    if (process.resourcesPath) {
      binPath = path.join(process.resourcesPath, 'bin', binaryName);
    } else {
      binPath = path.join(__dirname, '../../../bin', binaryName);
    }

    // Check if binary exists (Critical for both platforms)
    try {
      await fs.access(binPath);
    } catch (e) {
        // Fallback check logic for logging
        const checkedPath = process.resourcesPath ? path.join(process.resourcesPath, 'bin', binaryName) : path.join(__dirname, '../../../bin', binaryName);
        return { success: false, error: `Binary not found at: ${checkedPath}` };
    }

    // ==========================================
    // CLEANUP ROUTINE
    // ==========================================
    const cleanup = () => {
      console.log('🧹 Cleaning up resources...');
      
      // Close Server
      if (server) server.close();
      
      // Kill Processes
      processes.forEach(p => {
        if (p && !p.killed) p.kill('SIGTERM');
      });

      // Platform specific cleanup
      if (os.platform() === 'win32') {
         spawn('wsl', ['rm', '-f', '/tmp/ctrace.sock']);
      } else {
         // Linux: Clean up the local socket file if it exists
         // The path is defined in the Linux block, we can't easily access it here
         // unless we scope it higher, but usually server.close() handles unlinking 
         // on Linux if net.createServer was used with a path. 
         // If not, we rely on os.tmpdir() auto-cleaning eventually.
      }
    };

    process.on('exit', cleanup);

    // ==========================================
    // WINDOWS EXECUTION PATH (WSL + TCP Bridge)
    // ==========================================
    if (os.platform() === 'win32') {
      console.log('🪟 Windows detected. Initializing WSL bridge...');
      
      // 1. Check WSL
      const wslStatus = await checkWSLAvailability();
      if (!wslStatus.available || !wslStatus.hasDistros) {
        return { success: false, error: 'WSL is not installed or has no distributions.' };
      }

      // 2. Check Socat
      if (!(await ensureSocatInstalled())) {
        return { success: false, error: 'Failed to install socat in WSL.' };
      }

      return new Promise(async (resolve, reject) => {
        const wslSocketPath = '/tmp/ctrace.sock'; // Fixed path inside WSL

        // 3. Start TCP Server
        server = net.createServer((socket) => {
          let outputBuffer = '';
          socket.on('data', (data) => {
             const str = data.toString();
             outputBuffer += str;
             if (event?.sender) event.sender.send('ctrace-output', str);
          });
          socket.on('end', () => {
            if (event?.sender) event.sender.send('ctrace-complete', { success: true, output: outputBuffer });
            cleanup();
            resolve({ success: true, output: outputBuffer });
          });
        });

        server.listen(0, '0.0.0.0', async () => {
          const tcpPort = server.address().port;
          console.log(`TCP Bridge listening on port ${tcpPort}`);

          try {
            const hostIP = await getWindowsHostIP();
            
            // 4. Start Socat Bridge in WSL
            const socatCmd = `rm -f ${wslSocketPath}; socat UNIX-LISTEN:${wslSocketPath},fork,reuseaddr TCP:${hostIP}:${tcpPort}`;
            const socatProc = spawn('wsl', ['bash', '-c', socatCmd]);
            processes.push(socatProc);

            // 5. Wait for Socket
            if (!(await waitForSocketFile(wslSocketPath))) {
              cleanup();
              reject({ success: false, error: 'Timeout waiting for WSL socket.' });
              return;
            }

            // 6. Run Binary via WSL
            const wslBinPath = binPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (m, d) => `/mnt/${d.toLowerCase()}`);
            const argsList = [wslBinPath, '--ipc', 'socket', '--ipc-path', wslSocketPath, ...args];
            
            console.log('Running:', 'wsl', argsList);
            const child = spawn('wsl', argsList);
            processes.push(child);

            // Basic error handling for binary
            child.on('error', (err) => {
                cleanup();
                reject({ success: false, error: err.message });
            });
          } catch (err) {
            cleanup();
            reject({ success: false, error: err.message });
          }
        });
      });
    } 
    
    // ==========================================
    // LINUX / MACOS EXECUTION PATH (Direct Socket)
    // ==========================================
    else {
      console.log('🐧 Linux/Mac detected. Using direct socket IPC.');
      
      return new Promise((resolve, reject) => {
        // 1. Create unique socket path
        const socketPath = path.join(os.tmpdir(), `ctrace-${uuidv4()}.sock`);
        
        // 2. Start Unix Socket Server
        server = net.createServer((socket) => {
          let outputBuffer = '';
          socket.on('data', (data) => {
            const str = data.toString();
            outputBuffer += str;
            if (event?.sender) event.sender.send('ctrace-output', str);
          });
          socket.on('end', () => {
            if (event?.sender) event.sender.send('ctrace-complete', { success: true, output: outputBuffer });
            cleanup();
            // Try to unlink socket file specifically for Linux
            try { fsSync.unlinkSync(socketPath); } catch(e) {}
            resolve({ success: true, output: outputBuffer });
          });
        });

        server.listen(socketPath, () => {
          console.log(`Listening on Unix socket: ${socketPath}`);
          
          // 3. Run Binary Directly
          const binaryArgs = ['--ipc', 'socket', '--ipc-path', socketPath, ...args];
          console.log('Running:', binPath, binaryArgs);
          
          const child = spawn(binPath, binaryArgs);
          processes.push(child);

          child.on('error', (err) => {
            cleanup();
            reject({ success: false, error: `Failed to start binary: ${err.message}` });
          });

          child.stderr.on('data', d => console.error(`[ctrace stderr]: ${d}`));
        });
        
        server.on('error', (err) => {
            cleanup();
            reject({ success: false, error: `Server error: ${err.message}` });
        });
      });
    }
  });
}

module.exports = { setupCtraceHandlers };