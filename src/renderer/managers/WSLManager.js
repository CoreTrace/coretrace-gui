class WSLManager {
  constructor(ui) {
    this.ui = ui;
  }

  setupListeners() {
    window.api.on('wsl-status', (data) => {
      if (data.platform) this.ui.platform = data.platform;
      this.ui.wslAvailable = data.available && data.hasDistros;

      if (this.ui.platform === 'win32') {
        this._updateIndicator(data);

        if (!data.available) {
          this.ui.notificationManager.showWarning(
            'WSL is not installed. CTrace requires WSL on Windows. Please install WSL to access all functionality.'
          );
          console.warn('WSL not detected on Windows platform');
        } else if (!data.hasDistros) {
          this.ui.notificationManager.showWarning(
            'WSL is installed but no Linux distributions are available. Please install a distribution (e.g., Ubuntu) to use CTrace.'
          );
          console.warn('WSL detected but no distributions installed');
        } else {
          console.log('WSL is available and ready with distributions');
        }
      }
    });

    window.api.on('wsl-install-response', (data) => {
      if (data.action === 'install') {
        this.ui.notificationManager.showInfo(
          'WSL installation initiated. Please follow the installation prompts and restart the application when complete.'
        );
      } else if (data.action === 'cancel') {
        this.ui.notificationManager.showWarning(
          'WSL installation cancelled. Some features may be limited without WSL.'
        );
      }
    });

    window.api.send('check-wsl-status');
  }

  _updateIndicator(wslStatus) {
    let statusEl = document.getElementById('wsl-status-indicator');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'wsl-status-indicator';
      statusEl.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: bold;
        color: white;
        z-index: 1000;
        cursor: pointer;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(statusEl);
    }

    if (!wslStatus.available) {
      statusEl.textContent = '❌ WSL Not Installed';
      statusEl.style.backgroundColor = '#ff4757';
      statusEl.title = 'WSL is not installed. Click for installation instructions.';
    } else if (!wslStatus.hasDistros) {
      statusEl.textContent = '⚠️ WSL No Distributions';
      statusEl.style.backgroundColor = '#ffa502';
      statusEl.title = 'WSL is installed but no Linux distributions are available. Click for setup instructions.';
    } else {
      statusEl.textContent = '✅ WSL Ready';
      statusEl.style.backgroundColor = '#2ed573';
      statusEl.title = 'WSL is ready and available for CTrace';
      setTimeout(() => {
        if (statusEl && statusEl.textContent.includes('✅')) {
          statusEl.style.opacity = '0.3';
        }
      }, 3000);
    }

    statusEl.onclick = () => {
      if (!wslStatus.available || !wslStatus.hasDistros) {
        this._showSetupDialog(wslStatus);
      }
    };
  }

  _showSetupDialog(wslStatus) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 10px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    `;

    let instructions = '';
    if (!wslStatus.available) {
      instructions = `
        <h3>🔧 Install WSL (Windows Subsystem for Linux)</h3>
        <p>CTrace requires WSL to run on Windows. Follow these steps:</p>
        <ol>
          <li><strong>Open PowerShell as Administrator</strong>
            <br><small>Right-click Start button → "Windows PowerShell (Admin)"</small>
          </li>
          <li><strong>Run the installation command:</strong>
            <br><code style="background:#f0f0f0; padding:4px 8px; border-radius:3px; font-family:monospace;">wsl --install</code>
          </li>
          <li><strong>Restart your computer</strong> when prompted</li>
          <li><strong>Follow the Ubuntu setup</strong> (create username/password)</li>
          <li><strong>Restart this application</strong> to use CTrace</li>
        </ol>
      `;
    } else {
      instructions = `
        <h3>📦 Install a Linux Distribution</h3>
        <p>WSL is installed but you need a Linux distribution to run CTrace:</p>
        <ol>
          <li><strong>Open PowerShell</strong> (no need for Admin)</li>
          <li><strong>List available distributions:</strong>
            <br><code style="background:#f0f0f0; padding:4px 8px; border-radius:3px; font-family:monospace;">wsl --list --online</code>
          </li>
          <li><strong>Install Ubuntu (recommended):</strong>
            <br><code style="background:#f0f0f0; padding:4px 8px; border-radius:3px; font-family:monospace;">wsl --install Ubuntu</code>
          </li>
          <li><strong>Follow the setup instructions</strong> (create username/password)</li>
          <li><strong>Restart this application</strong> to use CTrace</li>
        </ol>
      `;
    }

    dialog.innerHTML = `
      ${instructions}
      <div style="margin-top:20px; text-align:right;">
        ${!wslStatus.available ? `
          <button id="auto-install-wsl" style="padding:10px 20px; background:#28a745; color:white; border:none; border-radius:5px; cursor:pointer; font-size:14px; margin-right:10px;">Install Automatically</button>
        ` : wslStatus.available && !wslStatus.hasDistros ? `
          <button id="install-ubuntu" style="padding:10px 20px; background:#28a745; color:white; border:none; border-radius:5px; cursor:pointer; font-size:14px; margin-right:10px;">Install Ubuntu</button>
        ` : ''}
        <button id="close-wsl-dialog" style="padding:10px 20px; background:#007acc; color:white; border:none; border-radius:5px; cursor:pointer; font-size:14px;">Got it!</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const close = () => document.body.removeChild(modal);
    document.getElementById('close-wsl-dialog').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    const autoInstallBtn = document.getElementById('auto-install-wsl');
    if (autoInstallBtn) {
      autoInstallBtn.onclick = () => {
        window.api.send('install-wsl');
        close();
        this.ui.notificationManager.showInfo('WSL installation started. Please follow any prompts that appear.');
      };
    }

    const installUbuntuBtn = document.getElementById('install-ubuntu');
    if (installUbuntuBtn) {
      installUbuntuBtn.onclick = () => {
        window.api.send('install-wsl-distro', 'Ubuntu');
        close();
        this.ui.notificationManager.showInfo('Ubuntu installation started. Please follow the setup instructions.');
      };
    }
  }
}

window.WSLManager = WSLManager;
