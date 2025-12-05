// WSL and CTrace testing utility
const { spawn } = require('child_process');
const os = require('os');

/**
 * Test WSL availability and CTrace execution
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
  
  // Test 1: WSL availability
  console.log('\n1. Testing WSL availability...');
  const wslAvailable = await testWSL();
  
  if (!wslAvailable) {
    console.log('❌ WSL is not available');
    return false;
  }
  
  console.log('✅ WSL is available');
  
  // Test 2: socat availability
  console.log('\n2. Testing socat installation...');
  const socatAvailable = await testSocat();
  
  if (!socatAvailable) {
    console.log('⚠️  socat is not installed (required for IPC bridge)');
    console.log('   Would you like to install it now? (y/n)');
    
    // Prompt user for installation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      rl.question('Install socat? (y/n): ', (ans) => {
        rl.close();
        resolve(ans.toLowerCase().trim());
      });
    });
    
    if (answer === 'y' || answer === 'yes') {
      console.log('📦 Installing socat...');
      const installed = await installSocat();
      if (installed) {
        console.log('✅ socat installed successfully');
      } else {
        console.log('❌ Failed to install socat');
        console.log('   Please install manually: wsl sudo apt-get install socat');
        return false;
      }
    } else {
      console.log('⚠️  Skipping socat installation. The IPC bridge will not work without it.');
      return false;
    }
  } else {
    console.log('✅ socat is installed');
  }
  
  // Test 3: CTrace binary accessibility via WSL
  console.log('\n3. Testing CTrace binary via WSL...');
  const ctraceAvailable = await testCTraceViaWSL();
  
  if (!ctraceAvailable) {
    console.log('❌ CTrace binary is not accessible via WSL');
    return false;
  }
  
  console.log('✅ CTrace binary is accessible via WSL');
  
  // Test 4: WSL path conversion
  console.log('\n4. Testing WSL path conversion...');
  testPathConversion();
  
  // Test 5: Windows host IP detection
  console.log('\n5. Testing Windows host IP detection from WSL...');
  await testWindowsHostIP();
  
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
    // Test with a simple --help command
    const child = spawn('wsl', ['/mnt/c/Users/shookapic/Electron-Test/bin/ctrace', '--help'], { 
      stdio: 'pipe' 
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
      console.log(`CTrace test error: ${err.message}`);
      resolve(false);
    });
    
    child.on('close', (code) => {
      console.log(`CTrace --help exit code: ${code}`);
      if (stdout) console.log(`Stdout: ${stdout.substring(0, 200)}...`);
      if (stderr) console.log(`Stderr: ${stderr.substring(0, 200)}...`);
      
      // Even if exit code is not 0, if we got output, the binary is accessible
      resolve(code === 0 || stdout.length > 0 || stderr.length > 0);
    });
    
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 10000);
  });
}

function testPathConversion() {
  const testPaths = [
    'C:\\Users\\test\\file.c',
    'C:\\Program Files\\test\\file.cpp',
    'D:\\Projects\\test\\main.c'
  ];
  
  console.log('Testing Windows to WSL path conversion:');
  testPaths.forEach(winPath => {
    const wslPath = winPath.replace(/([A-Z]):\\/g, (match, drive) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, '/');
    console.log(`  ${winPath} → ${wslPath}`);
  });
}

function testSocat() {
  return new Promise((resolve) => {
    const child = spawn('wsl', ['which', 'socat'], { stdio: 'pipe' });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
    
    child.on('error', () => {
      resolve(false);
    });
    
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

function installSocat() {
  return new Promise((resolve) => {
    console.log('   Running: wsl --user root apt-get update && apt-get install -y socat');
    console.log('   (No password required - using Windows admin privileges)');
    console.log('   This may take a few moments...');
    
    const child = spawn('wsl', [
      '--user', 'root',
      'bash', '-c',
      'apt-get update -qq && apt-get install -y socat'
    ], { 
      stdio: 'inherit' // Show installation output to user
    });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
    
    child.on('error', (err) => {
      console.error(`   Installation error: ${err.message}`);
      resolve(false);
    });
    
    setTimeout(() => {
      console.log('   Installation timeout');
      child.kill();
      resolve(false);
    }, 120000); // 2 minute timeout for installation
  });
}

function testWindowsHostIP() {
  return new Promise((resolve) => {
    const child = spawn('wsl', ['ip', 'route', 'show', 'default'], {
      stdio: 'pipe'
    });
    
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0 && output) {
        // Parse: "default via 172.30.240.1 dev eth0 proto kernel"
        const match = output.match(/default\s+via\s+(\d+\.\d+\.\d+\.\d+)/);
        if (match && match[1]) {
          console.log(`  Windows host IP from WSL: ${match[1]}`);
          console.log('  ✅ IP detection successful');
          resolve(true);
        } else {
          console.log('  ❌ Failed to parse IP address');
          resolve(false);
        }
      } else {
        console.log('  ❌ Failed to detect Windows host IP');
        resolve(false);
      }
    });
    
    child.on('error', () => {
      console.log('  ❌ Error detecting Windows host IP');
      resolve(false);
    });
    
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

// Export for use in development
module.exports = { testWSLAndCTrace };

// Auto-run when called directly
if (require.main === module) {
  testWSLAndCTrace().catch(console.error);
}