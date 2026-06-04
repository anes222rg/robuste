/**
 * Homepage Initialization.
 * 
 * Coordinates all homepage modules.
 * Safe DOM access ensures no errors on missing elements.
 * 
 * TODO Future: Defer non-critical modules with requestIdleCallback.
 * TODO Future: Add performance monitoring.
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

      /* Init slideshow if present */
      if (document.querySelector('.mySlides1')) {
        Slideshow.init();
      }

      /* Load products if container exists */
      if (safeGetElement('productsContainer')) {
        ProductService.loadProducts().then(function () {
          return ProductService.loadProducts();
        }).then(function (products) {
          ProductCardRenderer.render(products, 'productsContainer');
          CategoryFilter.init();
          CarouselManager.initProductCardCarousels();
        }).catch(function (err) {
          console.error('Homepage: failed to load products', err);
        });
      }

      /* Init offer timer */
      if (safeGetElement('days')) {
        OfferTimer.init();
      }

      /* Init carousels */
      CarouselManager.initAll();

      /* Populate wilayas */
      populateWilayaSelect('wilaya');

      /* Setup theme toggle */
      var themeToggle = safeGetElement('themeToggle');
      if (themeToggle) {
        themeToggle.addEventListener('click', function (e) {
          e.preventDefault();
          ThemeState.toggle();
          ThemeState.updateToggleIcon();
        });
      }

      /* Setup cart toggle */
      var cartBtn = document.querySelector('.cart-btn');
      if (cartBtn) {
        cartBtn.addEventListener('click', function (e) {
          e.preventDefault();
          toggleCartSidebar();
        });
      }

      /* Setup contact form */
      var contactForm = safeGetElement('contactForm');
      if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
          e.preventDefault();
          handleContactSubmit();
        });
      }

      /* Setup order modal */
      var orderModalEl = safeGetElement('orderModal');
      if (orderModalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        window._orderModal = new bootstrap.Modal(orderModalEl);
      }

      /* Setup product card clicks (navigation) */
      setupProductNavigation();

      /* Touch effects */
      TouchEffects.init();

      /* Product card click delegation for add-to-cart */
      setupGlobalAddToCart();

    } catch (err) {
      console.error('Homepage init error:', err);
    }
  }

  function toggleCartSidebar() {
    if (CartState.isEmpty()) {
      Toast.show('سلة المشتريات فارغة', 'info', 2000);
      return;
    }
    var cartEl = safeGetElement('cartOffcanvas');
    if (!cartEl) return;
    try {
      if (typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
        var offcanvas = new bootstrap.Offcanvas(cartEl);
        offcanvas.show();
      } else {
        cartEl.classList.add('show');
        document.body.classList.add('offcanvas-open');
      }
    } catch (e) {
      cartEl.classList.add('show');
      document.body.classList.add('offcanvas-open');
    }
  }

  function setupProductNavigation() {
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.product-card');
      if (!card) return;
      var interactive = e.target.closest('button, a, input, select, textarea, .carousel-control-prev, .carousel-control-next');
      if (interactive) return;
      if (e.target.closest('.carousel-indicators, .carousel-control')) return;
      var pid = card.getAttribute('data-pid');
      if (!pid) return;
      window.location.href = 'product.html?pid=' + encodeURIComponent(pid);
    });
  }

  function setupGlobalAddToCart() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.add-to-cart-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var productId = btn.getAttribute('data-id');
      if (!productId) return;
      ProductService.getProductById(productId).then(function (product) {
        if (!product) {
          Toast.show('المنتج غير موجود', 'error');
          return;
        }
        CartState.addItem({
          id: product.id,
          name: product.title,
          price: product.price,
          image: product.images[0]
        });
        Toast.show('تمت إضافة "' + product.title.substring(0, 30) + '" إلى السلة', 'success');
      }).catch(function () {
        Toast.show('حدث خطأ أثناء إضافة المنتج', 'error');
      });
    });
  }

  /* Legacy order submission from index.html checkout */
  window.submitOrder = function () {
    var fullName = safeGetElement('fullName');
    var phone = safeGetElement('phone');
    var email = safeGetElement('email');
    var wilaya = safeGetElement('wilaya');
    var address = safeGetElement('address');
    var paymentMethodEl = document.querySelector('input[name="paymentMethod"]:checked');

    if (!fullName || !phone || !wilaya) return;

    var nameVal = fullName.value.trim();
    var phoneVal = phone.value.trim();
    var emailVal = email ? email.value : '';
    var wilayaVal = wilaya.value;
    var addressVal = address ? address.value : '';

    if (!nameVal || !phoneVal || !wilayaVal) {
      Toast.show('الرجاء ملء جميع الحقول المطلوبة', 'error');
      return;
    }
    if (!/^0[5-7][0-9]{8}$/.test(phoneVal)) {
      Toast.show('رقم الهاتف غير صحيح', 'error');
      return;
    }

    var paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'الدفع عند الاستلام';
    var total = CartState.getTotal();
    var items = CartState.getItems();

    Toast.show('جاري معالجة طلبك...', 'info', 10000);

    var submitBtn = safeGetElement('submitOrderBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> جاري المعالجة...';
    }

    OrderService.submitOrder({
      fullName: nameVal,
      phone: phoneVal,
      email: emailVal,
      wilaya: wilayaVal,
      address: addressVal,
      paymentMethod: paymentMethod,
      totalPrice: total
    }, items).then(function (result) {
      var successHtml = '<div class="text-center">' +
        '<i class="bi bi-check-circle-fill text-success fs-1"></i>' +
        '<h5 class="mt-2">تم تأكيد طلبك بنجاح!</h5>' +
        '<div class="text-start mt-3">' +
        '<p><strong>رقم الطلب:</strong> ' + result.orderId + '</p>' +
        '<p><strong>الاسم:</strong> ' + nameVal + '</p>' +
        '<p><strong>عدد المنتجات:</strong> ' + items.length + ' منتجات</p>' +
        '<p><strong>المبلغ الإجمالي:</strong> ' + total.toLocaleString() + ' د.ج</p>' +
        '<p class="mt-3">سيتم التواصل معك على الرقم <strong>' + phoneVal + '</strong> خلال 24 ساعة لتأكيد الشحن.</p>' +
        '</div>' +
        '<a href="https://wa.me/213656360457?text=' + encodeURIComponent(
          'استفسار عن الطلب ' + result.orderId + '\nالاسم: ' + nameVal + '\nعدد المنتجات: ' + items.length + '\nالمجموع: ' + total.toLocaleString() + ' د.ج\nرقم الهاتف: ' + phoneVal
        ) + '" class="btn whatsapp-contact-btn mt-2 w-100" target="_blank">' +
        '<i class="bi bi-whatsapp"></i> تواصل عبر واتساب (اختياري)' +
        '</a>' +
        '</div>';
      Toast.showLegacy(successHtml, 'success');
      CartState.clear();
      fullName.form.reset();
      if (window._orderModal) {
        window._orderModal.hide();
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'تأكيد الطلب';
      }
    }).catch(function (error) {
      Toast.show('حدث خطأ أثناء إرسال الطلب', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'تأكيد الطلب';
      }
    });
  };

  window.checkout = function () {
    if (CartState.isEmpty()) {
      Toast.show('سلة المشتريات فارغة', 'error');
      return;
    }

    var cartEl = safeGetElement('cartOffcanvas');
    if (cartEl) {
      try {
        var offcanvas = bootstrap.Offcanvas.getInstance(cartEl);
        if (offcanvas) offcanvas.hide();
        else cartEl.classList.remove('show');
      } catch (e) {
        cartEl.classList.remove('show');
      }
    }
    document.body.classList.remove('offcanvas-open');

    var firstItem = CartState.getItems()[0];
    var total = CartState.getTotal();

    var productNameEl = safeGetElement('productName');
    var productPriceEl = safeGetElement('productPriceValue');
    var productImageEl = safeGetElement('productImageUrl');
    var nameDisplayEl = safeGetElement('productNameDisplay');
    var priceDisplayEl = safeGetElement('productPrice');
    var imageDisplayEl = safeGetElement('productImage');

    if (productNameEl) productNameEl.value = CartState.getCount() + ' منتجات مختلفة';
    if (productPriceEl) productPriceEl.value = total;
    if (productImageEl) productImageEl.value = firstItem ? firstItem.image : '';
    if (nameDisplayEl) nameDisplayEl.textContent = CartState.getCount() + ' منتجات مختلفة';
    if (priceDisplayEl) priceDisplayEl.textContent = total.toLocaleString() + ' DA';
    if (imageDisplayEl) imageDisplayEl.src = firstItem ? firstItem.image : '';

    var form = safeGetElement('orderForm');
    if (form) form.reset();
    var cashOnDelivery = safeGetElement('cashOnDelivery');
    if (cashOnDelivery) cashOnDelivery.checked = true;

    if (window._orderModal) {
      window._orderModal.show();
    }
  };

  window.hideStatus = function () {
    Toast.hideLegacy();
  };

  function handleContactSubmit() {
    var name = safeGetElement('contactName');
    var email = safeGetElement('contactEmail');
    var phone = safeGetElement('contactPhone');
    var message = safeGetElement('contactMessage');

    if (!name || !email || !message) return;

    var nameVal = name.value.trim();
    var emailVal = email.value.trim();
    var messageVal = message.value.trim();
    var phoneVal = phone ? phone.value.trim() : '';

    if (!nameVal || !emailVal || !messageVal) {
      Toast.show('الرجاء ملء جميع الحقول المطلوبة', 'error');
      return;
    }

    var spinner = safeGetElement('contactSpinner');
    var submitText = safeGetElement('contactSubmitText');
    if (spinner) spinner.classList.remove('d-none');
    if (submitText) submitText.textContent = 'جاري الإرسال...';

    ContactService.sendMessage({
      name: nameVal,
      email: emailVal,
      phone: phoneVal,
      message: messageVal
    }).then(function () {
      Toast.show('تم إرسال رسالتك بنجاح! سوف نتواصل معك قريباً.', 'success');
      name.form.reset();
    }).catch(function () {
      Toast.show('حدث خطأ أثناء إرسال الرسالة', 'error');
    }).finally(function () {
      if (spinner) spinner.classList.add('d-none');
      if (submitText) submitText.textContent = 'إرسال الرسالة';
    });
  }

  /* Init on DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose legacy functions for inline onclick */
  window.toggleCart = toggleCartSidebar;
  window.scrollOffers = function (direction) {
    var container = document.querySelector('.offer-products');
    if (!container) return;
    container.scrollTo({
      left: container.scrollLeft + (380 * direction),
      behavior: 'smooth'
    });
  };

})();
