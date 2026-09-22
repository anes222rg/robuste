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
  /* ---- Conversions API mirror -------------------------------------------
   * Every pixel event also goes to the Worker, which forwards it to Meta
   * server-side. Ad blockers, ITP and iOS silently drop a large share of
   * browser events; the server copy survives them and carries IP +
   * User-Agent, so match quality is higher too.
   * Meta merges the two copies on a shared event_id — so every mirrored
   * event MUST have one, otherwise the same action is counted twice. */
  var CAPI_MIRROR = { ViewContent: 1, AddToCart: 1, InitiateCheckout: 1, Lead: 1, PlaceOrder: 1 };
  var _eq = [], _eqTimer = null;

  function workerUrl() {
    try { return (window.ROBUSTE_WORKER_URL || "https://robuste.aneslaidaoui06.workers.dev").replace(/\/+$/, ""); }
    catch (e) { return ""; }
  }
  function amIdentity() {
    try {
      var o = JSON.parse(localStorage.getItem("robuste_am_v1") || "null") || {};
      var parts = clean(o.customer).split(/\s+/).filter(Boolean);
      return {
        phone: o.phone || "",
        email: o.email || "",
        fn: parts.length ? latin(parts[0]) : "",
        ln: parts.length > 1 ? latin(parts[parts.length - 1]) : "",
        ct: o.baladiya ? latin(o.baladiya) : "",
        st: o.wilaya ? latin(o.wilaya) : "",
        country: "dz"
      };
    } catch (e) { return { country: "dz" }; }
  }
  function fbCookies() {
    try {
      function ck(n) { var m = document.cookie.match("(^|;)\\s*" + n + "\\s*=\\s*([^;]+)"); return m ? decodeURIComponent(m[2]) : ""; }
      var out = {};
      var fbp = ck("_fbp"); if (fbp) out.fbp = fbp;
      var fbc = ck("_fbc") || (function () { try { return localStorage.getItem("robuste_fbc") || ""; } catch (e) { return ""; } })();
      if (fbc) out.fbc = fbc;
      return out;
    } catch (e) { return {}; }
  }
  function flushEvents() {
    if (!_eq.length) return;
    var batch = _eq.splice(0, 10);
    var body = JSON.stringify({ events: batch, user: amIdentity(), fb: fbCookies() });
    var url = workerUrl() + "/events";
    try {
      // keepalive so the batch still leaves when the page is being closed.
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  function queueServerEvent(name, params, eventId) {
    if (!CAPI_MIRROR[name] || !eventId) return;
    try {
      _eq.push({
        event_name: name,
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: location.href,
        content_ids: params && params.content_ids,
        contents: params && params.contents
      });
      if (_eqTimer) clearTimeout(_eqTimer);
      _eqTimer = setTimeout(flushEvents, 1200);   // small debounce, then send
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushEvents();
  });

  /* Every mirrored event needs a stable id shared with the server copy. */
  var _eidSeq = 0;
  function newEventId(name) {
    _eidSeq++;
    return name.toLowerCase() + "_" + Date.now().toString(36) + "_" + _eidSeq + "_" + Math.random().toString(36).slice(2, 8);
  }

  function fb(name, params, opts) {
    try {
      opts = opts || {};
      if (CAPI_MIRROR[name] && !opts.eventID) opts.eventID = newEventId(name);
      if (typeof window.fbq === "function") window.fbq("track", name, params || {}, opts);
      queueServerEvent(name, params, opts.eventID);
    } catch (e) {}
  }
  function fbc(name, params, opts) {
    try {
      opts = opts || {};
      if (CAPI_MIRROR[name] && !opts.eventID) opts.eventID = newEventId(name);
      if (typeof window.fbq === "function") window.fbq("trackCustom", name, params || {}, opts);
      queueServerEvent(name, params, opts.eventID);
    } catch (e) {}
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
  /* Must produce byte-for-byte the same string as normPhoneE164() in the
   * Worker: the pixel sends this as external_id and the Conversions API sends
   * its SHA-256, so any difference breaks the match instead of improving it. */
  function phoneE164(p) {
    var d = clean(p).replace(/[^0-9]/g, "");
    if (!d) return "";
    if (d.indexOf("00") === 0) d = d.slice(2);      // 00213... international prefix
    if (d.indexOf("213") === 0) return d;
    if (d.charAt(0) === "0") return "213" + d.slice(1);
    if (d.length === 9) return "213" + d;
    return d;
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
    _catP = fetch("products.json", { cache: "no-cache" })
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
        /* Fallback for a product page whose id could not be read. Meta flags
         * ViewContent without content_ids/value as low quality, so derive the
         * id from the filename (product-107.html) and price it from the
         * catalogue rather than sending a bare, unmatchable event. */
        var m = String(location.pathname).match(/product-(\d+)\.html/);
        if (m) {
          findProduct(m[1]).then(function (p) {
            fb("ViewContent", pack(m[1], p ? (p.title || p.name || "") : "", p ? p.price : undefined, 1));
          });
        }
      }
    } catch (e) {}

    // 2) WhatsApp click => Lead (with an estimated value so Meta can rank leads)
    document.addEventListener("click", function (e) {
      try {
        var t = e.target;
        var a = t && t.closest ? t.closest('a[href*="wa.me"],a[href*="whatsapp"]') : null;
        if (!a) return;
        gt("contact", { method: "whatsapp" });
        /* A zero-value Lead tells Meta the lead is worth nothing, so it cannot
         * rank leads or optimise for the valuable ones. Price the lead off the
         * product being viewed: a WhatsApp click on an 8,200 DA page is worth
         * more than one on a 2,400 DA page. */
        var lpid = currentPid() || (String(location.pathname).match(/product-(\d+)\.html/) || [])[1];
        if (lpid) {
          findProduct(lpid).then(function (p) {
            var pr = num(p && p.price) || 0;
            var lead = { content_category: "whatsapp", currency: CUR, content_type: "product", content_ids: [String(lpid)], contents: [{ id: String(lpid), quantity: 1, item_price: pr }] };
            if (pr > 0) lead.value = pr;
            fb("Lead", lead);
          });
        } else {
          fb("Lead", { content_category: "whatsapp", currency: CUR });
        }
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
