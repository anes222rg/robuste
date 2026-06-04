/**
 * Cart State - Centralized cart management.
 * 
 * Single source of truth for shopping cart data.
 * Uses StorageService for persistence.
 * Implements observer pattern for UI updates.
 * 
 * TODO Future: Add cart persistence to Firestore for cross-device sync.
 * TODO Future: Add cart expiry for abandoned carts.
 * TODO Future: Add promo code support.
 * TODO Future: Add shipping cost calculation.
 */

var CartState = {
  _items: [],
  _listeners: [],
  _storageKey: 'cart',
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._items = StorageService.get(this._storageKey) || [];
    this._initialized = true;
    this._notify();
  },

  getItems: function () {
    return this._items.slice();
  },

  getCount: function () {
    return this._items.reduce(function (sum, item) {
      return sum + (item.quantity || 1);
    }, 0);
  },

  getTotal: function () {
    return this._items.reduce(function (sum, item) {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);
  },

  isEmpty: function () {
    return this._items.length === 0;
  },

  addItem: function (product) {
    var existing = null;
    for (var i = 0; i < this._items.length; i++) {
      if (this._items[i].id == product.id) {
        existing = this._items[i];
        break;
      }
    }
    if (existing) {
      existing.quantity += product.quantity || 1;
    } else {
      this._items.push({
        id: product.id,
        name: product.name || product.title,
        price: product.price,
        image: product.image || (product.images ? product.images[0] : ''),
        quantity: product.quantity || 1
      });
    }
    this._persist();
    this._notify();
  },

  removeItem: function (index) {
    if (index >= 0 && index < this._items.length) {
      this._items.splice(index, 1);
      this._persist();
      this._notify();
    }
  },

  updateQuantity: function (index, newQuantity) {
    if (index >= 0 && index < this._items.length) {
      if (newQuantity < 1) {
        this.removeItem(index);
        return;
      }
      this._items[index].quantity = newQuantity;
      this._persist();
      this._notify();
    }
  },

  clear: function () {
    this._items = [];
    this._persist();
    this._notify();
  },

  subscribe: function (listener) {
    if (typeof listener === 'function') {
      this._listeners.push(listener);
    }
    return this._listeners.length - 1;
  },

  unsubscribe: function (index) {
    if (typeof index === 'number') {
      this._listeners[index] = null;
    }
  },

  _persist: function () {
    StorageService.set(this._storageKey, this._items);
  },

  _notify: function () {
    var state = {
      items: this.getItems(),
      count: this.getCount(),
      total: this.getTotal(),
      isEmpty: this.isEmpty()
    };
    this._listeners.forEach(function (listener) {
      if (typeof listener === 'function') {
        try {
          listener(state);
        } catch (e) {
          console.warn('Cart listener error:', e);
        }
      }
    });
  }
};
