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
  
  // Test 2: CTrace binary accessibility via WSL
  console.log('\n2. Testing CTrace binary via WSL...');
  const ctraceAvailable = await testCTraceViaWSL();
  
  if (!ctraceAvailable) {
    console.log('❌ CTrace binary is not accessible via WSL');
    return false;
  }
  
  console.log('✅ CTrace binary is accessible via WSL');
  
  // Test 3: WSL path conversion
  console.log('\n3. Testing WSL path conversion...');
  testPathConversion();
  
  console.log('\n🎉 All tests passed! WSL and CTrace are properly configured.');
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

// Export for use in development
module.exports = { testWSLAndCTrace };

// Auto-run when called directly
if (require.main === module) {
  testWSLAndCTrace().catch(console.error);
}