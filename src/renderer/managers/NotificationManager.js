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
  showNotification(message, type = 'info', duration = 4000) {
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
    
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; background: ${colors[type]}; color: white; padding: 12px 16px; border-radius: 6px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideIn 0.3s ease; max-width: 400px;">
        ${icons[type]} ${message}
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;
    
    document.body.appendChild(notification);
    this.notifications.push(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
      this.notifications = this.notifications.filter(n => n !== notification);
    }, duration);
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