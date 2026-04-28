class UpdaterManager {
  constructor(notificationManager) {
    this.notificationManager = notificationManager;
  }

  updateBackendVersionLabel(releaseTag, statusText = '') {
    const backendEl = document.getElementById('backend_version');
    if (!backendEl) return;

    const normalizedTag = typeof releaseTag === 'string' && releaseTag.trim()
      ? releaseTag.trim()
      : null;

    if (normalizedTag) {
      backendEl.textContent = `CoreTrace latest: ${normalizedTag}`;
      backendEl.title = `Latest CoreTrace backend release: ${normalizedTag}`;
      return;
    }

    const fallback = statusText && String(statusText).trim() ? String(statusText).trim() : 'unknown';
    backendEl.textContent = `CoreTrace latest: ${fallback}`;
    backendEl.title = 'Latest CoreTrace backend release tag';
  }

  setupListeners() {
    const indicator = document.getElementById('update-status-indicator');

    this.updateBackendVersionLabel(null, 'checking...');

    const applyBackendStatus = (status) => {
      if (!status || !status.type) return;

      if (status.type === 'backend-checking-for-update') {
        this.updateBackendVersionLabel(null, 'checking...');
        return;
      }

      if (status.type === 'backend-update-not-available' || status.type === 'backend-update-installed') {
        const releaseTag = status.info && status.info.releaseTag ? status.info.releaseTag : null;
        this.updateBackendVersionLabel(releaseTag, releaseTag ? '' : 'up to date');
        return;
      }

      if (status.type === 'backend-error') {
        this.updateBackendVersionLabel(null, 'unavailable');
      }
    };

    window.api.invoke('backend-get-status')
      .then((res) => {
        if (res && res.success && res.status) applyBackendStatus(res.status);
      })
      .catch(() => {});

    const showIndicator = (state, html, title = '') => {
      if (!indicator) return;
      indicator.className = `update-status-indicator ${state}`;
      indicator.innerHTML = html;
      indicator.title = title;
      indicator.style.display = 'inline-flex';
      indicator.onclick = null;
    };

    const hideIndicator = () => {
      if (!indicator) return;
      indicator.style.display = 'none';
      indicator.className = 'update-status-indicator';
      indicator.onclick = null;
    };

    window.api.on('updater-status', (data) => {
      if (!data || !data.type) return;

      if (['backend-checking-for-update', 'backend-update-not-available', 'backend-update-installed', 'backend-error'].includes(data.type)) {
        applyBackendStatus(data);
        if (data.type === 'backend-error') console.warn('[BackendUpdater] Error:', data.message);
        return;
      }

      if (data.type === 'checking-for-update') {
        showIndicator('checking', '<span class="update-spinner"></span><span>Checking for updates…</span>', 'Checking for updates');
      } else if (data.type === 'update-available') {
        const version = data.info && data.info.version ? ` v${data.info.version}` : '';
        showIndicator('update-available', `<span>↑</span><span>Update available${version} — downloading…</span>`, `Update${version} is downloading in the background`);
      } else if (data.type === 'download-progress') {
        const pct = data.percent != null ? ` ${Math.round(data.percent)}%` : '';
        const version = data.info && data.info.version ? ` v${data.info.version}` : '';
        showIndicator('update-available', `<span>↑</span><span>Downloading${version}${pct}…</span>`, `Downloading update${version}`);
      } else if (data.type === 'update-not-available') {
        hideIndicator();
      } else if (data.type === 'update-downloaded') {
        const version = data.info && data.info.version ? ` v${data.info.version}` : '';
        showIndicator('update-downloaded', `<span>✓</span><span>${version ? version.trim() : 'Update'} ready — restart to apply</span>`, `Click to restart and install${version}`);
        indicator.onclick = () => window.api.invoke('updater-install-update').catch(() => {});
      } else if (data.type === 'error') {
        hideIndicator();
        console.warn('[Updater] Error:', data.message);
      }
    });
  }

  async openUpdateSettingsModal() {
    let currentChannel = 'main';

    try {
      const result = await window.api.invoke('updater-get-settings');
      if (result && result.success && result.settings && result.settings.channel) {
        currentChannel = result.settings.channel;
      }
    } catch (error) {
      console.warn('Failed to load updater settings:', error);
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex; justify-content: center; align-items: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #0d1117; color: #f0f6fc;
      padding: 20px; border-radius: 10px; width: 440px;
      border: 1px solid #30363d;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    `;

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px 0; font-size:18px;">Update Settings</h3>
      <div style="font-size:12px; color:#8b949e; margin-bottom:14px; line-height:1.5;">
        Choose which update stream to receive.
      </div>
      <label for="update-release-channel" style="display:block; font-size:12px; margin-bottom:6px; color:#c9d1d9;">Release channel</label>
      <select id="update-release-channel" style="width:100%; padding:8px; background:#161b22; color:#f0f6fc; border:1px solid #30363d; border-radius:6px; margin-bottom:8px;">
        <option value="main">Main (stable)</option>
        <option value="beta">Beta (pre-release)</option>
      </select>
      <div style="font-size:11px; color:#8b949e; margin-bottom:16px;">Beta may include pre-release builds and unstable changes.</div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="check-updates-now" style="padding:8px 12px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer;">Check now</button>
        <button id="close-update-settings" style="padding:8px 12px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer;">Close</button>
        <button id="save-update-settings" style="padding:8px 12px; background:#238636; border:1px solid #2ea043; color:#fff; border-radius:6px; cursor:pointer;">Save</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const channelSelect = dialog.querySelector('#update-release-channel');
    if (channelSelect) channelSelect.value = currentChannel === 'beta' ? 'beta' : 'main';

    const closeModal = () => { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); };

    dialog.querySelector('#close-update-settings').onclick = closeModal;

    dialog.querySelector('#check-updates-now').onclick = async () => {
      try {
        const result = await window.api.invoke('updater-check-now');
        if (result && result.success) {
          this.notificationManager.showInfo('Update check started. You will be notified if an update is available.');
        } else {
          this.notificationManager.showWarning(result && result.error ? result.error : 'Unable to check for updates.');
        }
      } catch (error) {
        this.notificationManager.showError('Failed to check updates: ' + error.message);
      }
    };

    dialog.querySelector('#save-update-settings').onclick = async () => {
      const selectedChannel = channelSelect ? channelSelect.value : 'main';
      try {
        const result = await window.api.invoke('updater-set-channel', selectedChannel);
        if (result && result.success) {
          this.notificationManager.showSuccess(`Update channel saved: ${selectedChannel}`);
          closeModal();
        } else {
          this.notificationManager.showError(result && result.error ? result.error : 'Failed to save update channel');
        }
      } catch (error) {
        this.notificationManager.showError('Failed to save update settings: ' + error.message);
      }
    };

    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  }

  async openBackendSettingsModal() {
    let currentPath = '';

    try {
      const result = await window.api.invoke('backend-get-settings');
      if (result && result.success && result.settings && result.settings.directBinaryPath) {
        currentPath = result.settings.directBinaryPath;
      }
    } catch (err) {
      console.warn('Failed to load backend settings:', err);
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex; justify-content: center; align-items: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #0d1117; color: #f0f6fc;
      padding: 24px; border-radius: 10px; width: 500px;
      border: 1px solid #30363d;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    `;

    dialog.innerHTML = `
      <h3 style="margin:0 0 8px 0; font-size:18px;">Backend Settings</h3>
      <div style="font-size:12px; color:#8b949e; margin-bottom:18px; line-height:1.5;">
        Optionally locate a native <code style="color:#79c0ff;">ctrace.exe</code> binary to run analysis
        directly on Windows — no WSL or HTTP server required.<br><br>
        When set, the GUI spawns the binary directly using CLI arguments.
        Clear the path to revert to the default WSL-backed server mode.
      </div>
      <label style="display:block; font-size:12px; margin-bottom:6px; color:#c9d1d9;">ctrace.exe path</label>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <input id="bs-binary-path" type="text"
          placeholder="e.g. C:\\tools\\ctrace.exe"
          style="flex:1; padding:8px; background:#161b22; color:#f0f6fc;
                 border:1px solid #30363d; border-radius:6px; font-size:12px;" />
        <button id="bs-browse"
          style="padding:8px 12px; background:#21262d; border:1px solid #30363d;
                 color:#f0f6fc; border-radius:6px; cursor:pointer; white-space:nowrap;">
          Browse…
        </button>
      </div>
      <div id="bs-mode-hint" style="font-size:11px; color:#8b949e; margin-bottom:16px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="bs-clear" style="padding:8px 12px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer;">Clear (use WSL mode)</button>
        <button id="bs-close" style="padding:8px 12px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer;">Cancel</button>
        <button id="bs-save" style="padding:8px 12px; background:#238636; border:1px solid #2ea043; color:#fff; border-radius:6px; cursor:pointer;">Save</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const pathInput = dialog.querySelector('#bs-binary-path');
    const modeHint = dialog.querySelector('#bs-mode-hint');

    const updateHint = (val) => {
      if (val && val.trim()) {
        modeHint.style.color = '#3fb950';
        modeHint.textContent = 'Direct binary mode active — analysis will use this executable.';
      } else {
        modeHint.style.color = '#8b949e';
        modeHint.textContent = 'No path set — WSL server mode will be used (default).';
      }
    };

    pathInput.value = currentPath;
    updateHint(currentPath);
    pathInput.oninput = () => updateHint(pathInput.value);

    const closeModal = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };

    dialog.querySelector('#bs-close').onclick = closeModal;

    dialog.querySelector('#bs-browse').onclick = async () => {
      try {
        const result = await window.api.invoke('backend-browse-binary');
        if (!result.canceled && result.filePath) {
          pathInput.value = result.filePath;
          updateHint(result.filePath);
        }
      } catch (err) {
        this.notificationManager.showError('Browse failed: ' + err.message);
      }
    };

    dialog.querySelector('#bs-clear').onclick = async () => {
      try {
        const result = await window.api.invoke('backend-save-settings', { directBinaryPath: '' });
        if (result && result.success) {
          this.notificationManager.showSuccess('Backend reset to WSL server mode.');
          closeModal();
        } else {
          this.notificationManager.showError(result.error || 'Failed to clear backend settings.');
        }
      } catch (err) {
        this.notificationManager.showError('Failed to clear: ' + err.message);
      }
    };

    dialog.querySelector('#bs-save').onclick = async () => {
      const val = pathInput.value.trim();
      try {
        const result = await window.api.invoke('backend-save-settings', { directBinaryPath: val });
        if (result && result.success) {
          this.notificationManager.showSuccess(val ? 'Direct binary mode enabled.' : 'Backend reset to WSL server mode.');
          closeModal();
        } else {
          this.notificationManager.showError(result.error || 'Failed to save backend settings.');
        }
      } catch (err) {
        this.notificationManager.showError('Failed to save: ' + err.message);
      }
    };

    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  }
}

window.UpdaterManager = UpdaterManager;
