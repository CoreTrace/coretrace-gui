/**
 * Diagnostics Manager - Handles CTrace diagnostics visualization
 * Manages parsing, display, filtering, and Monaco editor integration
 */

class DiagnosticsManager {
  constructor(monacoEditorManager) {
    this.monacoEditorManager = monacoEditorManager;
    this.currentDiagnostics = null;
    this.currentMetadata = null;
    this.currentFunctions = null;
    this.decorations = []; // Store Monaco decorations
    this.hoverProviderDisposable = null;
    this.currentSeverityFilter = 'ALL'; // ALL, ERROR, WARNING, INFO
    
    this.severityColors = {
      'ERROR': '#ff6b6b',
      'WARNING': '#ffa500',
      'INFO': '#58a6ff'
    };
  }

  /**
   * Parse CTrace JSON output and store data
   * @param {string} output - JSON output from CTrace
   * @returns {boolean} Success status
   */
  parseOutput(output) {
    try {
      const data = JSON.parse(output);
      
      this.currentMetadata = data.meta || null;
      this.currentFunctions = data.functions || [];
      this.currentDiagnostics = data.diagnostics || [];
      
      console.log('Parsed CTrace output:', {
        meta: this.currentMetadata,
        functionsCount: this.currentFunctions.length,
        diagnosticsCount: this.currentDiagnostics.length
      });
      
      return true;
    } catch (error) {
      console.error('Failed to parse CTrace JSON output:', error);
      this.clear();
      return false;
    }
  }

  /**
   * Group diagnostics by Rule ID and then by Function
   * @param {Array} diagnostics - Array of diagnostics
   * @returns {Object} Grouped diagnostics structure
   */
  groupDiagnostics(diagnostics) {
    const groups = {};
    
    diagnostics.forEach(diag => {
      const ruleId = diag.ruleId;
      const funcName = diag.location.function;
      
      if (!groups[ruleId]) {
        groups[ruleId] = {
          ruleId: ruleId,
          severity: diag.severity,
          totalCount: 0,
          functions: {}
        };
      }
      
      if (!groups[ruleId].functions[funcName]) {
        groups[ruleId].functions[funcName] = [];
      }
      
      groups[ruleId].functions[funcName].push(diag);
      groups[ruleId].totalCount++;
    });
    
    return groups;
  }

  /**
   * Parse diagnostic message to extract structured information
   * @param {string} message - Raw diagnostic message
   * @returns {Object} Parsed message components
   */
  parseMessage(message) {
    const parsed = {
      problem: '',
      variable: '',
      escapesVia: '',
      details: ''
    };
    
    // Extract variable name
    const varMatch = message.match(/variable\s+'([^']+)'/i) || message.match(/variable\s+`([^`]+)`/i);
    if (varMatch) {
      parsed.variable = varMatch[1];
    }
    
    // Extract problem type
    if (message.includes('stack pointer escape')) {
      parsed.problem = 'Stack Pointer Escape';
    } else if (message.includes('recursion')) {
      parsed.problem = 'Recursion Detected';
    } else {
      // Extract first line as problem
      const firstLine = message.split('\n')[0];
      parsed.problem = firstLine.replace(/^\s*\[!!\]\s*/i, '').trim();
    }
    
