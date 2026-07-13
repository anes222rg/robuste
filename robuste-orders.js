/* ROBUSTE — order submission with enrichment + optional Worker routing.
   IMPORTANT: load this AFTER main.js (it overrides window.submitOrder).
   - CONFIG.workerUrl SET   -> orders POST to your Cloudflare Worker, which adds
     IP/geo + risk, writes Firestore, and sends Telegram/EmailJS from server secrets.
   - CONFIG.workerUrl EMPTY -> Phase-1 fallback: writes Firestore directly from the
     browser and sends Telegram/EmailJS, with meta + risk attached to the order. */
(function () {
  "use strict";

  // ===== CONFIG — set workerUrl once your Worker is deployed (Phase 3) =====
  var CONFIG = {
    workerUrl: (typeof window !== "undefined" && window.ROBUSTE_WORKER_URL) || "",  // set once in robuste-tracking.js
    emailjs: { service: "service_lc1q5k8", template: "template_a15g7yg" }
  };
  // =========================================================================

  var CART_KEY = "robuste_cart";
  var PHONE_RE = /^0[5-7][0-9]{8}$/;

  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? el.value : ""; }
  function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]") || []; } catch (e) { return []; } }

  function status(msg, type) {
    try {
      var ind = $("statusIndicator"), m = $("statusMessage");
      if (!ind || !m) { console.log(type + ": " + ("" + msg).replace(/<[^>]+>/g, "")); return; }
      m.innerHTML = msg;
      var alert = ind.querySelector(".alert");
      if (alert) {
        alert.className = "alert alert-dismissible fade show";
        alert.classList.add(type === "success" ? "alert-success" : type === "error" ? "alert-danger" : "alert-info");
      }
      ind.style.display = "block";
      if (type === "success") setTimeout(function () { ind.style.display = "none"; }, 8000);
    } catch (e) { console.log(msg); }
  }

  function buildOrder() {
    var cart = getCart(), products, total;
    if (cart.length) {
      products = cart;
      total = cart.reduce(function (a, i) { return a + (i.price || 0) * (i.quantity || 0); }, 0);
    } else {
      var price = Number(val("productPriceValue")) || 0;
      var qty = Number(val("quantity")) || 1;
      products = [{ id: "single", name: val("productName") || "\u0645\u0646\u062a\u062c", price: price, image: val("productImageUrl") || "", quantity: qty }];
      total = price * qty;
    }
    var payEl = document.querySelector('input[name="paymentMethod"]:checked');
    return {
      products: products,
      customer: val("fullName"),
      phone: val("phone"),
      email: val("email") || "\u0644\u0645 \u064a\u062a\u0645 \u062a\u0642\u062f\u064a\u0645\u0647",
      wilaya: val("wilaya"),
      address: val("address") || "\u063a\u064a\u0631 \u0645\u062d\u062f\u062f",
      payment: payEl ? payEl.value : "\u0627\u0644\u062f\u0641\u0639 \u0639\u0646\u062f \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645",
      totalPrice: total,
      timestamp: new Date().toISOString(),
      status: "\u062c\u062f\u064a\u062f"
    };
  }

  function validate(o) {
    if (!o.customer || !o.phone || !o.wilaya) { status("\u0627\u0644\u0631\u062c\u0627\u0621 \u0645\u0644\u0621 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629", "error"); return false; }
    if (!PHONE_RE.test(o.phone)) { status("\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d (05 / 06 / 07 + 10 \u0623\u0631\u0642\u0627\u0645)", "error"); return false; }
    return true;
  }

  function lockBtn(lock) {
    var b = $("submitOrderBtn"); if (!b) return;
    b.disabled = lock;
    b.innerHTML = lock ? '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> \u062c\u0627\u0631\u064a \u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629...' : "\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0637\u0644\u0628";
  }

  function onSuccess(order, id) {
    status('<div class="text-center"><i class="bi bi-check-circle-fill text-success fs-1"></i><h5 class="mt-2">\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0637\u0644\u0628\u0643 \u0628\u0646\u062c\u0627\u062d!</h5><p>\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: <strong>' + (id || "\u2014") + '</strong></p></div>', "success");
    try { localStorage.removeItem(CART_KEY); } catch (e) {}
    try { if ($("orderForm")) $("orderForm").reset(); } catch (e) {}
    try {
      var modalEl = $("orderModal");
      if (modalEl && window.bootstrap && bootstrap.Modal) { var inst = bootstrap.Modal.getInstance(modalEl); if (inst) inst.hide(); }
    } catch (e) {}
    try { if (typeof window.updateCartCount === "function") window.updateCartCount(); } catch (e) {}
  }

  function sendTelegram(order) { try { if (typeof window.sendOrderToTelegram === "function") window.sendOrderToTelegram(order); } catch (e) {} }

  function sendEmail(order, id) {
    try {
      if (typeof emailjs === "undefined") return Promise.resolve();
      var rows = order.products.map(function (p) { return '<div><strong>' + p.name + '</strong> \u00d7' + p.quantity + ' = ' + ((p.price || 0) * (p.quantity || 0)).toLocaleString() + ' \u062f.\u062c</div>'; }).join("");
      return emailjs.send(CONFIG.emailjs.service, CONFIG.emailjs.template, {
        order_id: id || "\u2014", customer_name: order.customer, customer_phone: order.phone,
        customer_email: order.email, wilaya: order.wilaya, address: order.address,
        total_price: order.totalPrice.toLocaleString(), payment_method: order.payment,
        order_date: new Date().toLocaleString("ar-DZ"), products: rows
      });
    } catch (e) { return Promise.resolve(); }
  }

  function submitViaWorker(payload) {
    return fetch(CONFIG.workerUrl, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    }).then(function (r) { if (!r.ok) throw new Error("Worker HTTP " + r.status); return r.json(); })
      .then(function (res) { return (res && res.id) || null; });
  }

  function submitViaFirebase(order) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof firebase === "undefined" || !firebase.firestore) { resolve(null); return; }
        firebase.firestore().collection("orders").add(order).then(function (ref) { resolve(ref.id); }).catch(reject);
      } catch (e) { reject(e); }
    }).then(function (id) {
      sendTelegram(order);
      return sendEmail(order, id).then(function () { return id; }, function () { return id; });
    });
  }

  function submit() {
    var order = buildOrder();
    if (!validate(order)) return;

    var meta = {}, risk = { flags: [], level: "green", score: 0 };
    try {
      if (window.RobusteTracking) { meta = window.RobusteTracking.getOrderMeta(); risk = window.RobusteTracking.computeClientRisk(meta, order); }
    } catch (e) {}
    order.meta = meta; order.risk = risk;

    status("\u062c\u0627\u0631\u064a \u0645\u0639\u0627\u0644\u062c\u0629 \u0637\u0644\u0628\u0643...", "loading");
    lockBtn(true);

    var fb = {};
    try { if (window.RobusteTracking && window.RobusteTracking.getFbData) fb = window.RobusteTracking.getFbData(); } catch (e) {}

    var p = CONFIG.workerUrl ? submitViaWorker({ order: order, meta: meta, risk: risk, fb: fb }) : submitViaFirebase(order);
    p.then(function (id) { onSuccess(order, id); })
     .catch(function (err) { console.error("Order submit error:", err); status("\u062a\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.", "error"); })
     .then(function () { lockBtn(false); });
  }

  // Override the global entry point used by the inline onclick="submitOrder()".
  window.submitOrder = submit;
})();
