/* ROBUSTE — rb-compat.js  (safety layer for in-app browsers: Instagram / Facebook / TikTok)
   Loaded synchronously in <head> on every page. Pure vanilla ES5, no dependencies.

   WHY THIS FILE EXISTS
   --------------------
   Visitors coming from the Instagram bio link browse inside Instagram's built-in
   browser (a WebView). That WebView has an EMPTY cache and often fails or times out
   on third-party CDN files (bootstrap.bundle.min.js from jsDelivr, firebase, emailjs).
   The site used to depend on Bootstrap's JS to open AND close the order popup, so:
     - the order form could not open at all           -> "nothing happens"
     - closing the popup after a SAVED order threw    -> "حدث خطأ" on a real success
     - a retry then hit the server 120s cooldown (429) -> a second, real error

   Everything here is defensive: if any helper is missing, the pages fall back to
   their original behaviour. Nothing in this file changes prices, products, or design.
*/
(function () {
  "use strict";

  var WHATSAPP = "213656360457"; // same number already used across the site

  /* ---------------------------------------------------------------
     1) MODALS THAT WORK WITHOUT BOOTSTRAP JS
     Bootstrap's CSS is hosted locally (bootstrap.rtl.min.css), so the
     .modal.show / .offcanvas.show classes are always available even when
     the CDN JavaScript never arrives. We drive those classes by hand.
  ----------------------------------------------------------------*/
  function hasBs() { try { return typeof window.bootstrap !== "undefined" && !!window.bootstrap.Modal; } catch (e) { return false; } }

  function backdrop(show) {
    try {
      var b = document.getElementById("rbBackdrop");
      if (show) {
        if (!b) {
          b = document.createElement("div");
          b.id = "rbBackdrop";
          b.className = "modal-backdrop fade show";
          document.body.appendChild(b);
        }
      } else if (b) { b.parentNode.removeChild(b); }
    } catch (e) {}
  }

  function manualShow(el) {
    el.classList.add("show");
    el.style.display = "block";
    el.removeAttribute("aria-hidden");
    el.setAttribute("aria-modal", "true");
    document.body.classList.add("modal-open");
    backdrop(true);
    if (!el.dataset.rbBound) {
      el.dataset.rbBound = "1";
      var closers = el.querySelectorAll('[data-bs-dismiss="modal"], .btn-close');
      for (var i = 0; i < closers.length; i++) {
        closers[i].addEventListener("click", function () { manualHide(el); });
      }
      el.addEventListener("click", function (ev) { if (ev.target === el) manualHide(el); });
    }
  }

  function manualHide(el) {
    el.classList.remove("show");
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    backdrop(false);
  }

  window.rbShowModal = function (id) {
    try {
      var el = typeof id === "string" ? document.getElementById(id) : id;
      if (!el) return false;
      if (hasBs()) {
        try { window.bootstrap.Modal.getOrCreateInstance(el).show(); return true; } catch (e) {}
      }
      manualShow(el);
      return true;
    } catch (e) { return false; }
  };

  window.rbHideModal = function (id) {
    try {
      var el = typeof id === "string" ? document.getElementById(id) : id;
      if (!el) return false;
      if (hasBs()) {
        try {
          var inst = window.bootstrap.Modal.getInstance(el);
          if (inst) { inst.hide(); return true; }
        } catch (e) {}
      }
      manualHide(el);
      return true;
    } catch (e) { return false; }
  };

  /* ---------------------------------------------------------------
     2) ORDER POST WITH TIMEOUT + ONE AUTOMATIC RETRY
     Mobile data inside an in-app browser drops requests silently. Without a
     timeout the button stays on "جاري المعالجة..." forever and the customer leaves.
     Resolves with { ok, status, data } for ANY server answer (including 400/429),
     rejects only when the network itself failed, so the caller can react properly.
  ----------------------------------------------------------------*/
  function postOnce(url, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var settled = false, ctrl = null, timer = null;
      try { if (window.AbortController) ctrl = new AbortController(); } catch (e) {}
      timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        reject({ rbType: "timeout" });
      }, timeoutMs);
      var init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        credentials: "omit",
        mode: "cors"
      };
      if (ctrl) init.signal = ctrl.signal;
      var p;
      try { p = fetch(url, init); } catch (e) { clearTimeout(timer); settled = true; reject({ rbType: "network", error: e }); return; }
      p.then(function (r) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        r.text().then(function (txt) {
          var data = null;
          try { data = JSON.parse(txt); } catch (e) {}
          resolve({ ok: r.ok, status: r.status, data: data, raw: txt });
        }, function () { resolve({ ok: r.ok, status: r.status, data: null, raw: "" }); });
      }, function (err) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject({ rbType: "network", error: err });
      });
    });
  }

  window.rbPostOrder = function (url, payload, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 22000;
    return postOnce(url, payload, timeout).catch(function (e1) {
      // One silent retry: covers the very common "first request dies on 3G" case.
      return new Promise(function (res) { setTimeout(res, 1200); }).then(function () {
        return postOnce(url, payload, timeout).catch(function (e2) { throw (e2 || e1); });
      });
    });
  };

  /* Build an Error carrying the server's own Arabic message instead of "Worker 400". */
  window.rbOrderHttpError = function (resp) {
    var msg = "";
    var code = "";
    try {
      if (resp && resp.data) { msg = resp.data.message || ""; code = resp.data.error || ""; }
    } catch (e) {}
    if (!msg) {
      if (resp && resp.status === 429) msg = "\u0644\u0642\u062f \u0627\u0633\u062a\u0644\u0645\u0646\u0627 \u0637\u0644\u0628\u0643 \u0628\u0627\u0644\u0641\u0639\u0644\u060c \u0633\u0646\u062a\u0635\u0644 \u0628\u0643 \u0642\u0631\u064a\u0628\u0627\u064b";
      else if (resp && resp.status >= 500) msg = "\u062e\u0644\u0644 \u0645\u0624\u0642\u062a \u0641\u064a \u0627\u0644\u062e\u0627\u062f\u0645\u060c \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649 \u0628\u0639\u062f \u0642\u0644\u064a\u0644";
      else msg = "\u062a\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u060c \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649";
    }
    var err = new Error(msg);
    err.rbType = "http";
    err.rbStatus = resp ? resp.status : 0;
    err.rbCode = code;
    err.rbFriendly = (resp && resp.status === 429) || code === "too_soon";
    return err;
  };

  /* Remember the last order being submitted, so a network failure can still be rescued. */
  window.rbRememberOrder = function (o) { try { window.__rbLastOrder = o || null; } catch (e) {} };

  /* ---------------------------------------------------------------
     3) NOTHING IS EVER LOST
     If the server is truly unreachable, we keep the order in the phone and
     offer a one-tap WhatsApp message containing the full order, so the sale
     survives even a total network failure inside the Instagram browser.
  ----------------------------------------------------------------*/
  function waText(o) {
    if (!o) return "\u0645\u0631\u062d\u0628\u0627\u060c \u0623\u0631\u064a\u062f \u062a\u0623\u0643\u064a\u062f \u0637\u0644\u0628";
    var lines = ["\u0637\u0644\u0628 \u062c\u062f\u064a\u062f (\u0644\u0645 \u064a\u0645\u0631 \u0645\u0646 \u0627\u0644\u0645\u0648\u0642\u0639)"];
    try {
      if (o.customer) lines.push("\u0627\u0644\u0627\u0633\u0645: " + o.customer);
      if (o.phone) lines.push("\u0627\u0644\u0647\u0627\u062a\u0641: " + o.phone);
      if (o.wilaya) lines.push("\u0627\u0644\u0648\u0644\u0627\u064a\u0629: " + o.wilaya);
      if (o.address) lines.push("\u0627\u0644\u0639\u0646\u0648\u0627\u0646: " + o.address);
      if (o.products && o.products.length) {
        for (var i = 0; i < o.products.length; i++) {
          var p = o.products[i];
          lines.push("\u0627\u0644\u0645\u0646\u062a\u062c: " + (p.name || "") + " ×" + (p.quantity || 1));
        }
      }
      if (o.totalPrice != null) lines.push("\u0627\u0644\u0645\u062c\u0645\u0648\u0639: " + o.totalPrice + " \u062f.\u062c");
    } catch (e) {}
    return lines.join("\n");
  }

  function overlay(html) {
    try {
      var ex = document.getElementById("rbNoticeOverlay");
      if (ex) ex.parentNode.removeChild(ex);
      var o = document.createElement("div");
      o.id = "rbNoticeOverlay";
      o.style.cssText = "position:fixed;inset:0;z-index:20001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;";
      o.innerHTML = html;
      o.addEventListener("click", function (e) { if (e.target === o) o.parentNode.removeChild(o); });
      document.body.appendChild(o);
      var c = document.getElementById("rbNoticeClose");
      if (c) c.addEventListener("click", function () { try { o.parentNode.removeChild(o); } catch (e) {} });
      return o;
    } catch (e) { return null; }
  }

  function card(inner, borderColor) {
    return '<div style="background:#fff;border-radius:20px;max-width:420px;width:100%;padding:26px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);border-top:6px solid ' + borderColor + ';font-family:inherit;">' + inner + '</div>';
  }

  /* Returns true when it fully handled the problem (caller should stay silent). */
  window.rbOrderProblem = function (err) {
    try {
      var t = err && (err.rbType || (err.name === "AbortError" ? "timeout" : ""));
      var order = window.__rbLastOrder || null;

      // a) The server answered "you already ordered a moment ago" -> reassure, never scare.
      if (err && err.rbFriendly) {
        overlay(card(
          '<div style="font-size:3rem;line-height:1;color:#2e7d32;">\u2705</div>' +
          '<h3 style="margin-top:8px;font-weight:800;color:#2e7d32;">\u0637\u0644\u0628\u0643 \u0648\u0635\u0644\u0646\u0627</h3>' +
          '<p style="color:#444;margin:8px 0 0;font-weight:600;">' + (err.message || "") + '</p>' +
          '<div style="margin-top:14px;"><button type="button" id="rbNoticeClose" style="background:#2e7d32;border:none;color:#fff;font-weight:700;padding:10px 22px;border-radius:10px;">\u062d\u0633\u0646\u0627\u064b</button></div>',
          "#2e7d32"));
        return true;
      }

      // b) Network died / timed out -> keep the order and offer WhatsApp.
      if (t === "network" || t === "timeout") {
        try {
          var pend = JSON.parse(localStorage.getItem("robuste_pending_orders") || "[]");
          if (order) { pend.push({ at: new Date().toISOString(), order: order }); localStorage.setItem("robuste_pending_orders", JSON.stringify(pend.slice(-10))); }
        } catch (e) {}
        var link = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(waText(order));
        overlay(card(
          '<div style="font-size:3rem;line-height:1;color:#e65100;">\u26a0\ufe0f</div>' +
          '<h3 style="margin-top:8px;font-weight:800;color:#e65100;">\u0627\u0644\u0625\u062a\u0635\u0627\u0644 \u0636\u0639\u064a\u0641</h3>' +
          '<p style="color:#444;margin:8px 0 2px;font-weight:600;">\u0644\u0645 \u0646\u062a\u0645\u0643\u0646 \u0645\u0646 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628\u0643 \u0627\u0644\u0622\u0646. \u0644\u0627 \u062a\u0642\u0644\u0642\u060c \u0637\u0644\u0628\u0643 \u0645\u062d\u0641\u0648\u0638.</p>' +
          '<p style="color:#666;font-size:.9rem;margin:0 0 12px;">\u0623\u0631\u0633\u0644\u0647 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u0648\u0627\u062a\u0633\u0627\u0628 \u0623\u0648 \u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.</p>' +
          '<a href="' + link + '" target="_blank" rel="noopener" style="display:block;background:#25d366;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:12px;">\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0639\u0628\u0631 \u0648\u0627\u062a\u0633\u0627\u0628</a>' +
          '<div style="margin-top:10px;"><button type="button" id="rbNoticeClose" style="background:transparent;border:none;color:#888;font-size:.9rem;">\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629</button></div>',
          "#e65100"));
        return true;
      }

      // c) The server refused with its own Arabic reason (bad phone, short address...).
      if (err && err.rbType === "http" && err.message) {
        if (typeof window.showToast === "function") { window.showToast(err.message, "error"); return true; }
        overlay(card(
          '<div style="font-size:2.6rem;line-height:1;color:#c62828;">\u26a0\ufe0f</div>' +
          '<p style="color:#333;margin:10px 0 14px;font-weight:700;">' + err.message + '</p>' +
          '<div><button type="button" id="rbNoticeClose" style="background:#c62828;border:none;color:#fff;font-weight:700;padding:10px 22px;border-radius:10px;">\u062a\u0635\u062d\u064a\u062d</button></div>',
          "#c62828"));
        return true;
      }
    } catch (e) {}
    return false; // not handled -> the page shows its original message
  };

  /* ---------------------------------------------------------------
     4) IN-APP BROWSER MARKER (useful for you, invisible for the customer)
     Adds .rb-inapp on <html> and exposes the detection, so any future CSS or
     analytics can target Instagram / Facebook / TikTok traffic.
  ----------------------------------------------------------------*/
  try {
    var ua = navigator.userAgent || "";
    var inApp = /Instagram|FBAN|FBAV|FB_IAB|Messenger|TikTok|Snapchat|Line\/|Twitter/i.test(ua);
    window.rbIsInAppBrowser = inApp;
    if (inApp && document.documentElement) document.documentElement.className += " rb-inapp";
  } catch (e) {}
})();

