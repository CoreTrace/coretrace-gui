const test = require('node:test');
const assert = require('node:assert/strict');

const { CloudRun, serialiseView, serialiseFinding } = require('../src/main/cloud/cloudRun');

/** A stand-in for @coretrace/cli-core exposing only what CloudRun touches. */
function fakeCore(script) {
  return {
    AuthError: class AuthError extends Error {
      constructor(m) {
        super(m);
        this.code = 3;
      }
    },
    fetchMe: async () => ({ principal: { kind: 'user', name: 'A' }, orgs: [{ id: '1', slug: 'dev', role: 'owner', access_state: 'active' }] }),
    selectOrg: (me) => me.orgs[0],
    runsOf: (view) => [...view.runs.values()],
    toSarif: () => ({ version: '2.1.0', runs: [] }),
    runCloud: async (_api, options, hooks) => script(options, hooks),
  };
}

function cloudWith(core) {
  return {
    client: async () => ({ core, api: {}, config: { org: undefined }, credential: { kind: 'session' } }),
    tempDir: () => require('os').tmpdir(),
  };
}

test('a run streams phases, estimate, confirmation, view, findings and done', async () => {
  const events = [];
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const core = fakeCore(async (options, hooks) => {
    assert.equal(options.org, 'dev');
    assert.equal(options.confirm, true);
    hooks.onPhase('pack');
    hooks.onPack({ fileCount: 3, expandedSize: 30, compressedSize: 10, excluded: new Map([['gitignore', { count: 2, examples: [] }]]) });
    hooks.onEstimate({ quoteId: 'q', totalReservedCtu: 100, items: [{ tool: 'ctrace', version: '1', reservedCtu: 100 }] }, { remaining_budget_ctu: 500 }, []);
    const accepted = await hooks.confirm({ quoteId: 'q', totalReservedCtu: 100, items: [] }, { remaining_budget_ctu: 500 }, '2026-01-01T00:00:00Z');
    assert.equal(accepted, true);
    const view = { jobId: 'j1', status: 'running', billedCtu: 0, rejected: [], runs: new Map([['r1', { id: 'r1', tool: 'ctrace', version: '1', status: 'running', progressMessage: 'analysing', inputCtu: 0, outputCtu: 0, billedCtu: 0, reservedCtu: 100 }]]) };
    hooks.onView(view);
    hooks.onWaitMode('streaming');
    return {
      view: { ...view, status: 'completed', conclusion: 'findings', billedCtu: 100 },
      reports: [{ runId: 'r1', tool: 'ctrace', version: '1', outcome: 'findings', billedCtu: 100, findings: [{ ruleId: 'CT-001', level: 'error', message: 'm', location: { path: 'a.c', line: 1 }, extra: {} }] }],
      exitCode: 1,
      declined: false,
      thresholdCount: 1,
    };
  });
  const runs = new CloudRun({
    cloud: cloudWith(core),
    emit: (e) => {
      events.push(e);
      if (e.type === 'awaiting_confirmation') setTimeout(() => runs.confirm(e.runId, true), 5);
      if (e.type === 'done') resolveDone();
    },
  });
  const { runId } = await runs.start({ rootPath: '/proj', tools: ['ctrace'] });
  await done;
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['phase', 'pack', 'estimate', 'awaiting_confirmation', 'job', 'wait', 'findings', 'done']);
  assert.ok(events.every((e) => e.runId === runId));
  assert.equal(events[1].excluded.gitignore, 2);
  assert.equal(events[3].confirmDeadline, '2026-01-01T00:00:00Z');
  assert.equal(events[4].runs[0].progress, 'analysing');
  assert.deepEqual(events[6].findings[0], { ruleId: 'CT-001', level: 'error', message: 'm', path: 'a.c', line: 1, column: null, endLine: null, endColumn: null });
  assert.equal(events[7].billedCtu, 100);
  assert.equal(typeof events[7].sarif, 'string');
});

test('decline resolves the confirmation with false; errors carry the exit code; cancel aborts', async () => {
  const events = [];
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const core = fakeCore(async (options, hooks) => {
    const accepted = await hooks.confirm({ quoteId: 'q', totalReservedCtu: 5, items: [] }, { remaining_budget_ctu: 1 }, null);
    assert.equal(accepted, false);
    const err = new Error('Confirmation window expired');
    err.code = 5;
    err.detail = { reason: 'expired' };
    throw err;
  });
  const runs = new CloudRun({
    cloud: cloudWith(core),
    emit: (e) => {
      events.push(e);
      if (e.type === 'awaiting_confirmation') runs.confirm(e.runId, false);
      if (e.type === 'error') resolveDone();
    },
  });
  await runs.start({ rootPath: '/proj', tools: ['ctrace'] });
  await done;
  assert.deepEqual(events.at(-1), { runId: events[0].runId, type: 'error', code: 5, message: 'Confirmation window expired', reason: 'expired' });
  assert.deepEqual(runs.confirm('nope', true), { ok: false, error: 'no confirmation pending' });
  assert.deepEqual(runs.cancel('nope'), { ok: false, error: 'unknown run' });

  // Cancel while the core is waiting on the abort signal.
  let aborted = false;
  const waiting = fakeCore((options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => {
    aborted = true;
    const e = new Error('Wait interrupted');
    e.code = 4;
    reject(e);
  })));
  const events2 = [];
  let resolveErr;
  const errored = new Promise((r) => (resolveErr = r));
  const runs2 = new CloudRun({ cloud: cloudWith(waiting), emit: (e) => { events2.push(e); if (e.type === 'error') resolveErr(); } });
  const { runId } = await runs2.start({ rootPath: '/proj', tools: ['ctrace'] });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(runs2.cancel(runId), { ok: true });
  await errored;
  assert.equal(aborted, true);
  assert.equal(events2.at(-1).code, 4);
});

test('serialisers keep only renderer-safe fields', () => {
  const core = { runsOf: (v) => [...v.runs.values()] };
  const view = { jobId: 'j', status: 'completed', conclusion: 'clean', billedCtu: 7, rejected: [], runs: new Map([['r', { id: 'r', tool: 't', version: 'v', status: 'completed', outcome: 'clean', inputCtu: 1, outputCtu: 1, billedCtu: 7, reservedCtu: 9 }]]) };
  const s = serialiseView(core, view);
  assert.deepEqual(Object.keys(s).sort(), ['billedCtu', 'conclusion', 'confirmDeadline', 'jobId', 'rejected', 'runs', 'status']);
  assert.equal(s.runs[0].findingsSoFar, null);
  assert.deepEqual(serialiseFinding({ ruleId: 'R', level: 'note', message: 'm', location: { path: 'p' }, extra: { secret: 'x' } }), { ruleId: 'R', level: 'note', message: 'm', path: 'p', line: null, column: null, endLine: null, endColumn: null });
});
