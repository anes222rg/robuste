/**
 * Category Filter Component - Product category filter buttons.
 * 
 * Manages category button active states and product filtering.
 * Uses debounced event handling to prevent rapid clicks.
 * 
 * TODO Future: Support sub-categories.
 * TODO Future: Support multi-select categories.
 */

var CategoryFilter = {
  _processing: false,
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    var buttons = document.querySelectorAll('.category-btn');
    if (buttons.length === 0) return;

    buttons.forEach(function (btn) {
      btn.addEventListener('click', this._handleClick.bind(this));
    }.bind(this));

    this._initialized = true;
  },

  _handleClick: function (e) {
    var btn = e.currentTarget;
    if (this._processing) return;
    this._processing = true;

    document.querySelectorAll('.category-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');

    var category = btn.getAttribute('data-category');
    this._onCategoryChange(category);

    setTimeout(function () {
      this._processing = false;
    }.bind(this), 300);
  },

  _onCategoryChange: function (category) {
    ProductService.getProductsByCategory(category).then(function (products) {
      ProductCardRenderer.render(products, 'productsContainer');
      CarouselManager.initProductCardCarousels();
    }).catch(function (error) {
      console.error('Category filter error:', error);
    });
  }
};
