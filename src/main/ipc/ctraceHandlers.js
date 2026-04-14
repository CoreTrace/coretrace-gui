const { ipcMain } = require('electron');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { callApi, ensureServerRunning, shutdownServer, resolveBinaryPath, getCapturedSince, waitForCapturedJson } = require('../utils/ctraceServeClient');

const DEBUG_BACKEND_REQUESTS = process.env.CTRACE_GUI_DEBUG_BACKEND === '1' || process.env.NODE_ENV === 'development';

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return Boolean(value);
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return Boolean(value);
}

function toSnakeCase(key) {
  return key.replace(/^-+/, '').replace(/-/g, '_');
}

function ensureArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    // Support comma-separated lists.
    if (val.includes(',')) return val.split(',').map(s => s.trim()).filter(Boolean);
    return [val];
  }
  return [String(val)];
}

function isSarif(json) {
  return Boolean(json && typeof json === 'object' && Array.isArray(json.runs));
}

function sarifResultsCount(sarif) {
  if (!isSarif(sarif)) return 0;
  const run0 = sarif.runs[0] || {};
  const results = Array.isArray(run0.results) ? run0.results : [];
  return results.length;
}

function looksLikeStackAnalyzerJson(json) {
  return Boolean(
    json &&
    typeof json === 'object' &&
    json.meta &&
    typeof json.meta === 'object' &&
    (json.meta.tool === 'ctrace-stack-analyzer' || json.meta.tool === 'ctrace_stack_analyzer') &&
    Array.isArray(json.diagnostics)
  );
}

function normalizeToolName(toolName) {
  if (typeof toolName !== 'string') return '';
  const trimmed = toolName.trim();
  return trimmed || '';
}

function inferToolNameFromMessage(message, fallbackToolName = '') {
  const msg = String(message || '');
  const normalizedFallback = normalizeToolName(fallbackToolName);

  // Check for Python traceback (indicates Python-based tool)
  if (msg.includes('Traceback (most recent call last)')) {
    const scriptMatch = msg.match(/File "([^"]+)"/);
    if (scriptMatch) {
      const scriptPath = scriptMatch[1];
      const scriptName = scriptPath.split(/[/\\]/).pop();
      if (scriptName && scriptName.endsWith('.py')) {
        return scriptName.replace('.py', '');
      }
    }
    return normalizedFallback || 'PythonTool';
  }

  const toolPatterns = [
    /(?:Running|Executing|Invoking|Error in|Failed to run)\s+([a-zA-Z0-9_\-]+)/i,
    /^([a-zA-Z0-9_\-]+):\s*(?:error|ERROR|Error)/i,
    /\[([a-zA-Z0-9_\-]+)\]/i,
    /ctrace[_-]?([a-zA-Z0-9_\-]+)/i,
  ];

  for (const toolRe of toolPatterns) {
    const toolMatch = msg.match(toolRe);
    if (toolMatch && toolMatch[1]) {
      return toolMatch[1];
    }
  }

  return normalizedFallback || 'UnknownTool';
}

function isLikelyExecutionFailureLine(line) {
  if (typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed) return false;

  const hardFailurePatterns = [
    /can't open file/i,
    /no such file or directory/i,
    /unknown tool/i,
    /failed to run/i,
    /tool execution failed/i,
    /\bexception\b/i,
    /\btraceback\b/i
  ];

  if (hardFailurePatterns.some((re) => re.test(trimmed))) return true;

  // Avoid turning diagnostic payloads or status lines into synthetic tool errors.
  if (/^"?severity"?\s*[:=]/i.test(trimmed) || /"severity"\s*:\s*"(?:ERROR|WARNING|INFO)"/i.test(trimmed)) {
    return false;
  }
  if (/^\{.*\}$/.test(trimmed) || /^\[.*\]$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return false;
    } catch (_) {
      // Fall through for non-JSON lines that merely resemble JSON.
    }
  }

  // Generic ERROR lines only count if they also include a strong failure keyword.
  return /\bERROR\b/i.test(trimmed) && /\b(failed|failure|exception|unknown|invalid|missing|cannot|can't|unable|denied|unsupported)\b/i.test(trimmed);
}

