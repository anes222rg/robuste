/* ROBUSTE — Telegram notifier (TOKEN-FREE, secure).
   The bot token used to live in this file and shipped to every visitor.
   It has been REMOVED. Notifications are now sent server-side by the
   Cloudflare Worker, using secrets that never reach the browser.

   - sendOrderToTelegram: disabled on the client. The Worker notifies on every
     order it writes to Firestore (with real IP + risk).
   - sendReviewToTelegram: forwarded to the Worker (window.ROBUSTE_WORKER_URL)
     as { type: "review", review }, so reviews still ping Telegram — no token here.

   Both fail silently if the Worker URL isn't set yet. */
(function () {
  "use strict";

  function workerUrl() {
    return (typeof window !== "undefined" && window.ROBUSTE_WORKER_URL) || "";
  }

  // Orders are notified server-side by the Worker. This stays as a safe no-op so
  // any existing calls in the site keep working without shipping a token.
  window.sendOrderToTelegram = function () {
    try { console.info("[ROBUSTE] Order Telegram is handled server-side by the Worker; client notifier disabled."); } catch (e) {}
  };

  // Reviews are relayed through the Worker (no token in the browser).
  window.sendReviewToTelegram = function (review) {
    try {
      var url = workerUrl();
      if (!url) { try { console.info("[ROBUSTE] Review notification skipped: Worker URL not set yet."); } catch (e) {} return; }
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "review", review: review || {} })
      }).catch(function (e) { try { console.warn("Review notify failed", e); } catch (e2) {} });
    } catch (e) { try { console.warn("Review notify error", e); } catch (e2) {} }
  };
})();
