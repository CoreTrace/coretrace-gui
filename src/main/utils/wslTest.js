// WSL and CTrace testing utility (serve-mode)
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs/promises');

const { resolveBinaryPath } = require('./ctraceServeClient');

function toWslPath(winPath) {
  return winPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (m, d) => `/mnt/${d.toLowerCase()}`);
}

/**
 * Test WSL availability and CTrace execution.
 *
 * Note: SOCAT is no longer required. The GUI now starts CTrace in `--ipc serve` mode.
 */
async function testWSLAndCTrace() {
  console.log('🧪 Testing WSL and CTrace Setup');
  console.log('================================');

  const platform = os.platform();
  console.log(`Platform: ${platform}`);

  if (platform !== 'win32') {
    console.log('✅ Not on Windows, WSL test not needed');
    return true;
  }

  console.log('\n1. Testing WSL availability...');
  const wslAvailable = await testWSL();
  if (!wslAvailable) {
    console.log('❌ WSL is not available');
    return false;
  }
  console.log('✅ WSL is available');

  console.log('\n2. Testing CTrace binary via WSL...');
  const ctraceAvailable = await testCTraceViaWSL();
  if (!ctraceAvailable) {
    console.log('❌ CTrace binary is not accessible via WSL');
    return false;
  }
  console.log('✅ CTrace binary is accessible via WSL');

  console.log('\n🎉 All critical tests passed! WSL and CTrace are properly configured.');
  return true;
}

function testWSL() {
  return new Promise((resolve) => {
    const child = spawn('wsl', ['--status'], { stdio: 'pipe' });

    child.on('error', (err) => {
      console.log(`WSL test error: ${err.message}`);
      resolve(false);
    });

    child.on('close', (code) => {
      console.log(`WSL status exit code: ${code}`);
      resolve(code === 0);
    });

    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

function testCTraceViaWSL() {
  return new Promise((resolve) => {
    (async () => {
      try {
        const binPath = resolveBinaryPath();
        await fs.access(binPath);

        const wslBinPath = toWslPath(binPath);
        const child = spawn('wsl', [wslBinPath, '--help'], { stdio: 'pipe' });

        let stdout = '';
        let stderr = '';
        let resolved = false;

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          console.log(`CTrace test error: ${err.message}`);
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        });

        child.on('close', (code) => {
          console.log(`CTrace --help exit code: ${code}`);
          if (stdout) console.log(`Stdout: ${stdout.substring(0, 200)}...`);
          if (stderr) console.log(`Stderr: ${stderr.substring(0, 200)}...`);
          if (!resolved) {
            resolved = true;
            resolve(code === 0 || stdout.length > 0 || stderr.length > 0);
          }
        });

        setTimeout(() => {
          child.kill();
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }, 5000);
      } catch (e) {
        console.log(`CTrace binary not accessible: ${e.message}`);
        resolve(false);
      }
    })();
  });
}

module.exports = { testWSLAndCTrace };

if (require.main === module) {
  testWSLAndCTrace().catch(console.error);
}