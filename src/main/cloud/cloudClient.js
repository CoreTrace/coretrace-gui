/**
 * CloudClient wraps @coretrace/cli-core for the main process: configuration
 * from the backend settings, credential resolution (environment key, then the
 * safeStorage-backed session, then the core's encrypted fallback), device-flow
 * sign-in, identity, tools and limits. Nothing here touches the renderer.
 */
const os = require('os');
const path = require('path');

const DEFAULT_UPGRADE_URL = 'https://coretrace.dev/pricing';
const GUI_VERSION = require('../../../package.json').version;

class CloudClient {
  /**
   * @param {object} deps
   * @param {() => Promise<object>} deps.loadSettings backend settings loader
   * @param {object} deps.store CredentialStore preferred (safeStorage)
   * @param {string} deps.configDir directory for the core's state and fallback files
   * @param {() => Promise<any>} [deps.loadCore] injectable module loader (tests)
   * @param {(line: string) => void} [deps.log]
   */
  constructor(deps) {
    this.deps = deps;
    this.corePromise = null;
    this.credential = null;
    this.deviceAbort = null;
  }

  core() {
    if (!this.corePromise) {
      this.corePromise = this.deps.loadCore ? this.deps.loadCore() : import('@coretrace/cli-core');
    }
    return this.corePromise;
  }

  async settings() {
    const all = (await this.deps.loadSettings()) || {};
    const cloud = all.cloud || {};
    return {
      baseUrl: cloud.baseUrl || process.env.CORETRACE_BASE_URL || 'https://api.coretrace.dev',
      caFile: cloud.caFile || process.env.CORETRACE_CA_FILE || '',
      org: cloud.org || process.env.CORETRACE_ORG || '',
      upgradeUrl: cloud.upgradeUrl || DEFAULT_UPGRADE_URL,
    };
  }

  async config() {
    const core = await this.core();
    const s = await this.settings();
    const overrides = { baseUrl: s.baseUrl, configDir: this.deps.configDir };
    if (s.caFile) overrides.caFile = s.caFile;
    if (s.org) overrides.org = s.org;
    const env = { ...process.env };
    if (s.baseUrl.startsWith('http://')) env.CORETRACE_DEV_INSECURE = '1';
    const config = core.loadConfig(overrides, env);
    return { core, config, upgradeUrl: s.upgradeUrl };
  }

  logger(core) {
    if (!this._logger) {
      this._logger = new core.Logger({
        level: process.env.CORETRACE_LOG === 'debug' ? 'debug' : 'warn',
        sink: (line) => (this.deps.log ? this.deps.log(line) : console.warn(line)),
      });
    }
    return this._logger;
  }

  async store(core, config) {
    return core.selectStore(config, { preferred: this.deps.store, preference: 'auto' });
  }

  /** Resolves the credential in use; undefined when signed out. */
  async resolveCredential() {
    const { core, config } = await this.config();
    const logger = this.logger(core);
    const fromEnv = core.fromEnvironment(config);
    if (fromEnv) return fromEnv;
    const store = await this.store(core, config);
    const pub = core.createApiClient({ baseUrl: config.baseUrl, userAgent: `coretrace-gui/${GUI_VERSION}`, caFile: config.caFile, logger });
    return core.resumeStoredSession(pub, config, store, { logger });
  }

  /** Authenticated client or null when signed out. */
  async client() {
    const { core, config } = await this.config();
    const credential = await this.resolveCredential();
    if (!credential) return null;
    const logger = this.logger(core);
    const api = core.createApiClient({
      baseUrl: config.baseUrl,
      userAgent: `coretrace-gui/${GUI_VERSION}`,
      caFile: config.caFile,
      logger,
      token: () => core.bearerOf(credential),
    });
    // User sessions scope organisation calls with X-Org; resolve the membership once.
    const me = await core.fetchMe(api);
    api.setOrg(core.selectOrg(me, config.org).slug);
    return { core, config, credential, api, me };
  }

  async status(online) {
    const { config, upgradeUrl } = await this.config();
    const out = { online, baseUrl: config.baseUrl, signedIn: false, storeKind: null, identity: null, upgradeUrl };
    if (!online) return out;
    try {
      const c = await this.client();
      if (!c) return out;
      out.signedIn = true;
      out.storeKind = c.credential.source;
      const me = await c.core.fetchMe(c.api);
      out.identity = { principal: me.principal, orgs: me.orgs, org: c.core.selectOrg(me, c.config.org).slug };
    } catch (err) {
      out.error = String(err && err.message ? err.message : err);
    }
    return out;
  }

  /** Starts the device flow; onCode receives the code, the promise resolves with the identity. */
  async loginStart(onCode) {
    const { core, config } = await this.config();
    const logger = this.logger(core);
    const pub = core.createApiClient({ baseUrl: config.baseUrl, userAgent: `coretrace-gui/${GUI_VERSION}`, caFile: config.caFile, logger });
    this.deviceAbort = new AbortController();
    const tokens = await core.deviceLogin(pub, { onCode, signal: this.deviceAbort.signal });
    const authed = core.createApiClient({ baseUrl: config.baseUrl, userAgent: `coretrace-gui/${GUI_VERSION}`, caFile: config.caFile, logger, token: () => tokens.access_token });
    const me = await core.fetchMe(authed);
    const store = await this.store(core, config);
    await core.saveSession(store, config, tokens, { userName: me.principal.name || '', orgSlug: me.orgs.length === 1 ? me.orgs[0].slug : '' });
    return { principal: me.principal, orgs: me.orgs, storeKind: store.kind };
  }

  loginCancel() {
    if (this.deviceAbort) this.deviceAbort.abort();
  }

  async logout() {
    const { core, config } = await this.config();
    const store = await this.store(core, config);
    let client;
    try {
      const c = await this.client();
      if (c && c.credential.kind === 'session') client = c.api;
    } catch {
      client = undefined;
    }
    return core.logout(client, store, config.profile);
  }

  async tools() {
    const c = await this.client();
    if (!c) throw new Error('Not signed in');
    return c.core.fetchTools(c.api);
  }

  async limits() {
    const c = await this.client();
    if (!c) throw new Error('Not signed in');
    const me = await c.core.fetchMe(c.api);
    const org = c.core.selectOrg(me, c.config.org);
    return c.core.fetchLimits(c.api, org.slug);
  }

  tempDir() {
    return process.env.CORETRACE_TMPDIR || os.tmpdir();
  }
}

module.exports = { CloudClient, DEFAULT_UPGRADE_URL, cloudConfigDir: (userDataDir) => path.join(userDataDir, 'coretrace') };
