const { spawn } = require('child_process');
const crypto = require('crypto');
const fsSync = require('fs');
const fs = require('fs/promises');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const DEBUG_BACKEND_REQUESTS = process.env.CTRACE_GUI_DEBUG_BACKEND === '1' || process.env.NODE_ENV === 'development';

/**
 * @typedef {Object} CtraceServerInfo
 * @property {string} host
 * @property {number} port
 * @property {string} token
 */

let serverProc = null;
/** @type {CtraceServerInfo|null} */
let serverInfo = null;
let startingPromise = null;

let requestIdSeq = 0;

/**
 * Captured outputs from the server process.
 * We use this to surface diagnostics that the server prints to stdout
 * but does not always include in the HTTP response (e.g. some tool outputs).
 */
const captured = {
  /** @type {Array<{ ts: number, json: any }>} */
  json: [],
  /** @type {Array<{ ts: number, stream: 'stdout'|'stderr', text: string }>} */
  text: []
};

let parseBuffer = '';

// Upper bound for buffered, not-yet-parsed backend output. Anything beyond it
// is discarded from the front so a chatty or broken backend cannot grow memory
// without limit.
const PARSE_BUFFER_MAX_CHARS = 4 * 1024 * 1024;

function trimCaptured(maxAgeMs = 5 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  captured.json = captured.json.filter(m => m.ts >= cutoff);
  captured.text = captured.text.filter(m => m.ts >= cutoff);
}

function tryExtractJsonMessagesFromBuffer() {
  // Streaming JSON extraction using brace/bracket balancing with string handling.
  // This is intentionally tolerant; malformed chunks are ignored.
  const messages = [];
  let i = 0;

  while (i < parseBuffer.length) {
    // Find start of a JSON value.
    const startObj = parseBuffer.indexOf('{', i);
    const startArr = parseBuffer.indexOf('[', i);
    let start;
    let opening;

    if (startObj === -1 && startArr === -1) break;
    if (startObj === -1) {
      start = startArr;
      opening = '[';
    } else if (startArr === -1) {
      start = startObj;
      opening = '{';
    } else if (startObj < startArr) {
      start = startObj;
      opening = '{';
    } else {
      start = startArr;
      opening = '[';
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let j = start; j < parseBuffer.length; j++) {
      const ch = parseBuffer[j];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{' || ch === '[') {
        depth++;
        continue;
      }
      if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }

    if (end === -1) {
      // Need more data.
      break;
    }

    const candidate = parseBuffer.slice(start, end);
    try {
      const parsed = JSON.parse(candidate);
      messages.push(parsed);
      // Remove everything up to end to avoid quadratic scans.
      parseBuffer = parseBuffer.slice(end);
      i = 0;
    } catch (_) {
      // If it looked like JSON but didn't parse, advance one char.
      i = start + 1;
    }
  }

  return messages;
}

function captureChunk(chunk, stream) {
  const ts = Date.now();
  const text = String(chunk || '');

  // Keep raw text (for tool execution failures, missing files, etc.)
  if (text.trim()) {
    captured.text.push({ ts, stream, text });
  }

  // Feed JSON extractor.
  parseBuffer += text;
  if (parseBuffer.length > PARSE_BUFFER_MAX_CHARS) {
    parseBuffer = parseBuffer.slice(parseBuffer.length - PARSE_BUFFER_MAX_CHARS);
  }
  const msgs = tryExtractJsonMessagesFromBuffer();
  for (const m of msgs) {
    captured.json.push({ ts: Date.now(), json: m });
  }

  trimCaptured();
}

function getCapturedSince(ts) {
  trimCaptured();
  return {
    json: captured.json.filter(m => m.ts >= ts).map(m => m.json),
    text: captured.text.filter(m => m.ts >= ts).map(m => m.text)
  };
}

async function waitForCapturedJson(predicate, { sinceTs, timeoutMs = 30000, pollMs = 200 } = {}) {
  const start = Date.now();
  const since = sinceTs ?? start;

  while (Date.now() - start < timeoutMs) {
    const { json } = getCapturedSince(since);
    const found = json.find(predicate);
    if (found) return found;
    await new Promise(r => setTimeout(r, pollMs));
  }
  return null;
}

/**
 * Binary file names to look for, most specific first. macOS needs a native
 * Mach-O build: the `ctrace` shipped in extraResources is a Linux ELF, so an
 * arch-suffixed name is preferred there and the plain name is only a fallback.
 * @returns {string[]}
 */
function binaryNameCandidates() {
  if (os.platform() === 'darwin') {
    return [`ctrace-darwin-${process.arch}`, 'ctrace-darwin', 'ctrace'];
  }
  return ['ctrace'];
}

/**
 * Directories that may hold the binary, in priority order: the user-managed
 * copy first (that is where the backend updater writes), then the packaged
 * resources, then the development checkout.
 * @returns {string[]}
 */
function binaryDirCandidates() {
  const dirs = [];

  try {
    const electronModule = require('electron');
    const electronApp = electronModule && electronModule.app;
    if (electronApp && typeof electronApp.getPath === 'function') {
      dirs.push(path.join(electronApp.getPath('userData'), 'bin'));
    }
  } catch (_) {
    // Ignore; fallback to packaged/development binary path.
  }

  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, 'bin'));
  }

  dirs.push(path.join(__dirname, '../../../bin'));

  return dirs;
}

