/**
 * TerminalManager - Integrated terminal panel for CTraceGUI.
 *
 * Manages multiple terminal sessions inside the bottom panel.
 * Each session tracks its own cwd, command history, and shell type.
 * Commands are executed via IPC (main process spawns the child process).
 */
class TerminalManager {
  constructor() {
    this.terminals = new Map();   // id -> terminal state
    this.activeId   = null;
    this.counter    = 0;

    this.shells         = [];
    this.currentShellId = null;
    this.currentShellPath = null;

    this._dataUnsub = null;
    this._doneUnsub = null;
    this._shellDropdownOpen = false;

    // Autocomplete state
    this._lastTabTime = 0;  // for double-tap detection
  }

  // ─── Init ────────────────────────────────────────────────────────────────

  async init() {
    try {
      this.shells = await window.api.invoke('terminal-get-shells');
    } catch {
      this.shells = [{ id: 'cmd', name: 'Command Prompt', icon: 'cmd' }];
    }
    if (this.shells.length) {
      this.currentShellId   = this.shells[0].id;
      this.currentShellPath = this.shells[0].path || null;
    }

    // IPC listeners
    this._dataUnsub = window.api.on('terminal-data', ({ terminalId, data }) => {
      this._appendOutput(terminalId, data);
    });
    this._doneUnsub = window.api.on('terminal-command-done', ({ terminalId, code }) => {
      const term = this.terminals.get(terminalId);
      if (!term) return;
      term.running = false;
      this._setInputEnabled(terminalId, true);
      this._scrollBottom(terminalId);
    });

    // Close shell dropdown on outside click
    document.addEventListener('click', (e) => {
      if (
        this._shellDropdownOpen &&
        !e.target.closest('#terminal-shell-dropdown') &&
        !e.target.closest('#terminal-shell-btn')
      ) {
        this._closeShellDropdown();
      }
    });

    this._setupTerminalResizer();
  }

  // ─── Panel visibility ────────────────────────────────────────────────────

  show() {
    const panel = document.getElementById('terminalPanel');
    if (!panel) return;
    panel.style.display = 'flex';
    panel.offsetHeight; // reflow
    panel.classList.add('active');

    // Auto-create first terminal
    if (this.terminals.size === 0) {
      this.createTerminal();
    } else if (this.activeId !== null) {
      setTimeout(() => this._focusInput(this.activeId), 60);
    }
  }

  hide() {
    const panel = document.getElementById('terminalPanel');
    if (!panel) return;
    panel.classList.remove('active');
    setTimeout(() => {
      if (!panel.classList.contains('active')) panel.style.display = 'none';
    }, 200);
  }

  toggle() {
    const panel = document.getElementById('terminalPanel');
    if (!panel) return;
    if (panel.classList.contains('active')) this.hide();
    else this.show();
  }

  isVisible() {
    const panel = document.getElementById('terminalPanel');
    return panel ? panel.classList.contains('active') : false;
  }

  // ─── Terminal lifecycle ──────────────────────────────────────────────────

  async createTerminal(shellId, shellPath) {
    const sid   = shellId   || this.currentShellId;
    const spath = shellPath || this.currentShellPath;
    const shell = this.shells.find(s => s.id === sid) || this.shells[0] || { id: 'cmd', name: 'Terminal' };

    // Get initial cwd from the app's working directory
    let cwd = '';
    try { cwd = await window.api.invoke('terminal-get-initial-cwd'); } catch {
      try { cwd = await window.api.invoke('terminal-get-home'); } catch { cwd = ''; }
    }

    const id = ++this.counter;
    this.terminals.set(id, {
      shell,
      shellPath: spath,
      cwd: cwd,
      history: [],
      historyIndex: -1,
      running: false,
    });

    this._renderTab(id);
    this._renderInstance(id);
    this._activate(id);

    this._appendOutput(id,
      `\u001b[32m${shell.name}\u001b[0m  \u001b[2m${cwd}\u001b[0m\r\n`,
      true
    );
    return id;
  }

