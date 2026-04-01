const crypto = require('crypto');
const fs = require('fs/promises');
const https = require('https');
const path = require('path');
const tar = require('tar');

const { app } = require('electron');
const { resolveBinaryPath } = require('./ctraceServeClient');

const CORETRACE_REPO_API_LATEST = 'https://api.github.com/repos/CoreTrace/coretrace/releases/latest';
const REQUEST_TIMEOUT_MS = 30000;

function getUserDataPath() {
  if (!app || typeof app.getPath !== 'function') return null;
  try {
    return app.getPath('userData');
  } catch (_) {
    return null;
  }
}

function getManagedBinaryPath() {
  const userDataPath = getUserDataPath();
  if (!userDataPath) return null;
  return path.join(userDataPath, 'bin', 'ctrace');
}

function getBackendStatePath() {
  const userDataPath = getUserDataPath();
  if (!userDataPath) return null;
  return path.join(userDataPath, 'backend-updater-state.json');
}

function getTargetPlatformForBackend() {
  if (process.platform === 'win32') return 'linux';
  if (process.platform === 'linux') return 'linux';
  return null;
}

function getTargetArchTag() {
  if (process.arch === 'x64') return 'amd64';
  if (process.arch === 'arm64') return 'arm64';
  return null;
}

function parseSha256Text(text) {
  const match = String(text || '').match(/([a-fA-F0-9]{64})/);
  return match ? match[1].toLowerCase() : null;
}

