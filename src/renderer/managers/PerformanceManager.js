class PerformanceManager {
  constructor() {
    this.hud = null;
    this.hudVisible = false;
    this.animationFrame = null;
    this.observer = null;
    this.sampleStartedAt = 0;
    this.lastFrameAt = 0;
    this.runtimeInfo = { hardwareAcceleration: 'unknown' };
    this.liteEffectsEnabled = false;
    this.stats = {
      fps: 0,
      frameMs: 0,
      maxFrameMs: 0,
      frameCount: 0,
      longTasks: 0,
      lastLongTaskMs: 0
    };
    this._metrics = null;
    this._effectsBtn = null;
  }

  init() {
    if (typeof document === 'undefined' || !document.body || this.hud) return;

    try {
      this.liteEffectsEnabled = localStorage.getItem('liteEffectsEnabled') === 'true';
    } catch (_) {
      this.liteEffectsEnabled = false;
    }

    this.applyLiteEffects(this.liteEffectsEnabled, false);

    if (window.api && typeof window.api.getRuntimeInfo === 'function') {
      try {
        this.runtimeInfo = window.api.getRuntimeInfo() || this.runtimeInfo;
      } catch (_) {
        this.runtimeInfo = { hardwareAcceleration: 'unknown' };
      }
    }

    const hud = document.createElement('aside');
    hud.className = 'performance-hud';
    hud.innerHTML = `
      <div class="performance-hud-header">
        <span class="performance-hud-title">Performance</span>
        <div class="performance-hud-actions">
          <button type="button" class="performance-hud-btn" data-action="effects">Lite effects</button>
          <button type="button" class="performance-hud-btn" data-action="hide">Hide</button>
        </div>
      </div>
      <div class="performance-hud-grid">
        <div class="performance-hud-card"><span class="performance-hud-label">FPS</span><span class="performance-hud-value" data-metric="fps">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">Frame</span><span class="performance-hud-value" data-metric="frame">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">Long tasks</span><span class="performance-hud-value" data-metric="longTasks">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">DOM nodes</span><span class="performance-hud-value" data-metric="domNodes">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">JS heap</span><span class="performance-hud-value" data-metric="memory">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">GPU</span><span class="performance-hud-value" data-metric="gpu">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">Effects</span><span class="performance-hud-value" data-metric="effects">--</span></div>
        <div class="performance-hud-card"><span class="performance-hud-label">DPR</span><span class="performance-hud-value" data-metric="dpr">--</span></div>
      </div>
      <div class="performance-hud-note">Toggle with Ctrl+Alt+P. If Lite effects makes the UI feel much faster, the slowdown is likely compositing and blur related.</div>
    `;

    hud.querySelector('[data-action="effects"]').addEventListener('click', () => {
      this.applyLiteEffects(!this.liteEffectsEnabled);
    });
    hud.querySelector('[data-action="hide"]').addEventListener('click', () => {
      this.toggle(false);
    });

    document.body.appendChild(hud);
    this.hud = hud;
    this._metrics = {
      fps: hud.querySelector('[data-metric="fps"]'),
      frame: hud.querySelector('[data-metric="frame"]'),
      longTasks: hud.querySelector('[data-metric="longTasks"]'),
      domNodes: hud.querySelector('[data-metric="domNodes"]'),
      memory: hud.querySelector('[data-metric="memory"]'),
      gpu: hud.querySelector('[data-metric="gpu"]'),
      effects: hud.querySelector('[data-metric="effects"]'),
      dpr: hud.querySelector('[data-metric="dpr"]')
    };
    this._effectsBtn = hud.querySelector('[data-action="effects"]');
    this._render();
  }

  toggle(forceVisible) {
    if (!this.hud) this.init();
    if (!this.hud) return;

    const next = typeof forceVisible === 'boolean' ? forceVisible : !this.hudVisible;
    this.hudVisible = next;
    this.hud.classList.toggle('visible', next);

    if (next) {
      this._startSampling();
    } else {
      this._stopSampling();
    }
  }

  applyLiteEffects(enabled, persist = true) {
    this.liteEffectsEnabled = !!enabled;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('lite-effects', this.liteEffectsEnabled);
    }

    if (persist) {
      try {
        localStorage.setItem('liteEffectsEnabled', JSON.stringify(this.liteEffectsEnabled));
      } catch (_) {
        // ignore persistence failures
      }
    }

    if (this._effectsBtn) {
      this._effectsBtn.textContent = this.liteEffectsEnabled ? 'Full effects' : 'Lite effects';
    }

    this._render();
  }

  _startSampling() {
    if (this.animationFrame || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      this._render();
      return;
    }

    Object.assign(this.stats, { fps: 0, frameMs: 0, maxFrameMs: 0, frameCount: 0, longTasks: 0, lastLongTaskMs: 0 });
    this.sampleStartedAt = performance.now();
    this.lastFrameAt = 0;

    if (typeof window.PerformanceObserver === 'function') {
      try {
        this.observer = new window.PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.stats.longTasks += 1;
            this.stats.lastLongTaskMs = Math.max(this.stats.lastLongTaskMs, entry.duration || 0);
          });
        });
        this.observer.observe({ entryTypes: ['longtask'] });
      } catch (_) {
        this.observer = null;
      }
    }

    const sample = (timestamp) => {
      if (!this.hudVisible) { this.animationFrame = null; return; }

      if (this.lastFrameAt) {
        const frameMs = timestamp - this.lastFrameAt;
        this.stats.frameMs = frameMs;
        this.stats.maxFrameMs = Math.max(this.stats.maxFrameMs, frameMs);
        this.stats.frameCount += 1;
      }
      this.lastFrameAt = timestamp;

      const elapsed = timestamp - this.sampleStartedAt;
      if (elapsed >= 500) {
        this.stats.fps = this.stats.frameCount > 0 ? (this.stats.frameCount * 1000) / elapsed : 0;
        this._render();
        this.sampleStartedAt = timestamp;
        this.stats.frameCount = 0;
        this.stats.maxFrameMs = this.stats.frameMs;
        this.stats.longTasks = 0;
        this.stats.lastLongTaskMs = 0;
      }

      this.animationFrame = window.requestAnimationFrame(sample);
    };

    this.animationFrame = window.requestAnimationFrame(sample);
  }

  _stopSampling() {
    if (this.animationFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = null;

    if (this.observer) {
      try { this.observer.disconnect(); } catch (_) {}
      this.observer = null;
    }
  }

  _render() {
    if (!this._metrics || typeof document === 'undefined') return;

    const domNodes = document.getElementsByTagName('*').length;
    const memoryInfo = typeof performance !== 'undefined' ? performance.memory : null;
    const memoryMb = memoryInfo && typeof memoryInfo.usedJSHeapSize === 'number'
      ? (memoryInfo.usedJSHeapSize / (1024 * 1024)).toFixed(1)
      : null;

    this._metrics.fps.textContent = this.stats.fps ? `${Math.round(this.stats.fps)}` : '--';
    this._metrics.frame.textContent = this.stats.frameMs ? `${this.stats.frameMs.toFixed(1)} ms` : '--';
    this._metrics.longTasks.textContent = this.stats.lastLongTaskMs
      ? `${this.stats.longTasks} / ${Math.round(this.stats.lastLongTaskMs)} ms`
      : '0';
    this._metrics.domNodes.textContent = `${domNodes}`;
    this._metrics.memory.textContent = memoryMb ? `${memoryMb} MB` : 'n/a';
    this._metrics.gpu.textContent = String(this.runtimeInfo.hardwareAcceleration || 'unknown').toUpperCase();
    this._metrics.effects.textContent = this.liteEffectsEnabled ? 'Lite' : 'Full';
    this._metrics.dpr.textContent = `${window.devicePixelRatio || 1}`;
  }
}

window.PerformanceManager = PerformanceManager;
