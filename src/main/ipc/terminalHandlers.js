/**
 * Terminal IPC handlers - spawns shell commands with PTY support for interactive commands.
 * Uses node-pty to provide pseudo-terminal for sudo, password prompts, etc.
 */

const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const pty = require('node-pty');

// terminalId -> currently running child process (one at a time per terminal)
const runningProcesses = new Map();

function getAvailableShells() {
  const platform = os.platform();
  const shells = [];

  if (platform === 'win32') {
    shells.push({ id: 'powershell', name: 'PowerShell', icon: 'ps' });
    shells.push({ id: 'cmd', name: 'Command Prompt', icon: 'cmd' });

    // PowerShell Core (pwsh)
    try {
      const { execSync } = require('child_process');
      execSync('pwsh --version', { stdio: 'ignore', timeout: 2000, windowsHide: true });
      shells.push({ id: 'pwsh', name: 'PowerShell Core', icon: 'ps' });
    } catch {}

    // Git Bash
    const gitBashCandidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe'),
    ];
    for (const p of gitBashCandidates) {
      try {
        if (fs.existsSync(p)) {
          shells.push({ id: 'gitbash', name: 'Git Bash', path: p, icon: 'bash' });
          break;
        }
      } catch {}
    }

    // WSL
    try {
      const { execSync } = require('child_process');
      execSync('wsl --list --quiet', { stdio: 'ignore', timeout: 3000, windowsHide: true });
      shells.push({ id: 'wsl', name: 'WSL', icon: 'bash' });
    } catch {}

  } else if (platform === 'darwin') {
    shells.push({ id: 'zsh', name: 'zsh', icon: 'bash' });
    shells.push({ id: 'bash', name: 'bash', icon: 'bash' });
  } else {
    shells.push({ id: 'bash', name: 'bash', icon: 'bash' });
    if (fs.existsSync('/bin/zsh')) shells.push({ id: 'zsh', name: 'zsh', icon: 'bash' });
    if (fs.existsSync('/usr/bin/fish')) shells.push({ id: 'fish', name: 'fish', icon: 'bash' });
  }

  return shells;
}

function buildSpawnArgs(shellId, command, cwd, shellPath) {
  const platform = os.platform();

  if (platform === 'win32') {
    switch (shellId) {
      case 'powershell':
        return {
          cmd: 'powershell.exe',
          args: [
            '-NoLogo', '-NonInteractive',
            '-Command',
            `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${command}`,
          ],
          cwd: os.homedir(),
        };
      case 'pwsh':
        return {
          cmd: 'pwsh.exe',
          args: [
            '-NoLogo', '-NonInteractive',
            '-Command',
            `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${command}`,
          ],
          cwd: os.homedir(),
        };
      case 'cmd':
        return { cmd: 'cmd.exe', args: ['/C', command], cwd };
      case 'gitbash':
        return {
          cmd: shellPath || 'C:\\Program Files\\Git\\bin\\bash.exe',
          args: ['-c', command],
          cwd,
        };
      case 'wsl':
        return { cmd: 'wsl.exe', args: ['-e', 'bash', '-c', command], cwd: null };
      default:
        return { cmd: 'cmd.exe', args: ['/C', command], cwd };
    }
  } else {
    const bin =
      shellId === 'zsh' ? '/bin/zsh' :
      shellId === 'fish' ? '/usr/bin/fish' :
      '/bin/bash';
    return { cmd: bin, args: ['-c', command], cwd };
  }
}