function buildToolErrorDiagnostics(textEntries, inputFile) {
  const diags = [];
  const seen = new Set();
  for (const entry of textEntries || []) {
    const message = typeof entry === 'string' ? entry : entry && entry.message;
    const fallbackToolName = typeof entry === 'string' ? '' : entry && entry.toolName;
    const msg = String(message || '').trim();
    if (!msg) continue;

    const matches = [];
    const tracebackMatch = msg.match(/Traceback \(most recent call last\):[\s\S]*?(?=\n\s*\n|$)/i);
    if (tracebackMatch) {
      matches.push(tracebackMatch[0].trim());
    } else {
      for (const line of msg.split('\n')) {
        if (isLikelyExecutionFailureLine(line)) {
          matches.push(line.trim());
        }
      }
    }

    for (const match of matches) {
      if (seen.has(match)) continue;
      seen.add(match);

      const toolName = inferToolNameFromMessage(match, fallbackToolName);
      const toolError = describeToolExecutionFailure(match, toolName);
      diags.push({
        id: `tool-error-${seen.size}`,
        severity: 'ERROR',
        ruleId: `ToolExecutionError.${toolName}`,
        location: {
          file: inputFile || '',
          function: 'global',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1
        },
        details: {
          message: toolError.summary,
          rawMessage: msg,
          failureKind: toolError.kind,
          toolName,
          suggestion: toolError.suggestion
        }
      });
    }
  }

  return diags;
}

function describeToolExecutionFailure(message, toolName) {
  const normalizedTool = normalizeToolName(toolName) || 'requested tool';
  const msg = String(message || '').trim();

  if (/unknown tool/i.test(msg) || /not available/i.test(msg) || /unsupported tool/i.test(msg)) {
    return {
      kind: 'tool-unavailable',
      summary: `${normalizedTool} was requested but is not available in this backend.`,
      suggestion: `Check the requested tool name and confirm that ${normalizedTool} is installed and enabled.`
    };
  }

  if (/no such file or directory/i.test(msg) || /can't open file/i.test(msg) || /cannot open shared object file/i.test(msg)) {
    return {
      kind: 'tool-startup-failed',
      summary: `${normalizedTool} failed to start because a required file or runtime dependency is missing.`,
      suggestion: `Verify that ${normalizedTool} and its required runtime files are installed on this system.`
    };
  }

  if (/\btraceback\b/i.test(msg) || /\bexception\b/i.test(msg)) {
    return {
      kind: 'tool-crashed',
      summary: `${normalizedTool} failed while running and reported an internal exception.`,
      suggestion: `Inspect the tool output below for the stack trace and verify the tool's own runtime dependencies.`
    };
  }

  if (/failed to run/i.test(msg) || /tool execution failed/i.test(msg) || /\bERROR\b/i.test(msg)) {
    return {
      kind: 'tool-execution-failed',
      summary: `${normalizedTool} failed during execution.`,
      suggestion: `Inspect the tool output below for the exact failure reported by ${normalizedTool}.`
    };
  }

  return {
    kind: 'tool-error',
    summary: `${normalizedTool} reported an execution error.`,
    suggestion: `Inspect the tool output below for more details from ${normalizedTool}.`
  };
}

function isOutputsEnvelope(result) {
  return Boolean(result && typeof result === 'object' && result.outputs && typeof result.outputs === 'object');
}

function extractToolMessages(outputs, toolName) {
  const entries = outputs && outputs[toolName];
  if (!Array.isArray(entries)) return [];
  return entries.map(e => e && e.message).filter(m => m !== undefined);
}

function extractAllTextMessagesFromOutputs(outputs) {
  if (!outputs || typeof outputs !== 'object') return [];
  const out = [];
  for (const toolName of Object.keys(outputs)) {
    const entries = outputs[toolName];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e) continue;
      if (typeof e.message === 'string' && e.message.trim()) {
        out.push({
          toolName,
          stream: e.stream || '',
          message: e.message
        });
      }
    }
  }
  return out;
}

function extractStackAnalyzerFromOutputs(outputs) {
  const candidates = [];
  // Common key is snake_case, but be defensive.
  candidates.push(...extractToolMessages(outputs, 'ctrace_stack_analyzer'));
  candidates.push(...extractToolMessages(outputs, 'ctrace-stack-analyzer'));
  // Last message tends to be the final JSON.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const m = candidates[i];
    if (looksLikeStackAnalyzerJson(m)) return m;
  }
  return null;
}

function extractSarifFromOutputs(outputs) {
  const sarifs = [];
  if (!outputs || typeof outputs !== 'object') return sarifs;
  for (const toolName of Object.keys(outputs)) {
    const entries = outputs[toolName];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const m = e && e.message;
      if (isSarif(m)) sarifs.push({ tool: toolName, sarif: m });
    }
  }
  return sarifs;
}

function pickBestSarif(sarifs) {
  if (!Array.isArray(sarifs) || sarifs.length === 0) return null;
  // Prefer SARIF that actually contains results.
  const withResults = sarifs.find(s => sarifResultsCount(s.sarif) > 0);
  return withResults || sarifs[0];
}

