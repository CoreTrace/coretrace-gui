;(function() {
/**
 * Split Pane Manager - Adds VS Code style editor groups to the right of the main
 * editor. Drag a tab and drop it on the RIGHT edge of a group to open a new
 * column beside it, or on the CENTER of a group to add it to that group.
 *
 * The main editor group (managed by TabManager + the primary Monaco instance)
 * stays the "primary" pane that diagnostics, search and CTrace tools target.
 * Every extra group is created dynamically here, has its own Monaco models
 * (one per open file), its own tab strip and its own save handling. A file lives
 * in exactly one place at a time, so the panes never hold diverging copies.
 *
 * @class SplitPaneManager
 */
const detectFileType = (typeof window !== 'undefined' && window.detectFileType)
  || (typeof require === 'function' ? require('../utils/fileTypeUtils').detectFileType : null);

const LANGUAGE_MAP = {
  'C': 'c', 'C++': 'cpp', 'C/C++ Header': 'cpp', 'JavaScript': 'javascript',
  'TypeScript': 'typescript', 'Python': 'python', 'Java': 'java', 'JSON': 'json',
  'HTML': 'html', 'CSS': 'css', 'Markdown': 'markdown', 'XML': 'xml', 'YAML': 'yaml',
  'Shell Script': 'shell', 'SQL': 'sql', 'Makefile': 'makefile', 'Plain Text': 'plaintext'
};

class SplitPaneManager {
  constructor(deps = {}) {
    this.tabManager = deps.tabManager || null;
    this.notificationManager = deps.notificationManager || null;

    /** @type {Array<Object>} extra editor groups, left-to-right */
    this.groups = [];
    this.idCounter = 0;

    // DOM refs
    this.row = document.getElementById('editor-split-row');
    this.groupMainEl = document.getElementById('editor-group-main');
    this.mainIndicator = this.groupMainEl
      ? this.groupMainEl.querySelector('[data-group-indicator="main"]')
      : null;

    if (this.row) this.setupDrag();
  }

  /* =============================== drag =============================== */

  setupDrag() {
    let startX = 0, startY = 0;
    let candidate = null;   // { kind, tabId, group? } pending press
    let dragging = false;

    const reset = () => {
      candidate = null;
      dragging = false;
      document.body.style.userSelect = '';
      this.clearIndicators();
      document.querySelectorAll('.tab.tab-dragging').forEach(t => t.classList.remove('tab-dragging'));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    const onMove = (e) => {
      if (!candidate) return;
      if (!dragging) {
        if (Math.abs(e.clientX - startX) < 6 && Math.abs(e.clientY - startY) < 6) return;
        dragging = true;
        document.body.style.userSelect = 'none';
        if (candidate.tabEl) candidate.tabEl.classList.add('tab-dragging');
      }
      const hit = this.hitTest(e.clientX, e.clientY);
      this.showIndicator(hit);
    };

    const onUp = (e) => {
      if (dragging && candidate) {
        const hit = this.hitTest(e.clientX, e.clientY);
        if (hit) this.performDrop(candidate, hit);
      }
      reset();
    };

    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const tabEl = e.target.closest && e.target.closest('.tab');
      if (!tabEl) return;
      if (e.target.classList.contains('tab-close')) return;

      const mainStrip = document.getElementById('tabs-container');
      if (mainStrip && mainStrip.contains(tabEl)) {
        candidate = { kind: 'main', tabId: tabEl.getAttribute('data-tab-id'), tabEl };
      } else {
        // Look for an owning extra group.
        const groupEl = tabEl.closest('.editor-group-extra');
        const group = this.groups.find(g => g.el === groupEl);
        if (!group) return;
        candidate = { kind: 'extra', group, tabId: tabEl.getAttribute('data-stab-id'), tabEl };
      }

      startX = e.clientX;
      startY = e.clientY;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  /** Which group + region the pointer is over. @returns {{el, group, region}|null} */
  hitTest(x, y) {
    const cols = [{ el: this.groupMainEl, group: null }].concat(
      this.groups.map(g => ({ el: g.el, group: g }))
    );
    for (const col of cols) {
      const r = col.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const region = x > r.left + r.width * 0.6 ? 'right' : 'center';
        return { el: col.el, group: col.group, region };
      }
    }
    return null;
  }

  indicatorFor(el) {
    return el.querySelector('.editor-split-indicator');
  }
  clearIndicators() {
    if (this.row) {
      this.row.querySelectorAll('.editor-split-indicator')
        .forEach(i => i.classList.remove('show-center', 'show-right'));
    }
  }
  showIndicator(hit) {
    this.clearIndicators();
    if (!hit) return;
    const ind = this.indicatorFor(hit.el);
    if (ind) ind.classList.add(hit.region === 'right' ? 'show-right' : 'show-center');
  }

  /* ============================== drop ============================== */

  performDrop(source, hit) {
    // Resolve the dragged file + a way to remove it from its origin.
    const payload = this.resolveSource(source);
    if (!payload) return;

    // Dropped back onto its own column's center → no-op.
    if (hit.region === 'center') {
      if (source.kind === 'extra' && hit.group === source.group) return;
      if (source.kind === 'main' && hit.group === null) return;
    }

    if (hit.region === 'right') {
      const newGroup = this.createGroup(hit.el);
      this.addToGroup(newGroup, payload);
      payload.removeSource();
    } else {
      // center
      if (hit.group === null) {
        // Dropped into the MAIN group → re-open as a normal main tab.
        this.openInMain(payload);
        payload.removeSource();
      } else {
        const existing = this.findInGroup(hit.group, payload.filePath);
        if (existing) { this.switchTo(hit.group, existing); }
        else { this.addToGroup(hit.group, payload); }
        payload.removeSource();
      }
    }

    // Drop empty source groups.
    this.gcGroups();
  }

  /** @returns {{filePath, fileName, content, removeSource:Function}|null} */
  resolveSource(source) {
    if (source.kind === 'main') {
      const tab = this.tabManager && this.tabManager.getTab(source.tabId);
      if (!tab) return null;
      let content = tab.content;
      if (source.tabId === this.tabManager.activeTabId && this.tabManager.editorManager) {
        try { content = this.tabManager.editorManager.getContent(); } catch (_) {}
      }
      return {
        filePath: tab.filePath, fileName: tab.fileName, content: content || '',
        removeSource: () => { void this.tabManager.closeTabById(source.tabId, true); }
      };
    }
    // extra
    const g = source.group;
    const t = g.tabs.get(source.tabId);
    if (!t) return null;
    return {
      filePath: t.filePath, fileName: t.fileName, content: t.model.getValue(),
      removeSource: () => this.removeTab(g, source.tabId)
    };
  }

  openInMain(payload) {
    if (!this.tabManager) return;
    // Focus if already open in main, else create a new main tab.
    const existing = payload.filePath ? this.tabManager.findTabByPath(payload.filePath) : null;
    if (existing) { this.tabManager.switchToTab(existing); return; }
    const id = this.tabManager.createTab(payload.fileName, payload.filePath, payload.content);
    this.tabManager.switchToTab(id);
  }

  /* ============================ group DOM ============================ */

  /** Build a new editor group inserted immediately after `afterEl`. */
  createGroup(afterEl) {
    const id = 'grp_' + (++this.idCounter);

    const resizer = document.createElement('div');
    resizer.className = 'editor-split-resizer';

    const el = document.createElement('div');
    el.className = 'editor-group editor-group-extra';
    el.innerHTML = `
      <div class="tabs-container"><div class="tabs-inner-wrapper"></div></div>
      <div class="editor-container">
        <div class="editor-main">
          <div class="editor-area-2"><div class="editor"></div></div>
        </div>
      </div>
      <div class="editor-split-indicator"></div>
    `;

    // Insert [resizer, group] after the target column (and its trailing groups).
    const anchor = this.lastElOfColumn(afterEl);
    anchor.after(resizer, el);

    const group = {
      id, el, resizer,
      tabsWrapper: el.querySelector('.tabs-inner-wrapper'),
      editorContainer: el.querySelector('.editor'),
      editor: null,
      tabs: new Map(),
      activeTabId: null
    };

    // Size: share space roughly evenly.
    const rowW = this.row.getBoundingClientRect().width;
    el.style.width = Math.max(280, Math.round(rowW / (this.groups.length + 2))) + 'px';

    // Track in DOM order: figure out insertion index.
    const order = Array.from(this.row.querySelectorAll('.editor-group-extra'));
    const index = order.indexOf(el);
    this.groups.splice(index, 0, group);

    this.createEditor(group);
    this.setupResizer(group);
    this.row.classList.add('split-active');
    return group;
  }

  /** The trailing DOM element of a column (main, or an extra group incl. its resizer chain). */
  lastElOfColumn(colEl) {
    return colEl; // groups/resizers are appended right after, simple `.after` keeps order
  }

  createEditor(group) {
    if (!window.monaco) return;
    group.editor = window.monaco.editor.create(group.editorContainer, {
      value: '', language: 'plaintext', theme: 'ctrace-dark',
      automaticLayout: true, fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, 'Cascadia Code', monospace",
      lineHeight: 20, minimap: { enabled: false },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      renderLineHighlight: 'all', smoothScrolling: true, tabSize: 4, insertSpaces: true,
      lineNumbers: 'on', wordWrap: 'off', fixedOverflowWidgets: true
    });

    group.editor.onDidChangeModelContent(() => {
      const t = group.activeTabId && group.tabs.get(group.activeTabId);
      if (t && !t.dirty) { t.dirty = true; this.renderTabs(group); }
    });
    group.editor.addCommand(
      window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS,
      () => this.saveActive(group)
    );
  }

  setupResizer(group) {
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const right = group.el.getBoundingClientRect().right;
      let width = right - e.clientX;
      width = Math.max(220, Math.min(width, this.row.getBoundingClientRect().width - 200));
      group.el.style.width = width + 'px';
      this.layout();
    };
    const onUp = () => {
      dragging = false;
      group.resizer.classList.remove('dragging');
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    group.resizer.addEventListener('mousedown', (e) => {
      dragging = true;
      group.resizer.classList.add('dragging');
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  removeGroup(group) {
    if (group.editor) group.editor.dispose();
    group.tabs.forEach(t => t.model && t.model.dispose());
    group.tabs.clear();
    if (group.resizer) group.resizer.remove();
    group.el.remove();
    this.groups = this.groups.filter(g => g !== group);
    if (this.groups.length === 0) this.row.classList.remove('split-active');
    this.layout();
  }

  gcGroups() {
    [...this.groups].forEach(g => { if (g.tabs.size === 0) this.removeGroup(g); });
  }

  /* ============================ group tabs ============================ */

  findInGroup(group, filePath) {
    if (!filePath) return null;
    for (const [id, t] of group.tabs) if (t.filePath === filePath) return id;
    return null;
  }

  addToGroup(group, payload) {
    if (!group.editor || !window.monaco) return;
    const existing = this.findInGroup(group, payload.filePath);
    if (existing) { this.switchTo(group, existing); return; }

    const id = 'stab_' + (++this.idCounter);
    const model = window.monaco.editor.createModel(payload.content || '', this.getLanguage(payload.fileName));
    group.tabs.set(id, {
      filePath: payload.filePath || null, fileName: payload.fileName || 'untitled',
      model, viewState: null, dirty: false
    });
    this.renderTabs(group);
    this.switchTo(group, id);
    group.editor.focus();
  }

  removeTab(group, tabId) {
    const t = group.tabs.get(tabId);
    if (!t) return;
    if (t.model) t.model.dispose();
    group.tabs.delete(tabId);
    if (group.activeTabId === tabId) {
      const remaining = Array.from(group.tabs.keys());
      group.activeTabId = null;
      if (remaining.length) this.switchTo(group, remaining[remaining.length - 1]);
    }
    this.renderTabs(group);
  }

  async closeTab(group, tabId) {
    const t = group.tabs.get(tabId);
    if (!t) return;
    if (t.dirty && !confirm(`${t.fileName} has unsaved changes in this group. Close anyway?`)) return;
    this.removeTab(group, tabId);
    if (group.tabs.size === 0) this.removeGroup(group);
  }

  switchTo(group, tabId) {
    const t = group.tabs.get(tabId);
    if (!t || !group.editor) return;
    if (group.activeTabId && group.tabs.has(group.activeTabId)) {
      group.tabs.get(group.activeTabId).viewState = group.editor.saveViewState();
    }
    group.activeTabId = tabId;
    group.editor.setModel(t.model);
    if (t.viewState) group.editor.restoreViewState(t.viewState);
    this.renderTabs(group);
    this.layout();
  }

  renderTabs(group) {
    if (!group.tabsWrapper) return;
    group.tabsWrapper.innerHTML = '';
    for (const [id, t] of group.tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (id === group.activeTabId ? ' active' : '') + (t.dirty ? ' modified' : '');
      el.setAttribute('data-stab-id', id);
      el.innerHTML = `
        <div class="tab-label">${this.escape(t.fileName)}</div>
        <div class="tab-close" title="Close">×</div>
      `;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) { e.stopPropagation(); this.closeTab(group, id); }
        else { this.switchTo(group, id); }
      });
      group.tabsWrapper.appendChild(el);
    }
  }

  /* ============================== save ============================== */

  async saveActive(group) {
    const t = group.activeTabId && group.tabs.get(group.activeTabId);
    if (!t || !group.editor) return;
    if (!t.filePath) {
      if (this.notificationManager) this.notificationManager.showWarning('Save As is not supported in split groups.');
      return;
    }
    const value = t.model.getValue();
    try {
      const result = await window.api.invoke('save-file', t.filePath, value);
      if (result && result.success === false) throw new Error(result.error || 'save failed');
      t.dirty = false;
      this.renderTabs(group);
      if (this.notificationManager) this.notificationManager.showSuccess(`Saved ${t.fileName}`);
    } catch (err) {
      if (this.notificationManager) this.notificationManager.showError(`Failed to save: ${err.message || err}`);
    }
  }

  /* ============================== utils ============================== */

  getLanguage(fileName) {
    const type = detectFileType ? detectFileType(fileName || '') : 'Plain Text';
    return LANGUAGE_MAP[type] || 'plaintext';
  }

  escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  layout() {
    setTimeout(() => {
      this.groups.forEach(g => { if (g.editor) g.editor.layout(); });
      const main = this.tabManager && this.tabManager.editorManager && this.tabManager.editorManager.editor;
      if (main && main.layout) main.layout();
    }, 0);
  }
}

if (typeof window !== 'undefined') window.SplitPaneManager = SplitPaneManager;
if (typeof module !== 'undefined' && module.exports) module.exports = SplitPaneManager;
})();
