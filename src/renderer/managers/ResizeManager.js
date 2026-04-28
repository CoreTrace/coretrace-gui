class ResizeManager {
  constructor() {
    this.isResizing = false;
    this.resizeType = null;
    this._boundDoResize = this._doResize.bind(this);
    this._boundStopResize = this._stopResize.bind(this);
  }

  setup() {
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');

    const startResize = (e, type) => {
      this.isResizing = true;
      this.resizeType = type;

      if (type === 'sidebar') {
        sidebar.style.transition = 'none';
      } else if (type === 'toolsPanel') {
        toolsPanel.style.transition = 'none';
      }

      document.addEventListener('mousemove', this._boundDoResize);
      document.addEventListener('mouseup', this._boundStopResize);
      e.preventDefault();
      document.body.style.userSelect = 'none';
    };

    window.initSidebarResize = (e) => startResize(e, 'sidebar');
    window.initToolsPanelResize = (e) => startResize(e, 'toolsPanel');
  }

  _doResize(e) {
    if (!this.isResizing) return;

    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');

    requestAnimationFrame(() => {
      if (this.resizeType === 'sidebar') {
        const sidebarRect = sidebar.getBoundingClientRect();
        const newWidth = e.clientX - sidebarRect.left;
        const minWidth = 180;
        const maxWidth = window.innerWidth * 0.5;

        if (newWidth >= minWidth && newWidth <= maxWidth) {
          sidebar.style.width = newWidth + 'px';
        }
      } else if (this.resizeType === 'toolsPanel') {
        const containerRect = toolsPanel.parentElement.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        const minWidth = 200;
        const maxWidth = window.innerWidth * 0.6;

        if (newWidth >= minWidth && newWidth <= maxWidth) {
          toolsPanel.style.width = newWidth + 'px';
        }
      }
    });
  }

  _stopResize() {
    this.isResizing = false;

    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');

    if (this.resizeType === 'sidebar') {
      sidebar.style.transition = '';
    } else if (this.resizeType === 'toolsPanel') {
      toolsPanel.style.transition = '';
    }

    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', this._boundDoResize);
    document.removeEventListener('mouseup', this._boundStopResize);
    this.resizeType = null;
  }
}

window.ResizeManager = ResizeManager;