function resolveBinaryPath() {
  const dirs = binaryDirCandidates();
  const names = binaryNameCandidates();

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  // Nothing exists yet: return the packaged path with the default name so the
  // caller's "not found" message points at the location we actually expect.
  return path.join(dirs[dirs.length - 1], 'ctrace');
}

/**
 * Check that a binary matches the executable format of the host OS. Only macOS
 * is checked, because that is the platform where a Linux ELF can end up
 * bundled: running it there fails with an opaque "cannot execute binary file".
 *
 * @param {string} binPath
 * @returns {{ ok: boolean, error?: string }}
 */
function checkBinaryFormat(binPath) {
  if (os.platform() !== 'darwin') return { ok: true };

  let header;
  try {
    const fd = fsSync.openSync(binPath, 'r');
    try {
      header = Buffer.alloc(4);
      fsSync.readSync(fd, header, 0, 4, 0);
    } finally {
      fsSync.closeSync(fd);
    }
  } catch (e) {
    return { ok: false, error: `Cannot read the ctrace binary at ${binPath}: ${e.message}` };
  }

  // 0x7f 'E' 'L' 'F' — a Linux binary, which macOS cannot load.
  if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) {
    return {
      ok: false,
      error:
        'The bundled ctrace binary is a Linux executable and cannot run on macOS. ' +
        'Build or download a macOS (Mach-O) ctrace, then select it from File > Backend Settings, ' +
        `or place it next to the bundled one as "ctrace-darwin-${process.arch}".`
    };
  }

  return { ok: true };
}

function toWslPath(winPath) {
  return winPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (m, d) => `/mnt/${d.toLowerCase()}`);
}

function createShutdownToken() {
  return crypto.randomBytes(32).toString('hex');
}

function waitForPortOpen({ host, port, timeoutMs = 15000 }) {
  const start = Date.now();

  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = net.connect({ host, port });

      const onDone = (ok) => {
        socket.removeAllListeners();
        try { socket.destroy(); } catch (_) {}
        resolve(ok);
      };

      socket.once('connect', () => onDone(true));
      socket.once('error', () => {
        if (Date.now() - start >= timeoutMs) return onDone(false);
        setTimeout(tryOnce, 150);
      });

      socket.setTimeout(1000, () => {
        try { socket.destroy(); } catch (_) {}
        if (Date.now() - start >= timeoutMs) return resolve(false);
        setTimeout(tryOnce, 150);
      });
    };

    tryOnce();
  });
}

function findAvailablePort(preferredPort = DEFAULT_PORT) {
  // First try preferred port. If it's busy, fallback to an ephemeral port.
  const tryPort = (port) => new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(null));
    tester.once('listening', () => {
      const actualPort = tester.address().port;
      tester.close(() => resolve(actualPort));
    });
    tester.listen(port, DEFAULT_HOST);
  });

  return (async () => {
    const preferred = await tryPort(preferredPort);
    if (preferred) return preferred;
    const ephemeral = await tryPort(0);
    return ephemeral || preferredPort;
  })();
}

function httpPostJson(url, { headers = {}, body, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const payload = body == null ? '' : JSON.stringify(body);

    const req = http.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: data });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