/* ===================================================================
   5) ESCAPE HATCH — "open in the real browser"
   Instagram/Facebook/TikTok open links inside their own mini-browser, which is
   slower, has an empty cache and blocks some features. The order flow above now
   works inside it, but a customer who still has trouble can jump out with one tap.
   Android: opens Chrome directly. iOS: tries Safari, then shows how to do it.
=================================================================== */
(function () {
  "use strict";
  if (!window.rbIsInAppBrowser) return; // normal browsers see nothing at all

  var L_OPEN = "\u0627\u0641\u062a\u062d \u0641\u064a \u0627\u0644\u0645\u062a\u0635\u0641\u062d";
  var L_INAPP = "\u0623\u0646\u062a \u062a\u062a\u0635\u0641\u062d \u062f\u0627\u062e\u0644 \u0625\u0646\u0633\u062a\u063a\u0631\u0627\u0645";
  var L_TROUBLE = "\u062a\u0648\u0627\u062c\u0647 \u0645\u0634\u0643\u0644\u0629 \u0641\u064a \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u061f " + L_OPEN;
  var L_COPY = "\u0646\u0633\u062e \u0627\u0644\u0631\u0627\u0628\u0637";
  var L_COPIED = "\u062a\u0645 \u0646\u0633\u062e \u0627\u0644\u0631\u0627\u0628\u0637 \u2713";
  var L_STEPS = "\u0627\u0636\u063a\u0637 \u0639\u0644\u0649 \u0627\u0644\u0646\u0642\u0627\u0637 \u0627\u0644\u062b\u0644\u0627\u062b \u0641\u064a \u0627\u0644\u0623\u0639\u0644\u0649 \u062b\u0645 \u0627\u062e\u062a\u0631: " + L_OPEN;
  var L_OR = "\u0623\u0648 \u0627\u0646\u0633\u062e \u0627\u0644\u0631\u0627\u0628\u0637 \u0648\u0627\u0641\u062a\u062d\u0647 \u0641\u064a \u0627\u0644\u0645\u062a\u0635\u0641\u062d";
  var L_CLOSE = "\u0625\u063a\u0644\u0627\u0642";

  function copyLink(url, btn) {
    var done = function () { if (btn) btn.textContent = L_COPIED; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { fallback(); });
        return;
      }
    } catch (e) {}
    fallback();
    function fallback() {
      try {
        var i = document.createElement("input");
        i.value = url; i.style.cssText = "position:fixed;opacity:0;";
        document.body.appendChild(i); i.select(); i.setSelectionRange(0, 99999);
        document.execCommand("copy"); document.body.removeChild(i); done();
      } catch (e) {}
    }
  }

  function steps(url) {
    var ex = document.getElementById("rbExtHelp");
    if (ex) ex.parentNode.removeChild(ex);
    var o = document.createElement("div");
    o.id = "rbExtHelp";
    o.style.cssText = "position:fixed;inset:0;z-index:20002;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;";
    o.innerHTML =
      '<div style="background:#fff;border-radius:18px;max-width:400px;width:100%;padding:22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="font-size:2.2rem;">\uD83C\uDF10</div>' +
      '<p style="font-weight:800;margin:8px 0 4px;color:#222;">' + L_STEPS + '</p>' +
      '<p style="color:#666;font-size:.86rem;margin:0 0 14px;">' + L_OR + '</p>' +
      '<button type="button" id="rbExtCopy" style="width:100%;background:#0d6efd;border:none;color:#fff;font-weight:700;padding:11px;border-radius:11px;">' + L_COPY + '</button>' +
      '<div style="margin-top:10px;"><button type="button" id="rbExtHelpClose" style="background:transparent;border:none;color:#888;font-size:.9rem;">' + L_CLOSE + '</button></div>' +
      '</div>';
    document.body.appendChild(o);
    var c = document.getElementById("rbExtCopy");
    if (c) c.addEventListener("click", function () { copyLink(url, c); });
    var x = document.getElementById("rbExtHelpClose");
    if (x) x.addEventListener("click", function () { try { o.parentNode.removeChild(o); } catch (e) {} });
    o.addEventListener("click", function (e) { if (e.target === o) o.parentNode.removeChild(o); });
  }

  window.rbOpenExternal = function () {
    var url = window.location.href;
    var ua = navigator.userAgent || "";
    try {
      if (/Android/i.test(ua)) {
        window.location.href = "intent://" + url.replace(/^https?:\/\//, "") +
          "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
          encodeURIComponent(url) + ";end";
        setTimeout(function () { steps(url); }, 1800);
        return;
      }
      window.location.href = "x-safari-" + url; // works in several iOS in-app browsers
      setTimeout(function () { steps(url); }, 1400);
    } catch (e) { steps(url); }
  };

  function btnStyle(bg) {
    return "background:" + bg + ";border:none;color:#fff;font-weight:700;border-radius:999px;padding:7px 14px;font-size:.8rem;white-space:nowrap;";
  }

  // Removed on request (2026-08-16): no bottom bar, no link inside the forms.
  // "Open in browser" now shows ONLY inside the weak-connection message below.


  // c) offer the same exit inside the "weak connection" rescue popup
  var prev = window.rbOrderProblem;
  window.rbOrderProblem = function (err) {
    var handled = prev ? prev.apply(this, arguments) : false;
    try {
      var ov = document.getElementById("rbNoticeOverlay");
      if (handled && ov && ov.querySelector("a[href*='wa.me']") && !ov.querySelector(".rb-ext-retry")) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rb-ext-retry";
        b.textContent = L_OPEN;
        b.style.cssText = "margin-top:10px;width:100%;background:#0d6efd;border:none;color:#fff;font-weight:700;padding:11px;border-radius:12px;";
        b.addEventListener("click", function () { window.rbOpenExternal(); });
        var box = ov.querySelector("div");
        if (box) box.appendChild(b);
      }
    } catch (e) {}
    return handled;
  };
})();
