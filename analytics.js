/* ROBUSTE - GA4 + Meta Pixel event tracking (v3, campaign-grade).
   v3: (a) InitiateCheckout is never sent without a price (fixes the 12% of
       events Meta flagged as missing price/currency).
   (b) Advanced Matching is attached to EVERY event, not only Purchase
       (raises Event Match Quality from ~6.1 toward 7+).

   WHAT CHANGED vs v1:
   - Every funnel event now carries value + currency "DZD" + content_ids +
     contents + content_name + num_items. Meta can finally tell WHICH product
     was viewed / added / checked out, and at WHAT price.
   - InitiateCheckout fires ONLY for #orderModal (the review modal used to
     fire a fake InitiateCheckout on every review popup).
   - Advanced Matching (phone, name, city, state, external_id) is pushed to the
     pixel at order time -> much higher Event Match Quality.
   - The Arabic-text MutationObserver "purchase detector" is REMOVED. It was
     fragile and could double-count.
   - Purchase itself is still sent SERVER-SIDE ONLY, after you confirm the
     order in the admin panel. The browser fires "PlaceOrder" (custom event).

   Everything is wrapped in try/catch so it can never break the site. */
(function () {
  "use strict";

  var CUR = "DZD";

  function gt(name, params) {
    try { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); } catch (e) {}
  }
  function fb(name, params, opts) {
    try { if (typeof window.fbq === "function") window.fbq("track", name, params || {}, opts || {}); } catch (e) {}
  }
  function fbc(name, params, opts) {
    try { if (typeof window.fbq === "function") window.fbq("trackCustom", name, params || {}, opts || {}); } catch (e) {}
  }
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  function num(v) {
    if (v == null) return undefined;
    var d = ("" + v).replace(/[^0-9.]/g, "");
    var n = parseFloat(d);
    return isNaN(n) ? undefined : n;
  }
  function clean(s) { return String(s == null ? "" : s).trim(); }

  // ---------- Advanced Matching (raw values; the pixel hashes them) ----------
  function latin(s) {
    return clean(s).toLowerCase().replace(/\s+/g, "");
  }
  function phoneE164(p) {
    var d = clean(p).replace(/[^0-9]/g, "");
    if (!d) return "";
    if (d.indexOf("213") === 0) return d;
    if (d.charAt(0) === "0") d = d.slice(1);
    return "213" + d;
  }
  function setUserData(o) {
    try {
      if (typeof window.fbq !== "function") return;
      var pid = window.RB_PIXEL_ID;
      if (!pid) return;
      o = o || {};
      var ph = phoneE164(o.phone);
      var parts = clean(o.customer).split(/\s+/).filter(Boolean);
      var ud = { country: "dz" };
      if (ph) { ud.ph = ph; ud.external_id = ph; }
      if (parts.length) ud.fn = latin(parts[0]);
      if (parts.length > 1) ud.ln = latin(parts[parts.length - 1]);
      if (o.email && o.email.indexOf("@") > 0) ud.em = clean(o.email).toLowerCase();
      if (o.baladiya) ud.ct = latin(o.baladiya);
      if (o.wilaya) ud.st = latin(o.wilaya);
      window.fbq("init", pid, ud);
    } catch (e) {}
  }
  window.RBSetUserData = setUserData;

  // ---------- product catalogue (for value on ViewContent) ----------
  var _cat = null, _catP = null;
  function catalogue() {
    if (_cat) return Promise.resolve(_cat);
    if (_catP) return _catP;
    _catP = fetch("products.json")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (a) { _cat = a || []; return _cat; })
      .catch(function () { _cat = []; return _cat; });
    return _catP;
  }
  function findProduct(id) {
    return catalogue().then(function (a) {
      for (var i = 0; i < a.length; i++) if (String(a[i].id) === String(id)) return a[i];
      return null;
    });
  }
  function currentPid() {
    var pid = null;
    try { pid = new URLSearchParams(location.search).get("pid"); } catch (e) {}
    if (!pid && window.RB_PID) pid = String(window.RB_PID);
    if (!pid) {
      var m = location.pathname.match(/product-(\d+)\.html/i);
      if (m) pid = m[1];
    }
    return pid ? String(pid) : null;
  }

  function pack(id, name, price, qty) {
    qty = qty || 1;
    var p = num(price) || 0;
    return {
      content_type: "product",
      content_ids: [String(id)],
      content_name: name || "",
      contents: [{ id: String(id), quantity: qty, item_price: p }],
      num_items: qty,
      value: p * qty,
      currency: CUR
    };
  }

  // ---------- de-dupe ----------
  var SENT_KEY = "robuste_ga_purchases";
  function alreadySent(id) {
    try { return JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]").indexOf(id) !== -1; } catch (e) { return false; }
  }
  function markSent(id) {
    try {
      var a = JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]");
      a.push(id);
      sessionStorage.setItem(SENT_KEY, JSON.stringify(a.slice(-50)));
    } catch (e) {}
  }

  // ---------- order submitted (browser side) ----------
  function trackPurchase(order) {
    try {
      order = order || {};
      var id = String(order.transaction_id || order.orderId || ("T" + Date.now()));
      if (alreadySent(id)) return;

      // Advanced Matching first, so the event carries the identity.
      setUserData(order);

      var items = order.items;
      if (!items && order.products && order.products.length) {
        items = order.products.map(function (p) {
          return {
            item_id: String(p.id != null ? p.id : (p.name || "")),
            item_name: p.name || p.title || "",
            price: num(p.price) || 0,
            quantity: p.quantity || 1
          };
        });
      }
      items = items || [];

      // Merchandise value only - delivery fee is NOT revenue.
      var val = null;
      if (items.length) {
        val = items.reduce(function (a, i) { return a + (num(i.price) || 0) * (i.quantity || 1); }, 0);
      }
      if (val == null) {
        val = num(order.value != null ? order.value : order.totalPrice);
        var fee = num(order.deliveryFee);
        if (val != null && fee) val = Math.max(0, val - fee);
      }

      var gp = { transaction_id: id, currency: CUR };
      if (val != null) gp.value = val;
      if (items.length) gp.items = items;
      gt("purchase", gp);

      var contents = items.map(function (i) { return { id: i.item_id, quantity: i.quantity || 1, item_price: i.price }; });
      fbc("PlaceOrder", {
        currency: CUR,
        value: val,
        content_type: "product",
        contents: contents,
        content_ids: contents.map(function (c) { return c.id; }),
        content_name: items.map(function (i) { return i.item_name; }).filter(Boolean).join(" | "),
        num_items: contents.reduce(function (a, c) { return a + (c.quantity || 1); }, 0),
        order_id: id
      }, { eventID: "ord_" + id });

      markSent(id);
    } catch (e) {}
  }
  window.trackPurchase = trackPurchase;

  ready(function () {
    // 0) Advanced Matching, as early as possible.
    //    Previously the phone/name were only sent to the pixel at purchase time,
    //    so PageView / ViewContent / AddToCart / InitiateCheckout arrived anonymous
    //    and Event Match Quality was stuck around 6. We now remember the shopper
    //    (locally, in their own browser) and attach the identity to every event.
    try {
      var AM_KEY = "robuste_am_v1";
      var amSave = function (o) { try { localStorage.setItem(AM_KEY, JSON.stringify(o)); } catch (e) {} };
      var amLoad = function () { try { return JSON.parse(localStorage.getItem(AM_KEY) || "null"); } catch (e) { return null; } };
      var val = function (id) { var el = document.getElementById(id); return el ? String(el.value == null ? "" : el.value).trim() : ""; };

      var saved = amLoad();
      if (saved && saved.phone) { setUserData(saved); }

      var amCollect = function () {
        try {
          var ph = val("expressPhone") || val("phone");
          var digits = ph.replace(/[^0-9]/g, "");
          if (digits.length < 9) return;
          var o = {
            phone: ph,
            customer: val("expressName") || val("fullName"),
            wilaya: val("expressWilaya") || val("wilayaSelect"),
            baladiya: val("expressBaladiya") || val("baladiyaInput"),
            email: val("email")
          };
          var sig = o.phone + "|" + o.customer + "|" + o.wilaya + "|" + o.baladiya;
          if (sig === window.__rbAmSig) return;
          window.__rbAmSig = sig;
          amSave(o);
          setUserData(o);
        } catch (e) {}
      };
      document.addEventListener("change", amCollect, true);
      document.addEventListener("blur", amCollect, true);
      window.RBAmCollect = amCollect;
    } catch (e) {}

    // 1) ViewContent - with real product id, name and price
    try {
      var pid = currentPid();
      if (pid) {
        findProduct(pid).then(function (p) {
          var name = p ? (p.title || p.name || "") : "";
          var price = p ? p.price : undefined;
          gt("view_item", { currency: CUR, value: num(price) || 0, items: [{ item_id: String(pid), item_name: name, price: num(price) || 0, quantity: 1 }] });
          fb("ViewContent", pack(pid, name, price, 1));
        });
      } else if (/product/i.test(location.pathname)) {
        fb("ViewContent", { content_type: "product", currency: CUR });
      }
    } catch (e) {}

    // 2) WhatsApp click => Lead (with an estimated value so Meta can rank leads)
    document.addEventListener("click", function (e) {
      try {
        var t = e.target;
        var a = t && t.closest ? t.closest('a[href*="wa.me"],a[href*="whatsapp"]') : null;
        if (!a) return;
        gt("contact", { method: "whatsapp" });
        fb("Lead", { content_category: "whatsapp", currency: CUR, value: 0 });
      } catch (er) {}
    }, true);

    // 3) AddToCart - reads the product actually added
    try {
      if (typeof window.addToCart === "function" && !window.addToCart.__gaWrapped) {
        var orig = window.addToCart;
        window.addToCart = function () {
          try {
            var args = Array.prototype.slice.call(arguments);
            // product pages: addToCart(name, price, img, id)
            // home page:     addToCart(title, priceLabel, price, images, id)
            var name = typeof args[0] === "string" ? args[0] : "";
            var id = args.length ? args[args.length - 1] : currentPid();
            if (id == null || id === "" || typeof id === "object") id = currentPid() || name;
            var price;
            for (var i = 1; i < args.length; i++) {
              if (typeof args[i] === "number") { price = args[i]; break; }
            }
            if (price == null) price = num(args[1]);
            var d = pack(id, name, price, 1);
            gt("add_to_cart", { currency: CUR, value: d.value, items: [{ item_id: String(id), item_name: name, price: num(price) || 0, quantity: 1 }] });
            fb("AddToCart", d);
          } catch (er) {}
          return orig.apply(this, arguments);
        };
        window.addToCart.__gaWrapped = true;
      }
    } catch (e) {}

    // 4) InitiateCheckout - ONLY the real order modal (never the review modal)
    try {
      document.addEventListener("shown.bs.modal", function (ev) {
        try {
          var el = ev && ev.target;
          if (!el || el.id !== "orderModal") return;

          var cart = [];
          try { cart = JSON.parse(localStorage.getItem("robuste_cart") || "[]") || []; } catch (e2) {}

          if (cart.length) {
            var contents = cart.map(function (c) {
              return { id: String(c.id), quantity: c.quantity || 1, item_price: num(c.price) || 0 };
            });
            var value = contents.reduce(function (a, c) { return a + c.item_price * c.quantity; }, 0);
            var nItems = contents.reduce(function (a, c) { return a + c.quantity; }, 0);
            gt("begin_checkout", { currency: CUR, value: value, items: cart.map(function (c) { return { item_id: String(c.id), item_name: c.name || "", price: num(c.price) || 0, quantity: c.quantity || 1 }; }) });
            if (!value || value <= 0) return;
            fb("InitiateCheckout", {
              currency: CUR, value: value, content_type: "product",
              contents: contents,
              content_ids: contents.map(function (c) { return c.id; }),
              content_name: cart.map(function (c) { return c.name; }).filter(Boolean).join(" | "),
              num_items: nItems
            });
            return;
          }

          var pid2 = currentPid();
          if (pid2) {
            findProduct(pid2).then(function (p) {
              var nm = p ? (p.title || p.name || "") : "";
              var pr = p ? p.price : undefined;
              var d = pack(pid2, nm, pr, 1);
              // Never report a checkout with no price: it corrupts ROAS.
              if (!d.value || d.value <= 0) return;
              gt("begin_checkout", { currency: CUR, value: d.value, items: [{ item_id: String(pid2), item_name: nm, price: num(pr) || 0, quantity: 1 }] });
              fb("InitiateCheckout", d);
            });
          }
          // No product and no cart => no price is known => send nothing.
        } catch (e3) {}
      });
    } catch (e) {}

    // 5) AddPaymentInfo - when a payment method is chosen in the order modal
    try {
      document.addEventListener("change", function (ev) {
        try {
          var t = ev.target;
          if (!t || t.name !== "paymentMethod") return;
          if (window.__rbPayFired) return;
          window.__rbPayFired = true;
          gt("add_payment_info", { currency: CUR, payment_type: t.value || "cod" });
          fb("AddPaymentInfo", { currency: CUR, content_type: "product" });
        } catch (e4) {}
      }, true);
    } catch (e) {}

    // NOTE: the old Arabic-text MutationObserver purchase detector was removed
    // on purpose. Purchase is server-side only (Conversions API, after you
    // confirm the order in the admin panel).
  });
})();
