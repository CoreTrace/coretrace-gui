'use strict';
/**
 * Unit tests for errorUtils.formatFileError.
 * Run with: node src/main/utils/errorUtils.test.js
 *
 * No Electron, no IPC, no real file system — tests the formatter in isolation.
 * Each case asserts the *specific hint text* for that error code so the test
 * cannot pass if hints are removed or the wrong hint fires.
 */

const { formatFileError } = require('./errorUtils');

const FAKE_PATH = process.platform === 'win32'
  ? 'C:\\Users\\nihil\\project\\file.txt'
  : '/home/nihil/delivery/eip/coretrace-gui/file.txt';

// expectedIncludes: substrings that MUST appear in the formatted message.
// At minimum: a snippet of the hint description and the error code.
// Deliberately avoids checking only the path/operation (those are always present).
const cases = [
  { code: 'ENOENT',    op: 'read',         expectedIncludes: ['not found',       'ENOENT']  },
  { code: 'EACCES',    op: 'save',         expectedIncludes: ['Permission denied','EACCES']  },
  { code: 'EPERM',     op: 'delete',       expectedIncludes: ['not permitted',   'EPERM']   },
  { code: 'EBUSY',     op: 'save',         expectedIncludes: ['busy or locked',  'EBUSY']   },
  { code: 'EEXIST',    op: 'create file',  expectedIncludes: ['already exists',  'EEXIST']  },
  { code: 'EISDIR',    op: 'read',         expectedIncludes: ['directory',       'EISDIR']  },
  { code: 'ENOTDIR',   op: 'open folder',  expectedIncludes: ['not a directory', 'ENOTDIR'] },
  { code: 'EROFS',     op: 'save',         expectedIncludes: ['read-only',       'EROFS']   },
  { code: 'ENOSPC',    op: 'save',         expectedIncludes: ['space left',      'ENOSPC']  },
  { code: 'EMFILE',    op: 'open',         expectedIncludes: ['open files',      'EMFILE']  },
  { code: 'ENOTEMPTY', op: 'delete',       expectedIncludes: ['not empty',       'ENOTEMPTY'] },
  // Unknown code: must fall back to the raw error message, not a hint.
  { code: 'UNKNOWN',   op: 'read',         expectedIncludes: ['mock error message for UNKNOWN'] },
];

console.log('=== formatFileError unit tests ===\n');

let passed = 0;
let failed = 0;

for (const { code, op, expectedIncludes } of cases) {
  const err = Object.assign(new Error(`mock error message for ${code}`), { code });
  const msg = formatFileError(err, FAKE_PATH, op);

  const missing = expectedIncludes.filter(s => !msg.includes(s));
  const ok = missing.length === 0;

  if (ok) {
    console.log(`[PASS] ${code.padEnd(12)} ${op}`);
    console.log(`       ${msg}\n`);
    passed++;
  } else {
    console.error(`[FAIL] ${code.padEnd(12)} ${op}`);
    console.error(`       message : ${msg}`);
    console.error(`       missing : ${missing.join(', ')}\n`);
    failed++;
  }
}

// Negative test: verify the test would NOT pass if hints were removed.
// Simulate a formatter that returns only "Failed to read /path. raw message".
{
  const noHintsFormatter = (err, fp, op) => `Failed to ${op} "${fp}". ${err.message}`;
  const err = Object.assign(new Error('raw msg'), { code: 'ENOENT' });
  const badMsg = noHintsFormatter(err, FAKE_PATH, 'read');
  const wouldCatch = !badMsg.includes('not found');
  if (wouldCatch) {
    console.log('[PASS] Negative check: hint-text assertions would catch a missing hint\n');
    passed++;
  } else {
    console.error('[FAIL] Negative check: assertions are too weak — would pass without hints\n');
    failed++;
  }
}

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
