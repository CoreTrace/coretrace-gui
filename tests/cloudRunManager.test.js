const test = require('node:test');
const assert = require('node:assert/strict');

const CloudRunManager = require('../src/renderer/managers/CloudRunManager');

function manager() {
  const calls = [];
  const diagnostics = {
    clearSource: (s) => calls.push(['clear', s]),
    addCloudFindings: (list, meta) => calls.push(['add', list.length, meta.source, meta.jobId]),
  };
  const m = new CloudRunManager({ diagnosticsManager: diagnostics });
  return { m, calls };
}

test('status and tools: greying rule is presentation only', () => {
  const { m } = manager();
  m.applyStatus({ online: true, signedIn: false, upgradeUrl: 'https://up' });
  assert.equal(m.state.status, 'signed_out');
  m.applyStatus({ online: true, signedIn: true, storeKind: 'safe_storage', identity: { principal: { kind: 'user', name: 'Alice' }, org: 'dev', orgs: [] } });
  assert.equal(m.state.status, 'ready');
  assert.match(m.label(), /Alice \(dev\)/);
  m.applyTools([
    { id: 'ctrace', version: '0.74.0', entitled: true, required_entitlement: 'static' },
    { id: 'runtime', version: '1.2.0', entitled: false, required_entitlement: 'runtime' },
  ]);
  assert.deepEqual(m.selectableTools(), ['ctrace']);
  const runtime = m.state.tools.find((t) => t.id === 'runtime');
  assert.equal(runtime.disabled, true);
  assert.equal(runtime.upgradeUrl, 'https://up');
  m.applyStatus({ online: false, signedIn: true });
  assert.equal(m.state.online, false);
});

test('full run: pack → estimate → quote → confirm → waiting → findings → finished', () => {
  const { m, calls } = manager();
  m.applyStatus({ online: true, signedIn: true, identity: { principal: { kind: 'user', name: 'A' }, org: 'dev' } });
  m.beginRun('r1');
  assert.equal(m.state.status, 'packing');
  assert.deepEqual(calls[0], ['clear', 'cloud']);
  m.applyEvent({ type: 'phase', phase: 'upload' });
  assert.equal(m.state.status, 'uploading');
  m.applyEvent({ type: 'pack', fileCount: 12, expandedSize: 1000, compressedSize: 300, excluded: { gitignore: 2 } });
  m.applyEvent({ type: 'phase', phase: 'estimate' });
  m.applyEvent({ type: 'estimate', quote: { quoteId: 'q', totalReservedCtu: 100, items: [{ tool: 'ctrace', version: '0.74.0', reservedCtu: 100 }] }, remainingBudgetCtu: 50000, rejected: [] });
  assert.equal(m.state.status, 'estimating');
  m.applyEvent({ type: 'awaiting_confirmation', confirmDeadline: '2026-09-05T12:00:00Z' });
  assert.equal(m.state.status, 'quote_shown');
  assert.equal(m.state.quote.totalReservedCtu, 100);
  m.confirm(true);
  assert.equal(m.state.status, 'confirming');
  m.applyEvent({ type: 'job', jobId: 'j1', status: 'queued', runs: [{ id: 'run1', tool: 'ctrace', status: 'pending', billedCtu: 0, reservedCtu: 100 }], rejected: [] });
  assert.equal(m.state.status, 'waiting');
  assert.equal(m.state.jobId, 'j1');
  m.applyEvent({ type: 'wait', mode: 'reconnecting' });
  assert.match(m.label(), /reconnecting/);
  m.applyEvent({ type: 'findings', tool: 'ctrace', toolRunId: 'run1', findings: [{ ruleId: 'CT-001', level: 'error', message: 'm', path: 'src/a.c', line: 10, column: 3 }] });
  assert.deepEqual(calls.at(-1), ['add', 1, 'cloud:ctrace', 'j1']);
  m.applyEvent({ type: 'done', exitCode: 1, conclusion: 'findings', billedCtu: 100, thresholdCount: 1, jobId: 'j1', sarif: '{}' });
  assert.equal(m.state.status, 'finished');
  assert.match(m.label(), /billed 100 CTU/);
});

test('decline, errors and sign-out states', () => {
  const { m } = manager();
  m.applyStatus({ online: true, signedIn: true, identity: { principal: { kind: 'user' }, org: 'dev' } });
  m.beginRun('r2');
  m.applyEvent({ type: 'awaiting_confirmation', quote: { quoteId: 'q', totalReservedCtu: 5, items: [] } });
  m.confirm(false);
  assert.equal(m.state.status, 'cancelled');
  m.applyEvent({ type: 'phase', phase: 'wait' });
  assert.equal(m.state.status, 'cancelled', 'late phases do not resurrect a cancelled run');
  m.applyEvent({ type: 'done', exitCode: 0, declined: true });
  assert.equal(m.state.summary.declined, true);
  assert.match(m.label(), /no CTU reserved/);

  m.beginRun('r3');
  m.applyEvent({ type: 'error', code: 2, message: 'Tree exceeds max_files', reason: 'cap_breach' });
  assert.equal(m.state.status, 'failed');
  assert.equal(m.state.error.reason, 'cap_breach');
  m.applyEvent({ type: 'error', code: 3, message: 'Session revoked' });
  assert.equal(m.state.status, 'signed_out');

  m.beginLogin();
  m.applyEvent({ type: 'login', state: 'pending', userCode: 'AB12-CD34', verificationUri: 'https://api/device' });
  assert.match(m.label(), /AB12-CD34/);
  m.applyEvent({ type: 'login', state: 'approved', identity: { principal: { kind: 'user', name: 'B' }, org: 'dev' } });
  assert.equal(m.state.status, 'ready');
  assert.throws(() => m.set({ status: 'nope' }), /unknown state/);
});
