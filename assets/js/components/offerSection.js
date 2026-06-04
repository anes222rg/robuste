/**
 * Offer Section Component - Renders special offers section.
 * 
 * Renders offer products with discount badges and Bootstrap carousels.
 * 
 * TODO Future: Support different offer layouts.
 * TODO Future: Add timer synchronization with server time.
 */

var OfferSectionRenderer = {
  render: function (offers, containerId) {
    var container = safeGetElement(containerId);
    if (!container) return;

    container.innerHTML = '';
    if (!offers || offers.length === 0) return;

    var html = '';
    for (var i = 0; i < offers.length; i++) {
      html += this._buildOfferCard(offers[i]);
    }
    container.innerHTML = html;
  },

  _buildOfferCard: function (product) {
    var discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);
    var badge = product.badge ? '<div class="offer-product-badge">' + product.badge + '</div>' : '';

    var indicators = '';
    var items = '';

    for (var j = 0; j < product.images.length; j++) {
      indicators += '<button type="button" data-bs-target="#carousel-offer-' + product.id + '" data-bs-slide-to="' + j + '" ' +
        (j === 0 ? 'class="active"' : '') + '></button>';
      items += '<div class="carousel-item ' + (j === 0 ? 'active' : '') + '">' +
        '<img src="' + product.images[j] + '" class="d-block w-100" alt="' + product.title.replace(/"/g, '&quot;') + '" loading="lazy">' +
        '</div>';
    }

    return '<div class="offer-product col-md-4">' +
      '<div class="offer-product-discount">-' + discount + '%</div>' +
      badge +
      '<div id="carousel-offer-' + product.id + '" class="carousel slide" data-bs-ride="carousel">' +
      '<div class="carousel-indicators">' + indicators + '</div>' +
      '<div class="carousel-inner">' + items + '</div>' +
      '<button class="carousel-control-prev" type="button" data-bs-target="#carousel-offer-' + product.id + '" data-bs-slide="prev">' +
      '<span class="carousel-control-prev-icon"></span>' +
      '</button>' +
      '<button class="carousel-control-next" type="button" data-bs-target="#carousel-offer-' + product.id + '" data-bs-slide="next">' +
      '<span class="carousel-control-next-icon"></span>' +
      '</button>' +
      '</div>' +
      '<div class="offer-product-content">' +
      '<h4 class="offer-product-title">' + product.title + '</h4>' +
      '<div class="price-container">' +
      '<div class="offer-product-price">' + product.price.toLocaleString() + ' د.ج</div>' +
      '<div class="offer-product-old-price">' + product.old_price.toLocaleString() + ' د.ج</div>' +
      '</div>' +
      '<a href="product.html?pid=' + product.id + '" class="offer-btn" aria-label="شراء المنتج">' +
      '<i class="bi bi-bolt"></i> اشتر الآن' +
      '</a>' +
      '</div>' +
      '</div>';
  }
};
