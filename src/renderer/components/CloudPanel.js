;(function() {
/**
 * CloudPanel - the "Run in cloud" view rendered inside the tools panel
 * (mode 'cloud'). It renders from CloudRunManager state and forwards user
 * actions to the main process through the allow-listed cloud IPC channels.
 */
class CloudPanel {
  constructor(ui) {
    this.ui = ui;
    this.manager = ui.cloudRunManager;
    this.selected = new Set();
    this.subscribed = false;
    this.manager.onChange = () => this.render();
  }

  open() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (this.ui._toolsPanelMode === 'cloud' && toolsPanel && toolsPanel.classList.contains('active')) {
      this.ui.hideToolsPanel();
      return;
    }
    this.ui._toolsPanelMode = 'cloud';
    this.ui.showToolsPanel();
    const header = document.querySelector('#toolsPanel .tools-panel-header span');
    if (header) header.textContent = 'CoreTrace Cloud';
    this.subscribe();
    this.render();
    this.refreshStatus();
  }

  subscribe() {
    if (this.subscribed) return;
    this.subscribed = true;
    window.api.on('cloud-run-event', (evt) => this.manager.applyEvent(evt));
  }

  async refreshStatus() {
    const res = await window.api.invoke('cloud-status');
    if (res && res.success) {
      this.manager.applyStatus(res.status);
      if (res.status.signedIn && res.status.online) await this.loadTools();
    } else {
      this.manager.set({ error: { message: (res && res.error) || 'status unavailable' } });
    }
  }

  async loadTools() {
    const res = await window.api.invoke('cloud-tools');
    if (res && res.success) {
      this.manager.applyTools(res.tools, res.upgradeUrl);
      if (this.selected.size === 0) for (const id of this.manager.selectableTools()) this.selected.add(id);
    }
    const lim = await window.api.invoke('cloud-limits');
    if (lim && lim.success) this.manager.set({ limits: lim.limits });
  }

  async login() {
    this.manager.beginLogin();
    const res = await window.api.invoke('cloud-login-start');
    if (!res || !res.success) this.manager.applyEvent({ type: 'login', state: 'failed', message: res && res.error });
    else await this.refreshStatus();
  }

  async logout() {
    await window.api.invoke('cloud-logout');
    this.manager.set({ status: 'signed_out', identity: null, tools: [], limits: null, runs: [], summary: null });
  }

  async run() {
    const root = this.ui.currentWorkspacePath || (this.ui.fileTree && this.ui.fileTree.rootPath) || null;
    if (!root) {
      this.ui.notificationManager.showWarning('Open a folder to run it in the cloud');
      return;
    }
    const tools = [...this.selected].filter((id) => this.manager.selectableTools().includes(id));
    if (tools.length === 0) {
      this.ui.notificationManager.showWarning('Select at least one tool');
      return;
    }
    const res = await window.api.invoke('cloud-run-start', { rootPath: root, tools, allowPartial: false, confirm: true });
    if (res && res.success) this.manager.beginRun(res.runId);
    else this.manager.applyEvent({ type: 'error', code: (res && res.code) || 4, message: (res && res.error) || 'cannot start' });
  }

  async answer(accept) {
    const runId = this.manager.state.runId;
    this.manager.confirm(accept);
    await window.api.invoke('cloud-run-confirm', { runId, accept });
  }

  async cancel() {
    const runId = this.manager.state.runId;
    if (runId) await window.api.invoke('cloud-run-cancel', { runId });
    this.manager.set({ status: 'cancelled' });
  }

  saveSarif() {
    const s = this.manager.state.summary;
    if (!s || !s.sarif) return;
    const blob = new Blob([s.sarif], { type: 'application/sarif+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `coretrace-${this.manager.state.jobId || 'job'}.sarif`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  render() {
    if (this.ui._toolsPanelMode !== 'cloud') return;
    const area = document.querySelector('#toolsPanel .tools-panel-content');
    if (!area) return;
    const st = this.manager.state;
    const esc = (t) => window.escapeHtml(String(t == null ? '' : t));
    const busy = this.manager.isBusy();
    const parts = [];
    parts.push(`<div class="cloud-status ${st.online ? '' : 'cloud-offline'}">${esc(st.online ? this.manager.label() : `Cloud analysis needs a connection to ${new URL(st.baseUrl || 'https://api.coretrace.dev').host}`)}</div>`);
    if (!st.online) {
      area.innerHTML = `<div class="cloud-panel">${parts.join('')}</div>`;
      return;
    }
    if (st.status === 'signed_out' || st.status === 'signing_in') {
      parts.push(`<div class="cloud-card">
        ${st.login && st.login.userCode ? `<div class="cloud-code">Code <strong>${esc(st.login.userCode)}</strong></div><div class="cloud-hint">Open <a href="#" data-cloud="open-uri">${esc(st.login.verificationUri)}</a>, enter the code and approve. This window waits for the approval.</div>` : `<div class="cloud-hint">Sign in with your browser; no password is typed here.</div>`}
        ${st.error ? `<div class="cloud-error">${esc(st.error.message || st.error)}</div>` : ''}
        <div class="ctrace-btn-row">
          <button class="ctrace-run-btn" data-cloud="login" ${st.status === 'signing_in' ? 'disabled' : ''}>${st.status === 'signing_in' ? 'Waiting for approval…' : 'Sign in'}</button>
          ${st.status === 'signing_in' ? '<button class="ctrace-clear-btn" data-cloud="login-cancel">Cancel</button>' : ''}
        </div>
      </div>`);
    } else {
      parts.push(`<div class="cloud-identity">${esc(st.identity && st.identity.principal && st.identity.principal.name ? st.identity.principal.name : 'user')} · ${esc(st.identity ? st.identity.org : '')}${st.limits ? ` · ${esc(st.limits.plan)} plan · ${esc(st.limits.remaining_budget_ctu)} CTU left` : ''} <a href="#" data-cloud="logout">sign out</a></div>`);
      parts.push(`<div class="cloud-card"><div class="section-title">Tools</div><div class="cloud-tools">${st.tools.map((t) => `
        <label class="cloud-tool ${t.disabled ? 'cloud-tool-disabled' : ''}" title="${t.disabled ? `Available on a plan with the ${esc(t.requiredEntitlement)} entitlement` : ''}">
          <input type="checkbox" data-cloud="tool" data-tool="${esc(t.id)}" ${t.disabled ? 'disabled' : ''} ${this.selected.has(t.id) && !t.disabled ? 'checked' : ''}>
          <span>${esc(t.id)} <span class="cloud-version">${esc(t.version)}</span></span>
          ${t.disabled ? `<a href="#" class="cloud-upgrade" data-cloud="upgrade">Upgrade</a>` : ''}
        </label>`).join('')}</div>
        <div class="ctrace-btn-row"><button class="ctrace-run-btn" data-cloud="run" ${busy ? 'disabled' : ''}>Run in cloud</button>${busy && st.status !== 'quote_shown' ? '<button class="ctrace-clear-btn" data-cloud="cancel">Cancel</button>' : ''}</div>
      </div>`);
      if (st.pack) parts.push(`<div class="cloud-line">packed ${esc(st.pack.fileCount)} file(s)${Object.keys(st.pack.excluded || {}).length ? ` · excluded ${Object.values(st.pack.excluded).reduce((a, b) => a + b, 0)}` : ''}</div>`);
      if (st.quote) {
        parts.push(`<div class="cloud-card cloud-quote"><div class="section-title">Quote</div>
          ${st.quote.items.map((i) => `<div class="cloud-row"><span>${esc(i.tool)} ${esc(i.version)}</span><span>${esc(i.reservedCtu)} CTU</span></div>`).join('')}
          ${st.rejected.map((r) => `<div class="cloud-row cloud-rejected"><span>${esc(r.tool)}</span><span>rejected (${esc(r.reason)})</span></div>`).join('')}
          <div class="cloud-row cloud-total"><span>total reserved</span><span>${esc(st.quote.totalReservedCtu)} CTU</span></div>
          ${st.remainingBudgetCtu != null ? `<div class="cloud-hint">remaining budget this period: ${esc(st.remainingBudgetCtu)} CTU</div>` : ''}
          ${st.status === 'quote_shown' ? `<div class="cloud-hint">${st.confirmDeadline ? `confirm before ${esc(new Date(st.confirmDeadline).toLocaleTimeString())}` : ''}</div>
            <div class="ctrace-btn-row"><button class="ctrace-run-btn" data-cloud="confirm-yes">Confirm and run</button><button class="ctrace-clear-btn" data-cloud="confirm-no">Decline</button></div>` : ''}
        </div>`);
      }
      if (st.runs.length) parts.push(`<div class="cloud-card"><div class="section-title">Progress${st.jobId ? ` <span class="cloud-version">job ${esc(st.jobId)}</span>` : ''}</div>${st.runs.map((r) => `<div class="cloud-row cloud-run-${esc(r.status)}"><span>${esc(r.tool)}</span><span>${esc(r.status)}${r.progress && r.status === 'running' ? ` · ${esc(r.progress)}` : ''}${r.outcome ? ` · ${esc(r.outcome)}` : ''}${r.billedCtu ? ` · ${esc(r.billedCtu)} CTU` : ''}</span></div>`).join('')}</div>`);
      if (st.summary && st.status === 'finished') parts.push(`<div class="cloud-card cloud-summary"><div>${esc(st.summary.conclusion || 'done')} · billed ${esc(st.summary.billedCtu)} CTU · ${esc(st.summary.thresholdCount)} finding(s)${st.summary.conclusion === 'ctu_cap' ? ' · stopped at the CTU cap, report truncated' : ''}</div><div class="cloud-hint">Findings are listed in the CTrace results view and marked in the editor.</div><div class="ctrace-btn-row"><button class="ctrace-clear-btn" data-cloud="save-sarif">Save SARIF</button></div></div>`);
      if (st.status === 'failed' && st.error) parts.push(`<div class="cloud-error">${esc(st.error.message)}</div>`);
      if (st.status === 'cancelled') parts.push(`<div class="cloud-line">Cancelled: no CTU reserved</div>`);
    }
    area.innerHTML = `<div class="cloud-panel">${parts.join('')}</div>`;
    this.bind(area);
  }

  bind(area) {
    area.querySelectorAll('[data-cloud]').forEach((el) => {
      const action = el.dataset.cloud;
      if (action === 'tool') {
        el.addEventListener('change', () => (el.checked ? this.selected.add(el.dataset.tool) : this.selected.delete(el.dataset.tool)));
        return;
      }
      el.addEventListener('click', (e) => {
        e.preventDefault();
        switch (action) {
          case 'login': return this.login();
          case 'login-cancel': return window.api.invoke('cloud-login-cancel').then(() => this.manager.set({ status: 'signed_out', login: null }));
          case 'logout': return this.logout();
          case 'run': return this.run();
          case 'cancel': return this.cancel();
          case 'confirm-yes': return this.answer(true);
          case 'confirm-no': return this.answer(false);
          case 'upgrade': return window.api.invoke('cloud-open-upgrade');
          case 'open-uri': return window.api.invoke('cloud-open-url', this.manager.state.login && this.manager.state.login.verificationUri);
          case 'save-sarif': return this.saveSarif();
          default: return undefined;
        }
      });
    });
  }
}

if (typeof window !== 'undefined') {
  window.CloudPanel = CloudPanel;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CloudPanel;
}
})();
