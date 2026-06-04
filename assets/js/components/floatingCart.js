/**
 * Floating Cart Component - Draggable floating cart button (product page).
 * 
 * Implements pointer-based drag for the floating cart.
 * Uses event delegation with pointer events for smooth drag.
 * 
 * TODO Future: Store cart position in localStorage per user preference.
 */

var FloatingCart = {
  _element: null,
  _isDragging: false,
  _dragOccurred: false,
  _startX: 0,
  _startY: 0,
  _startLeft: 0,
  _startBottom: 0,
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    this._element = safeGetElement('floatingCart');
    if (!this._element) return;

    this._element.addEventListener('pointerdown', this._onPointerDown.bind(this));
    window.addEventListener('pointermove', this._onPointerMove.bind(this));
    window.addEventListener('pointerup', this._onPointerUp.bind(this));
    this._initialized = true;
  },

  _onPointerDown: function (e) {
    this._isDragging = true;
    this._dragOccurred = false;
    var rect = this._element.getBoundingClientRect();
    this._startLeft = rect.left;
    this._startBottom = window.innerHeight - rect.bottom;
    this._startX = e.clientX;
    this._startY = e.clientY;
    this._element.style.transition = 'none';
    e.preventDefault();
  },

  _onPointerMove: function (e) {
    if (!this._isDragging) return;
    var dx = e.clientX - this._startX;
    var dy = e.clientY - this._startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      this._dragOccurred = true;
    }
    var newLeft = Math.min(window.innerWidth - 80, Math.max(8, this._startLeft + dx));
    var newBottom = Math.min(window.innerHeight - 40, Math.max(60, this._startBottom - dy));
    this._element.style.left = newLeft + 'px';
    this._element.style.bottom = newBottom + 'px';
    this._element.style.top = 'auto';
    this._element.style.right = 'auto';
  },

  _onPointerUp: function () {
    if (!this._isDragging) return;
    this._isDragging = false;
    this._element.style.transition = '';
    if (!this._dragOccurred) {
      this._openCart();
    }
    this._dragOccurred = false;
  },

  _openCart: function () {
    if (typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
      var cartEl = safeGetElement('cartOffcanvas');
      if (cartEl) {
        new bootstrap.Offcanvas(cartEl).show();
      }
    }
  },

  destroy: function () {
    if (this._element) {
      this._element.removeEventListener('pointerdown', this._onPointerDown);
    }
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this._initialized = false;
  }
};
