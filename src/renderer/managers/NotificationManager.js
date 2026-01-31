/**
 * Notification Manager - Handles user notifications and messages
 */
class NotificationManager {
  constructor() {
    this.notifications = [];
  }

  /**
   * Show notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type (success, error, info, warning)
   * @param {number} duration - Duration in milliseconds (default 4000)
   */
  showNotification(message, type = 'info', duration = 4000, options = {}) {
    const colors = {
      success: '#238636',
      error: '#f85149',
      info: '#1f6feb',
      warning: '#d29922'
    };
    
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };
    
    const showSpinner = Boolean(options && options.showSpinner);

    const notification = document.createElement('div');
    notification.innerHTML = `
      <div class="ctrace-notification" style="position: fixed; top: 60px; left: 50%; transform: translateX(-50%); background: ${colors[type]}; color: white; padding: 10px 14px; border-radius: 6px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: fadeIn 0.3s ease; max-width: 360px; font-size: 13px; text-align: center; display: inline-flex; align-items: center; gap: 8px;">
        ${showSpinner ? '<span class="ctrace-spinner" aria-hidden="true" style="width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.45); border-top-color: rgba(255,255,255,1); border-radius: 50%; display: inline-block; animation: ctraceSpin 0.8s linear infinite;"></span>' : ''}
        <span aria-hidden="true">${icons[type]}</span>
        <span class="ctrace-notification-message">${message}</span>
        <button class="ctrace-notification-close" type="button" aria-label="Dismiss" style="margin-left: 6px; background: transparent; border: none; color: rgba(255,255,255,0.9); cursor: pointer; font-size: 16px; line-height: 12px; padding: 2px 4px; border-radius: 4px;">×</button>
      </div>
      <style>
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes ctraceSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    
    document.body.appendChild(notification);
    this.notifications.push(notification);

    let timeoutId = null;

    const dismiss = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (notification.parentNode) {
        notification.remove();
      }
      this.notifications = this.notifications.filter(n => n !== notification);
    };

    const messageEl = notification.querySelector('.ctrace-notification-message');
    const update = (nextMessage) => {
      if (messageEl) {
        messageEl.textContent = String(nextMessage);
      }
    };

    const closeBtn = notification.querySelector('.ctrace-notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      });
    }

    if (typeof duration === 'number' && duration > 0) {
      timeoutId = setTimeout(dismiss, duration);
    }

    return { dismiss, update, element: notification };
  }

  /**
   * Show a non-dismissed loading notification.
   * @param {string} message - Message to display
   * @returns {{dismiss: Function, update: Function, element: HTMLElement}} handle
   */
  showLoading(message) {
    return this.showNotification(message, 'info', 0, { showSpinner: true });
  }

  /**
   * Show success notification
   * @param {string} message - Message to display
   */
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  /**
   * Show error notification
   * @param {string} message - Message to display
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show warning notification
   * @param {string} message - Message to display
   */
  showWarning(message) {
    this.showNotification(message, 'warning');
  }

  /**
   * Show info notification
   * @param {string} message - Message to display
   */
  showInfo(message) {
    this.showNotification(message, 'info');
  }

  /**
   * Clear all notifications
   */
  clearAll() {
    this.notifications.forEach(notification => {
      if (notification.parentNode) {
        notification.remove();
      }
    });
    this.notifications = [];
  }

  /**
   * Show encoding warning dialog
   * @returns {Promise<string>} - User choice ('yes' or 'no')
   */
  showEncodingWarningDialog() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;
      
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: #1c2128;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 24px;
        max-width: 500px;
        color: #f0f6fc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      `;
      
      dialog.innerHTML = `
        <h3 style="margin: 0 0 16px 0; color: #f85149;">⚠️ Non-UTF8 File Detected</h3>
        <p style="margin: 0 0 20px 0; line-height: 1.5;">The file contains non UTF8 characters it may cause improper display. Open still?</p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="no-btn" style="
            background: #21262d;
            border: 1px solid #30363d;
            color: #f0f6fc;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">No</button>
          <button id="yes-btn" style="
            background: #f85149;
            border: 1px solid #f85149;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Yes</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const noBtn = dialog.querySelector('#no-btn');
      const yesBtn = dialog.querySelector('#yes-btn');
      
      noBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve('no');
      });
      
      yesBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve('yes');
      });
      
      // Close on escape key
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          document.body.removeChild(overlay);
          document.removeEventListener('keydown', handleKeyDown);
          resolve('no');
        }
      };
      document.addEventListener('keydown', handleKeyDown);
    });
  }

  /**
   * Show confirmation dialog
   * @param {string} message - Message to display
   * @param {string} title - Dialog title
   * @returns {Promise<boolean>} - User confirmation
   */
  showConfirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
      const result = confirm(`${title}: ${message}`);
      resolve(result);
    });
  }
}

module.exports = NotificationManager;