    // Extract escape mechanism
    const escapeMatch = message.match(/function\s+'([^']+)'|function\s+`([^`]+)`/);
    if (escapeMatch) {
      parsed.escapesVia = escapeMatch[1] || escapeMatch[2];
      
      // Extract additional context
      const contextMatch = message.match(/\(([^)]+)\)/);
      if (contextMatch) {
        parsed.details = contextMatch[1];
      }
    }
    
    return parsed;
  }

  /**
   * Render metadata section
   * @returns {string} HTML string for metadata
   */
  renderMetadata() {
    if (!this.currentMetadata) return '';
    
    const meta = this.currentMetadata;
    return `
      <div class="ctrace-metadata-compact">
        <div class="metadata-header">
          <span class="metadata-icon">📊</span>
          <span class="metadata-file-name" title="${this.escapeHtml(meta.inputFile || 'N/A')}">${this.escapeHtml(this.getFileName(meta.inputFile))}</span>
          <span class="metadata-mode-badge">${this.escapeHtml(meta.mode || 'N/A')}</span>
        </div>
        <div class="metadata-stats">
          <span class="stat-item" title="Tool Used">🔧 ${this.escapeHtml(meta.tool || 'ctrace')}</span>
          <span class="stat-item" title="Functions Analyzed">⚡ ${this.currentFunctions.length} functions</span>
          <span class="stat-item" title="Analysis Time">${meta.analysisTimeMs >= 0 ? '⏱️ ' + meta.analysisTimeMs + ' ms' : ''}</span>
          <span class="stat-item" title="Stack Limit">💾 ${meta.stackLimit ? this.formatBytes(meta.stackLimit) : 'N/A'}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render diagnostics list with filtering
   * @returns {string} HTML string for diagnostics
   */
  renderDiagnostics() {
    if (!this.currentDiagnostics || this.currentDiagnostics.length === 0) {
      return `
        <div class="diagnostics-container">
          <div class="diagnostics-toolbar">
            <div class="diagnostics-count">
              <span class="count-icon">✅</span>
              <span class="count-text">No Issues Found</span>
            </div>
          </div>
          <div class="diagnostics-empty">
            <div class="empty-icon">🎉</div>
            <div class="empty-text">All clear! No diagnostics reported.</div>
          </div>
        </div>
      `;
    }
    
    const filteredDiagnostics = this.filterDiagnostics(this.currentDiagnostics);
    
    // Generate summary text
    const severityCounts = {};
    filteredDiagnostics.forEach(diag => {
      severityCounts[diag.severity] = (severityCounts[diag.severity] || 0) + 1;
    });
    
    const groupedDiagnostics = this.groupDiagnostics(filteredDiagnostics);
    const ruleCount = Object.keys(groupedDiagnostics).length;
    
    let summaryText = `${filteredDiagnostics.length} total`;
    if (severityCounts.ERROR) summaryText = `${severityCounts.ERROR} Error${severityCounts.ERROR > 1 ? 's' : ''}`;
    else if (severityCounts.WARNING) summaryText = `${severityCounts.WARNING} Warning${severityCounts.WARNING > 1 ? 's' : ''}`;
    else if (severityCounts.INFO) summaryText = `${severityCounts.INFO} Info`;
    
    if (ruleCount > 0) {
      summaryText += ` (${ruleCount} Rule${ruleCount > 1 ? 's' : ''})`;
    }
    
    // Generate flat list HTML
    const diagnosticsHtml = filteredDiagnostics.map(diag => {
      const severityColor = this.severityColors[diag.severity] || '#7d8590';
      const icon = this.getSeverityIcon(diag.severity);
      const parsed = this.parseMessage(diag.details.message);
      
      return `
        <div class="diagnostic-item" data-diag-id="${this.escapeHtml(diag.id)}" onclick="window.diagnosticsManager.jumpToDiagnostic('${this.escapeHtml(diag.id)}')">
          <div class="diagnostic-item-header">
            <div class="diagnostic-severity-icon" style="background: ${severityColor};">
              ${icon}
            </div>
            <div class="diagnostic-item-info">
              <div class="diagnostic-title">
                <span class="diagnostic-rule">${this.escapeHtml(diag.ruleId)}</span>
                <span class="diagnostic-separator">•</span>
                <span class="diagnostic-function">${this.escapeHtml(diag.location.function)}</span>
              </div>
              <div class="diagnostic-location">
                📍 Line ${diag.location.startLine}${diag.location.startColumn ? ':' + diag.location.startColumn : ''}
              </div>
            </div>
          </div>
          <div class="diagnostic-item-details">
            ${parsed.variable ? `<div class="detail-row"><span class="detail-label">Variable:</span> <code>${this.escapeHtml(parsed.variable)}</code></div>` : ''}
            ${parsed.escapesVia ? `<div class="detail-row"><span class="detail-label">Escapes via:</span> <code>${this.escapeHtml(parsed.escapesVia)}</code></div>` : ''}
            ${parsed.details ? `<div class="detail-row detail-note">${this.escapeHtml(parsed.details)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="diagnostics-container">
        <div class="diagnostics-toolbar">
          <div class="diagnostics-count">
            <span class="count-icon">🔍</span>
            <span class="count-text">${summaryText}</span>
          </div>
          ${this.renderFilterDropdown()}
        </div>
        <div class="diagnostics-flat-list">
          ${diagnosticsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Render filter dropdown
   * @returns {string} HTML for filter dropdown
   */
  renderFilterDropdown() {
    return `
      <div class="severity-filter">
        <select id="severity-filter-select" onchange="window.diagnosticsManager.changeSeverityFilter(this.value)">
          <option value="ALL" ${this.currentSeverityFilter === 'ALL' ? 'selected' : ''}>🔍 All Issues</option>
          <option value="ERROR" ${this.currentSeverityFilter === 'ERROR' ? 'selected' : ''}>❌ Errors</option>
          <option value="WARNING" ${this.currentSeverityFilter === 'WARNING' ? 'selected' : ''}>⚠️ Warnings</option>
          <option value="INFO" ${this.currentSeverityFilter === 'INFO' ? 'selected' : ''}>ℹ️ Info</option>
        </select>
      </div>
    `;
  }

  /**
   * Filter diagnostics by current severity filter
   * @param {Array} diagnostics - Diagnostics array
   * @returns {Array} Filtered diagnostics
   */
  filterDiagnostics(diagnostics) {
    if (this.currentSeverityFilter === 'ALL') {
      return diagnostics;
    }
    return diagnostics.filter(diag => diag.severity === this.currentSeverityFilter);
  }

  /**
   * Change severity filter and re-render
   * @param {string} severity - Severity filter value
   */
  changeSeverityFilter(severity) {
    this.currentSeverityFilter = severity;
    this.render();
    this.applyMonacoDecorations(); // Re-apply decorations with new filter
  }

  /**
   * Jump to diagnostic location in editor
   * @param {string} diagId - Diagnostic ID
   */
  jumpToDiagnostic(diagId) {
    const diag = this.currentDiagnostics.find(d => d.id === diagId);
    if (!diag || !diag.location || !diag.location.startLine) {
      console.warn('Cannot jump to diagnostic - no location info:', diagId);
      return;
    }
    
    if (this.monacoEditorManager && this.monacoEditorManager.editor) {
      this.monacoEditorManager.jumpToLine(diag.location.startLine);
      console.log(`Jumped to diagnostic ${diagId} at line ${diag.location.startLine}`);
    }
  }

  /**
   * Apply Monaco editor decorations for diagnostics
   */
  async applyMonacoDecorations() {
    if (!this.monacoEditorManager || !this.monacoEditorManager.editor) {
      console.warn('Monaco editor not available for decorations');
      return;
    }

    await this.monacoEditorManager.initializationPromise;
    const editor = this.monacoEditorManager.editor;
    const model = editor.getModel();
    
    if (!model) {
      console.warn('Monaco model not available');
      return;
    }

    // Clear previous decorations
    this.decorations = editor.deltaDecorations(this.decorations, []);

    // Get filtered diagnostics
    const filteredDiagnostics = this.filterDiagnostics(this.currentDiagnostics || []);
    
    if (filteredDiagnostics.length === 0) {
      return;
    }

    // Create new decorations
    const newDecorations = filteredDiagnostics
      .filter(diag => diag.location && diag.location.startLine > 0)
      .map(diag => {
        const line = diag.location.startLine;
        const startCol = diag.location.startColumn || 1;
        const endCol = diag.location.endColumn || model.getLineMaxColumn(line);
        const severity = diag.severity;
        const color = this.severityColors[severity] || '#7d8590';
        
        // Choose decoration class based on severity
        let inlineClassName = 'diagnostic-decoration-warning';
        let glyphMarginClassName = 'diagnostic-glyph-warning';
        
        if (severity === 'ERROR') {
          inlineClassName = 'diagnostic-decoration-error';
          glyphMarginClassName = 'diagnostic-glyph-error';
        } else if (severity === 'INFO') {
          inlineClassName = 'diagnostic-decoration-info';
          glyphMarginClassName = 'diagnostic-glyph-info';
        }

        return {
          range: new window.monaco.Range(line, startCol, line, endCol),
          options: {
            isWholeLine: false,
            className: inlineClassName,
            glyphMarginClassName: glyphMarginClassName,
            minimap: {
              color: color,
              position: window.monaco.editor.MinimapPosition.Inline
            },
            overviewRuler: {
              color: color,
              position: window.monaco.editor.OverviewRulerLane.Full
            }
          }
        };
      });

    // Apply decorations
    this.decorations = editor.deltaDecorations([], newDecorations);
    
    console.log(`Applied ${newDecorations.length} Monaco decorations`);
  }

  /**
   * Register Monaco hover provider for diagnostics
   */
  registerHoverProvider() {
    if (!window.monaco || this.hoverProviderDisposable) {
      return;
    }

    this.hoverProviderDisposable = window.monaco.languages.registerHoverProvider(['c', 'cpp'], {
      provideHover: (model, position) => {
        if (!this.currentDiagnostics) return null;

        const line = position.lineNumber;
        const filteredDiagnostics = this.filterDiagnostics(this.currentDiagnostics);
        const diagnosticsAtLine = filteredDiagnostics.filter(
          diag => diag.location && diag.location.startLine === line
        );

        if (diagnosticsAtLine.length === 0) return null;

        const contents = diagnosticsAtLine.map(diag => ({
          value: this.formatDiagnosticHover(diag)
        }));

        return {
          contents: contents
        };
      }
    });

    console.log('Registered Monaco hover provider for diagnostics');
  }

  /**
   * Format diagnostic hover message
   * @param {Object} diag - Diagnostic object
   * @returns {string} Formatted hover message
   */
  formatDiagnosticHover(diag) {
    const parsed = this.parseMessage(diag.details.message);
    
    let message = `**[${diag.severity}] ${diag.ruleId}**\n\n`;
    message += `**Function:** ${diag.location.function}\n\n`;
    message += `**Location:** Line ${diag.location.startLine}`;
    
    if (diag.location.startColumn) {
      message += `:${diag.location.startColumn}`;
    }
    
    message += `\n\n---\n\n`;
    
    if (parsed.problem) {
      message += `**Problem:** ${parsed.problem}\n\n`;
    }
    
    if (parsed.variable) {
      message += `**Variable:** \`${parsed.variable}\`\n\n`;
    }
    
    if (parsed.escapesVia) {
      message += `**Escapes via:** \`${parsed.escapesVia}\``;
      if (parsed.details) {
        message += ` _(${parsed.details})_`;
      }
      message += `\n\n`;
    }
    
    if (diag.details.variableAliasing && diag.details.variableAliasing.length > 0) {
      message += `**Variable Aliasing:**\n\n`;
      message += diag.details.variableAliasing.map(v => `• ${v}`).join('\n');
    }
    
    return message;
  }

  /**
   * Get severity icon
   * @param {string} severity - Severity level
   * @returns {string} Icon character
   */
  getSeverityIcon(severity) {
    switch (severity) {
      case 'ERROR': return '❌';
      case 'WARNING': return '⚠️';
      case 'INFO': return 'ℹ️';
      default: return '•';
    }
  }

  /**
   * Render all diagnostic content to output panel
   */
  render() {
    const resultsArea = document.getElementById('ctrace-results-area');
    if (!resultsArea) return;
    
    const metadataHtml = this.renderMetadata();
    const diagnosticsHtml = this.renderDiagnostics();
    
    resultsArea.innerHTML = metadataHtml + diagnosticsHtml;
  }

  /**
   * Display full output (metadata + diagnostics) and apply editor decorations
   */
  async displayDiagnostics() {
    this.render();
    await this.applyMonacoDecorations();
    this.registerHoverProvider();
  }

  /**
   * Clear all diagnostics data and decorations
   */
  clear() {
    this.currentMetadata = null;
    this.currentFunctions = null;
    this.currentDiagnostics = null;
    this.currentSeverityFilter = 'ALL';
    
    // Clear Monaco decorations
    if (this.monacoEditorManager && this.monacoEditorManager.editor) {
      this.decorations = this.monacoEditorManager.editor.deltaDecorations(this.decorations, []);
    }
    
    // Dispose hover provider
    if (this.hoverProviderDisposable) {
      this.hoverProviderDisposable.dispose();
      this.hoverProviderDisposable = null;
    }
    
    // Reset results area to placeholder
    const resultsArea = document.getElementById('ctrace-results-area');
    if (resultsArea) {
      resultsArea.innerHTML = `
        <div class="ctrace-placeholder">
          <div class="placeholder-icon">🔍</div>
          <div class="placeholder-text">Run CTrace to analyze your code</div>
          <div class="placeholder-subtext">Click the button above to start</div>
        </div>
      `;
    }
  }

  /**
   * Utility: Escape HTML
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Utility: Truncate message
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateMessage(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Utility: Get filename from path
   * @param {string} path - File path
   * @returns {string} Filename
   */
  getFileName(path) {
    if (!path) return '';
    return path.split(/[/\\]/).pop();
  }

  /**
   * Utility: Format bytes to human-readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = DiagnosticsManager;
