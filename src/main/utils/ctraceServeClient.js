const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;

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

function resolveBinaryPath() {
  const binaryName = 'ctrace';

  if (process.resourcesPath) {
    return path.join(process.resourcesPath, 'bin', binaryName);
  }

  return path.join(__dirname, '../../../bin', binaryName);
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
    try {
      await fs.access(binPath);
    } catch (e) {
      throw new Error(`ctrace binary not found at: ${binPath}`);
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

      const cwd = options && typeof options.cwd === 'string' ? options.cwd : '';
      const wslCwd = cwd ? toWslPath(cwd) : '';
      const cmd = `${wslCwd ? `cd ${bashEscape(wslCwd)} && ` : ''}${bashEscape(wslBinPath)} ${args.map(bashEscape).join(' ')}`;

      // Use bash -lc so the environment is closer to interactive WSL runs
      // (and so `cd` works regardless of the default directory).
      proc = spawn('wsl', ['bash', '-lc', cmd], { stdio: 'pipe', windowsHide: true });
    } else {
      const spawnOpts = { stdio: 'pipe' };
      if (options && typeof options.cwd === 'string' && options.cwd) {
        spawnOpts.cwd = options.cwd;
      }
      proc = spawn(binPath, args, spawnOpts);
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
  getCapturedSince,
  waitForCapturedJson
};
