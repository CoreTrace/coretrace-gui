class CTraceRunner {
  constructor(ui) {
    this.ui = ui;
  }

  async run() {
    const ui = this.ui;
    const resultsArea = document.getElementById('ctrace-results-area');
    ui.showToolsPanel();

    if (!resultsArea) {
      ui.notificationManager.showError('CTrace results area not found');
      return;
    }

    const active = ui.tabManager.getActiveTab();
    const currentFilePath = active && active.filePath ? active.filePath : null;

    if (!currentFilePath) {
      resultsArea.innerHTML = `
        <div class="ctrace-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">No active file to analyze</div>
          <div class="error-subtext">Please open a file first</div>
        </div>
      `;
      ui.notificationManager.showWarning('Open a file to analyze with CTrace');
      return;
    }

    if (ui.tabManager.activeTabId && ui.tabManager.isTabFileMissing(ui.tabManager.activeTabId)) {
      resultsArea.innerHTML = `
        <div class="ctrace-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">File not found on disk</div>
          <div class="error-subtext">${currentFilePath}</div>
          <div class="error-help">The file was moved or deleted. Open its new location to analyze it.</div>
        </div>
      `;
      ui.notificationManager.showError('File not found — analysis blocked');
      return;
    }

    const wslFilePath = ui.convertToWSLPath(currentFilePath);
    ui.diagnosticsManager.clear();
    resultsArea.innerHTML = `
      <div class="ctrace-loading">
        <div class="loading-spinner"></div>
        <div class="loading-text">Analyzing ${ui.diagnosticsManager.getFileName(currentFilePath)}...</div>
        <div class="loading-subtext">This may take a moment</div>
      </div>
    `;

    try {
      const argsInput = document.getElementById('ctrace-args');
      const customArgs = argsInput ? argsInput.value.trim() : '';

      let args = [];
      if (customArgs) {
        const matches = customArgs.match(/(?:[^\s"]+|"[^"]*")+/g);
        if (matches) args = matches.map(arg => arg.replace(/^"(.*)"$/, '$1'));
      }

      args.unshift(`--input=${wslFilePath}`);

      console.log('invoke run-ctrace with WSL path:', wslFilePath);
      console.log('Custom arguments:', args);
      const result = await window.api.invoke('run-ctrace', args);

      if (result && result.success) {
        if (!result.output || result.output.trim() === '') {
          resultsArea.innerHTML = `
            <div class="ctrace-error">
              <div class="error-icon">⚠️</div>
              <div class="error-text">No Output from CTrace</div>
              <div class="error-details">CTrace completed successfully but produced no output. This might indicate:</div>
              <div class="error-help">
                • The file may not be supported by CTrace<br>
                • The analysis produced no diagnostics<br>
                • Check that your custom arguments are correct<br>
                • Try adding <code>--sarif-format</code> for JSON output
              </div>
            </div>
          `;
          ui.notificationManager.showWarning('CTrace produced no output');
          return;
        }

        const isParsed = ui.diagnosticsManager.parseOutput(result.output);

        if (isParsed) {
          await ui.diagnosticsManager.displayDiagnostics();
          ui.notificationManager.showSuccess('CTrace analysis completed');
        } else {
          resultsArea.innerHTML = `
            <div class="ctrace-raw-output">
              <div class="raw-output-header"><span>Raw Output</span></div>
              <pre class="raw-output-content">${ui.diagnosticsManager.escapeHtml(result.output)}</pre>
            </div>
          `;
          ui.notificationManager.showSuccess('CTrace completed');
        }
      } else {
        const details = (result && (result.stderr || result.output || result.error)) || 'Unknown error';
        const clean = this._stripAnsi(details);

        if (details.includes('WSL') && details.includes('distributions')) {
          resultsArea.innerHTML = `
            <div class="ctrace-error">
              <div class="error-icon">⚠️</div>
              <div class="error-text">WSL Setup Required</div>
              <div class="error-details">${clean}</div>
              <div class="error-help">
                <strong>Quick Setup:</strong><br>
                1. Open PowerShell as Administrator<br>
                2. Run: <code>wsl --install Ubuntu</code><br>
                3. Restart when prompted<br>
                4. Restart this application
              </div>
            </div>
          `;
          ui.notificationManager.showWarning('WSL setup required');
        } else {
          resultsArea.innerHTML = `
            <div class="ctrace-error">
              <div class="error-icon">❌</div>
              <div class="error-text">CTrace Error</div>
              <pre class="error-details">${clean}</pre>
            </div>
          `;
          ui.notificationManager.showError('Failed to run CTrace');
        }
      }
    } catch (err) {
      resultsArea.innerHTML = `
        <div class="ctrace-error">
          <div class="error-icon">❌</div>
          <div class="error-text">Exception</div>
          <pre class="error-details">${err.message}</pre>
        </div>
      `;
      ui.notificationManager.showError('Error invoking CTrace');
    }
  }

  _stripAnsi(input) {
    if (!input || typeof input !== 'string') return input;
    return input.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

window.CTraceRunner = CTraceRunner;