  closeTerminal(id) {
    const term = this.terminals.get(id);
    if (!term) return;

    window.api.invoke('terminal-kill-current', id).catch(() => {});

    document.getElementById(`terminal-tab-${id}`)?.remove();
    document.getElementById(`terminal-inst-${id}`)?.remove();
    this.terminals.delete(id);

    if (this.activeId === id) {
      this.activeId = null;
      const remaining = [...this.terminals.keys()];
      if (remaining.length) {
        this._activate(remaining[remaining.length - 1]);
      } else {
        this.hide();
      }
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  _renderTab(id) {
    const term = this.terminals.get(id);
    const list = document.getElementById('terminal-tabs-list');
    if (!list) return;

    const tab = document.createElement('div');
    tab.className = 'terminal-tab';
    tab.id = `terminal-tab-${id}`;
    tab.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0">
        <path d="M1.5 5.5A.5.5 0 0 1 2 5h4a.5.5 0 0 1 0 1H3.707l3.147 3.146a.5.5 0 1 1-.708.708L3 6.707V9a.5.5 0 0 1-1 0V5.5zM8 5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H8.5A.5.5 0 0 1 8 5zm1 3a.5.5 0 0 1 .5-.5H13a.5.5 0 0 1 0 1H9.5A.5.5 0 0 1 9 8zm-1 3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4A.5.5 0 0 1 8 11z"/>
      </svg>
      <span>${this._escHtml(term.shell.name)}</span>
      <span class="terminal-tab-close" title="Close">×</span>
    `;

    tab.addEventListener('click', (e) => {
      if (e.target.closest('.terminal-tab-close')) {
        e.stopPropagation();
        this.closeTerminal(id);
      } else if (!e.target.closest('svg')) {
        this._activate(id);
      }
    });

    list.appendChild(tab);
  }

  _renderInstance(id) {
    const body = document.getElementById('terminal-body');
    if (!body) return;
    const term = this.terminals.get(id);

    const el = document.createElement('div');
    el.className = 'terminal-instance';
    el.id = `terminal-inst-${id}`;
    el.innerHTML = `
      <div class="terminal-output" id="terminal-out-${id}"></div>
      <div class="terminal-input-row">
        <span class="terminal-prompt-cwd" id="terminal-cwd-${id}" title="${this._escHtml(term.cwd)}"></span>
        <span class="terminal-prompt-symbol">$</span>
        <div class="terminal-running-indicator" id="terminal-spinner-${id}"></div>
        <input
          class="terminal-input"
          id="terminal-in-${id}"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="type a command..."
        />
      </div>
    `;
    body.appendChild(el);

    this._updateCwd(id);

    const input = el.querySelector(`#terminal-in-${id}`);
    input.addEventListener('keydown', (e) => this._onKey(e, id));
  }

  _activate(id) {
    if (this.activeId !== null) {
      document.getElementById(`terminal-tab-${this.activeId}`)?.classList.remove('active');
      document.getElementById(`terminal-inst-${this.activeId}`)?.classList.remove('active');
    }
    this.activeId = id;
    document.getElementById(`terminal-tab-${id}`)?.classList.add('active');
    document.getElementById(`terminal-inst-${id}`)?.classList.add('active');
    setTimeout(() => this._focusInput(id), 40);
  }

  _updateCwd(id) {
    const term = this.terminals.get(id);
    const el   = document.getElementById(`terminal-cwd-${id}`);
    if (!el || !term) return;
    // Show full path
    el.textContent = term.cwd || '~';
    el.title = term.cwd;
  }

  // ─── Input handling ──────────────────────────────────────────────────────

  _onKey(e, id) {
    const term = this.terminals.get(id);
    if (!term) return;

    switch (e.key) {
      case 'Enter': {
        e.preventDefault();
        const raw = e.target.value.trim();
        if (!raw) return;

        // If a process is running, send input to it instead of executing a new command
        if (term.running) {
          window.api.invoke('terminal-send-input', { terminalId: id, input: raw }).catch(() => {});
          this._appendOutput(id, `${this._escHtml(raw)}\r\n`, true);
          e.target.value = '';
          term.historyIndex = -1;
        } else {
          // Normal command execution
          term.history.unshift(raw);
          if (term.history.length > 100) term.history.pop();
          term.historyIndex = -1;
          e.target.value = '';
          this._execute(id, raw);
        }
        break;
      }
      case 'Tab': {
        e.preventDefault();
        this._onTab(e.target, id);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (term.historyIndex < term.history.length - 1) {
          term.historyIndex++;
          e.target.value = term.history[term.historyIndex] || '';
        }
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (term.historyIndex > 0) {
          term.historyIndex--;
          e.target.value = term.history[term.historyIndex] || '';
        } else {
          term.historyIndex = -1;
          e.target.value = '';
        }
        break;
      }
      case 'c': {
        if (e.ctrlKey && term.running) {
          e.preventDefault();
          window.api.invoke('terminal-kill-current', id).catch(() => {});
          this._appendOutput(id, '\u001b[31m^C\u001b[0m\r\n', true);
          term.running = false;
          this._setInputEnabled(id, true);
        }
        break;
      }
      case 'l': {
        if (e.ctrlKey) {
          e.preventDefault();
          const out = document.getElementById(`terminal-out-${id}`);
          if (out) out.innerHTML = '';
        }
        break;
      }
    }
  }

  async _onTab(input, id) {
    const term = this.terminals.get(id);
    if (!term) return;

    const partial = input.value;
    if (!partial.trim()) return;

    try {
      const matches = await window.api.invoke('terminal-get-completions', {
        cwd: term.cwd,
        partial,
      });

      if (matches.length === 0) {
        // No matches, do nothing
        return;
      } else if (matches.length === 1) {
        // Single match: auto-complete
        const trimmed = partial.trim();
        const lastSpace = trimmed.lastIndexOf(' ');
        const prefix = lastSpace === -1 ? '' : trimmed.substring(0, lastSpace + 1);
        input.value = prefix + matches[0].value;
      } else {
        // Multiple matches: show them
        this._appendOutput(id, `\u001b[2m${matches.map(m => m.label).join('  ')}\u001b[0m\r\n`, true);
        this._scrollBottom(id);
      }
    } catch {}
  }

  async _execute(id, command) {
    const term = this.terminals.get(id);
    if (!term || term.running) return;

    // Echo the command
    this._appendOutput(id,
      `\u001b[2m${this._escPrompt(term.cwd)}\u001b[0m \u001b[1m${this._escHtml(command)}\u001b[0m\r\n`,
      true
    );

    // Handle `cd` locally — update cwd, then bail (no subprocess needed)
    const cdMatch = command.match(/^cd(?:\s+(.+))?$/i);
    if (cdMatch) {
      const target = (cdMatch[1] || '').trim().replace(/^["']|["']$/g, '');
      if (!target || target === '~') {
        try { term.cwd = await window.api.invoke('terminal-get-home'); } catch {}
      } else {
        term.cwd = this._joinPath(term.cwd, target);
      }
      this._updateCwd(id);
      return;
    }

    // Handle `clear` / `cls`
    if (/^(clear|cls)$/i.test(command)) {
      const out = document.getElementById(`terminal-out-${id}`);
      if (out) out.innerHTML = '';
      return;
    }

    term.running = true;
    this._setInputEnabled(id, false);

    try {
      await window.api.invoke('terminal-execute', {
        terminalId: id,
        shellId:    term.shell.id,
        shellPath:  term.shellPath || null,
        command,
        cwd:        term.cwd,
      });
    } catch (err) {
      this._appendOutput(id, `\u001b[31mError: ${err.message}\u001b[0m\r\n`, true);
      term.running = false;
      this._setInputEnabled(id, true);
    }
  }

  _joinPath(base, rel) {
    if (!rel) return base;
    // Absolute paths (Windows or Unix)
    if (/^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith('/')) return rel;
    if (rel === '..') {
      const parts = base.replace(/\\/g, '/').split('/');
      parts.pop();
      return parts.join('/') || base;
    }
    const sep = base.includes('\\') ? '\\' : '/';
    return base.replace(/[\\/]+$/, '') + sep + rel;
  }

  // ─── Output rendering ────────────────────────────────────────────────────

  _appendOutput(id, text, raw = false) {
    const out = document.getElementById(`terminal-out-${id}`);
    if (!out) return;

    const span = document.createElement('span');
    span.innerHTML = this._ansiToHtml(text);
    out.appendChild(span);
    this._scrollBottom(id);
  }

  _ansiToHtml(text) {
    if (!text) return '';

    // Normalise line endings
    let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Strip all ANSI escape sequences except SGR color/style codes.
    s = s.replace(
      /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
      (m) => /^\x1b\[[0-9;]*m$/.test(m) ? m : ''
    );

    // Escape HTML special chars (before inserting spans)
    const escHtml = (t) => t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const fgMap = {
      '30':'a-black','31':'a-red','32':'a-green','33':'a-yellow',
      '34':'a-blue','35':'a-magenta','36':'a-cyan','37':'a-white',
      '90':'a-Bblack','91':'a-Bred','92':'a-Bgreen','93':'a-Byellow',
      '94':'a-Bblue','95':'a-Bmagenta','96':'a-Bcyan','97':'a-Bwhite',
    };

    let result = '';
    let openSpans = 0;

    // Split on SGR sequences (\x1b[...m)
    const parts = s.split(/(\x1b\[[0-9;]*m)/g);
    for (const part of parts) {
      if (/^\x1b\[/.test(part)) {
        // Close open spans on any SGR
        while (openSpans > 0) { result += '</span>'; openSpans--; }
        const code = part.slice(2, -1);
        if (code === '0' || code === '') continue; // reset
        const classes = [];
        for (const c of code.split(';')) {
          if (c === '1')  classes.push('a-bold');
          if (c === '2')  classes.push('a-dim');
          if (fgMap[c])   classes.push(fgMap[c]);
        }
        if (classes.length) { result += `<span class="${classes.join(' ')}"`; result += '>'; openSpans++; }
      } else {
        result += escHtml(part);
      }
    }
    while (openSpans > 0) { result += '</span>'; openSpans--; }
    return result;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _scrollBottom(id) {
    const out = document.getElementById(`terminal-out-${id}`);
    if (out) out.scrollTop = out.scrollHeight;
  }

  _setInputEnabled(id, enabled) {
    const spinner = document.getElementById(`terminal-spinner-${id}`);
    if (spinner) spinner.classList.toggle('visible', !enabled);
    // Keep input always enabled so user can respond to interactive prompts (sudo, password, etc.)
  }

  _focusInput(id) {
    document.getElementById(`terminal-in-${id}`)?.focus();
  }

  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  _escPrompt(cwd) {
    const parts = (cwd || '').replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '~';
  }

  // ─── Shell selector dropdown ─────────────────────────────────────────────

  toggleShellDropdown() {
    if (this._shellDropdownOpen) {
      this._closeShellDropdown();
    } else {
      this._openShellDropdown();
    }
  }

  _openShellDropdown() {
    this._closeShellDropdown();

    const btn  = document.getElementById('terminal-shell-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();

    const dd = document.createElement('div');
    dd.className = 'terminal-shell-dropdown';
    dd.id = 'terminal-shell-dropdown';
    dd.style.cssText = `bottom:${window.innerHeight - rect.top + 4}px; left:${rect.left}px;`;

    dd.innerHTML = this.shells.map(s => `
      <div class="terminal-shell-option ${s.id === this.currentShellId ? 'current' : ''}" data-id="${s.id}" data-path="${s.path || ''}">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 5.5A.5.5 0 0 1 2 5h4a.5.5 0 0 1 0 1H3.707l3.147 3.146a.5.5 0 1 1-.708.708L3 6.707V9a.5.5 0 0 1-1 0V5.5z"/>
          <path d="M8 5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H8.5A.5.5 0 0 1 8 5zm1 3a.5.5 0 0 1 .5-.5H13a.5.5 0 0 1 0 1H9.5A.5.5 0 0 1 9 8zm-1 3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4A.5.5 0 0 1 8 11z"/>
        </svg>
        ${this._escHtml(s.name)}
      </div>
    `).join('');

    dd.addEventListener('click', (e) => {
      const item = e.target.closest('[data-id]');
      if (!item) return;
      const sid   = item.dataset.id;
      const spath = item.dataset.path || null;
      this.currentShellId   = sid;
      this.currentShellPath = spath;
      const btnLabel = document.getElementById('terminal-shell-label');
      const s = this.shells.find(x => x.id === sid);
      if (btnLabel && s) btnLabel.textContent = s.name;
      this._closeShellDropdown();
      this.createTerminal(sid, spath || null);
    });

    document.body.appendChild(dd);
    this._shellDropdownOpen = true;
  }

  _closeShellDropdown() {
    document.getElementById('terminal-shell-dropdown')?.remove();
    this._shellDropdownOpen = false;
  }

  // ─── Vertical resize ─────────────────────────────────────────────────────

  _setupTerminalResizer() {
    const handle = document.getElementById('terminal-resizer-top');
    const panel  = document.getElementById('terminalPanel');
    if (!handle || !panel) return;

    let startY = 0;
    let startH = 0;

    const onMove = (e) => {
      const dy = startY - e.clientY;
      const newH = Math.max(120, Math.min(window.innerHeight * 0.72, startH + dy));
      panel.style.height = newH + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startH = panel.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }


  destroy() {
    if (this._dataUnsub) window.api.removeListener('terminal-data', this._dataUnsub);
    if (this._doneUnsub) window.api.removeListener('terminal-command-done', this._doneUnsub);
  }
}
