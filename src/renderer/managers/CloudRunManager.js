;(function() {
/**
 * CloudRunManager - state of the "Run in cloud" panel (data-model.md, GUI panel
 * state) and the bridge from cloud findings into the DiagnosticsManager.
 * Pure state: it never touches the DOM, so it is unit-tested with node --test.
 */

const STATES = ['signed_out', 'signing_in', 'ready', 'packing', 'uploading', 'estimating', 'quote_shown', 'confirming', 'cancelled', 'waiting', 'finished', 'failed'];

class CloudRunManager {
  /**
   * @param {object} deps
   * @param {object} deps.diagnosticsManager exposes addSarifRuns(sarif, meta) and clearSource(source)
   * @param {(state: object) => void} [deps.onChange]
   */
  constructor(deps = {}) {
    this.diagnosticsManager = deps.diagnosticsManager || null;
    this.onChange = deps.onChange || (() => {});
    this.state = {
      status: 'signed_out',
      online: true,
      identity: null,
      storeKind: null,
      tools: [],
      upgradeUrl: null,
      limits: null,
      runId: null,
      jobId: null,
      phase: null,
      pack: null,
      quote: null,
      remainingBudgetCtu: null,
      confirmDeadline: null,
      runs: [],
      rejected: [],
      waitMode: null,
      summary: null,
      error: null,
      login: null,
    };
  }

  set(patch) {
    if (patch.status && !STATES.includes(patch.status)) throw new Error(`unknown state ${patch.status}`);
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
    return this.state;
  }

  /** Applies a `cloud-status` result. */
  applyStatus(status) {
    const online = status.online !== false;
    const signedIn = Boolean(status.signedIn);
    return this.set({
      online,
      identity: status.identity || null,
      storeKind: status.storeKind || null,
      upgradeUrl: status.upgradeUrl || this.state.upgradeUrl,
      status: !signedIn ? 'signed_out' : this.isBusy() ? this.state.status : 'ready',
      error: status.error || null,
    });
  }

  isBusy() {
    return ['packing', 'uploading', 'estimating', 'quote_shown', 'confirming', 'waiting', 'signing_in'].includes(this.state.status);
  }

  /** Tools with the greying rule: not entitled → disabled, presentation only. */
  applyTools(tools, upgradeUrl) {
    const list = (tools || []).map((t) => ({ id: t.id, version: t.version, entitled: Boolean(t.entitled), requiredEntitlement: t.required_entitlement, disabled: !t.entitled, upgradeUrl: t.entitled ? null : upgradeUrl || this.state.upgradeUrl }));
    return this.set({ tools: list, upgradeUrl: upgradeUrl || this.state.upgradeUrl });
  }

  selectableTools() {
    return this.state.tools.filter((t) => !t.disabled).map((t) => t.id);
  }

  beginLogin() {
    return this.set({ status: 'signing_in', login: { state: 'pending' }, error: null });
  }

  beginRun(runId) {
    if (this.diagnosticsManager && this.diagnosticsManager.clearSource) this.diagnosticsManager.clearSource('cloud');
    return this.set({ status: 'packing', runId, jobId: null, phase: 'pack', pack: null, quote: null, confirmDeadline: null, runs: [], rejected: [], summary: null, error: null, waitMode: null });
  }

  /** Folds one `cloud-run-event` into the state. */
  applyEvent(evt) {
    if (!evt || typeof evt !== 'object') return this.state;
    switch (evt.type) {
      case 'login':
        if (evt.state === 'pending') return this.set({ status: 'signing_in', login: { state: 'pending', userCode: evt.userCode, verificationUri: evt.verificationUri, expiresIn: evt.expiresIn } });
        if (evt.state === 'approved') return this.set({ status: 'ready', login: null, identity: evt.identity || null });
        return this.set({ status: 'signed_out', login: { state: evt.state }, error: evt.message || null });
      case 'phase': {
        const map = { limits: 'packing', tools: 'packing', pack: 'packing', upload: 'uploading', estimate: 'estimating', create: 'estimating', confirm: 'quote_shown', wait: 'waiting', reports: 'waiting' };
        const status = map[evt.phase] || this.state.status;
        return this.set({ phase: evt.phase, status: this.state.status === 'cancelled' ? 'cancelled' : status });
      }
      case 'pack':
        return this.set({ pack: { fileCount: evt.fileCount, expandedSize: evt.expandedSize, compressedSize: evt.compressedSize, excluded: evt.excluded || {} } });
      case 'estimate':
        return this.set({ quote: evt.quote, remainingBudgetCtu: evt.remainingBudgetCtu ?? null, rejected: evt.rejected || [] });
      case 'awaiting_confirmation':
        return this.set({ status: 'quote_shown', quote: evt.quote || this.state.quote, remainingBudgetCtu: evt.remainingBudgetCtu ?? this.state.remainingBudgetCtu, confirmDeadline: evt.confirmDeadline || null });
      case 'job':
        return this.set({ jobId: evt.jobId, runs: evt.runs || [], rejected: evt.rejected && evt.rejected.length ? evt.rejected : this.state.rejected, confirmDeadline: evt.confirmDeadline || this.state.confirmDeadline, status: this.state.status === 'confirming' && evt.status !== 'awaiting_confirmation' ? 'waiting' : this.state.status });
      case 'wait':
        return this.set({ waitMode: evt.mode });
      case 'findings':
        if (this.diagnosticsManager && this.diagnosticsManager.addCloudFindings) {
          this.diagnosticsManager.addCloudFindings(evt.findings || [], { tool: evt.tool, toolRunId: evt.toolRunId || null, jobId: this.state.jobId, source: `cloud:${evt.tool}` });
        }
        return this.state;
      case 'done':
        if (evt.declined) return this.set({ status: 'cancelled', summary: { declined: true, billedCtu: 0, exitCode: evt.exitCode } });
        return this.set({ status: 'finished', jobId: evt.jobId || this.state.jobId, summary: { exitCode: evt.exitCode, conclusion: evt.conclusion, billedCtu: evt.billedCtu, thresholdCount: evt.thresholdCount, sarif: evt.sarif || null } });
      case 'error':
        return this.set({ status: evt.code === 3 ? 'signed_out' : 'failed', error: { code: evt.code, message: evt.message, reason: evt.reason || null } });
      default:
        return this.state;
    }
  }

  confirm(accept) {
    return this.set({ status: accept ? 'confirming' : 'cancelled' });
  }

  /** Human label for the current state. */
  label() {
    const s = this.state;
    switch (s.status) {
      case 'signed_out': return 'Sign in to run analyses in the cloud';
      case 'signing_in': return s.login && s.login.userCode ? `Enter code ${s.login.userCode} at ${s.login.verificationUri}` : 'Starting sign-in…';
      case 'ready': return s.identity ? `Signed in as ${s.identity.principal && s.identity.principal.name ? s.identity.principal.name : 'user'} (${s.identity.org})` : 'Ready';
      case 'packing': return 'Packing the project…';
      case 'uploading': return 'Uploading…';
      case 'estimating': return 'Asking the platform for a quote…';
      case 'quote_shown': return 'Confirm the reserved CTU to start';
      case 'confirming': return 'Confirming…';
      case 'cancelled': return 'Cancelled: no CTU reserved';
      case 'waiting': return s.waitMode === 'polling' ? 'Running (polling)…' : s.waitMode === 'reconnecting' ? 'Running (reconnecting)…' : 'Running…';
      case 'finished': return s.summary ? `${s.summary.conclusion || 'done'} · billed ${s.summary.billedCtu} CTU` : 'Finished';
      case 'failed': return s.error ? s.error.message : 'Failed';
      default: return s.status;
    }
  }
}

CloudRunManager.STATES = STATES;

if (typeof window !== 'undefined') {
  window.CloudRunManager = CloudRunManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CloudRunManager;
}
})();
