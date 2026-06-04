/**
 * Cart UI Component - Renders cart offcanvas content.
 * 
 * Subscribes to CartState changes.
 * Manages cart DOM rendering and event handlers.
 * 
 * TODO Future: Support cart item animations.
 * TODO Future: Add quantity change animation.
 */

var CartUI = {
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    CartState.subscribe(this._onCartChange.bind(this));
    this._initialized = true;
  },

  updateCounters: function () {
    var count = CartState.getCount();
    var cartCount = safeGetElement('cartCount');
    var cartCountFloat = safeGetElement('cartCountFloat');
    var checkoutBtn = safeGetElement('checkoutBtn');
    var checkoutBtnCart = safeGetElement('checkoutBtnCart');

    if (cartCount) cartCount.textContent = count;
    if (cartCountFloat) cartCountFloat.textContent = count;

    if (checkoutBtn) {
      checkoutBtn.disabled = count === 0;
      if (count === 0) {
        checkoutBtn.classList.add('disabled');
      } else {
        checkoutBtn.classList.remove('disabled');
      }
    }
    if (checkoutBtnCart) {
      checkoutBtnCart.disabled = count === 0;
    }
  },

  render: function () {
    var cartItems = safeGetElement('cartItems');
    var cartTotal = safeGetElement('cartTotal');
    var cartItemsList = safeGetElement('cartItemsList');
    var cartTotalAmount = safeGetElement('cartTotalAmount');

    this._renderLegacyCart(cartItems, cartTotal);
    this._renderProductPageCart(cartItemsList, cartTotalAmount);
    this.updateCounters();
  },

  _renderLegacyCart: function (container, totalEl) {
    if (!container) return;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (CartState.isEmpty()) {
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'text-center py-4 text-muted';
      emptyDiv.id = 'emptyCartMessage';
      emptyDiv.innerHTML = '<i class="bi bi-cart-x display-4 d-block mb-2"></i>سلة المشتريات فارغة';
      container.appendChild(emptyDiv);
      if (totalEl) totalEl.textContent = '0 د.ج';
      return;
    }

    var total = 0;
    var items = CartState.getItems();

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var itemTotal = (item.price || 0) * (item.quantity || 0);
      total += itemTotal;

      var itemElement = document.createElement('div');
      itemElement.className = 'cart-item';
      itemElement.setAttribute('data-id', item.id || '');
      itemElement.innerHTML = '<div class="d-flex align-items-center">' +
        '<img src="' + (item.image || '') + '" alt="' + (item.name || 'منتج') + '" class="cart-item-img me-3" loading="lazy">' +
        '<div class="cart-item-details flex-grow-1">' +
        '<div class="cart-item-title mb-1">' + (item.name || 'منتج بدون اسم') + '</div>' +
        '<div class="cart-item-price mb-2">' + (item.price || 0).toLocaleString() + ' د.ج</div>' +
        '<div class="quantity-controls d-flex align-items-center">' +
        '<button class="quantity-btn decrease-btn" data-index="' + i + '">-</button>' +
        '<input type="number" class="quantity-input mx-2" value="' + (item.quantity || 1) + '" min="1" data-index="' + i + '" readonly>' +
        '<button class="quantity-btn increase-btn" data-index="' + i + '">+</button>' +
        '</div>' +
        '</div>' +
        '<button class="remove-item-btn ms-2" data-index="' + i + '">' +
        '<i class="bi bi-trash"></i>' +
        '</button>' +
        '</div>';
      container.appendChild(itemElement);
    }

    if (totalEl) totalEl.textContent = total.toLocaleString('ar-DZ') + ' د.ج';
  },

  _renderProductPageCart: function (container, totalEl) {
    if (!container) return;

    if (CartState.isEmpty()) {
      container.innerHTML = '<div class="empty-cart-cta"><i class="bi bi-bag-x"></i><h5 class="mt-2">سلة التسوق فارغة</h5><p class="text-muted">استكشف منتجاتنا وأضف ما يناسبك</p><a href="index.html#products" class="btn btn-outline-modern mt-2">تصفح المنتجات</a></div>';
      if (totalEl) totalEl.innerText = '0 د.ج';
      return;
    }

    var html = '';
    var total = 0;
    var items = CartState.getItems();

    items.forEach(function (item, idx) {
      total += item.price * item.quantity;
      html += '<div class="cart-item d-flex gap-3">' +
        '<img src="' + item.image + '" width="60" class="rounded-3" loading="lazy">' +
        '<div class="flex-grow-1">' +
        '<h6 class="mb-1">' + item.name + '</h6>' +
        '<div class="text-primary fw-bold">' + item.price.toLocaleString() + ' د.ج</div>' +
        '<div class="d-flex gap-2 mt-2">' +
        '<button class="btn btn-sm btn-outline-secondary" onclick="CartState.updateQuantity(' + idx + ', ' + (item.quantity - 1) + ')">-</button>' +
        '<span class="px-2">' + item.quantity + '</span>' +
        '<button class="btn btn-sm btn-outline-secondary" onclick="CartState.updateQuantity(' + idx + ', ' + (item.quantity + 1) + ')">+</button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="CartState.removeItem(' + idx + ')"><i class="bi bi-trash"></i></button>' +
        '</div>' +
        '</div>' +
        '</div>';
    });

    container.innerHTML = html;
    if (totalEl) totalEl.innerText = total.toLocaleString() + ' د.ج';
  },

  _onCartChange: function () {
    this.render();
  }
};