async function ensureServerRunning(options = {}) {
  if (serverProc && serverInfo) return serverInfo;
  if (startingPromise) return startingPromise;

  startingPromise = (async () => {
    const binPath = resolveBinaryPath();
    console.log(`[ctrace] binary path: ${binPath}`);
    try {
      await fs.access(binPath);
    } catch (e) {
      throw new Error(`ctrace binary not found at: ${binPath}`);
    }

    const format = checkBinaryFormat(binPath);
    if (!format.ok) {
      throw new Error(format.error);
    }

    const host = DEFAULT_HOST;
    const port = await findAvailablePort(DEFAULT_PORT);
    const token = createShutdownToken();

    const args = ['--ipc', 'serve', '--serve-host', host, '--serve-port', String(port), '--shutdown-token', token];

    let proc;
    if (os.platform() === 'win32') {
      const wslBinPath = toWslPath(binPath);

      const bashEscape = (s) => {
        const str = String(s ?? '');
        // Wrap in single quotes and escape embedded single quotes.
        return `'${str.replace(/'/g, `'"'"'`)}'`;
      };

      // Default CWD: parent of the binary's containing directory (i.e. parent of bin/).
      // This ensures ctrace always runs from the same relative location in both dev
      // (coretrace-gui/) and production (resources/) so tool/model path resolution
      // inside the binary is consistent regardless of where Electron was launched from.
      const defaultCwd = path.dirname(path.dirname(binPath));
      const cwdOverride = options && typeof options.cwd === 'string' ? options.cwd : '';
      const resolvedCwd = cwdOverride || defaultCwd;
      const wslCwd = toWslPath(resolvedCwd);
      const cmd = `${wslCwd ? `cd ${bashEscape(wslCwd)} && ` : ''}${bashEscape(wslBinPath)} ${args.map(bashEscape).join(' ')}`;

      // Use bash -lc so the environment is closer to interactive WSL runs
      // (and so `cd` works regardless of the default directory).
      proc = spawn('wsl', ['bash', '-lc', cmd], { stdio: 'pipe', windowsHide: true });
    } else {
      // Linux / WSL-launched process: wrap in bash -lc to get a proper login
      // environment (PATH, LLVM, etc.) consistent with interactive WSL sessions.
      const bashEscapeLinux = (s) => `'${String(s ?? '').replace(/'/g, `'"'"'`)}'`;
      const defaultCwdLinux = path.dirname(path.dirname(binPath));
      const cwdLinux = (options && typeof options.cwd === 'string' && options.cwd) || defaultCwdLinux;
      const cmd = `${cwdLinux ? `cd ${bashEscapeLinux(cwdLinux)} && ` : ''}${bashEscapeLinux(binPath)} ${args.map(bashEscapeLinux).join(' ')}`;
      proc = spawn('bash', ['-lc', cmd], { stdio: 'pipe' });
    }

    proc.stdout.on('data', (d) => {
      // Keep logs useful but not too noisy.
      const s = d.toString();
      captureChunk(s, 'stdout');
      if (s.trim()) console.log(`[ctrace serve]: ${s.trimEnd()}`);
    });

    proc.stderr.on('data', (d) => {
      const s = d.toString();
      captureChunk(s, 'stderr');
      if (s.trim()) console.error(`[ctrace serve stderr]: ${s.trimEnd()}`);
    });

    proc.on('exit', (code, signal) => {
      console.log(`ctrace serve exited: code=${code} signal=${signal}`);
      serverProc = null;
      serverInfo = null;
      startingPromise = null;
    });

    const ready = await waitForPortOpen({ host, port, timeoutMs: 20000 });
    if (!ready) {
      try { proc.kill('SIGTERM'); } catch (_) {}
      throw new Error(`ctrace serve did not open ${host}:${port} in time`);
    }

    serverProc = proc;
    serverInfo = { host, port, token };
    return serverInfo;
  })();

  try {
    return await startingPromise;
  } finally {
    startingPromise = null;
  }
}

async function callApi(method, params) {
  const info = await ensureServerRunning();

  const request = {
    proto: 'coretrace-1.0',
    id: ++requestIdSeq,
    type: 'request',
    method,
    params
  };

  const url = `http://${info.host}:${info.port}/api`;

  if (DEBUG_BACKEND_REQUESTS) {
    console.log('[ctrace debug] backend url:', url);
    console.log('[ctrace debug] backend request:', JSON.stringify(request));
  }

  const res = await httpPostJson(url, { body: request });

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch (_) {
    // If backend responds with plain text, still surface it.
    return { ok: res.statusCode >= 200 && res.statusCode < 300, raw: res.body, statusCode: res.statusCode };
  }

  return { ok: res.statusCode >= 200 && res.statusCode < 300, json: parsed, statusCode: res.statusCode };
}

async function shutdownServer() {
  if (!serverInfo) return { success: true, skipped: true };

  const { host, port, token } = serverInfo;

  try {
    const res = await httpPostJson(`http://${host}:${port}/shutdown`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: {}
    });

    // Regardless of HTTP status, attempt to stop the process too.
    if (serverProc && !serverProc.killed) {
      try { serverProc.kill('SIGTERM'); } catch (_) {}
    }

    serverProc = null;
    serverInfo = null;

    return { success: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, body: res.body };
  } catch (e) {
    // Fall back to killing the process if HTTP shutdown fails.
    if (serverProc && !serverProc.killed) {
      try { serverProc.kill('SIGTERM'); } catch (_) {}
    }

    serverProc = null;
    serverInfo = null;

    return { success: false, error: e.message };
  }
}

module.exports = {
  ensureServerRunning,
  callApi,
  shutdownServer,
  resolveBinaryPath,
  checkBinaryFormat,
  getCapturedSince,
  waitForCapturedJson
};
