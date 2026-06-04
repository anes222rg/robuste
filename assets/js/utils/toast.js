/**
 * Toast notification system.
 * Provides non-blocking status messages.
 * TODO Future: Use a toast container with stacking support.
 */

var Toast = {
  show: function (message, type, duration) {
    duration = duration || 3000;
    var toastDiv = safeGetElement('statusToast');
    if (!toastDiv) return;
    var bg;
    switch (type) {
      case 'success':
        bg = '#28a745';
        break;
      case 'error':
        bg = '#dc3545';
        break;
      case 'info':
        bg = '#17a2b8';
        break;
      default:
        bg = '#6c757d';
    }
    toastDiv.innerHTML = '<div class="alert shadow rounded-4 p-2 text-white" style="background:' + bg + '; margin:0;">' + message + '</div>';
    if (type !== 'loading') {
      clearTimeout(toastDiv._hideTimer);
      toastDiv._hideTimer = setTimeout(function () {
        toastDiv.innerHTML = '';
      }, duration);
    }
  },

  hide: function () {
    var toastDiv = safeGetElement('statusToast');
    if (toastDiv) {
      toastDiv.innerHTML = '';
    }
  },

  /* Legacy status indicator support (from main.js) */
  showLegacy: function (message, type) {
    var indicator = safeGetElement('statusIndicator');
    var messageElement = safeGetElement('statusMessage');
    if (!indicator || !messageElement) return;
    messageElement.innerHTML = message;
    var alert = indicator.querySelector('.alert');
    if (!alert) return;
    alert.className = 'alert alert-dismissible fade show';
    switch (type) {
      case 'success':
        alert.classList.add('alert-success', 'order-confirmation');
        break;
      case 'error':
        alert.classList.add('alert-danger', 'order-error');
        break;
      case 'loading':
        alert.classList.add('alert-info');
        messageElement.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>' + message;
        break;
      case 'info':
        alert.classList.add('alert-info');
        break;
      default:
        alert.classList.add('alert-info');
    }
    safeShow(indicator);
    if (type === 'success') {
      setTimeout(function () {
        safeHide(indicator);
      }, 5000);
    }
  },

  hideLegacy: function () {
    safeHide(safeGetElement('statusIndicator'));
  }
};