function argsToRunAnalysisParams(args = []) {
  /** @type {Record<string, any>} */
  const out = {};

  // Accept both --key=value and --key value forms.
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== 'string') continue;
    if (!a.startsWith('--')) continue;

    const eqIdx = a.indexOf('=');
    let key;
    let value;

    if (eqIdx !== -1) {
      key = a.slice(2, eqIdx);
      value = a.slice(eqIdx + 1);
    } else {
      key = a.slice(2);
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }

    // Normalize keys we know about.
    const normalized = toSnakeCase(key);

    // Drop CLI-only flags that shouldn't be forwarded.
    if (normalized === 'ipc' || normalized === 'ipc_path') continue;

    // Known list-like keys.
    if (normalized === 'input' || normalized === 'entry_points' || normalized === 'entry_point' || normalized === 'invoke') {
      const targetKey = normalized === 'entry_point' ? 'entry_points' : normalized;
      out[targetKey] = ensureArray(value);
      continue;
    }

    // Known boolean flags.
    if (
      normalized === 'static_analysis' ||
      normalized === 'dynamic_analysis' ||
      normalized === 'sarif_format' ||
      normalized === 'async' ||
      normalized === 'verbose'
    ) {
      out[normalized] = parseBoolean(value);
      continue;
    }

    // Translate historical CLI flag names.
    if (normalized === 'sarif_format' || normalized === 'sarif') {
      out.sarif_format = true;
      continue;
    }

    // Default: keep as string or boolean.
    out[normalized] = value;
  }

  // Ensure required/requested defaults.
  out.ipc = 'serve';
  out.ipc_path = out.ipc_path || '/tmp/coretrace_ipc';

  if (typeof out.static_analysis === 'undefined') out.static_analysis = true;
  if (typeof out.dynamic_analysis === 'undefined') out.dynamic_analysis = false;
  if (typeof out.async === 'undefined') out.async = false;

  // Default to full analysis profile so all functions (not just entry points) are analyzed.
  if (typeof out.analysis_profile === 'undefined') out.analysis_profile = 'full';

  // `input` is required by the backend.
  if (out.input && !Array.isArray(out.input)) out.input = ensureArray(out.input);

  return out;
}

function deriveCwdFromInputPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return '';
  // If the renderer passed a WSL-style path, use posix dirname.
  if (inputPath.includes('/')) {
    const dir = path.posix.dirname(inputPath);
    return dir && dir !== '.' ? dir : '';
  }
  const dir = path.dirname(inputPath);
  return dir && dir !== '.' ? dir : '';
}

// ==========================================
// MAIN HANDLER
// ==========================================

