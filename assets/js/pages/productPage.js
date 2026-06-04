/**
 * Product Page Initialization.
 * 
 * Coordinates product detail page modules.
 * 
 * TODO Future: Add product page analytics.
 * TODO Future: Support product variants.
 * TODO Future: Add customer reviews section.
 */

(function () {
  'use strict';

  function init() {
    try {
      /* Init Firebase and EmailJS */
      initFirebase();
      initEmailJS();

      /* Init theme */
      ThemeState.init();
      ThemeState.updateToggleIcon();

      /* Init cart */
      CartState.init();
      CartUI.init();

      /* Populate wilayas for express form and order modal */
      populateWilayaSelect('expressWilaya');
      populateWilayaSelect('wilayaSelect');

      /* Get product ID from URL */
      var urlParams = new URLSearchParams(window.location.search);
      var productId = parseInt(urlParams.get('pid'));

      /* Load product */
      if (productId) {
        ProductService.loadProducts().then(function (products) {
          var product = products.find(function (p) {
            return p.id === productId;
          });
          if (product) {
            ProductPageUI.render(product);
            ProductPageUI.renderRelated(products, productId);
          } else {
            ProductPageUI.render(null);
          }
        }).catch(function () {
          ProductPageUI.render(null);
        });
      } else {
        ProductPageUI.render(null);
      }

      /* Setup theme toggle */
      var themeToggle = safeGetElement('themeToggle');
      if (themeToggle) {
        themeToggle.addEventListener('click', function (e) {
          e.preventDefault();
          ThemeState.toggle();
          ThemeState.updateToggleIcon();
        });
      }

      /* Setup floating cart drag */
      FloatingCart.init();

      /* Setup cart button click */
      var dragCartBtn = safeGetElement('dragCartBtn');
      if (dragCartBtn) {
        dragCartBtn.addEventListener('click', function () {
          new bootstrap.Offcanvas(safeGetElement('cartOffcanvas')).show();
        });
      }

      /* Setup order modal */
      var orderModalEl = safeGetElement('orderModal');
      if (orderModalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        window._orderModal = new bootstrap.Modal(orderModalEl);
      }

      /* Setup final order submit */
      var submitFinal = safeGetElement('submitOrderFinal');
      if (submitFinal) {
        submitFinal.addEventListener('click', function () {
          submitOrderFromCart();
        });
      }

    } catch (err) {
      console.error('Product page init error:', err);
    }
  }

  function submitOrderFromCart() {
    var fullName = safeGetElement('fullName');
    var phone = safeGetElement('phone');
    var wilaya = safeGetElement('wilayaSelect');
    var address = safeGetElement('address');

    if (!fullName || !phone || !wilaya) return;

    var nameVal = fullName.value.trim();
    var phoneVal = phone.value.trim();
    var wilayaVal = wilaya.value;
    var addressVal = address ? address.value.trim() : '';

    if (!nameVal || !phoneVal || !wilayaVal) {
      Toast.show('يرجى ملء جميع الحقول المطلوبة', 'error');
      return;
    }
    if (!/^0[5-7][0-9]{8}$/.test(phoneVal)) {
      Toast.show('رقم هاتف غير صحيح', 'error');
      return;
    }

    var total = CartState.getTotal();
    var items = CartState.getItems();

    OrderService.submitOrder({
      fullName: nameVal,
      phone: phoneVal,
      email: '',
      wilaya: wilayaVal,
      address: addressVal,
      paymentMethod: 'الدفع عند الاستلام',
      totalPrice: total
    }, items).then(function (result) {
      Toast.show('✅ تم تأكيد الطلب #' + result.orderId.slice(-6), 'success');
      CartState.clear();
      fullName.form.reset();
      if (window._orderModal) {
        window._orderModal.hide();
      }
    }).catch(function () {
      Toast.show('حدث خطأ، حاول مجدداً', 'error');
    });
  }

  /* Expose legacy functions */
  window.toggleCart = function () {
    new bootstrap.Offcanvas(safeGetElement('cartOffcanvas')).show();
  };

  window.checkoutFromCart = function () {
    if (CartState.isEmpty()) {
      Toast.show('السلة فارغة', 'error');
      return;
    }
    var items = CartState.getItems();
    var total = CartState.getTotal();
    var first = items[0];

    var orderProductName = safeGetElement('orderProductName');
    var orderProductPrice = safeGetElement('orderProductPrice');
    var modalTitle = safeGetElement('modalProductTitle');
    var modalPrice = safeGetElement('modalProductPrice');
    var modalImg = safeGetElement('modalProductImg');

    if (orderProductName) orderProductName.value = items.length + ' منتج';
    if (orderProductPrice) orderProductPrice.value = total;
    if (modalTitle) modalTitle.innerText = items.length + ' منتج مختلف';
    if (modalPrice) modalPrice.innerText = total.toLocaleString() + ' د.ج';
    if (modalImg) modalImg.src = first.image;

    if (window._orderModal) {
      window._orderModal.show();
    }
  };

  window.showToast = function (msg, type) {
    Toast.show(msg, type);
  };

  window.addToCart = function (name, price, img, id) {
    CartState.addItem({
      id: id,
      name: name,
      price: price,
      image: img
    });
    Toast.show('✓ تم إضافة "' + name.substring(0, 30) + '" إلى السلة', 'success');
  };

  window.updateQty = function (idx, qty) {
    CartState.updateQuantity(idx, qty);
  };

  window.removeCartItem = function (idx) {
    CartState.removeItem(idx);
    Toast.show('تم إزالة المنتج', 'success');
  };

  window.submitOrderFinal = function () {
    submitOrderFromCart();
  };

  /* Init on DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
