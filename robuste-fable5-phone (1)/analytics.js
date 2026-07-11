/* ROBUSTE — GA4 event tracking (safe & accurate).
   The base gtag.js tag lives in <head>; this file only adds shop events.

   IMPORTANT: `purchase` now fires ONLY for a real, completed order, exactly
   once per order id. The old version scanned the whole page (including inline
   <script> source) for a confirmation phrase, which fired a fake purchase on
   every product-page load. That is removed.

   Everything is wrapped in try/catch so it can never break the site. */
(function () {
  "use strict";

  function track(name, params) {
    try { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); } catch (e) {}
  }
  // Mirror to the Meta Pixel (queues safely even before fbq init).
  function fbqTrack(name, params, opts) {
    try { if (typeof window.fbq === "function") window.fbq("track", name, params || {}, opts || {}); } catch (e) {}
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

  // ---- de-dupe: never count the same order twice (survives reloads) ----
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

  // ---- the ONLY way a purchase is ever sent ----
  function trackPurchase(order) {
    try {
      order = order || {};
      var id = order.transaction_id || order.orderId || ("T" + Date.now());
      id = String(id);
      if (alreadySent(id)) return;
      var params = { transaction_id: id, currency: "DZD" };
      var val = num(order.value != null ? order.value : order.totalPrice);
      if (val != null) params.value = val;
      var items = order.items;
      if (!items && order.products && order.products.length) {
        items = order.products.map(function (p) {
          return {
            item_id: String(p.id != null ? p.id : (p.name || "")),
            item_name: p.name || p.title || "",
            price: num(p.price),
            quantity: p.quantity || 1
          };
        });
      }
      if (items && items.length) params.items = items;
      track("purchase", params);
      try {
        var mContents = (items || []).map(function (i) { return { id: i.item_id, quantity: i.quantity || 1, item_price: i.price }; });
        fbqTrack("Purchase", {
          currency: "DZD",
          value: params.value,
          content_type: "product",
          contents: mContents,
          content_ids: mContents.map(function (c) { return c.id; }),
          num_items: mContents.reduce(function (a, c) { return a + (c.quantity || 1); }, 0)
        }, { eventID: "ord_" + id });
      } catch (e) {}
      markSent(id);
    } catch (e) {}
  }
  // Expose for explicit, accurate calls from the order-submit code.
  window.trackPurchase = trackPurchase;

  // Rendered text of an element EXCLUDING <script>/<style>, so inline script
  // source can never be mistaken for a confirmation message.
  function visibleText(node) {
    try {
      if (!node || node.nodeType !== 1) return "";
      var clone = node.cloneNode(true);
      var bad = clone.querySelectorAll ? clone.querySelectorAll("script,style") : [];
      for (var i = 0; i < bad.length; i++) bad[i].parentNode && bad[i].parentNode.removeChild(bad[i]);
      return clone.textContent || "";
    } catch (e) { return ""; }
  }

  var ORDERNO = "\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628"; // رقم الطلب
  var AMOUNT = "\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a"; // المبلغ الإجمالي

  // Fallback for pages whose submit code we don't call trackPurchase from
  // directly (e.g. index.html). Fires ONLY when a freshly rendered success
  // card containing a real order number appears. Never scans document.body
  // text and never reads <script> source.
  function scanNode(node) {
    try {
      var text = visibleText(node);
      if (!text || text.indexOf(ORDERNO) === -1) return; // must contain a real order number
      var afterNo = text.split(ORDERNO)[1] || "";
      var idMatch = afterNo.match(/[A-Za-z0-9\-]+/);
      var id = (idMatch && idMatch[0]) || ("T" + Date.now());
      var value = num((text.split(AMOUNT)[1] || "").split("\u062f")[0]); // digits before "د.ج"
      trackPurchase({ transaction_id: id, value: value });
    } catch (e) {}
  }

  ready(function () {
    // 1) view_item on the product page
    try {
      var pid = null;
      try { pid = new URLSearchParams(location.search).get("pid"); } catch (e) {}
      if (pid || /product/i.test(location.pathname)) track("view_item", pid ? { item_id: pid } : {});
      if (pid || /product/i.test(location.pathname)) fbqTrack("ViewContent", pid ? { content_ids: [pid], content_type: "product" } : {});
    } catch (e) {}

    // 2) WhatsApp clicks => contact (lead)
    document.addEventListener("click", function (e) {
      try {
        var t = e.target;
        var a = t && t.closest ? t.closest('a[href*="wa.me"],a[href*="whatsapp"]') : null;
        if (a) { track("contact", { method: "whatsapp" }); fbqTrack("Lead", { method: "whatsapp" }); }
      } catch (er) {}
    }, true);

    // 3) add_to_cart => wrap the global addToCart if it exists
    try {
      if (typeof window.addToCart === "function" && !window.addToCart.__gaWrapped) {
        var orig = window.addToCart;
        window.addToCart = function () { track("add_to_cart", {}); fbqTrack("AddToCart", {}); return orig.apply(this, arguments); };
        window.addToCart.__gaWrapped = true;
      }
    } catch (e) {}

    // 4) begin_checkout => when the order modal opens
    try { document.addEventListener("shown.bs.modal", function () { track("begin_checkout", {}); fbqTrack("InitiateCheckout", {}); }); } catch (e) {}

    // 5) purchase => fallback detector, real order cards only, deduped.
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType === 1 && (n.textContent || "").indexOf(ORDERNO) !== -1) scanNode(n);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  });
})();
