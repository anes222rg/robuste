/**
 * Theme State - Dark/Light mode management.
 * 
 * Centralized theme state with localStorage persistence.
 * Supports observer pattern for UI synchronization.
 * 
 * TODO Future: Add system preference detection (prefers-color-scheme).
 * TODO Future: Add theme transition animation support.
 * TODO Future: Support multiple themes (not just dark/light).
 */

var ThemeState = {
  _current: 'light',
  _listeners: [],
  _storageKey: 'theme',
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._current = StorageService.getRaw(this._storageKey) || 'light';
    this._apply();
    this._initialized = true;
  },

  get: function () {
    return this._current;
  },

  isDark: function () {
    return this._current === 'dark';
  },

  toggle: function () {
    this._current = this._current === 'dark' ? 'light' : 'dark';
    StorageService.setRaw(this._storageKey, this._current);
    this._apply();
    this._notify();
    return this._current;
  },

  set: function (theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    this._current = theme;
    StorageService.setRaw(this._storageKey, theme);
    this._apply();
    this._notify();
  },

  subscribe: function (listener) {
    if (typeof listener === 'function') {
      this._listeners.push(listener);
    }
  },

  _apply: function () {
    document.documentElement.setAttribute('data-theme', this._current);
  },

  _notify: function () {
    this._listeners.forEach(function (listener) {
      try {
        listener(this._current);
      } catch (e) {
        console.warn('Theme listener error:', e);
      }
    }.bind(this));
  },

  /**
   * Update theme toggle button icon.
   */
  updateToggleIcon: function () {
    var icon = safeQuerySelector('#themeToggle i');
    var btn = safeGetElement('themeToggle');
    if (!icon) return;
    if (this._current === 'dark') {
      icon.className = 'bi bi-sun';
      if (btn) btn.title = 'تفعيل وضع النهار';
    } else {
      icon.className = 'bi bi-moon';
      if (btn) btn.title = 'تفعيل وضع الظلام';
    }
  }
};
