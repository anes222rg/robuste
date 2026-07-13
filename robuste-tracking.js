/* ROBUSTE — visitor & order tracking (Phase 1, no backend required).
   Captures traffic source, on-site behavior, device, and anti-bot signals, and
   exposes RobusteTracking.getOrderMeta() for the order-submit module.
   Everything is wrapped in try/catch so it can never break the site. */
(function () {
  "use strict";

  // ===== Cloudflare Worker endpoint — SINGLE source of truth =====
  // After deploying the Worker, set this to its URL once, e.g.:
  //   window.ROBUSTE_WORKER_URL = "https://orders.robustedz.store/api/order";
  // robuste-orders.js, product.html and telegram.js all read this value.
  if (typeof window.ROBUSTE_WORKER_URL === "undefined") window.ROBUSTE_WORKER_URL = "https://robuste.aneslaidaoui06.workers.dev";
  // ==============================================================

  var SESSION_KEY = "robuste_session";
  var FIRST_TOUCH_KEY = "robuste_first_touch";
  var SESSION_START = Date.now();
  var FORM_OPEN = 0;
  var addToCartCount = 0;

  function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
  function getParam(name) { return safe(function () { return new URLSearchParams(location.search).get(name) || ""; }, ""); }
  function referrerHost() {
    return safe(function () {
      if (!document.referrer) return "";
      return new URL(document.referrer).hostname.replace(/^www\./, "");
    }, "");
  }

  // First-touch attribution (persists for the whole visit)
  function captureFirstTouch() {
    safe(function () {
      if (localStorage.getItem(FIRST_TOUCH_KEY)) return;
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify({
        source: getParam("utm_source") || referrerHost() || "direct",
        medium: getParam("utm_medium") || (document.referrer ? "referral" : "none"),
        campaign: getParam("utm_campaign") || "",
        landingPage: location.pathname + location.search,
        referrer: document.referrer || "",
        at: new Date().toISOString()
      }));
    });
  }

  function bumpPageView() {
    safe(function () {
      var s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
      s.pages = (s.pages || 0) + 1;
      s.start = s.start || SESSION_START;
      s.id = s.id || ("s" + SESSION_START + "_" + Math.random().toString(36).slice(2, 8));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    });
  }
  function session() { return safe(function () { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}"); }, {}); }

  function parseDevice() {
    var ua = navigator.userAgent || "";
    var mobile = /Mobi|Android|iPhone|iPad/i.test(ua);
    var os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS"
           : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS"
           : /Linux/i.test(ua) ? "Linux" : "Other";
    var browser = /Edg/i.test(ua) ? "Edge" : /Chrome/i.test(ua) ? "Chrome"
                : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "Other";
    return { device: mobile ? "mobile" : "desktop", os: os, browser: browser };
  }

  // Count add-to-cart actions by wrapping the global (mirrors analytics.js).
  function wrapAddToCart() {
    safe(function () {
      if (typeof window.addToCart === "function" && !window.addToCart.__rbWrapped) {
        var orig = window.addToCart;
        window.addToCart = function () { addToCartCount++; return orig.apply(this, arguments); };
        window.addToCart.__rbWrapped = true;
      } else if (typeof window.addToCart !== "function") {
        setTimeout(wrapAddToCart, 1500);
      }
    });
  }

  // Start the form-fill timer when the order modal opens.
  function watchFormOpen() {
    safe(function () { document.addEventListener("shown.bs.modal", function () { FORM_OPEN = Date.now(); }); });
  }

  function getOrderMeta() {
    var dev = parseDevice();
    var first = safe(function () { return JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || "{}"); }, {});
    var s = session();
    return {
      referrer: document.referrer || "",
      referrerHost: referrerHost(),
      landingPage: first.landingPage || (location.pathname + location.search),
      utm_source: getParam("utm_source"),
      utm_medium: getParam("utm_medium"),
      utm_campaign: getParam("utm_campaign"),
      firstTouchSource: first.source || "direct",
      firstTouchMedium: first.medium || "none",
      lastTouchSource: getParam("utm_source") || referrerHost() || "direct",
      device: dev.device, os: dev.os, browser: dev.browser,
      userAgent: navigator.userAgent || "",
      language: navigator.language || "",
      screen: safe(function () { return screen.width + "x" + screen.height; }, ""),
      sessionId: s.id || "",
      pagesViewed: s.pages || 1,
      timeOnSiteSec: Math.round((Date.now() - (s.start || SESSION_START)) / 1000),
      addToCartCount: addToCartCount,
      formFillSec: FORM_OPEN ? Math.round((Date.now() - FORM_OPEN) / 1000) : null,
      honeypot: safe(function () { var el = document.getElementById("company_url"); return el ? el.value : ""; }, ""),
      clientTimestamp: new Date().toISOString()
    };
  }

  // Meta fbc/fbp for the Conversions API. Never returns empty strings —
  // missing keys are omitted entirely so the server never sends fbc: "".
  function getFbData() {
    return safe(function () {
      function cookie(name) {
        var m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
        return m ? decodeURIComponent(m[2]) : "";
      }
      var fbc = cookie("_fbc");
      if (fbc) {
        try { localStorage.setItem("robuste_fbc", fbc); } catch (e) {}
      } else {
        var fbclid = getParam("fbclid");
        if (fbclid) {
          // Build _fbc from fbclid per Meta's format: fb.1.<timestamp_ms>.<fbclid>
          fbc = "fb.1." + Date.now() + "." + fbclid;
          try { localStorage.setItem("robuste_fbc", fbc); } catch (e) {}
        } else {
          // Multi-page visit: reuse the value captured on the landing page.
          try { fbc = localStorage.getItem("robuste_fbc") || ""; } catch (e) {}
        }
      }
      var fbp = cookie("_fbp");
      var fb = { event_source_url: location.href };
      if (fbp) fb.fbp = fbp;
      if (fbc) fb.fbc = fbc;
      return fb;
    }, { });
  }

  // Client-side risk flags (display/triage only — never blocks).
  function computeClientRisk(meta, order) {
    var flags = [];
    if (meta) {
      if (meta.honeypot) flags.push({ key: "honeypot_filled", level: "red", label: "Honeypot filled (bot)" });
      if (meta.formFillSec != null && meta.formFillSec < 4) flags.push({ key: "too_fast", level: "yellow", label: "Form filled in <4s" });
      if (!meta.referrer && meta.firstTouchSource === "direct" && (meta.pagesViewed || 1) <= 1) flags.push({ key: "no_referrer_single_page", level: "yellow", label: "No referrer + single page" });
    }
    if (order && order.phone && !/^0[5-7][0-9]{8}$/.test(order.phone)) flags.push({ key: "bad_phone", level: "yellow", label: "Phone format unusual" });
    var level = flags.some(function (f) { return f.level === "red"; }) ? "red"
              : flags.some(function (f) { return f.level === "yellow"; }) ? "yellow" : "green";
    var score = flags.reduce(function (a, f) { return a + (f.level === "red" ? 60 : 25); }, 0);
    return { flags: flags, level: level, score: Math.min(score, 100) };
  }

  captureFirstTouch();
  getFbData(); // persist fbc from the ad click as early as possible
  bumpPageView();
  watchFormOpen();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wrapAddToCart);
  else wrapAddToCart();

  window.RobusteTracking = { getOrderMeta: getOrderMeta, computeClientRisk: computeClientRisk, getFbData: getFbData };
})();