function setupCtraceHandlers() {
  ipcMain.handle('run-ctrace', async (_event, args = []) => {
    // Validate binary presence early (for a clear error message).
    try {
      console.log('[ctrace debug] Binary path:', resolveBinaryPath());
      await fs.access(resolveBinaryPath());
    } catch (e) {
      return { success: false, error: `ctrace binary not found: ${e.message}` };
    }

    // The server is run through WSL on Windows.
    if (os.platform() === 'win32') {
      // We rely on main.js's WSL readiness checks + UI.
      // If WSL is missing, the spawn will fail and we surface the error.
    }

    try {
      const params = argsToRunAnalysisParams(args);

      if (DEBUG_BACKEND_REQUESTS) {
        console.log('[ctrace debug] run-ctrace args:', JSON.stringify(args));
        console.log('[ctrace debug] run-ctrace params:', JSON.stringify(params));
      }

      await ensureServerRunning();
      const captureSince = Date.now();
      const apiRes = await callApi('run_analysis', params);

      if (!apiRes.ok) {
        const errText = apiRes.json?.error?.message || apiRes.json?.error || apiRes.raw || `HTTP ${apiRes.statusCode}`;
        return { success: false, error: errText, statusCode: apiRes.statusCode };
      }

      // Most backends respond with {result: ...}. If not, return the full JSON.
      const payload = apiRes.json?.result ?? apiRes.json;

      // Newer backends return a "result" envelope with per-tool outputs.
      // If present, flatten the most relevant tool output into the legacy format the GUI expects.
      if (isOutputsEnvelope(payload)) {
        const outputs = payload.outputs;
        let stackJson = extractStackAnalyzerFromOutputs(outputs);
        const sarifs = extractSarifFromOutputs(outputs);
        const bestSarif = pickBestSarif(sarifs);

        const inputFile = Array.isArray(payload.input) ? payload.input[0] : (Array.isArray(params.input) ? params.input[0] : '');
        const outputTextMessages = extractAllTextMessagesFromOutputs(outputs);
        const toolErrorDiags = buildToolErrorDiagnostics(outputTextMessages, inputFile);

        const wantsStackAnalyzer = Array.isArray(params.invoke) && params.invoke.includes('ctrace_stack_analyzer');

        // Some backends/tools print the stack-analyzer JSON after the HTTP response.
        // If we didn't get diagnostics yet, fall back to captured stdout/stderr.
        if (
          wantsStackAnalyzer &&
          typeof waitForCapturedJson === 'function' &&
          typeof getCapturedSince === 'function' &&
          (!stackJson || (Array.isArray(stackJson.diagnostics) && stackJson.diagnostics.length === 0))
        ) {
          try {
            await waitForCapturedJson(
              (j) => looksLikeStackAnalyzerJson(j) && Array.isArray(j.diagnostics) && j.diagnostics.length > 0,
              { sinceTs: captureSince, timeoutMs: 15000, pollMs: 250 }
            );
          } catch {
            // Ignore timeouts; we'll still return what we have.
          }

          const capturedOut = getCapturedSince(captureSince);
          const laterStackJson = [...capturedOut.json].reverse().find(
            (j) => looksLikeStackAnalyzerJson(j) && Array.isArray(j.diagnostics) && j.diagnostics.length > 0
          );
          if (laterStackJson) stackJson = laterStackJson;

          // Also surface tool execution errors from stderr/stdout if any.
          if (capturedOut.text && capturedOut.text.length > 0) {
            toolErrorDiags.push(...buildToolErrorDiagnostics(capturedOut.text, inputFile));
          }
        }

        if (stackJson) {
          const combined = {
            ...stackJson,
            sarif: bestSarif ? bestSarif.sarif : null,
            diagnostics: Array.isArray(stackJson.diagnostics)
              ? [...stackJson.diagnostics, ...toolErrorDiags]
              : toolErrorDiags
          };
          return { success: true, output: JSON.stringify(combined, null, 2), statusCode: apiRes.statusCode };
        }

        if (bestSarif) {
          return { success: true, output: JSON.stringify(bestSarif.sarif, null, 2), statusCode: apiRes.statusCode };
        }

        if (toolErrorDiags.length > 0) {
          const combined = {
            meta: { tool: 'coretrace', note: 'Tool execution errors captured from /api outputs', sarif: Boolean(payload.sarif_format) },
            functions: [],
            diagnostics: toolErrorDiags
          };
          return { success: true, output: JSON.stringify(combined, null, 2), statusCode: apiRes.statusCode };
        }
      }

      // If we got SARIF with no results, but we invoked the stack analyzer (or any tool that prints
      // additional JSON to stdout), wait for the extra JSON and merge so the GUI doesn't show "All clear".
      const wantsStackAnalyzer = Array.isArray(params.invoke) && params.invoke.includes('ctrace_stack_analyzer');
      const isSarifPayload = isSarif(payload);
      const sarifCount = isSarifPayload ? sarifResultsCount(payload) : null;

      if (wantsStackAnalyzer && isSarifPayload && sarifCount === 0) {
        // Wait for stack analyzer JSON to appear on stdout (backend may return SARIF early).
        await waitForCapturedJson(looksLikeStackAnalyzerJson, { sinceTs: captureSince, timeoutMs: 45000, pollMs: 250 });
        const capturedOut = getCapturedSince(captureSince);
        const stackJson = [...capturedOut.json].reverse().find(looksLikeStackAnalyzerJson) || null;
        const toolErrorDiags = buildToolErrorDiagnostics(capturedOut.text, (params.input && params.input[0]) || '');

        if (stackJson) {
          // Preserve SARIF alongside stack analyzer output.
          const combined = {
            ...stackJson,
            sarif: payload,
            diagnostics: Array.isArray(stackJson.diagnostics)
              ? [...stackJson.diagnostics, ...toolErrorDiags]
              : toolErrorDiags
          };
          return { success: true, output: JSON.stringify(combined, null, 2), statusCode: apiRes.statusCode };
        }

        // If stack JSON didn't show up, still surface tool execution errors if we saw any.
        if (toolErrorDiags.length > 0) {
          const combined = {
            meta: { tool: 'coretrace', note: 'SARIF contained no results; tool execution errors captured from server logs', sarif: true },
            functions: [],
            diagnostics: toolErrorDiags,
            sarif: payload
          };
          return { success: true, output: JSON.stringify(combined, null, 2), statusCode: apiRes.statusCode };
        }
      }

      const output = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      return { success: true, output, statusCode: apiRes.statusCode };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { setupCtraceHandlers, shutdownCtraceServer: shutdownServer };
