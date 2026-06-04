/**
 * Product Page UI Component - Renders product detail page.
 * 
 * Handles product layout rendering, image gallery,
 * quick order form, and related products.
 * 
 * TODO Future: Add zoom on image hover.
 * TODO Future: Add product reviews/ratings display.
 * TODO Future: Add variant/color selector.
 */

var ProductPageUI = {
  _currentProduct: null,

  render: function (product) {
    if (!product) {
      this._showNotFound();
      return;
    }
    this._currentProduct = product;
    this._renderDetail(product);
    this._renderDescription(product);
  },

  _renderDetail: function (p) {
    var row = safeGetElement('productDetailRow');
    if (!row) return;

    var thumbs = '';
    p.images.forEach(function (img, idx) {
      thumbs += '<div class="thumbnail ' + (idx === 0 ? 'active' : '') + '" onclick="ProductPageUI.changeImage(\'' + img + '\', this)">' +
        '<img src="' + img + '" alt="' + p.title.replace(/'/g, "\\'") + '">' +
        '</div>';
    });

    var discount = p.old_price ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : 0;
    var discountHtml = discount ? '<span class="discount-badge ms-2">-' + discount + '%</span>' : '';
    var featuresHtml = (p.features || ['جودة عالية', 'ضمان سنتان', 'توصيل سريع']).map(function (f) {
      return '<li><i class="bi bi-check-circle-fill"></i> ' + f + '</li>';
    }).join('');

    var safeTitle = p.title.replace(/'/g, "\\'");

    row.innerHTML =
      '<div class="col-lg-5 mb-4">' +
      '  <div class="main-image-wrapper"><img id="mainProductImg" src="' + p.images[0] + '" alt="' + safeTitle + '"></div>' +
      '  <div class="thumbnail-strip">' + thumbs + '</div>' +
      '</div>' +
      '<div class="col-lg-4 mb-4">' +
      '  <div class="product-info-card">' +
      '    <span class="badge bg-primary mb-2 px-3 py-2 rounded-pill">' + (p.badge || 'جديد') + '</span>' +
      '    <h1 class="product-title">' + p.title + '</h1>' +
      '    <div class="price-block d-flex align-items-center justify-content-between">' +
      '      <div><span class="current-price">' + p.price.toLocaleString() + ' د.ج</span>' +
      (p.old_price ? '<span class="old-price me-2">' + p.old_price.toLocaleString() + ' د.ج</span>' : '') + '</div>' +
      discountHtml +
      '    </div>' +
      '    <p class="mt-3">' + (p.description_short || 'منتج عالي الجودة من ROBUSTE') + '</p>' +
      '    <ul class="feature-list">' + featuresHtml + '</ul>' +
      '    <div class="stock-status"><i class="bi bi-check-circle-fill text-success"></i> متوفر · توصيل سريع</div>' +
      '    <div class="action-buttons d-flex gap-3 mt-3">' +
      '      <button class="btn btn-orange flex-grow-1" onclick="ProductPageUI.addToCart(' + p.id + ')"><i class="bi bi-cart-plus"></i> أضف للسلة</button>' +
      '      <button class="btn btn-outline-modern flex-grow-1" onclick="ProductPageUI.buyNow(' + p.id + ')"><i class="bi bi-bag-check"></i> شراء فوري</button>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div class="col-lg-3 mb-4">' +
      '  <div class="quick-order-card">' +
      '    <div class="quick-order-title">طلب سريع</div>' +
      '    <div class="product-mini"><img src="' + p.images[0] + '" width="50" alt=""><div><strong>' + p.title.substring(0, 35) + '</strong><div class="text-primary fw-bold">' + p.price + ' د.ج</div></div></div>' +
      '    <form id="expressForm" onsubmit="return false;">' +
      '      <input type="text" id="expressName" class="form-control-premium mb-2" placeholder="الاسم الكامل *">' +
      '      <input type="tel" id="expressPhone" class="form-control-premium mb-2" placeholder="رقم الهاتف *">' +
      '      <select id="expressWilaya" class="form-select-premium mb-2"></select>' +
      '      <input type="number" id="expressQty" class="form-control-premium mb-2" value="1" min="1">' +
      '      <button type="button" class="btn-submit-express" onclick="ProductPageUI.submitExpress(' + p.id + ')">تأكيد الطلب</button>' +
      '    </form>' +
      '  </div>' +
      '</div>';
  },

  _renderDescription: function (p) {
    var descSection = safeGetElement('descriptionSection');
    if (descSection) {
      descSection.innerHTML = '<h4 class="fw-bold mb-3">وصف المنتج</h4><p>' +
        (p.description_long || p.description_short || 'منتج عالي الجودة من ROBUSTE') + '</p>';
    }
  },

  _showNotFound: function () {
    var row = safeGetElement('productDetailRow');
    if (row) {
      row.innerHTML = '<div class="col-12 text-center py-5"><i class="bi bi-exclamation-triangle fs-1"></i><h3>المنتج غير موجود</h3></div>';
    }
  },

  renderRelated: function (products, currentId) {
    var section = safeGetElement('relatedSection');
    if (!section) return;
    var related = products.filter(function (p) {
      return p.id != currentId;
    }).slice(0, 4);
    if (related.length === 0) return;

    var html = '<h3 class="mb-4">قد يعجبك أيضاً</h3><div class="row g-4">';
    related.forEach(function (p) {
      var safeTitle = p.title.replace(/'/g, "\\'");
      html += '<div class="col-md-3 col-6">' +
        '<div class="related-card" onclick="window.location.href=\'product.html?pid=' + p.id + '\'">' +
        '<img src="' + p.images[0] + '" alt="' + safeTitle + '" loading="lazy">' +
        '<div class="related-title">' + p.title.substring(0, 35) + '</div>' +
        '<div class="related-price">' + p.price.toLocaleString() + ' د.ج</div>' +
        '<button class="btn btn-orange w-100 mt-2" onclick="event.stopPropagation(); ProductPageUI.addToCart(' + p.id + ')">أضف للسلة</button>' +
        '</div>' +
        '</div>';
    });
    html += '</div>';
    section.innerHTML = html;
  },

  changeImage: function (src, el) {
    var mainImg = safeGetElement('mainProductImg');
    if (mainImg) mainImg.src = src;
    document.querySelectorAll('.thumbnail').forEach(function (t) {
      t.classList.remove('active');
    });
    if (el) el.classList.add('active');
  },

  addToCart: function (productId) {
    var self = this;
    ProductService.getProductById(productId).then(function (p) {
      if (!p) return;
      CartState.addItem({
        id: p.id,
        name: p.title,
        price: p.price,
        image: p.images[0]
      });
      Toast.show('✓ تم إضافة "' + p.title.substring(0, 30) + '" إلى السلة', 'success');
    });
  },

  buyNow: function (productId) {
    var self = this;
    ProductService.getProductById(productId).then(function (p) {
      if (!p) return;
      CartState.addItem({
        id: p.id,
        name: p.title,
        price: p.price,
        image: p.images[0]
      });
      if (typeof checkoutFromCart === 'function') {
        checkoutFromCart();
      }
    });
  },

  submitExpress: function (productId) {
    if (!this._currentProduct) return;
    var p = this._currentProduct;

    var name = safeGetElement('expressName');
    var phone = safeGetElement('expressPhone');
    var wilaya = safeGetElement('expressWilaya');
    var qty = safeGetElement('expressQty');

    if (!name || !phone || !wilaya) return;

    var nameVal = name.value.trim();
    var phoneVal = phone.value.trim();
    var wilayaVal = wilaya.value;
    var qtyVal = parseInt(qty.value) || 1;

    if (!nameVal || !phoneVal || !wilayaVal) {
      Toast.show('يرجى ملء البيانات', 'error');
      return;
    }
    if (!/^0[5-7][0-9]{8}$/.test(phoneVal)) {
      Toast.show('رقم هاتف غير صحيح', 'error');
      return;
    }

    var total = p.price * qtyVal;

    OrderService.submitExpressOrder(p, qtyVal, {
      name: nameVal,
      phone: phoneVal,
      wilaya: wilayaVal
    }).then(function (result) {
      Toast.show('تم تأكيد طلبك', 'success');
      if (name && name.form) name.form.reset();
    }).catch(function (e) {
      Toast.show('حدث خطأ', 'error');
    });
  }

};

/* Expose for inline event handlers */
window.ProductPageUI = ProductPageUI;
