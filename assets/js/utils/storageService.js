/**
 * LocalStorage abstraction layer.
 * Provides safe read/write with error handling.
 * 
 * TODO Future: Support multiple storage backends (localStorage, sessionStorage, IndexedDB)
 * for future offline mode and larger data volumes.
 */

var StorageService = {
  prefix: 'robuste_',

  get: function (key) {
    try {
      var value = localStorage.getItem(this.prefix + key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.warn('Storage read error:', key, e);
      return null;
    }
  },

  set: function (key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write error:', key, e);
      return false;
    }
  },

  remove: function (key) {
    try {
      localStorage.removeItem(this.prefix + key);
      return true;
    } catch (e) {
      console.warn('Storage remove error:', key, e);
      return false;
    }
  },

  getRaw: function (key) {
    try {
      return localStorage.getItem(this.prefix + key);
    } catch (e) {
      return null;
    }
  },

  setRaw: function (key, value) {
    try {
      localStorage.setItem(this.prefix + key, value);
      return true;
    } catch (e) {
      return false;
    }
  },

  clear: function () {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(this.prefix) === 0) {
          keys.push(k);
        }
      }
      keys.forEach(function (k) {
        localStorage.removeItem(k);
      });
      return true;
    } catch (e) {
      return false;
    }
  }
};
