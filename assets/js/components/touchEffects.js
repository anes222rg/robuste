/**
 * Touch Effects Component - Adds mobile touch feedback.
 * 
 * Applies scale-down effect on touch for buttons and interactive elements.
 * Prevents default behavior for better mobile UX.
 */

var TouchEffects = {
  init: function () {
    this._addAddToCartTouch();
    this._addCardTouch();
    this._addGenericTouch();
    document.documentElement.style.touchAction = 'manipulation';
    document.documentElement.style.webkitTapHighlightColor = 'transparent';
  },

  _addAddToCartTouch: function () {
    document.addEventListener('touchstart', function (e) {
      var btn = e.target.closest('.add-to-cart-btn, .offer-btn, .btn, .social-icon, .whatsapp-btn, .prev1, .next1');
      if (btn) {
        btn.style.transform = 'scale(0.96)';
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      var btn = e.target.closest('.add-to-cart-btn, .offer-btn, .btn, .social-icon, .whatsapp-btn, .prev1, .next1');
      if (btn) {
        btn.style.transform = '';
      }
    }, { passive: true });
  },

  _addCardTouch: function () {
    document.addEventListener('touchstart', function (e) {
      var card = e.target.closest('.product-card, .offer-product');
      if (card && !e.target.closest('button, a, input, select, textarea')) {
        card.style.transform = 'translateY(-2px)';
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      var card = e.target.closest('.product-card, .offer-product');
      if (card) {
        card.style.transform = '';
      }
    }, { passive: true });
  },

  _addGenericTouch: function () {
    var selectors = '#themeToggle, .cart-btn, #checkoutBtn, #submitOrderBtn';
    document.addEventListener('touchstart', function (e) {
      var el = e.target.closest(selectors);
      if (el) {
        el.style.transform = 'scale(0.95)';
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      var el = e.target.closest(selectors);
      if (el) {
        el.style.transform = '';
      }
    }, { passive: true });
  }
};