function setupTerminalHandlers(mainWindow) {
  ipcMain.handle('terminal-get-shells', () => getAvailableShells());

  ipcMain.handle('terminal-execute', async (event, { terminalId, shellId, shellPath, command, cwd }) => {
    // Kill any previously running command in this terminal
    const prev = runningProcesses.get(terminalId);
    if (prev) {
      try { killProcess(prev); } catch {}
      runningProcesses.delete(terminalId);
    }

    const built = buildSpawnArgs(shellId, command, cwd || os.homedir(), shellPath);

    return new Promise((resolve) => {
      let proc;
      try {
        // Use node-pty for interactive command support (sudo, password prompts, etc.)
        proc = pty.spawn(built.cmd, built.args, {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: built.cwd !== undefined ? built.cwd : (cwd || os.homedir()),
          env: { ...process.env, TERM: 'xterm-color' },
        });
      } catch (err) {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-data', {
            terminalId,
            data: `\u001b[31mFailed to start: ${err.message}\u001b[0m\r\n`,
          });
          mainWindow.webContents.send('terminal-command-done', { terminalId, code: 1 });
        }
        resolve({ error: err.message });
        return;
      }

      runningProcesses.set(terminalId, proc);

      proc.onData((data) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-data', { terminalId, data: data.toString() });
        }
      });

      proc.onExit(({ exitCode }) => {
        runningProcesses.delete(terminalId);
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-command-done', { terminalId, code: exitCode });
        }
        resolve({ code: exitCode });
      });
    });
  });

  ipcMain.handle('terminal-kill-current', (event, terminalId) => {
    const proc = runningProcesses.get(terminalId);
    if (proc) {
      try {
        // node-pty process has a kill() method
        if (typeof proc.kill === 'function') {
          proc.kill();
        } else {
          killProcess(proc);
        }
      } catch {}
      runningProcesses.delete(terminalId);
    }
  });

  ipcMain.handle('terminal-send-input', (event, { terminalId, input }) => {
    const proc = runningProcesses.get(terminalId);
    if (proc) {
      // node-pty uses write() method directly
      proc.write(input + '\n');
    }
  });

  ipcMain.handle('terminal-get-home', () => {
    // On Windows, return the home directory
    // On Linux/Mac, return home directory
    const home = os.homedir();
    return home;
  });

  ipcMain.handle('terminal-get-initial-cwd', () => {
    // Return app's current working directory
    return process.cwd();
  });

  ipcMain.handle('terminal-get-completions', async (event, { cwd, partial }) => {
    const path = require('path');
    const fs = require('fs');

    // Parse the partial input to extract what we're completing
    const trimmed = partial.trim();
    const lastSpace = trimmed.lastIndexOf(' ');
    const word = lastSpace === -1 ? trimmed : trimmed.substring(lastSpace + 1);

    const completions = [];

    // If word is empty, suggest files in cwd
    if (!word) {
      try {
        const files = fs.readdirSync(cwd, { withFileTypes: true });
        for (const f of files.slice(0, 30)) {
          completions.push({
            label: f.isDirectory() ? f.name + '/' : f.name,
            value: f.name + (f.isDirectory() ? '/' : ''),
            isDir: f.isDirectory(),
          });
        }
      } catch {}
      return completions.sort((a, b) => a.label.localeCompare(b.label));
    }

    // If word looks like a path (contains / or \)
    if (word.includes('/') || word.includes('\\')) {
      const sep = word.includes('\\') ? '\\' : '/';
      const lastSep = word.lastIndexOf(sep);
      const dir = lastSep === -1 ? cwd : path.resolve(cwd, word.substring(0, lastSep));
      const prefix = lastSep === -1 ? word : word.substring(lastSep + 1);

      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const f of files) {
          if (f.name.toLowerCase().startsWith(prefix.toLowerCase())) {
            const fullPath = word.substring(0, lastSep + 1) + f.name;
            completions.push({
              label: f.isDirectory() ? fullPath + '/' : fullPath,
              value: fullPath + (f.isDirectory() ? '/' : ''),
              isDir: f.isDirectory(),
            });
          }
        }
      } catch {}
      return completions.sort((a, b) => a.label.localeCompare(b.label));
    }

    // Otherwise, suggest matching files/executables in cwd
    try {
      const files = fs.readdirSync(cwd, { withFileTypes: true });
      for (const f of files) {
        if (f.name.toLowerCase().startsWith(word.toLowerCase())) {
          completions.push({
            label: f.isDirectory() ? f.name + '/' : f.name,
            value: f.name + (f.isDirectory() ? '/' : ''),
            isDir: f.isDirectory(),
          });
        }
      }
    } catch {}

    // Add some common commands if word starts with a letter and no matches yet
    if (completions.length === 0 && /^[a-z]/i.test(word)) {
      const commonCmds = [
        'cd', 'ls', 'pwd', 'echo', 'cat', 'mkdir', 'rm', 'cp', 'mv', 'touch',
        'git', 'npm', 'node', 'python', 'pip', 'docker', 'curl', 'wget',
      ];
      for (const cmd of commonCmds) {
        if (cmd.startsWith(word.toLowerCase())) {
          completions.push({ label: cmd, value: cmd, isDir: false });
        }
      }
    }

    return completions.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 20);
  });
}

function killProcess(proc) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { windowsHide: true });
  } else {
    proc.kill('SIGTERM');
  }
}

function cleanupTerminals() {
  for (const proc of runningProcesses.values()) {
    try {
      if (typeof proc.kill === 'function') {
        proc.kill();
      } else {
        killProcess(proc);
      }
    } catch {}
  }
  runningProcesses.clear();
}

module.exports = { setupTerminalHandlers, cleanupTerminals };
