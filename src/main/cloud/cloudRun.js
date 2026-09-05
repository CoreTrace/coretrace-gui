/**
 * CloudRun drives one "Run in cloud" job through @coretrace/cli-core's runCloud
 * and translates its hooks into renderer events (contracts/gui-integration.md).
 * The confirmation answer arrives later through IPC; nothing is spent until it does.
 */
const crypto = require('crypto');

class CloudRun {
  /**
   * @param {object} deps
   * @param {import('./cloudClient').CloudClient} deps.cloud
   * @param {(event: object) => void} deps.emit pushes `cloud-run-event` payloads to the renderer
   */
  constructor(deps) {
    this.cloud = deps.cloud;
    this.emit = deps.emit;
    this.runs = new Map();
  }

  /** Starts a run; resolves immediately with the run id, progress arrives as events. */
  async start({ rootPath, tools, allowPartial, config, failOn, confirm = true }) {
    const runId = crypto.randomUUID();
    const controller = new AbortController();
    const state = { runId, controller, confirmResolve: null, result: null, error: null, view: null };
    this.runs.set(runId, state);
    const emit = (type, payload) => this.emit({ runId, type, ...payload });
    (async () => {
      try {
        const c = await this.cloud.client();
        if (!c) throw new c.core.AuthError('Not signed in');
        const me = await c.core.fetchMe(c.api);
        const org = c.core.selectOrg(me, c.config.org);
        const hooks = {
          onPhase: (phase, detail) => emit('phase', { phase, detail: detail || null }),
          onPack: (s) => emit('pack', { fileCount: s.fileCount, expandedSize: s.expandedSize, compressedSize: s.compressedSize, excluded: Object.fromEntries([...s.excluded.entries()].map(([k, v]) => [k, v.count])) }),
          onEstimate: (quote, limits, rejected) => emit('estimate', { quote: serialiseQuote(quote), remainingBudgetCtu: limits.remaining_budget_ctu, rejected }),
          onView: (view) => {
            state.view = view;
            emit('job', serialiseView(c.core, view));
          },
          onWaitMode: (mode, detail) => emit('wait', { mode, detail: detail || null }),
          confirm: (quote, limits, deadline) =>
            new Promise((resolve) => {
              state.confirmResolve = resolve;
              emit('awaiting_confirmation', { quote: serialiseQuote(quote), remainingBudgetCtu: limits.remaining_budget_ctu, confirmDeadline: deadline || null });
            }),
        };
        const result = await c.core.runCloud(
          c.api,
          {
            org: org.slug,
            root: rootPath,
            tools,
            allowPartial: Boolean(allowPartial),
            confirm: confirm !== false,
            skipEstimate: false,
            failOn: failOn || 'any',
            tempDir: this.cloud.tempDir(),
            timeoutMs: 30 * 60 * 1000,
            wait: true,
            signal: controller.signal,
            cancelOnInterrupt: true,
            ...(config ? { config } : {}),
          },
          hooks,
        );
        state.result = result;
        for (const r of result.reports) {
          emit('findings', { tool: r.tool, toolRunId: r.runId, outcome: r.outcome, billedCtu: r.billedCtu, findings: r.findings.map(serialiseFinding) });
        }
        emit('done', {
          exitCode: result.exitCode,
          declined: result.declined,
          conclusion: result.view.conclusion || null,
          billedCtu: result.view.billedCtu,
          thresholdCount: result.thresholdCount,
          jobId: result.view.jobId,
          sarif: JSON.stringify(c.core.toSarif(result.view, result.reports, { exitCode: result.exitCode })),
        });
      } catch (err) {
        state.error = err;
        const code = typeof err.code === 'number' ? err.code : 4;
        emit('error', { code, message: String(err && err.message ? err.message : err), reason: err && err.detail && err.detail.reason ? err.detail.reason : null });
      } finally {
        this.runs.delete(runId);
      }
    })();
    return { runId };
  }

  confirm(runId, accept) {
    const state = this.runs.get(runId);
    if (!state || !state.confirmResolve) return { ok: false, error: 'no confirmation pending' };
    const resolve = state.confirmResolve;
    state.confirmResolve = null;
    resolve(Boolean(accept));
    return { ok: true };
  }

  cancel(runId) {
    const state = this.runs.get(runId);
    if (!state) return { ok: false, error: 'unknown run' };
    if (state.confirmResolve) this.confirm(runId, false);
    state.controller.abort();
    return { ok: true };
  }
}

function serialiseQuote(q) {
  return { quoteId: q.quoteId, totalReservedCtu: q.totalReservedCtu, expiresAt: q.expiresAt || null, items: q.items.map((i) => ({ tool: i.tool, version: i.version, reservedCtu: i.reservedCtu })) };
}

function serialiseView(core, view) {
  return {
    jobId: view.jobId,
    status: view.status,
    conclusion: view.conclusion || null,
    billedCtu: view.billedCtu,
    confirmDeadline: view.confirmDeadline || null,
    rejected: view.rejected,
    runs: core.runsOf(view).map((r) => ({ id: r.id, tool: r.tool, version: r.version, status: r.status, outcome: r.outcome || null, progress: r.progressMessage || null, findingsSoFar: r.findingsSoFar ?? null, billedCtu: r.billedCtu, reservedCtu: r.reservedCtu })),
  };
}

function serialiseFinding(f) {
  return { ruleId: f.ruleId, level: f.level, message: f.message, path: f.location.path, line: f.location.line ?? null, column: f.location.column ?? null, endLine: f.location.endLine ?? null, endColumn: f.location.endColumn ?? null };
}

module.exports = { CloudRun, serialiseView, serialiseQuote, serialiseFinding };
