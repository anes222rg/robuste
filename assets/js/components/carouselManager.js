/**
 * Carousel Manager - Initializes Bootstrap carousels.
 * 
 * Safely initializes carousels with proper timing.
 * Prevents double initialization and race conditions.
 * 
 * TODO Future: Support custom carousel options per product.
 * TODO Future: Add IntersectionObserver for lazy carousel init.
 */

var CarouselManager = {
  _initialized: false,

  initAll: function () {
    if (this._initialized) return;
    setTimeout(function () {
      this._initProductCards();
      this._initOfferCarousels();
      this._initialized = true;
    }.bind(this), 500);
  },

  initProductCardCarousels: function () {
    setTimeout(function () {
      this._initProductCards();
    }.bind(this), 200);
  },

  _initProductCards: function () {
    if (typeof bootstrap === 'undefined' || !bootstrap.Carousel) return;
    var carousels = document.querySelectorAll('.product-card .carousel');
    carousels.forEach(function (carousel) {
      var items = carousel.querySelectorAll('.carousel-item');
      if (items.length <= 1) return;
      try {
        new bootstrap.Carousel(carousel, {
          interval: 3000,
          wrap: true,
          pause: 'hover'
        });
      } catch (e) {
        /* silently fail for already initialized */
      }
    });
  },

  _initOfferCarousels: function () {
    if (typeof bootstrap === 'undefined' || !bootstrap.Carousel) return;
    var carousels = document.querySelectorAll('.offer-product .carousel');
    carousels.forEach(function (carousel) {
      try {
        new bootstrap.Carousel(carousel, {
          interval: 3000,
          wrap: true,
          pause: 'hover'
        });
      } catch (e) {
        /* silently fail for already initialized */
      }
    });
  },

  destroy: function () {
    this._initialized = false;
  }
};