async function sha256File(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function requestUrl(url, { method = 'GET', headers = {}, timeoutMs = REQUEST_TIMEOUT_MS, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const appVersion = app && typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0';
    const req = https.request(url, {
      method,
      headers: {
        'User-Agent': `coretrace-gui/${appVersion}`,
        Accept: 'application/vnd.github+json',
        ...headers
      }
    }, (res) => {
      const statusCode = res.statusCode || 0;
      const location = res.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location && maxRedirects > 0) {
        res.resume();
        requestUrl(location, { method, headers, timeoutMs, maxRedirects: maxRedirects - 1 })
          .then(resolve)
          .catch(reject);
        return;
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout for ${url}`));
    });
    req.end();
  });
}

async function fetchJson(url) {
  const res = await requestUrl(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = res.body ? res.body.toString('utf8') : '';
    throw new Error(`HTTP ${res.statusCode} fetching JSON from ${url}: ${body.slice(0, 200)}`);
  }
  return JSON.parse(res.body.toString('utf8'));
}

async function fetchText(url) {
  const res = await requestUrl(url, { headers: { Accept: 'text/plain,*/*' } });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = res.body ? res.body.toString('utf8') : '';
    throw new Error(`HTTP ${res.statusCode} fetching text from ${url}: ${body.slice(0, 200)}`);
  }
  return res.body.toString('utf8');
}

async function downloadToFile(url, targetPath) {
  const res = await requestUrl(url, { headers: { Accept: 'application/octet-stream,*/*' } });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = res.body ? res.body.toString('utf8') : '';
    throw new Error(`HTTP ${res.statusCode} downloading ${url}: ${body.slice(0, 200)}`);
  }
  await fs.writeFile(targetPath, res.body);
}

async function readBackendUpdaterState() {
  const statePath = getBackendStatePath();
  if (!statePath) return null;
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function writeBackendUpdaterState(state) {
  const statePath = getBackendStatePath();
  if (!statePath) return;
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function findFileRecursive(rootDir, name) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name === name) return fullPath;
    if (entry.isDirectory()) {
      const found = await findFileRecursive(fullPath, name);
      if (found) return found;
    }
  }
  return null;
}

function pickAssets(release, platformTag, archTag) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  // Allow semver prerelease/build metadata in filenames (e.g. v0.74.0-dev.40+gda3218e).
  const baseNameRegex = new RegExp(`^coretrace-v[0-9A-Za-z._+-]+-${platformTag}-${archTag}\\.tar\\.gz$`);
  const tarAsset = assets.find((a) => baseNameRegex.test(a.name || '')) || null;
  const shaAsset = tarAsset
    ? assets.find((a) => a.name === `${tarAsset.name}.sha256`) || null
    : null;

  return { tarAsset, shaAsset };
}

async function installBinary(extractedBinaryPath, targetBinaryPath) {
  await fs.mkdir(path.dirname(targetBinaryPath), { recursive: true });

  const tempTargetPath = `${targetBinaryPath}.tmp`;
  await fs.copyFile(extractedBinaryPath, tempTargetPath);

  if (process.platform !== 'win32') {
    await fs.chmod(tempTargetPath, 0o755);
  }

  try {
    await fs.rename(tempTargetPath, targetBinaryPath);
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      await fs.unlink(targetBinaryPath).catch(() => {});
      await fs.rename(tempTargetPath, targetBinaryPath);
      return;
    }

    if (error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
      await fs.unlink(targetBinaryPath).catch(() => {});
      await fs.rename(tempTargetPath, targetBinaryPath);
      return;
    }

    throw error;
  }
}

async function checkAndUpdateBackendBinary({ log = () => {}, force = false } = {}) {
  const platformTag = getTargetPlatformForBackend();
  const archTag = getTargetArchTag();
  const userDataPath = getUserDataPath();
  const managedBinaryPath = getManagedBinaryPath();
  const state = await readBackendUpdaterState();

  if (!platformTag || !archTag) {
    return {
      success: true,
      skipped: true,
      reason: `Unsupported platform/arch for backend updater: ${process.platform}/${process.arch}`
    };
  }

  if (!userDataPath || !managedBinaryPath) {
    return {
      success: true,
      skipped: true,
      reason: 'Electron userData path is unavailable in current runtime'
    };
  }

  let release;
  let releaseTag = null;
  try {
    release = await fetchJson(CORETRACE_REPO_API_LATEST);
    releaseTag = release?.tag_name || 'unknown';
  } catch (error) {
    const cachedReleaseTag = typeof state?.releaseTag === 'string' && state.releaseTag.trim()
      ? state.releaseTag.trim()
      : null;

    if (cachedReleaseTag) {
      log('Using cached backend release tag after fetch failure', {
        cachedReleaseTag,
        error: error?.message || String(error)
      });
      return {
        success: true,
        updated: false,
        releaseTag: cachedReleaseTag,
        stale: true,
        reason: 'Using cached backend release tag after release metadata fetch failed'
      };
    }

    throw error;
  }

  const { tarAsset, shaAsset } = pickAssets(release, platformTag, archTag);
  if (!tarAsset || !shaAsset) {
    return {
      success: true,
      skipped: true,
      reason: `No matching backend assets for ${platformTag}-${archTag} in release ${releaseTag}`
    };
  }

  const currentBinaryPath = resolveBinaryPath();
  let currentBinarySha = null;
  if (await fileExists(currentBinaryPath)) {
    currentBinarySha = await sha256File(currentBinaryPath);
  }

  if (
    !force &&
    state &&
    state.releaseTag === releaseTag &&
    state.arch === archTag &&
    state.platform === platformTag &&
    state.binarySha256 &&
    state.binarySha256 === currentBinarySha
  ) {
    return {
      success: true,
      updated: false,
      releaseTag,
      reason: 'Backend already up to date (state + checksum match)'
    };
  }

  const tmpRoot = path.join(userDataPath, 'backend-updater-tmp');
  const runDir = path.join(tmpRoot, `${Date.now()}-${process.pid}`);
  const archivePath = path.join(runDir, tarAsset.name);
  const extractDir = path.join(runDir, 'extract');

  await fs.mkdir(extractDir, { recursive: true });

  try {
    log('Downloading backend checksum file', { name: shaAsset.name, tag: releaseTag });
    const shaText = await fetchText(shaAsset.browser_download_url);
    const expectedArchiveSha = parseSha256Text(shaText);
    if (!expectedArchiveSha) {
      throw new Error(`Could not parse sha256 from asset ${shaAsset.name}`);
    }

    log('Downloading backend archive', { name: tarAsset.name, tag: releaseTag });
    await downloadToFile(tarAsset.browser_download_url, archivePath);

    const downloadedArchiveSha = await sha256File(archivePath);
    if (downloadedArchiveSha !== expectedArchiveSha) {
      throw new Error(
        `Checksum mismatch for ${tarAsset.name}: expected ${expectedArchiveSha}, got ${downloadedArchiveSha}`
      );
    }

    log('Extracting backend archive', { archivePath });
    await tar.x({
      file: archivePath,
      cwd: extractDir,
      strict: true
    });

    const extractedBinaryPath = await findFileRecursive(extractDir, 'ctrace');
    if (!extractedBinaryPath) {
      throw new Error(`Could not locate ctrace binary inside ${tarAsset.name}`);
    }

    const downloadedBinarySha = await sha256File(extractedBinaryPath);

    if (currentBinarySha && currentBinarySha === downloadedBinarySha) {
      await writeBackendUpdaterState({
        releaseTag,
        platform: platformTag,
        arch: archTag,
        binarySha256: downloadedBinarySha,
        assetName: tarAsset.name,
        checkedAt: new Date().toISOString()
      });
      return {
        success: true,
        updated: false,
        releaseTag,
        reason: 'Current binary checksum matches release binary checksum'
      };
    }

    log('Installing backend binary', {
      from: extractedBinaryPath,
      to: managedBinaryPath
    });
    await installBinary(extractedBinaryPath, managedBinaryPath);

    const installedBinarySha = await sha256File(managedBinaryPath);
    if (installedBinarySha !== downloadedBinarySha) {
      throw new Error('Installed binary checksum verification failed');
    }

    await writeBackendUpdaterState({
      releaseTag,
      platform: platformTag,
      arch: archTag,
      binarySha256: installedBinarySha,
      assetName: tarAsset.name,
      checkedAt: new Date().toISOString(),
      installedAt: new Date().toISOString()
    });

    return {
      success: true,
      updated: true,
      releaseTag,
      binaryPath: managedBinaryPath,
      binarySha256: installedBinarySha,
      assetName: tarAsset.name
    };
  } finally {
    fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  checkAndUpdateBackendBinary,
  getManagedBinaryPath
};
