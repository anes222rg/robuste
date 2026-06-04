/**
 * Product Card Component - Renders product grid cards.
 * 
 * Generates Bootstrap carousel + product card HTML.
 * Uses event delegation for add-to-cart and navigation.
 * 
 * TODO Future: Support different card templates/themes.
 * TODO Future: Add stock status indicators.
 * TODO Future: Add lazy loading with IntersectionObserver.
 */

var ProductCardRenderer = {
  render: function (products, containerId) {
    var container = safeGetElement(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (!products || products.length === 0) {
      container.innerHTML = '<div class="col-12 text-center text-muted py-5">لا توجد منتجات</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < products.length; i++) {
      html += this._buildCard(products[i]);
    }
    container.innerHTML = html;
  },

  _buildCard: function (product) {
    var discountBadge = '';
    var oldPrice = '';
    var productBadge = '';

    if (product.old_price && product.old_price > product.price) {
      var discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);
      discountBadge = '<div class="discount-badge">-' + discount + '%</div>';
      oldPrice = '<small dir="ltr" class="old-price text-decoration-line-through text-muted">' + product.old_price.toLocaleString() + ' DA</small>';
    }

    if (product.badge) {
      productBadge = '<div class="product-badge">' + product.badge + '</div>';
    }

    var carouselIndicators = '';
    var carouselItems = '';
    var carouselControls = '';
    var carouselRide = '';

    for (var j = 0; j < product.images.length; j++) {
      carouselIndicators += '<button type="button" data-bs-target="#carousel-' + product.id + '" data-bs-slide-to="' + j + '" ' +
        (j === 0 ? 'class="active" aria-current="true"' : '') +
        ' aria-label="صورة ' + (j + 1) + '"></button>';
      carouselItems += '<div class="carousel-item ' + (j === 0 ? 'active' : '') + '">' +
        '<img src="' + product.images[j] + '" class="d-block w-100" alt="' + product.title.replace(/"/g, '&quot;') + '" loading="lazy">' +
        '</div>';
    }

    if (product.images.length > 1) {
      carouselControls = '<button class="carousel-control-prev" type="button" data-bs-target="#carousel-' + product.id + '" data-bs-slide="prev">' +
        '<span class="carousel-control-prev-icon" aria-hidden="true"></span>' +
        '<span class="visually-hidden">السابق</span>' +
        '</button>' +
        '<button class="carousel-control-next" type="button" data-bs-target="#carousel-' + product.id + '" data-bs-slide="next">' +
        '<span class="carousel-control-next-icon" aria-hidden="true"></span>' +
        '<span class="visually-hidden">التالي</span>' +
        '</button>';
      carouselRide = ' data-bs-ride="carousel" data-bs-interval="3000"';
    }

    return '<div class="col-6 col-md-4 col-lg-3 mb-4">' +
      '<div class="product-card card h-100 position-relative" role="link" tabindex="0" data-pid="' + product.id + '">' +
      productBadge + discountBadge +
      '<div id="carousel-' + product.id + '" class="carousel slide"' + carouselRide + '>' +
      '<div class="carousel-indicators">' + carouselIndicators + '</div>' +
      '<div class="carousel-inner">' + carouselItems + '</div>' +
      carouselControls +
      '</div>' +
      '<h5 class="product-title card-title">' + product.title + '</h5>' +
      '<div class="price-section">' +
      oldPrice +
      '<p dir="ltr" class="current-price">' + product.price.toLocaleString() + ' DA</p>' +
      '</div>' +
      '<div class="card-footer bg-transparent border-0 mt-auto">' +
      '<button class="btn btn-orange add-to-cart-btn" data-id="' + product.id + '" aria-label="إضافة ' + product.title.replace(/"/g, '&quot;') + ' للسلة">' +
      '<i class="bi bi-cart-plus"></i> أضف للسلة' +
      '</button>' +
      '</div>' +
      '</div>' +
      '</div>';
  }
};
