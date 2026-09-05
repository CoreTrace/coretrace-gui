const test = require('node:test');
const assert = require('node:assert/strict');

const DiagnosticsManager = require('../src/renderer/managers/DiagnosticsManager');

test('cloud findings map to diagnostics attributed to the tool and job; clearSource removes only cloud entries', () => {
  const dm = new DiagnosticsManager(null);
  dm.currentDiagnostics = [{ id: 'local-1', ruleId: 'X', severity: 'INFO', source: 'local', details: { message: 'local' }, location: { file: 'a.c', startLine: 1, startColumn: 1, endLine: 1, endColumn: 1, function: 'global' } }];
  dm.addCloudFindings(
    [
      { ruleId: 'CT-001', level: 'error', message: 'Buffer overflow', path: 'src/a.c', line: 10, column: 3, endLine: 10, endColumn: 20 },
      { ruleId: 'CT-017', level: 'warning', message: 'Unchecked', path: 'src/b.c', line: 4, column: null },
      { ruleId: 'CT-042', level: 'note', message: 'Style', path: 'src/c.c' },
    ],
    { tool: 'ctrace', jobId: 'job-1', source: 'cloud:ctrace' },
  );
  assert.equal(dm.currentDiagnostics.length, 4);
  const cloud = dm.currentDiagnostics.filter((d) => d.source === 'cloud:ctrace');
  assert.equal(cloud.length, 3);
  assert.deepEqual(cloud[0].location, { file: 'src/a.c', startLine: 10, startColumn: 3, endLine: 10, endColumn: 20, function: 'global' });
  assert.equal(cloud[0].severity, 'ERROR');
  assert.equal(cloud[1].severity, 'WARNING');
  assert.equal(cloud[1].location.startColumn, 1);
  assert.equal(cloud[2].severity, 'INFO');
  assert.equal(cloud[2].location.startLine, 1);
  assert.equal(cloud[0].jobId, 'job-1');
  assert.match(cloud[0].id, /^cloud:ctrace:/);
  assert.equal(dm.currentMetadata.tool, 'cloud');
  assert.deepEqual(dm.currentMetadata.tools, ['ctrace']);
  assert.equal(dm.currentMetadata.jobId, 'job-1');

  dm.addCloudFindings([{ ruleId: 'R', level: 'error', message: 'm', path: 'x.c', line: 1 }], { tool: 'runtime', jobId: 'job-1', source: 'cloud:runtime' });
  assert.deepEqual(dm.currentMetadata.tools, ['ctrace', 'runtime']);
  assert.equal(dm.currentDiagnostics.length, 5);

  dm.clearSource('cloud');
  assert.equal(dm.currentDiagnostics.length, 1);
  assert.equal(dm.currentDiagnostics[0].id, 'local-1');
  assert.equal(dm.currentMetadata, null);
});
