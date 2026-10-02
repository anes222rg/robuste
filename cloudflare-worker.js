/* ROBUSTE — Cloudflare Worker (Phase 3 + Tracking).
 * Two responsibilities:
 *   1) POST /            → secure order INTAKE (IP/geo, risk, Firestore write, Telegram/EmailJS)
 *   2) GET  /track?phone → customer ORDER TRACKING (find orders by phone, read LIVE EcoTrack status)
 *
 * All secrets live here, never in the browser.
 *
 * Worker secrets / vars to set (`wrangler secret put` or dashboard):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   EMAILJS_SERVICE, EMAILJS_TEMPLATE, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY (optional)
 *   ALLOWED_ORIGIN   e.g. https://www.robustedz.store   (NEVER leave as "*" in prod)
 *   ECOTRACK_API_URL e.g. https://assildelivery.ecotrack.dz
 *   ECOTRACK_TOKEN   the API STANDARD token from the EcoTrack dashboard
 *   ADMIN_EMAIL      the owner's Google account, e.g. anescareer@gmail.com.
 *                    Firebase ID tokens are only accepted for this address —
 *                    same rule as firestore.rules. REQUIRED for the panel.
 *   ADMIN_KEY        legacy shared secret for /admin/*. Optional: delete it
 *                    once ADMIN_EMAIL works, and the old gate closes for good.
 */

/**
 * Firestore documents and courier JSON are dynamic records. Route handlers
 * validate required fields before using them; these declarations also let the
 * Cloudflare JavaScript editor check the optional request fields correctly.
 * @typedef {Record<string, any>} RobusteRecord
 */
/**
 * @typedef {Object} EcoCallOptions
 * @property {string} [method]
 * @property {RobusteRecord} [params]
 * @property {unknown} [body]
 * @property {boolean} [raw]
 */

const PHONE_RE = /^0[5-7][0-9]{8}$/;
const COOLDOWN_SECONDS = 120;

/* Anything the browser says about price or quantity is a suggestion an
 * attacker can forge, and a forged total does not stay in one place: it
 * becomes the conversion value Meta optimises on, the amount the courier
 * collects at the door, and the revenue in your reports. products.json is
 * therefore the price authority, and quantities are clamped. */
const MAX_LINE_QTY = 20;      // hard ceiling per product line
const BULK_QTY_FLAG = 5;      // above this, let the order through but flag it
const MAX_DELIVERY_FEE = 3000;
const MAX_CART_LINES = 20;

let _catalog = null, _catalogExp = 0;
async function catalogById(env) {
  const now = Date.now();
  if (_catalog && now < _catalogExp) return _catalog;
  const host = env.SITE_HOST || "www.robustedz.store";
  try {
    const options = /** @type {RequestInit & { cf?: { cacheTtl?: number } }} */ ({
      cf: { cacheTtl: 600 }
    });
    const res = await fetch("https://" + host + "/products.json", options);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const arr = await res.json();
    const map = {};
    (Array.isArray(arr) ? arr : []).forEach(p => { if (p && p.id != null) map[String(p.id)] = p; });
    _catalog = map;
    _catalogExp = now + 600000;
  } catch (e) {
    // Fail open: a catalogue hiccup must never block a real customer.
    if (!_catalog) _catalog = {};
    _catalogExp = now + 60000;
  }
  return _catalog;
}

/* Rewrites order.products / deliveryFee / totalPrice from trusted values.
 * Returns what had to be corrected so the order can be flagged for review. */
async function repriceOrder(env, order) {
  const catalog = await catalogById(env);
  const notes = [];
  let subtotal = 0, bulk = false;

  const lines = order.products.slice(0, MAX_CART_LINES);
  if (order.products.length > MAX_CART_LINES) notes.push("سلة مقتطعة إلى " + MAX_CART_LINES + " سطراً");

  order.products = lines.map(line => {
    const l = Object.assign({}, line);
    let qty = Math.floor(Number(l.quantity));
    if (!isFinite(qty) || qty < 1) qty = 1;
    if (qty > MAX_LINE_QTY) { notes.push("كمية " + qty + " خُفّضت إلى " + MAX_LINE_QTY); qty = MAX_LINE_QTY; }
    if (qty > BULK_QTY_FLAG) bulk = true;
    l.quantity = qty;

    const known = catalog[String(l.id)];
    if (known && Number(known.price) > 0) {
      if (Number(l.price) !== Number(known.price)) notes.push("سعر " + (known.title || l.id) + " صُحّح إلى " + known.price);
      l.price = Number(known.price);
    } else {
      l.price = Math.max(0, Number(l.price) || 0);
    }
    subtotal += l.price * qty;
    return l;
  });

  const clientFee = Math.max(0, Number(order.deliveryFee) || 0);
  let fee = clientFee;
  if (fee > MAX_DELIVERY_FEE) { notes.push("سعر توصيل غير معقول (" + fee + ") أُلغي"); fee = 0; }
  if (env.ECOTRACK_API_URL && env.ECOTRACK_TOKEN && env.ECOTRACK_LIVE_DELIVERY_PRICES !== "false") {
    const ref = await ecoReference(env);
    const code = resolveWilayaCode(order.wilaya);
    const stopDesk = ecoStatusKey(order.deliveryType || order.delivery_type) === "home" ? 0 : 1;
    if (ref.available.wilayas && !ref.wilayas.some(w => w.code === code))
      throw new Error("wilaya_not_served");
    if (stopDesk && ref.available.desks && !ref.desks.some(d => d.wilaya === code))
      throw new Error("stop_desk_not_available");
    const quote = ecoQuote(ref, code, 1, stopDesk);
    if (ref.available.fees && quote.service == null) throw new Error("delivery_fee_unavailable");
    if (quote.service != null) {
      fee = quote.service;
      order.ecotrackRateSource = "live_account_tariff";
      order.ecotrackTariffFetchedAt = ref.fetchedAt;
    } else {
      order.ecotrackRateSource = "legacy_fallback";
    }
  }
  order.deliveryFee = fee;

  const claimed = Number(order.totalPrice) || 0;
  order.totalPrice = subtotal + fee;
  const tariffDifference = order.ecotrackRateSource === "live_account_tariff" ? fee - clientFee : 0;
  if (Math.abs(claimed + tariffDifference - order.totalPrice) > 1) {
    notes.push("المجموع من المتصفح " + claimed + " ← الصحيح " + order.totalPrice);
  }
  return { notes, bulk };
}

// Rejects placeholder / troll names. Requires exactly two words, each with >=2 letters.
function isRealName(name) {
  const s = String(name || "").trim();
  if (s.length < 4) return false;
  const parts = s.split(/\s+/).filter(w => (w.match(/\p{L}/gu) || []).length >= 2);
  return parts.length === 2;
}

// Rejects lazy / fake phone numbers (all-same digit, too few distinct digits, long sequential runs).
function isLazyPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length !== 10) return true;
  const distinct = new Set(d.split("")).size;
  if (distinct <= 2) return true;
  let asc = 1, desc = 1, maxAsc = 1, maxDesc = 1;
  for (let i = 1; i < d.length; i++) {
    const delta = d.charCodeAt(i) - d.charCodeAt(i - 1);
    asc = delta === 1 ? asc + 1 : 1;
    desc = delta === -1 ? desc + 1 : 1;
    maxAsc = Math.max(maxAsc, asc);
    maxDesc = Math.max(maxDesc, desc);
  }
  if (maxAsc >= 6 || maxDesc >= 6) return true;
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key, Authorization"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);

    // ---------- Customer order tracking (read-only, phone lookup) ----------
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/track")) {
      return handleTrack(url, env, cors, request);
    }

    // ---------- Admin (protected by X-Admin-Key) ----------
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/admin/orders")) {
      return handleAdminOrders(url, request, env, cors);
    }
    if (request.method === "POST" && url.pathname.replace(/\/+$/, "").endsWith("/admin/set-tracking")) {
      return handleAdminSetTracking(request, env, cors);
    }
    if (request.method === "POST" && url.pathname.replace(/\/+$/, "").endsWith("/admin/confirm-ship")) {
      return handleAdminConfirmShip(request, env, cors);
    }
    if (request.method === "POST" && url.pathname.replace(/\/+$/, "").endsWith("/admin/confirm-purchase")) {
      return handleAdminConfirmPurchase(request, env, cors);
    }

    // ---------- EcoTrack: dispatch, labels, reference data ----------
    if (request.method === "POST" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/validate")) {
      return handleEcotrackValidate(request, env, cors);
    }
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/label")) {
      return handleEcotrackLabel(url, request, env, cors);
    }
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/reference")) {
      return handleEcotrackReference(url, request, env, ctx, cors);
    }
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/ping")) {
      return handleEcotrackPing(request, env, cors);
    }

    // ---------- Conversions API coverage for browser funnel events ----------
    if (request.method === "POST" && url.pathname.replace(/\/+$/, "").endsWith("/events")) {
      return handleBrowserEvents(request, env, ctx, cors);
    }

    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/delivery/reference")) {
      return ecoPublicReference(env, cors);
    }
    if (request.method === "POST" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/sync")) {
      return ecoHandleSync(request, env, cors);
    }
    if (request.method === "POST" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/parcel")) {
      return ecoHandleParcelAction(request, env, cors);
    }
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/history")) {
      return ecoHandleHistory(url, request, env, cors);
    }
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/admin/ecotrack/health")) {
      return ecoHandleHealth(request, env, cors);
    }
    if (request.method !== "POST" || !["", "/", "/order", "/api/order"].includes(url.pathname.replace(/\/+$/, ""))) {
      return json({ error: "Method not allowed" }, 405, cors);
    }
    return handleIntake(request, env, ctx, cors);
  },
  async scheduled(event, env, ctx) {
    const task = ecoScheduledSync(env).catch(async e => {
      console.error("EcoTrack scheduled sync:", String(e.message || e));
      try { await ecoPatchDocument(env, "config", "ecotrackSync", {
        lastAttemptAt: new Date().toISOString(), lastError: ecoPlain(e.message || e, 180)
      }); } catch {}
    });
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
};

/* =========================================================================
   TRACKING  —  GET /track?phone=0XXXXXXXXX
   Privacy note: phone-only lookup means anyone with a valid phone can see
   that order. We therefore return MINIMAL, sanitized data (no full address,
   no email, first name only) and the front-end is rate-limited at the edge.
   ========================================================================= */
async function handleTrack(url, env, cors, request = null) {
  const phone = (url.searchParams.get("phone") || "").trim();
  if (!PHONE_RE.test(phone)) return json({ error: "invalid_phone" }, 400, cors);

  let docs = [];
  try { docs = await ordersByPhone(env, phone); }
  catch (e) { return json({ error: "lookup_failed", detail: String(e) }, 500, cors); }

  if (!docs.length) return json({ orders: [] }, 200, cors);

  // Collect tracking numbers that exist, fetch their live EcoTrack status in one call.
  const codes = docs.map(d => d.ecotrackTracking).filter(Boolean);
  const wantDebug = url.searchParams.get("debug") === "1" && request && await adminOk(request, env);
  const diag = wantDebug ? { attempts: [] } : null;
  let live = {};
  if (codes.length) { try { live = await ecotrackTrackings(env, codes, diag); } catch (e) { if (diag) diag.fatal = String(e); live = {}; } }

  const orders = docs.map(d => {
    const code = d.ecotrackTracking || null;
    const liveOne = code && live[code] ? live[code] : null;
    return {
      ref: shortRef(d.id),
      placedAt: d.createdAt || d.timestamp || null,
      productCount: Array.isArray(d.products) ? d.products.length : 0,
      total: Number(d.totalPrice || 0),
      wilaya: d.wilaya || "",
      customerFirst: firstName(d.customer),
      internalStatus: d.status || "",
      stage: liveOne && liveOne.stage !== "unknown" ? liveOne.stage : d.ecotrackStage || internalStage(d.status),
      stageLabel: liveOne && liveOne.stage !== "unknown" ? liveOne.label : d.ecotrackStageLabel || internalLabel(d.status),
      tracking: code,
      timeline: (liveOne ? liveOne.timeline : d.ecotrackTimeline || internalTimeline(d))
        .map(t => ({ date: t.date, status: t.status, activity: t.activity || "" }))
    };
  });

  const resp = { orders };
  if (wantDebug) resp._debug = { codes, diag };
  return json(resp, 200, cors);
}

/* =========================================================================
   ADMIN  —  protected by the X-Admin-Key header (set the ADMIN_KEY secret).
   GET  /admin/orders?phone=...   full (unsanitized) orders for a phone
   POST /admin/set-tracking       { id, tracking, status? } -> patch the order
   ========================================================================= */
/* Admin identity.
 * Primary:  Authorization: Bearer <Firebase ID token>, verified against
 *           Google's public JWKS and matched to ADMIN_EMAIL. Same identity
 *           firestore.rules trusts, so panel and database agree on "admin".
 * Legacy:   X-Admin-Key === ADMIN_KEY, accepted only while that secret exists.
 *           Delete the ADMIN_KEY secret to switch it off for good. */
const GOOGLE_JWK_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let _jwksCache = { keys: null, expires: 0 };

function b64urlToBytes(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function googleJwks() {
  const now = Date.now();
  if (_jwksCache.keys && now < _jwksCache.expires) return _jwksCache.keys;
  const res = await fetch(GOOGLE_JWK_URL);
  if (!res.ok) throw new Error("jwks_fetch_failed_" + res.status);
  const body = await res.json();
  const m = (res.headers.get("cache-control") || "").match(/max-age=(\d+)/);
  _jwksCache = { keys: body.keys || [], expires: now + (m ? Number(m[1]) : 3600) * 1000 };
  return _jwksCache.keys;
}

async function verifyFirebaseIdToken(token, env) {
  try {
    const projectId = env.FIREBASE_PROJECT_ID;
    if (!projectId) return null;
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    if (header.alg !== "RS256" || !header.kid) return null;

    // Cheap claim checks before the costly signature check.
    const now = Math.floor(Date.now() / 1000);
    const SKEW = 60;
    if (!(Number(payload.exp) > now - SKEW)) return null;
    if (!(Number(payload.iat) < now + SKEW)) return null;
    if (payload.aud !== projectId) return null;
    if (payload.iss !== "https://securetoken.google.com/" + projectId) return null;
    if (!payload.sub) return null;

    const jwk = (await googleJwks()).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    return ok ? payload : null;
  } catch (e) {
    return null;
  }
}

async function adminOk(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer) {
    const payload = await verifyFirebaseIdToken(bearer, env);
    const allowed = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (payload && allowed && String(payload.email || "").toLowerCase() === allowed) return true;
  }
  return !!env.ADMIN_KEY && request.headers.get("X-Admin-Key") === env.ADMIN_KEY;
}

async function handleAdminOrders(url, request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  const phone = (url.searchParams.get("phone") || "").trim();
  if (!PHONE_RE.test(phone)) return json({ error: "invalid_phone" }, 400, cors);
  let docs = [];
  try { docs = await ordersByPhone(env, phone); }
  catch (e) { return json({ error: "lookup_failed", detail: String(e) }, 500, cors); }
  const orders = docs.map(d => ({
    id: d.id, ref: shortRef(d.id), customer: d.customer || "", phone: d.phone || "",
    wilaya: d.wilaya || "", commune: d.commune || "", address: d.address || "", total: Number(d.totalPrice || 0),
    status: d.status || "", ecotrackTracking: d.ecotrackTracking || null,
    placedAt: d.createdAt || d.timestamp || null,
    productCount: Array.isArray(d.products) ? d.products.length : 0
  }));
  return json({ orders }, 200, cors);
}

async function handleAdminSetTracking(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);
  const fields = {};
  if (body.tracking !== undefined) fields.ecotrackTracking = body.tracking ? String(body.tracking).trim() : null;
  if (body.status !== undefined && body.status) fields.status = String(body.status).trim();
  if (!Object.keys(fields).length) return json({ error: "nothing_to_update" }, 400, cors);
  try { await updateOrderFields(env, id, fields); }
  catch (e) { return json({ error: "update_failed", detail: String(e) }, 500, cors); }
  // ANY positive status (تم التأكيد, قيد التحضير, تم الشحن, تم التسليم, ...)
  // or a tracking number being attached = a REAL order -> send the Meta Purchase.
  // Works for ALL orders, with or without EcoTrack.
  let capi = null;
  if ((fields.status && isPositiveStatus(fields.status)) || fields.ecotrackTracking) {
    try { capi = await fireConfirmedPurchase(env, id, request); } catch (e) { capi = { ok: false, error: String(e) }; }
  }
  return json({ ok: true, id, updated: fields, capi }, 200, cors);
}

/* POST /admin/confirm-ship  { id, commune?, code_wilaya?, adresse?, type?, stop_desk?, status?, remarque? }
 * The TRUE auto path: creates the parcel in EcoTrack via the API, which RETURNS the
 * tracking number in the response. We then store ecotrackTracking on the order — no
 * manual paste, no guessing. Creating a parcel = a REAL shipment, so this is gated by
 * ADMIN_KEY and is idempotent (refuses if the order already has a tracking number). */
async function handleAdminConfirmShip(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);
  let order;
  try { order = await getOrderById(env, id); }
  catch { return json({ error: "lookup_failed" }, 500, cors); }
  if (!order) return json({ error: "order_not_found" }, 404, cors);
  if (order.ecotrackTracking) return json({ error: "already_shipped", tracking: order.ecotrackTracking }, 409, cors);
  if (!env.ECOTRACK_API_URL || !env.ECOTRACK_TOKEN) return json({ error: "ecotrack_not_configured" }, 503, cors);
  let payload, quote;
  try {
    payload = buildEcotrackPayload(order, body);
    const ref = await ecoReference(env);
    ecoValidateDestination(ref, payload);
    quote = ecoQuote(ref, payload.code_wilaya, payload.type, payload.stop_desk);
  } catch (e) { return json({ error: "invalid_parcel", detail: ecoPlain(e.message) }, 400, cors); }
  const actionId = "primary_" + (await sha256Hex(id + "|" + (order.ecotrackDeletedDraftTracking || "initial"))).slice(0, 40);
  let prior;
  try { prior = await ecoReserveAction(env, actionId, id, 1); }
  catch (e) { return json({ error: "shipment_reservation_failed", detail: ecoPlain(e.message) }, 409, cors); }
  if (prior) {
    if (!prior.tracking || !prior.parcel) return json({ error: "shipment_pending_reconciliation",
      detail: "A previous create request has an unknown outcome. Check Assil before retrying.", reference: payload.reference }, 409, cors);
    try { await updateOrderFields(env, id, prior.parcel, order._firestoreUpdateTime); }
    catch { return json({ error: "saved_parcel_but_db_update_failed", tracking: prior.tracking }, 502, cors); }
    let capi = null;
    try { capi = await fireConfirmedPurchase(env, id, request); } catch {}
    return json({ ok: true, already: true, id, tracking: prior.tracking, status: prior.parcel.status, capi }, 200, cors);
  }
  let created;
  try { created = await ecotrackCreateOrder(env, payload); }
  catch (e) {
    if (e.safeToRetry) {
      try { await ecoPatchDocument(env, "ecotrackActions", actionId, { state: "rejected", failure: ecoPlain(e.message, 180) }); } catch {}
    }
    return json({ error: "ecotrack_create_failed", detail: ecoPlain(e.message, 220),
      requiresReconciliation: !e.safeToRetry, reference: payload.reference }, 502, cors);
  }
  const tracking = created.tracking;
  const fields = { ecotrackTracking: tracking, status: "مؤكد", ecotrackPayload: payload,
    ecotrackType: payload.type, ecotrackCodAmount: payload.montant,
    ecotrackValidated: false, ecotrackValidatedAt: null,
    ecotrackStage: "preparing", ecotrackStageLabel: "قيد التحضير",
    ecotrackRawStatus: "prete_a_expedier", ecotrackCreatedAt: new Date().toISOString(), ecotrackTimeline: [],
    ecotrackPaymentState: "unknown", ecotrackLastSyncedAt: null,
    ecotrackActualServiceFee: null, ecotrackActualReturnFee: null,
    ecotrackPaymentReference: null, ecotrackReturnReference: null,
    ecotrackReturnRequestedAt: null, ecotrackReturnReceivedAt: null,
    ecotrackServiceFeeEstimate: quote.service, ecotrackReturnFeeEstimate: quote.returnFee,
    ecotrackTariffFetchedAt: quote.fetchedAt, ecotrackNeedsAttention: "", ecotrackAlertSignature: null };
  try { await ecoPatchDocument(env, "ecotrackActions", actionId, { state: "created", tracking, parcel: fields }); }
  catch { return json({ error: "saved_parcel_but_action_update_failed", tracking,
    detail: "Parcel exists at Assil. Reconcile before another creation request." }, 502, cors); }
  try { await updateOrderFields(env, id, fields, order._firestoreUpdateTime); }
  catch { return json({ error: "saved_parcel_but_db_update_failed", tracking,
    detail: "Retry the same order to link the already-created parcel; do not create it manually again." }, 502, cors); }
  let capi = null;
  try { capi = await fireConfirmedPurchase(env, id, request); } catch (e) { capi = { ok: false, error: ecoPlain(e.message) }; }
  return json({ ok: true, id, tracking, status: fields.status, capi }, 200, cors);
}

/* Is this status "positive" (= the order is real)?
 * Matches: تم التأكيد / مؤكد / confirmed, قيد التحضير / جاهز / preparing,
 * تم الشحن / في الطريق / shipped / in transit, خرج للتوصيل / out for delivery,
 * تم التسليم / وصل / delivered (Arabic, French and English wording).
 * NEVER matches: ملغى / إلغاء / cancelled, مرتجع / إرجاع / returned, جديد / new. */
function isPositiveStatus(st) {
  const s = String(st || "").toLowerCase();
  // Negative statuses always lose, even if the text also contains a positive word.
  if (/\u0625\u0644\u063a|\u0644\u063a\u0649|\u0644\u063a\u064a|cancel|annul|refus|\u0631\u0641\u0636|\u0631\u0627\u062c\u0639|\u0625\u0631\u062c\u0627\u0639|\u0645\u0631\u062a\u062c\u0639|retour|return|fake|\u0648\u0647\u0645\u064a|spam/.test(s)) return false;
  return /\u0623\u0643\u062f|\u0624\u0643\u062f|\u062a\u0623\u0643\u064a\u062f|confirm|\u062a\u062d\u0636\u064a\u0631|\u062c\u0627\u0647\u0632|prepar|ready|\u0634\u062d\u0646|\u0627\u0644\u0637\u0631\u064a\u0642|\u062a\u0648\u0635\u064a\u0644|exp\u00e9di|expedi|ship|transit|livr|\u062a\u0633\u0644\u064a\u0645|\u0648\u0635\u0644|deliver/.test(s);
}

/* Send the Meta CAPI Purchase for a CONFIRMED order, exactly once.
 * Idempotent via the metaPurchaseSentAt field stored on the order document. */
async function fireConfirmedPurchase(env, id, request) {
  const order = await getOrderById(env, id);
  if (!order) return { ok: false, error: "order_not_found" };
  if (order.metaPurchaseSentAt) return { ok: true, already: true, sentAt: order.metaPurchaseSentAt };
  await sendMetaCapi(env, order, id, order.fb || {}, request);
  try { await updateOrderFields(env, id, { metaPurchaseSentAt: new Date().toISOString() }); } catch (e) {}
  return { ok: true, already: false };
}

/* POST /admin/confirm-purchase  { id }
 * Call this the moment you confirm an order by phone (even before shipping).
 * Sends the Meta Purchase using the fbc/fbp saved at order time. Safe to
 * call more than once — the event is only ever sent a single time. */
async function handleAdminConfirmPurchase(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);
  let result;
  try { result = await fireConfirmedPurchase(env, id, request); }
  catch (e) { return json({ error: "capi_failed", detail: String(e) }, 500, cors); }
  return json(result, result.ok ? 200 : 404, cors);
}

async function getOrderById(env, id) {
  const token = await accessToken(env);
  const res = await fetch(baseUrl(env) + "/orders/" + encodeURIComponent(id), { headers: { "Authorization": "Bearer " + token } });
  if (res.status === 404) return null;
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error("get " + res.status + " " + t.slice(0, 300)); }
  const data = await res.json();
  const o = decodeFields(data.fields || {});
  o.id = data.name.split("/").pop();
  o._firestoreUpdateTime = data.updateTime || null;
  return o;
}

/* Build + validate the EcoTrack create/order body. Field names & rules verified against
 * the CourierDZ EcoTrack integration (api/v1/create/order):
 *   nom_client*, telephone* (9-10 digits), adresse*, commune*, code_wilaya* (1-58),
 *   montant*, type* (1=Livraison,2=Echange,3=Pickup,4=Recouvrement), stop_desk(0/1),
 *   reference?, telephone_2?, produit?, remarque?
 * Admin can override the fields an order may lack (commune, code_wilaya, adresse). */
function buildEcotrackPayload(order, ov) {
  ov = ov || {};
  const type = ov.type == null ? Number(order.ecotrackType || 1) : Number(ov.type);
  if (![1, 2, 3, 4].includes(type)) throw new Error("type invalide");
  const phone = String(ov.telephone || order.phone || "").replace(/\s+/g, "");
  if (!/^0[5-7][0-9]{8}$/.test(phone)) throw new Error("telephone invalide");

  const wilayaRaw = (ov.code_wilaya != null && ov.code_wilaya !== "") ? ov.code_wilaya : order.wilaya;
  const code_wilaya = resolveWilayaCode(wilayaRaw);
  if (!code_wilaya) throw new Error("wilaya non reconnue: \"" + (order.wilaya || "") + "\" (envoyez code_wilaya entre 1 et 58)");

  // Storefronts have historically sent this field as `baladiya`. Keep that
  // spelling readable for orders already in Firestore as well as new ones.
  const commune = String(ov.commune || order.commune || order.baladiya || order.municipality || "").trim();
  if (!commune) throw new Error("commune manquante");

  const nom_client = String(ov.nom_client || order.customer || "").trim();
  if (!nom_client) throw new Error("nom client manquant");

  const adresse = (String(ov.adresse || order.address || "").trim()) || commune;
  const montant = ov.montant == null ? Number(order.totalPrice || 0) : Number(ov.montant);
  if (!Number.isFinite(montant) || montant < 0 || (type === 1 && montant === 0)) throw new Error("montant invalide");

  const produit = ((Array.isArray(order.products) ? order.products : [])
    .map(p => String(p.name || "") + (p.quantity ? " x" + p.quantity : "")).join(", ") || "Commande").slice(0, 255);

  const payload = {
    nom_client: nom_client.slice(0, 255),
    telephone: phone,
    adresse: adresse.slice(0, 255),
    commune: commune.slice(0, 255),
    code_wilaya,
    montant,
    produit: ov.produit == null ? produit : ecoPlain(ov.produit),
    type,
    stop_desk: ov.stop_desk != null ? Number(ov.stop_desk) : 0
  };
  if (![0, 1].includes(payload.stop_desk)) throw new Error("stop desk invalide");
  const reference = order.id ? String(order.id).slice(-12) : "";
  if (reference) payload.reference = reference;
  if (ov.remarque) payload.remarque = String(ov.remarque).slice(0, 255);
  for (const key of ["telephone_2", "produit_a_recuperer", "code_postal", "boutique"])
    if (ov[key] != null && ov[key] !== "") payload[key] = ecoPlain(ov[key]);
  if (payload.telephone_2 && !PHONE_RE.test(payload.telephone_2)) throw new Error("telephone 2 invalide");
  if (ov.fragile != null) {
    if (![0, 1].includes(Number(ov.fragile))) throw new Error("fragile invalide");
    payload.fragile = Number(ov.fragile);
  }
  if (ov.gps_link) {
    if (!/^https:\/\//i.test(String(ov.gps_link))) throw new Error("gps link invalide");
    payload.gps_link = ecoPlain(ov.gps_link, 1500);
  }
  return payload;
}

async function ecotrackCreateOrder(env, payload) {
  if (!env.ECOTRACK_API_URL || !env.ECOTRACK_TOKEN) throw new Error("ecotrack non configure");
  const endpoint = env.ECOTRACK_API_URL.replace(/\/+$/, "") + "/api/v1/create/order";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.ECOTRACK_TOKEN, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(Object.assign({ api_token: env.ECOTRACK_TOKEN }, payload))
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const e = Object.assign(new Error("HTTP " + res.status + " " + text.split(env.ECOTRACK_TOKEN).join("[redacted]").slice(0, 300)), {
      safeToRetry: res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)
    });
    throw e;
  }
  if (data && (data.success === false || data.success === 0 || data.success === "false")) {
    const e = Object.assign(new Error(String(data.message || "creation refusee").split(env.ECOTRACK_TOKEN).join("[redacted]")), {
      safeToRetry: true
    });
    throw e;
  }
  const tracking = data && (data.tracking || data.tracking_id || data.trackingNumber ||
    (data.order && (data.order.tracking || data.order.tracking_id)) ||
    (data.data && (data.data.tracking || data.data.tracking_id)) || data.id);
  if (!tracking) throw new Error("pas de numero de suivi dans la reponse: " + text.slice(0, 300));
  return { tracking: String(tracking), raw: data };
}

/* ---- Wilaya name -> code (1..58). Accepts a numeric code, an Arabic name, or a
 * French/Latin name. Both the input and the table are passed through normWilaya so
 * accents, spaces, apostrophes, tashkeel and the Arabic article "\u0627\u0644" don't matter. */
function resolveWilayaCode(input) {
  if (input == null) return null;
  const n = Number(String(input).trim());
  if (Number.isInteger(n) && n >= 1 && n <= 58) return n;
  const key = normWilaya(String(input));
  return key ? (WILAYA_LOOKUP[key] || null) : null;
}
function normWilaya(s) {
  let x = String(s || "").trim().toLowerCase();
  x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");                 // latin accents
  x = x.replace(/[\u064B-\u0652\u0670]/g, "")                              // arabic tashkeel
       .replace(/[\u0623\u0625\u0622\u0627]/g, "\u0627")                   // alef variants
       .replace(/\u0649/g, "\u064a")                                       // alef maqsura -> ya
       .replace(/\u0629/g, "\u0647");                                      // ta marbuta -> ha
  x = x.replace(/^\u0627\u0644/, "");                                      // arabic article "al"
  x = x.replace(/[^0-9a-z\u0621-\u064a]/g, "");                            // keep latin+arabic letters/digits
  return x;
}
const WILAYAS = [
  [1,"Adrar","\u0623\u062f\u0631\u0627\u0631"],[2,"Chlef","\u0627\u0644\u0634\u0644\u0641"],[3,"Laghouat","\u0627\u0644\u0623\u063a\u0648\u0627\u0637"],
  [4,"Oum El Bouaghi","\u0623\u0645 \u0627\u0644\u0628\u0648\u0627\u0642\u064a"],[5,"Batna","\u0628\u0627\u062a\u0646\u0629"],[6,"Bejaia","\u0628\u062c\u0627\u064a\u0629"],
  [7,"Biskra","\u0628\u0633\u0643\u0631\u0629"],[8,"Bechar","\u0628\u0634\u0627\u0631"],[9,"Blida","\u0627\u0644\u0628\u0644\u064a\u062f\u0629"],
  [10,"Bouira","\u0627\u0644\u0628\u0648\u064a\u0631\u0629"],[11,"Tamanrasset","\u062a\u0645\u0646\u0631\u0627\u0633\u062a"],[12,"Tebessa","\u062a\u0628\u0633\u0629"],
  [13,"Tlemcen","\u062a\u0644\u0645\u0633\u0627\u0646"],[14,"Tiaret","\u062a\u064a\u0627\u0631\u062a"],[15,"Tizi Ouzou","\u062a\u064a\u0632\u064a \u0648\u0632\u0648"],
  [16,"Alger","\u0627\u0644\u062c\u0632\u0627\u0626\u0631"],[17,"Djelfa","\u0627\u0644\u062c\u0644\u0641\u0629"],[18,"Jijel","\u062c\u064a\u062c\u0644"],
  [19,"Setif","\u0633\u0637\u064a\u0641"],[20,"Saida","\u0633\u0639\u064a\u062f\u0629"],[21,"Skikda","\u0633\u0643\u064a\u0643\u062f\u0629"],
  [22,"Sidi Bel Abbes","\u0633\u064a\u062f\u064a \u0628\u0644\u0639\u0628\u0627\u0633"],[23,"Annaba","\u0639\u0646\u0627\u0628\u0629"],[24,"Guelma","\u0642\u0627\u0644\u0645\u0629"],
  [25,"Constantine","\u0642\u0633\u0646\u0637\u064a\u0646\u0629"],[26,"Medea","\u0627\u0644\u0645\u062f\u064a\u0629"],[27,"Mostaganem","\u0645\u0633\u062a\u063a\u0627\u0646\u0645"],
  [28,"Msila","\u0627\u0644\u0645\u0633\u064a\u0644\u0629"],[29,"Mascara","\u0645\u0639\u0633\u0643\u0631"],[30,"Ouargla","\u0648\u0631\u0642\u0644\u0629"],
  [31,"Oran","\u0648\u0647\u0631\u0627\u0646"],[32,"El Bayadh","\u0627\u0644\u0628\u064a\u0636"],[33,"Illizi","\u0625\u0644\u064a\u0632\u064a"],
  [34,"Bordj Bou Arreridj","\u0628\u0631\u062c \u0628\u0648\u0639\u0631\u064a\u0631\u064a\u062c"],[35,"Boumerdes","\u0628\u0648\u0645\u0631\u062f\u0627\u0633"],[36,"El Tarf","\u0627\u0644\u0637\u0627\u0631\u0641"],
  [37,"Tindouf","\u062a\u0646\u062f\u0648\u0641"],[38,"Tissemsilt","\u062a\u064a\u0633\u0645\u0633\u064a\u0644\u062a"],[39,"El Oued","\u0627\u0644\u0648\u0627\u062f\u064a"],
  [40,"Khenchela","\u062e\u0646\u0634\u0644\u0629"],[41,"Souk Ahras","\u0633\u0648\u0642 \u0623\u0647\u0631\u0627\u0633"],[42,"Tipaza","\u062a\u064a\u0628\u0627\u0632\u0629"],
  [43,"Mila","\u0645\u064a\u0644\u0629"],[44,"Ain Defla","\u0639\u064a\u0646 \u0627\u0644\u062f\u0641\u0644\u0649"],[45,"Naama","\u0627\u0644\u0646\u0639\u0627\u0645\u0629"],
  [46,"Ain Temouchent","\u0639\u064a\u0646 \u062a\u0645\u0648\u0634\u0646\u062a"],[47,"Ghardaia","\u063a\u0631\u062f\u0627\u064a\u0629"],[48,"Relizane","\u063a\u0644\u064a\u0632\u0627\u0646"],
  [49,"El Mghair","\u0627\u0644\u0645\u063a\u064a\u0631"],[50,"El Meniaa","\u0627\u0644\u0645\u0646\u064a\u0639\u0629"],[51,"Ouled Djellal","\u0623\u0648\u0644\u0627\u062f \u062c\u0644\u0627\u0644"],
  [52,"Bordj Baji Mokhtar","\u0628\u0631\u062c \u0628\u0627\u062c\u064a \u0645\u062e\u062a\u0627\u0631"],[53,"Beni Abbes","\u0628\u0646\u064a \u0639\u0628\u0627\u0633"],[54,"Timimoun","\u062a\u064a\u0645\u064a\u0645\u0648\u0646"],
  [55,"Touggourt","\u062a\u0642\u0631\u062a"],[56,"Djanet","\u062c\u0627\u0646\u062a"],[57,"In Salah","\u0639\u064a\u0646 \u0635\u0627\u0644\u062d"],[58,"In Guezzam","\u0639\u064a\u0646 \u0642\u0632\u0627\u0645"]
];
const WILAYA_LOOKUP = (() => { const m = {}; for (const [c, fr, ar] of WILAYAS) { m[normWilaya(fr)] = c; m[normWilaya(ar)] = c; } return m; })();

async function updateOrderFields(env, id, fields, updateTime = null) {
  const token = await accessToken(env);
  const masks = Object.keys(fields).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const condition = updateTime ? "&currentDocument.updateTime=" + encodeURIComponent(updateTime) : "";
  const res = await fetch(baseUrl(env) + "/orders/" + encodeURIComponent(id) + "?" + masks + condition, {
    method: "PATCH",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(fields) })
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error("patch " + res.status + " " + t.slice(0, 300)); }
  return true;
}

async function ordersByPhone(env, phone) {
  const token = await accessToken(env);
  // No orderBy here on purpose: filtering by `phone` and ordering by a DIFFERENT
  // field (`createdAt`) would require a Firestore composite index. We filter only
  // (single-field index, always present) and sort in JS below.
  const q = { structuredQuery: {
    from: [{ collectionId: "orders" }],
    where: { fieldFilter: { field: { fieldPath: "phone" }, op: "EQUAL", value: { stringValue: phone } } },
    limit: 25
  } };
  const res = await fetch(baseUrl(env) + ":runQuery", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(q)
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error("runQuery " + res.status + " " + t.slice(0, 300)); }
  const rows = await res.json();
  const docs = rows.filter(r => r.document).map(r => {
    const o = decodeFields(r.document.fields || {});
    o.id = r.document.name.split("/").pop();
    return o;
  });
  docs.sort((a, b) => String(b.createdAt || b.timestamp || "").localeCompare(String(a.createdAt || a.timestamp || "")));
  return docs.slice(0, 10);
}

/* ---- EcoTrack live status ----
 * Standard EcoTrack/Noest read endpoint. VERIFY the exact path against the
 * "Information" button in YOUR dashboard — most tenants use one of:
 *   POST {API_URL}/api/v1/get/trackings/info     (most common)
 *   POST {API_URL}/api/public/get/trackings/info  (Noest-style)
 * Body: { trackings: ["CODE1", ...] }  Header: Authorization: Bearer <token>
 * Response: object keyed by tracking code, each with an activity/events array.
 */
async function ecotrackTrackings(env, codes, diag) {
  if (!env.ECOTRACK_API_URL || !env.ECOTRACK_TOKEN) { if (diag) diag.error = "ecotrack_not_configured"; return {}; }
  const base = env.ECOTRACK_API_URL.replace(/\/+$/, "");
  codes = codes.slice(0, 100); // API caps a batch at 100 trackings
  const qs = codes.map(c => "trackings[]=" + encodeURIComponent(c)).join("&");
  /* Documented shape is GET .../get/trackings/info?trackings[]=A&trackings[]=B.
   * The older POST form stays as a fallback for tenants that still accept it. */
  const candidates = [
    { method: "GET",  endpoint: base + "/api/v1/get/trackings/info?" + qs },
    { method: "POST", endpoint: base + "/api/v1/get/trackings/info" },
    { method: "POST", endpoint: base + "/api/public/get/trackings/info" }
  ];
  let data = null;
  for (const cand of candidates) {
    try {
      const init = {
        method: cand.method,
        headers: { "Authorization": "Bearer " + env.ECOTRACK_TOKEN, "Accept": "application/json" }
      };
      if (cand.method === "POST") {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify({ trackings: codes, api_token: env.ECOTRACK_TOKEN });
      }
      const res = await fetch(cand.endpoint, init);
      const text = await res.text();
      const attempt = { endpoint: cand.endpoint, method: cand.method, status: res.status, body: String(text).slice(0, 1000) };
      if (diag) diag.attempts.push(attempt);
      if (res.status === 429) throw new Error("rate_limited");
      if (!res.ok) continue;
      try { data = JSON.parse(text); } catch (e) { if (diag) attempt.parseError = String(e); data = null; continue; }
      // Some EcoTrack tenants report unsupported routes with HTTP 200 and a
      // failure object. Try the next route instead of showing stale status.
      if (data && (data.success === false || data.success === 0 || data.error)) {
        if (diag) attempt.apiError = data.message || data.error || "api_failure";
        data = null;
        continue;
      }
      if (data) break;
    } catch (e) {
      if (e && e.message === "rate_limited") throw e;
      if (diag) diag.attempts.push({ endpoint: cand.endpoint, method: cand.method, error: String(e) });
    }
  }
  if (!data) return {};
  if (diag) diag.parsedKeys = Array.isArray(data) ? ("array:" + data.length) : Object.keys(data);
  const out = {};
  for (const code of codes) {
    let node = data[code] || (data.trackings && data.trackings[code]) || null;
    if (!node && Array.isArray(data)) node = data.find(x => x && (x.tracking === code || x.tracking_id === code)) || null;
    if (!node && data.data) node = data.data[code] || (Array.isArray(data.data) ? data.data.find(x => x && (x.tracking === code || x.tracking_id === code)) : null) || null;
    if (!node) continue;
    // Defensive: EcoTrack returns activity under "activity" | "activites" | "events".
    const acts = node.activity || node.activites || node.events || (node.OrderInfo && node.OrderInfo.activity) || [];
    const timeline = (Array.isArray(acts) ? acts : []).map(a => ({
      date: ecoEventTime(a),
      status: a.event || a.status || a.libelle || a.activity || "",
      // Machine code kept separate so mapping never depends on wording.
      activity: a.activity || a.activity_code || "",
      reason: ecoPlain(a.reason),
      details: ecoPlain(a.details),
      station: ecoPlain(a.station || a.scanLocation)
    })).filter(t => t.status || t.activity);
    // Tenants differ on event ordering. Prefer the newest dated activity;
    // keep the API order for entries without parseable dates.
    timeline.sort((a, b) => {
      const at = Date.parse(a.date), bt = Date.parse(b.date);
      return Number.isFinite(at) && Number.isFinite(bt) ? bt - at : 0;
    });
    const last = timeline.length ? timeline[0] : null;
    const lastRaw = node.status || node.last_status || (last && last.status) || "";
    const mapped = ecoStageFor(lastRaw, timeline);
    out[code] = { stage: mapped.stage, label: mapped.label, rawStatus: lastRaw, timeline,
      paymentState: ecoPaymentState(lastRaw, timeline) };
  }
  return out;
}

/* =========================================================================
   ECOTRACK — dispatch, labels and reference data
   Docs: https://documenter.getpostman.com/view/14517169/Tz5je15g
   Rate limits: 50/min, 1 500/hour, 15 000/day. Bulk helpers below pace
   themselves so a daily batch never trips the per-minute ceiling.
   ========================================================================= */
function ecoUrl(env, path, params) {
  const base = env.ECOTRACK_API_URL.replace(/\/+$/, "");
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return base + "/api/v1/" + path.replace(/^\/+/, "") + qs;
}

/**
 * raw=true returns a Response; JSON responses are validated by each caller.
 * @param {RobusteRecord} env
 * @param {string} path
 * @param {EcoCallOptions} [options]
 * @returns {Promise<any>}
 */
async function ecoCall(env, path, { method = "GET", params, body, raw = false } = {}) {
  if (!env.ECOTRACK_API_URL || !env.ECOTRACK_TOKEN) throw new Error("ecotrack non configure");
  const res = await fetch(ecoUrl(env, path, params), {
    method,
    headers: {
      "Authorization": "Bearer " + env.ECOTRACK_TOKEN,
      "Accept": raw ? "*/*" : "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (raw) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res;
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 200));
  if (data && (data.success === false || data.success === 0 || data.success === "false"))
    throw new Error(data.message || "refuse");
  return data;
}

/* POST /admin/ecotrack/validate  { trackings: ["A","B"], ask_collection? }
 * This is the "Expédier" step. create/order only drafts a parcel; until it is
 * validated the courier never collects it. Irreversible: once validated the
 * parcel can no longer be updated or deleted. */
async function handleEcotrackValidate(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }

  const list = Array.isArray(body.trackings) ? body.trackings : (body.tracking ? [body.tracking] : []);
  const codes = list.map(c => String(c || "").trim()).filter(c => /^[A-Za-z0-9_-]+$/.test(c));
  if (!codes.length) return json({ error: "no_tracking" }, 400, cors);
  /* Each parcel costs 2 subrequests here (valid/order + the Firestore patch),
   * and a Worker gets 50 subrequests per request on the free plan. 15 keeps a
   * comfortable margin; the panel splits larger batches into chunks. */
  if (codes.length > 15) return json({ error: "too_many", max: 15 }, 400, cors);

  const results = [];
  for (const tracking of codes) {
    const params = { tracking };
    if (body.ask_collection) params.ask_collection = "1";
    try {
      const data = await ecoCall(env, "valid/order", { method: "POST", params });
      results.push({ tracking, ok: true, message: (data && data.message) || "" });
    } catch (e) {
      results.push({ tracking, ok: false, error: String(e.message || e) });
    }
    // EcoTrack allows 50 requests/minute; a 15-parcel chunk paced at 250ms
    // finishes in ~4s and leaves room for the panel's next chunk.
    if (codes.length > 1) await new Promise(r => setTimeout(r, 1300));
  }

  const okCodes = results.filter(r => r.ok).map(r => r.tracking);
  // Record the dispatch so the panel can tell "parcel made" from "handed over".
  const stamp = new Date().toISOString();
  if (okCodes.length && Array.isArray(body.ids) && body.ids.length === codes.length) {
    for (let i = 0; i < codes.length; i++) {
      if (!results[i].ok) continue;
      const id = String(body.ids[i] || "").trim();
      if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
      try { await updateOrderFields(env, id, { ecotrackValidated: true, ecotrackValidatedAt: stamp }); } catch (e) {}
    }
  }
  return json({ ok: results.every(r => r.ok), validated: okCodes.length, results }, 200, cors);
}

/* GET /admin/ecotrack/label?tracking=XXX
 * Streams the courier's official PDF through the Worker so the API token
 * never reaches the browser. */
async function handleEcotrackLabel(url, request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  const tracking = String(url.searchParams.get("tracking") || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(tracking)) return json({ error: "invalid_tracking" }, 400, cors);
  let res;
  try { res = await ecoCall(env, "get/order/label", { params: { tracking }, raw: true }); }
  catch (e) { return json({ error: "label_failed", detail: String(e.message || e) }, 502, cors); }
  const headers = Object.assign({}, cors, {
    "Content-Type": "application/pdf",
    "Content-Disposition": 'inline; filename="' + tracking + '.pdf"',
    "Cache-Control": "no-store"
  });
  return new Response(res.body, { status: 200, headers });
}

/* GET /admin/ecotrack/reference
 * Wilayas, communes, stop desks and YOUR tariff table, in one cached call.
 * Cached at the edge for an hour: this data changes rarely and every page of
 * the panel would otherwise burn requests against the rate limit. */
async function handleEcotrackReference(url, request, env, ctx, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  try {
    return json(Object.assign({ ok: true }, await ecoReference(env, url.searchParams.get("fresh") === "1")),
      200, Object.assign({}, cors, { "Cache-Control": "no-store" }));
  } catch (e) { return json({ error: "reference_failed", detail: ecoPlain(e.message) }, 502, cors); }
}

/* GET /admin/ecotrack/ping — is the token still valid? */
async function handleEcotrackPing(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  try {
    const data = await ecoCall(env, "validate/token");
    if (!data || data.success !== true) {
      return json({ ok: false, error: (data && data.message) || "token_validation_failed" }, 502, cors);
    }
    return json({ ok: true, data }, 200, cors);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502, cors);
  }
}

/* Map an EcoTrack event to a customer-facing stage + Arabic label.
 *
 * `activity` codes are stable machine identifiers, so they are checked FIRST.
 * `status` is human text each courier may reword, and it is ORDER-SENSITIVE:
 * "En livraison" (out for delivery) and "Retours chez livreur" (return held by
 * the driver) both contain "livr", so the delivered test must run last.
 * Lists come from the EcoTrack API docs, "Suivi ... plusieurs commandes". */
const ECOTRACK_ACTIVITY_STAGES = {
  order_information_received_by_carrier: { stage: "preparing",        label: "\u0642\u064a\u062f \u0627\u0644\u062a\u062d\u0636\u064a\u0631" },
  picked:                                { stage: "in_transit",       label: "\u0641\u064a \u0627\u0644\u0637\u0631\u064a\u0642" },
  accepted_by_carrier:                   { stage: "in_transit",       label: "\u0641\u064a \u0627\u0644\u0637\u0631\u064a\u0642" },
  dispatched_to_driver:                  { stage: "out_for_delivery", label: "\u062e\u0631\u062c \u0644\u0644\u062a\u0648\u0635\u064a\u0644" },
  attempt_delivery:                      { stage: "out_for_delivery", label: "\u0645\u062d\u0627\u0648\u0644\u0629 \u062a\u0633\u0644\u064a\u0645" },
  return_asked:                          { stage: "returned",         label: "\u0642\u064a\u062f \u0627\u0644\u0625\u0631\u062c\u0627\u0639" },
  return_in_transit:                     { stage: "returned",         label: "\u0642\u064a\u062f \u0627\u0644\u0625\u0631\u062c\u0627\u0639" },
  return_received:                       { stage: "returned",         label: "\u0645\u0631\u062a\u062c\u0639" },
  livred:                                { stage: "delivered",        label: "\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645" },
  encaissed:                             { stage: "delivered",        label: "\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645" },
  payed:                                 { stage: "delivered",        label: "\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645" }
};

function mapEcotrackStatus(raw, activity) {
  const act = String(activity || "").trim().toLowerCase();
  if (act && ECOTRACK_ACTIVITY_STAGES[act]) return ECOTRACK_ACTIVITY_STAGES[act];

  const s = String(raw || "").toLowerCase();
  // Returns first: several return statuses contain "livr" ("Retours chez livreur").
  if (/retour|returned|\u0625\u0631\u062c\u0627\u0639|\u0631\u0627\u062c\u0639|\u0645\u0631\u062a\u062c\u0639/.test(s)) return { stage: "returned", label: "\u0645\u0631\u062a\u062c\u0639" };
  // Then out-for-delivery: "En livraison" also contains "livr".
  if (/en livraison|sortie|out for|\u062e\u0631\u062c|\u0644\u0644\u062a\u0648\u0635\u064a\u0644/.test(s)) return { stage: "out_for_delivery", label: "\u062e\u0631\u062c \u0644\u0644\u062a\u0648\u0635\u064a\u0644" };
  if (/suspend|\u0645\u0639\u0644\u0651\u0642|\u0645\u0639\u0644\u0642/.test(s)) return { stage: "in_transit", label: "\u0645\u0639\u0644\u0651\u0642 \u0645\u0624\u0642\u062a\u0627\u064b" };
  // Only now is a bare "livr"/"livre" safe to read as delivered.
  if (/livr|delivered|encaiss|paiement|\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645/.test(s)) return { stage: "delivered", label: "\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645" };
  // "Pr\u00eat \u00e0 exp\u00e9dier" must read as preparing, so this beats the transit test.
  if (/pr\u00eat|pret|ready|pr\u00e9par|prepar|stock|\u062c\u0627\u0647\u0632/.test(s)) return { stage: "preparing", label: "\u0642\u064a\u062f \u0627\u0644\u062a\u062d\u0636\u064a\u0631" };
  if (/hub|wilaya|transit|achemin|exp\u00e9di|ramass|collect|\u0641\u064a \u0627\u0644\u0637\u0631\u064a\u0642/.test(s)) return { stage: "in_transit", label: "\u0641\u064a \u0627\u0644\u0637\u0631\u064a\u0642" };
  return { stage: "in_transit", label: raw || "\u0642\u064a\u062f \u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629" };
}

/* Internal status (before a parcel/tracking number exists). */
function internalStage(st) {
  const s = String(st || "").toLowerCase();
  if (/\u0623\u0643\u062f|confirm/.test(s)) return "confirmed";
  if (/\u062a\u062d\u0636\u064a\u0631|prepar/.test(s)) return "preparing";
  if (/\u0625\u0644\u063a|cancel/.test(s)) return "cancelled";
  return "received";
}
function internalLabel(st) {
  switch (internalStage(st)) {
    case "confirmed": return "\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0637\u0644\u0628";
    case "preparing": return "\u0642\u064a\u062f \u0627\u0644\u062a\u062d\u0636\u064a\u0631";
    case "cancelled": return "\u0645\u0644\u063a\u0649";
    default: return "\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0637\u0644\u0628\u0643";
  }
}
function internalTimeline(d) {
  const t = [{ date: d.createdAt || d.timestamp || "", status: "\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0644\u0637\u0644\u0628" }];
  if (internalStage(d.status) === "confirmed") t.unshift({ date: "", status: "\u062a\u0645 \u0627\u0644\u062a\u0623\u0643\u064a\u062f" });
  return t;
}

function firstName(full) { return String(full || "").trim().split(/\s+/)[0] || ""; }
function shortRef(id) { return id ? String(id).slice(-6).toUpperCase() : ""; }

/* =========================================================================
   ORDER INTAKE  —  POST /
   ========================================================================= */
/* =========================================================================
   POST /events  —  Conversions API coverage for the browser funnel
   The pixel alone loses events to ad blockers, ITP and iOS. Mirroring the
   same events server-side is exactly what Meta's "Conversions API event
   coverage" metric measures, and the server always has IP + User-Agent, so
   match quality is higher than the browser can manage on its own.
   Dedup relies on the browser sending the SAME event_id it gave fbq().
   This endpoint is public, so it validates hard and trusts nothing:
   only known event names, a small batch, and money recomputed from the
   catalogue rather than taken from the caller.
   ========================================================================= */
const CAPI_ALLOWED_EVENTS = {
  ViewContent: 1, AddToCart: 1, InitiateCheckout: 1, Lead: 1, PlaceOrder: 1
};
const CAPI_MAX_BATCH = 10;

async function handleBrowserEvents(request, env, ctx, cors) {
  const PIXEL = env.META_PIXEL_ID, TOKEN = env.META_CAPI_TOKEN;
  if (!PIXEL || !TOKEN) return json({ ok: true, skipped: "not_configured" }, 200, cors);

  let payload;
  try { payload = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  try { if (JSON.stringify(payload).length > 20000) return json({ error: "payload_too_large" }, 413, cors); } catch {}

  const list = Array.isArray(payload.events) ? payload.events.slice(0, CAPI_MAX_BATCH) : [];
  if (!list.length) return json({ ok: true, sent: 0 }, 200, cors);

  const u = payload.user || {}, fb = payload.fb || {};
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = request.headers.get("User-Agent") || "";
  const cf = request.cf || {};

  const user_data = {};
  const e164 = normPhoneE164(u.phone);
  if (e164 && e164.length >= 11) {
    const ph = await hashField(e164); if (ph) user_data.ph = [ph];
    const ext = await hashField(e164); if (ext) user_data.external_id = [ext];
  }
  const email = String(u.email || "").trim().toLowerCase();
  if (email.includes("@")) { const em = await hashField(email); if (em) user_data.em = [em]; }
  const fn = await hashField(u.fn); if (fn) user_data.fn = [fn];
  const ln = await hashField(u.ln); if (ln) user_data.ln = [ln];
  const ct = await hashField(u.ct || cf.city); if (ct) user_data.ct = [ct];
  const st = await hashField(u.st || cf.region); if (st) user_data.st = [st];
  const co = await hashField(u.country || cf.country || "dz"); if (co) user_data.country = [co];
  if (ip) user_data.client_ip_address = ip;
  if (ua) user_data.client_user_agent = ua;
  if (fb.fbp) user_data.fbp = String(fb.fbp).slice(0, 120);
  if (fb.fbc) user_data.fbc = String(fb.fbc).slice(0, 200);

  // Without fbp/fbc or any identifier Meta cannot match the event to anyone;
  // sending it would only drag the match-quality average down.
  if (!user_data.fbp && !user_data.fbc && !user_data.ph && !user_data.em) {
    return json({ ok: true, sent: 0, skipped: "no_identifiers" }, 200, cors);
  }

  const catalog = await catalogById(env);
  const now = Math.floor(Date.now() / 1000);
  const data = [];

  for (const raw of list) {
    const name = String(raw && raw.event_name || "");
    if (!CAPI_ALLOWED_EVENTS[name]) continue;
    const eid = String(raw.event_id || "").slice(0, 100);
    if (!eid) continue; // no event_id means the pixel copy could not be deduped

    let t = Math.floor(Number(raw.event_time) || 0);
    if (!(t > now - 6 * 86400 && t <= now + 60)) t = now;

    // Money comes from the catalogue, never from the caller.
    const ids = Array.isArray(raw.content_ids) ? raw.content_ids.slice(0, 20).map(String) : [];
    const qtyById = {};
    (Array.isArray(raw.contents) ? raw.contents : []).forEach(c => {
      if (!c) return;
      const q = Math.min(MAX_LINE_QTY, Math.max(1, Math.floor(Number(c.quantity) || 1)));
      qtyById[String(c.id)] = q;
    });
    let value = 0;
    const contents = ids.map(id => {
      const p = catalog[id];
      const q = qtyById[id] || 1;
      const price = p && Number(p.price) > 0 ? Number(p.price) : 0;
      value += price * q;
      return { id: id, quantity: q, item_price: price };
    });

    const custom_data = { currency: "DZD", content_type: "product" };
    if (contents.length) { custom_data.contents = contents; custom_data.content_ids = ids; custom_data.num_items = contents.reduce((a, c) => a + c.quantity, 0); }
    if (value > 0) custom_data.value = value;
    else if (name === "Lead") custom_data.value = Number(env.LEAD_VALUE || 0) || undefined;

    data.push({
      event_name: name,
      event_time: t,
      event_id: eid,
      action_source: "website",
      event_source_url: String(raw.event_source_url || "").slice(0, 500) || ("https://" + (env.SITE_HOST || "www.robustedz.store") + "/"),
      user_data,
      custom_data
    });
  }

  if (!data.length) return json({ ok: true, sent: 0 }, 200, cors);

  /* Setting the META_TEST_EVENT_CODE secret makes these events show up in
   * Events Manager > Test events. Delete the secret when you are done — while
   * it is set the events are test traffic and do not count as conversions. */
  const body = { data, access_token: TOKEN };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;

  const send = fetch("https://graph.facebook.com/v21.0/" + PIXEL + "/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(send); else await send;

  return json({ ok: true, sent: data.length }, 200, cors);
}

async function handleIntake(request, env, ctx, cors) {
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Bad JSON" }, 400, cors); }

  // Cap payload size defensively (junk/abuse protection).
  try { if (JSON.stringify(payload).length > 20000) return json({ error: "payload_too_large" }, 413, cors); } catch {}

  if (payload.type === "review") {
    const rp = notifyReviewTelegram(env, payload.review || {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(rp); else await rp;
    return json({ ok: true }, 200, cors);
  }

  // CAPI-only path: server-side Purchase for orders saved client-side (homepage/
  // cart via main.js) WITHOUT re-writing Firestore or re-sending Telegram/email.
  // Deduped against the browser Pixel via event_id "ord_"+id.
  if (payload.capiOnly) {
    const o = payload.order || {};
    o.meta = o.meta || {};
    const cf0 = request.cf || {};
    o.meta.ip = request.headers.get("CF-Connecting-IP") || o.meta.ip || "";
    o.meta.country = o.meta.country || cf0.country || "";
    o.meta.city = o.meta.city || cf0.city || "";
    o.meta.region = o.meta.region || cf0.region || "";
    o.meta.userAgent = o.meta.userAgent || request.headers.get("User-Agent") || "";
    const cp = sendMetaCapi(env, o, payload.id, payload.fb || {}, request);
    if (ctx && ctx.waitUntil) ctx.waitUntil(cp); else await cp;
    return json({ ok: true, capi: true }, 200, cors);
  }

  const order = payload.order || {};
  // Carrier links, payment flags and sync metadata are server-owned.
  for (const key of Object.keys(order))
    if (key.startsWith("ecotrack") || key === "metaPurchaseSentAt") delete order[key];
  const meta = payload.meta || {};

  // Minimal schema validation before persisting.
  if (!order.phone || !PHONE_RE.test(String(order.phone))) return json({ error: "invalid_order_phone", message: "\u0631\u0642\u0645 \u0647\u0627\u062a\u0641 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d" }, 400, cors);
  if (isLazyPhone(order.phone)) return json({ error: "suspicious_phone", message: "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0631\u0642\u0645 \u0647\u0627\u062a\u0641 \u062d\u0642\u064a\u0642\u064a" }, 400, cors);
  if (!order.customer) return json({ error: "missing_fields", message: "\u064a\u0631\u062c\u0649 \u0645\u0644\u0621 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629" }, 400, cors);
  if (!isRealName(order.customer)) return json({ error: "invalid_name", message: "\u0627\u0644\u0631\u062c\u0627\u0621 \u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0627\u0633\u0645 \u0648\u0627\u0644\u0644\u0642\u0628 (\u0643\u0644\u0645\u062a\u0627\u0646 \u0641\u0642\u0637)" }, 400, cors);
  if (!order.wilaya) return json({ error: "missing_wilaya", message: "\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0648\u0644\u0627\u064a\u0629" }, 400, cors);
  if (!order.address || String(order.address).trim().length < 8) return json({ error: "missing_address", message: "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0628\u0634\u0643\u0644 \u0648\u0627\u0636\u062d" }, 400, cors);
  if (!Array.isArray(order.products) || order.products.length === 0) return json({ error: "empty_cart", message: "\u0627\u0644\u0633\u0644\u0629 \u0641\u0627\u0631\u063a\u0629" }, 400, cors);

  // Use one field name from intake through parcel creation. Older orders may
  // still have only `baladiya`, which buildEcotrackPayload handles above.
  order.commune = String(order.commune || order.baladiya || order.municipality || "").trim();

  // Trust the catalogue, not the browser, for every number that leaves here.
  let priceAudit = { notes: [], bulk: false };
  try { priceAudit = await repriceOrder(env, order); }
  catch (e) {
    if (e && ["wilaya_not_served", "delivery_fee_unavailable", "stop_desk_not_available"].includes(e.message))
      return json({ error: e.message, message: "طريقة التوصيل أو الولاية غير متاحة لدى Assil. راجع اختيار التوصيل." }, 400, cors);
  }

  meta.ip = request.headers.get("CF-Connecting-IP") || "";
  const cf = request.cf || {};
  meta.country = cf.country || ""; meta.city = cf.city || ""; meta.region = cf.region || ""; meta.isp = cf.asOrganization || "";
  meta.serverTimestamp = new Date().toISOString();

  // Cooldown: reject a second order from the same phone or IP within COOLDOWN_SECONDS.
  try {
    const sinceIso = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
    const dupPhone = await recentCount(env, "phone", order.phone, sinceIso, 1);
    const dupIp = meta.ip ? await recentCount(env, "meta.ip", meta.ip, sinceIso, 1) : 0;
    if (dupPhone > 0 || dupIp > 0) return json({ error: "too_soon", message: "\u0644\u0642\u062f \u0623\u0631\u0633\u0644\u062a \u0637\u0644\u0628\u0627\u064b \u0644\u0644\u062a\u0648\u060c \u064a\u0631\u062c\u0649 \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631 \u0642\u0644\u064a\u0644\u0627\u064b \u0642\u0628\u0644 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0622\u062e\u0631" }, 429, cors);
  } catch {}

  let watch = { phones: [], ips: [] };
  try { watch = await readWatchlist(env); } catch {}
  const flags = Array.isArray(payload.risk && payload.risk.flags) ? payload.risk.flags.slice() : [];
  // A forged cart is a strong abuse signal — surface it instead of silently fixing it.
  if (priceAudit.notes.length) {
    flags.push({ key: "price_mismatch", level: "red", label: "بيانات سلة معدّلة: " + priceAudit.notes.join(" · ") });
  }
  if (priceAudit.bulk) {
    flags.push({ key: "bulk_qty", level: "yellow", label: "كمية كبيرة — راجعها قبل الشحن" });
  }
  if (order.phone && watch.phones.includes(order.phone)) flags.push({ key: "watchlisted_phone", level: "red", label: "Phone on watchlist" });
  if (meta.ip && watch.ips.includes(meta.ip)) flags.push({ key: "watchlisted_ip", level: "red", label: "IP on watchlist" });

  try {
    const recent = await countRecentByIp(env, meta.ip);
    if (recent >= 3) flags.push({ key: "repeat_ip", level: recent >= 5 ? "red" : "yellow", label: "IP used " + recent + "x / 24h" });
  } catch {}

  const level = flags.some(f => f.level === "red") ? "red" : flags.some(f => f.level === "yellow") ? "yellow" : "green";
  const score = Math.min(100, flags.reduce((a, f) => a + (f.level === "red" ? 60 : 25), 0));
  const risk = { flags, level, score };

  order.meta = meta; order.risk = risk;
  order.fb = payload.fb || {}; // saved so the Purchase can be sent LATER, after you confirm the order
  if (!order.status) order.status = "\u062c\u062f\u064a\u062f";
  if (!order.timestamp) order.timestamp = new Date().toISOString();
  order.createdAt = new Date().toISOString();
  order.ecotrackTracking = order.ecotrackTracking || null; // set later, when the parcel ships

  let id = null;
  try { id = await writeOrder(env, order); }
  catch (e) { return json({ error: "Firestore write failed", detail: String(e) }, 500, cors); }

  // NOTE: the Meta Purchase is NOT sent here anymore. It is sent ONLY after
  // YOU confirm the order (/admin/confirm-ship, /admin/confirm-purchase, or
  // /admin/set-tracking with a "confirmed" status), so fake / cancelled
  // orders never pollute the Purchase signal Meta optimizes on.
  const notify = Promise.allSettled([ notifyTelegram(env, order, id, risk), notifyEmail(env, order, id) ]);
  if (ctx && ctx.waitUntil) ctx.waitUntil(notify); else await notify;

  return json({ id, ref: shortRef(id), risk }, 200, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, cors || {}) });
}

/* ---------- Meta Conversions API (server-side Purchase) ----------
   Fires a server-side "Purchase" event to Meta from the Worker, deduped against
   the browser Pixel via a shared event_id ("ord_" + Firestore order id).
   No-op unless META_PIXEL_ID and META_CAPI_TOKEN secrets are set. */
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hashField(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (!s) return undefined;
  return await sha256Hex(s);
}
function normPhoneE164(p) {
  // Algerian local 0XXXXXXXXX -> 213XXXXXXXXX (digits only, no "+"), per Meta normalization.
  let d = String(p || "").replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("213")) return d;
  if (d.startsWith("0")) return "213" + d.slice(1);
  if (d.length === 9) return "213" + d;
  return d;
}
async function sendMetaCapi(env, order, id, fb, request) {
  try {
    const PIXEL = env.META_PIXEL_ID, TOKEN = env.META_CAPI_TOKEN;
    if (!PIXEL || !TOKEN) return; // not configured yet -> safe no-op
    fb = fb || {};
    const meta = order.meta || {};
    // Fallback: if the browser didn't send fbc, rebuild it from the landing page's fbclid.
    if (!fb.fbc) {
      try {
        const m = String(meta.landingPage || "").match(/[?&]fbclid=([^&#]+)/);
        if (m) fb.fbc = "fb.1." + Date.now() + "." + decodeURIComponent(m[1]);
      } catch (e) {}
    }
    const parts = String(order.customer || "").trim().split(/\s+/).filter(Boolean);
    const first = parts.shift() || "";
    const last = parts.join(" ");

    const user_data = {};
    const e164 = normPhoneE164(order.phone);
    const ph = await hashField(e164); if (ph) user_data.ph = [ph];
    /* The browser pixel sends external_id = the same E.164 phone (analytics.js
     * phoneE164), so sending it here too gives Meta a strong shared key: it
     * lifts Event Match Quality and makes pixel/CAPI dedup more reliable.
     * Both sides must normalise identically or the identity will not match. */
    const ext = await hashField(e164); if (ext) user_data.external_id = [ext];
    const email = String(order.email || "").trim().toLowerCase();
    if (email.includes("@")) { const em = await hashField(email); if (em) user_data.em = [em]; }
    const fn = await hashField(first); if (fn) user_data.fn = [fn];
    const ln = await hashField(last); if (ln) user_data.ln = [ln];
    const ct = await hashField(meta.city); if (ct) user_data.ct = [ct];
    const st = await hashField(order.wilaya || meta.region); if (st) user_data.st = [st];
    const co = await hashField(meta.country || "dz"); if (co) user_data.country = [co];
    const ip = meta.ip || (request && request.headers.get("CF-Connecting-IP")) || ""; if (ip) user_data.client_ip_address = ip;
    const ua = meta.userAgent || (request && request.headers.get("User-Agent")) || ""; if (ua) user_data.client_user_agent = ua;
    if (fb.fbp) user_data.fbp = fb.fbp;
    if (fb.fbc) user_data.fbc = fb.fbc;

    const products = Array.isArray(order.products) ? order.products : [];
    const contents = products.map(p => ({ id: String(p.id != null ? p.id : (p.name || "")), quantity: p.quantity || 1, item_price: Number(p.price) || 0 }));
    const num_items = products.reduce((a, p) => a + (p.quantity || 1), 0);

    const event = {
      event_name: "Purchase",
      // Use the ORDER time (when the customer actually bought), not the
      // confirmation time — Meta accepts events up to 7 days old and this
      // keeps ad attribution exact.
      event_time: (function () {
        const now = Math.floor(Date.now() / 1000);
        try {
          const t = Math.floor(Date.parse(order.createdAt || order.timestamp || "") / 1000);
          if (t && t <= now && t > now - 6 * 86400) return t;
        } catch (e) {}
        return now;
      })(),
      event_id: "ord_" + id,                 // stable dedup key per order
      action_source: "website",
      event_source_url: fb.event_source_url || ("https://" + (env.SITE_HOST || "www.robustedz.store") + "/product.html"),
      user_data,
      custom_data: {
        currency: "DZD",
        value: Number(order.totalPrice) || 0,
        content_type: "product",
        contents,
        content_ids: contents.map(c => c.id),
        num_items,
        order_id: String(id || "")
      }
    };
    const bodyObj = { data: [event] };
    if (env.META_TEST_EVENT_CODE) bodyObj.test_event_code = env.META_TEST_EVENT_CODE;

    const res = await fetch("https://graph.facebook.com/v19.0/" + PIXEL + "/events?access_token=" + encodeURIComponent(TOKEN), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj)
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); console.error("Meta CAPI HTTP", res.status, t); }
  } catch (e) { console.error("Meta CAPI exception", String(e)); }
}

/* ---------- Google service-account auth (RS256 JWT -> access token) ---------- */
let _token = null, _exp = 0;
async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_token && now < _exp - 60) return _token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600
  }));
  const unsigned = header + "." + claim;
  const key = await importKey(env.FIREBASE_PRIVATE_KEY);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + "." + b64urlBytes(new Uint8Array(sig));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("token: " + JSON.stringify(data));
  _token = data.access_token; _exp = now + (data.expires_in || 3600);
  return _token;
}
async function importKey(pem) {
  const body = (pem || "").replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\\n/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
function b64url(str) { return b64urlBytes(new TextEncoder().encode(str)); }
function b64urlBytes(bytes) {
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------- Firestore REST ---------- */
function baseUrl(env) { return "https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents"; }
async function writeOrder(env, order) {
  const token = await accessToken(env);
  const res = await fetch(baseUrl(env) + "/orders", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(order) })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.name.split("/").pop();
}
async function readWatchlist(env) {
  const token = await accessToken(env);
  const res = await fetch(baseUrl(env) + "/config/watchlist", { headers: { "Authorization": "Bearer " + token } });
  if (!res.ok) return { phones: [], ips: [] };
  const data = await res.json();
  const f = data.fields || {};
  return { phones: decodeArray(f.phones), ips: decodeArray(f.ips) };
}
async function countRecentByIp(env, ip) {
  if (!ip) return 0;
  const token = await accessToken(env);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const q = { structuredQuery: {
    from: [{ collectionId: "orders" }],
    where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "meta.ip" }, op: "EQUAL", value: { stringValue: ip } } },
      { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN", value: { stringValue: since } } }
    ] } }, limit: 50
  } };
  const res = await fetch(baseUrl(env) + ":runQuery", {
    method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(q)
  });
  if (!res.ok) return 0;
  const rows = await res.json();
  return rows.filter(r => r.document).length;
}
// Generic: count recent orders where fieldPath == value and createdAt > sinceIso.
async function recentCount(env, fieldPath, value, sinceIso, limit) {
  if (!value) return 0;
  const token = await accessToken(env);
  const q = { structuredQuery: {
    from: [{ collectionId: "orders" }],
    where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: fieldPath }, op: "EQUAL", value: { stringValue: String(value) } } },
      { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN", value: { stringValue: sinceIso } } }
    ] } }, limit: limit || 5
  } };
  const res = await fetch(baseUrl(env) + ":runQuery", {
    method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(q)
  });
  if (!res.ok) return 0;
  const rows = await res.json();
  return rows.filter(r => r.document).length;
}
function decodeArray(field) {
  if (!field || !field.arrayValue || !field.arrayValue.values) return [];
  return field.arrayValue.values.map(v => v.stringValue).filter(Boolean);
}
function encodeFields(obj) { const out = {}; for (const k in obj) out[k] = encodeValue(obj[k]); return out; }
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v) } };
  return { stringValue: String(v) };
}
/* Decode Firestore REST value shapes back into plain JS (used by tracking lookup). */
/**
 * @param {RobusteRecord} fields
 * @returns {RobusteRecord}
 */
function decodeFields(fields) { const out = {}; for (const k in fields) out[k] = decodeValue(fields[k]); return out; }
function decodeValue(v) {
  if (!v || typeof v !== "object") return v;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

/* ---------- Notifications (unchanged) ---------- */
async function notifyTelegram(env, order, id, risk) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = (order.products || []).map(p => "\u2022 " + esc(p.name) + " \u00d7" + p.quantity + " = " + ((p.price || 0) * (p.quantity || 0)).toLocaleString() + " \u062f\u062c").join("\n");
  const riskLine = risk.level !== "green" ? ("\n\u26a0\ufe0f <b>\u062a\u0646\u0628\u064a\u0647:</b> " + esc(risk.level) + " \u2014 " + risk.flags.map(f => esc(f.label || f.key)).join("\u060c ")) : "";
  const text =
    "\ud83d\udecd <b>\u0637\u0644\u0628 \u062c\u062f\u064a\u062f \u2014 ROBUSTE</b>\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n" +
    (items ? "\ud83d\udce6 <b>\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a:</b>\n" + items + "\n" : "") +
    "\ud83d\udc64 <b>\u0627\u0644\u0627\u0633\u0645:</b> " + esc(order.customer) + "\n\ud83d\udcde <b>\u0627\u0644\u0647\u0627\u062a\u0641:</b> " + esc(order.phone) + "\n" +
    "\ud83d\udccd <b>\u0627\u0644\u0648\u0644\u0627\u064a\u0629:</b> " + esc(order.wilaya) + "\n\ud83c\udfe0 <b>\u0627\u0644\u0639\u0646\u0648\u0627\u0646:</b> " + esc(order.address) + "\n" +
    "\ud83d\udcb0 <b>\u0627\u0644\u0645\u062c\u0645\u0648\u0639:</b> " + Number(order.totalPrice || 0).toLocaleString() + " \u062f\u062c\n" +
    "\ud83c\udf10 <b>IP:</b> " + esc(order.meta && order.meta.ip) + " (" + esc(order.meta && order.meta.country) + ")\n\ud83c\udd94 " + esc(id) + riskLine;
  await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true })
  });
}
async function notifyReviewTelegram(env, review) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let r = Number(review.rating || 0); if (isNaN(r) || r < 1) r = 5; if (r > 5) r = 5;
  let stars = ""; for (let i = 0; i < 5; i++) stars += (i < r ? "\u2b50" : "\u2606");
  const text =
    "\ud83d\udcdd <b>\u062a\u0642\u064a\u064a\u0645 \u062c\u062f\u064a\u062f \u2014 ROBUSTE</b>\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n" +
    "\ud83d\udc64 <b>\u0627\u0644\u0627\u0633\u0645:</b> " + esc(review.name || "-") + "\n" +
    (review.productName ? ("\ud83d\udce6 <b>\u0627\u0644\u0645\u0646\u062a\u062c:</b> " + esc(review.productName) + "\n") : "") +
    "\u2b50 <b>\u0627\u0644\u062a\u0642\u064a\u064a\u0645:</b> " + stars + " (" + r + "/5)\n\ud83d\udcac <b>\u0627\u0644\u0631\u0623\u064a:</b> " + esc(review.comment || "-");
  await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true })
  });
}
async function notifyEmail(env, order, id) {
  if (!env.EMAILJS_SERVICE || !env.EMAILJS_TEMPLATE || !env.EMAILJS_PRIVATE_KEY) return;
  const rows = (order.products || []).map(p => "<div><strong>" + p.name + "</strong> \u00d7" + p.quantity + " = " + ((p.price || 0) * (p.quantity || 0)).toLocaleString() + " \u062f.\u062c</div>").join("");
  await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE, template_id: env.EMAILJS_TEMPLATE,
      user_id: env.EMAILJS_PUBLIC_KEY, accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: {
        order_id: id, customer_name: order.customer, customer_phone: order.phone,
        customer_email: order.email, wilaya: order.wilaya, address: order.address,
        total_price: Number(order.totalPrice || 0).toLocaleString(), payment_method: order.payment,
        order_date: new Date().toLocaleString("ar-DZ"), products: rows
      }
    })
  });
}

/* ROBUSTE / Assil Delivery — documented API Standard extensions.
 * This file is appended to cloudflare-worker.js by the update script, so the
 * deployed Worker remains a single module. No token is exposed to visitors.
 */
const ECO_SYNC_PAGE_SIZE = 15;
const ECO_RELATED_LIMIT = 5;
let ecoReferenceMemory = null;

function ecoNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ecoList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.data)) return value.data;
  return Object.values(value).filter(v => v && typeof v === "object");
}

function ecoPlain(value, max = 255) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function ecoStatusKey(value) {
  return ecoPlain(value).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "_").replace(/^_|_$/g, "");
}

function ecoNormalizeReference(raw) {
  const wilayas = ecoList(raw.wilayas).map(w => {
    const code = resolveWilayaCode(w.wilaya_id || w.code_wilaya || w.id);
    const known = WILAYAS.find(x => x[0] === code);
    return { code, name: ecoPlain(w.wilaya_name || w.name || (known && known[1])),
      arabic: known ? known[2] : "" };
  }).filter(w => w.code);
  const active = new Set(wilayas.map(w => w.code));
  const communes = ecoList(raw.communes).map(c => ({
    wilaya: resolveWilayaCode(c.wilaya_id || c.code_wilaya),
    name: ecoPlain(c.nom || c.commune || c.name),
    postal: ecoPlain(c.code_postal || c.postal_code, 12),
    stopDesk: c.has_stop_desk === true || Number(c.has_stop_desk) === 1
  })).filter(c => c.wilaya && c.name && (!active.size || active.has(c.wilaya)));
  const desksRaw = [];
  if (raw.desks && raw.desks.my_desk) {
    const d = raw.desks.my_desk;
    desksRaw.push(Object.assign({ name: d.hub_name }, d.location || {}, {
      working_hours: d.working_hours
    }));
  }
  if (raw.desks && raw.desks.other_desks) desksRaw.push(...ecoList(raw.desks.other_desks));
  else if (!raw.desks || !raw.desks.my_desk) desksRaw.push(...ecoList(raw.desks));
  const seen = new Set();
  const desks = desksRaw.map(d => ({
    wilaya: resolveWilayaCode(d.code_wilaya || d.wilaya_id || d.wilaya),
    name: ecoPlain(d.name || d.hub_name),
    commune: ecoPlain(d.commune),
    address: ecoPlain(d.adresse || d.address),
    phone: ecoPlain(d.phone, 30),
    map: /^https:\/\//i.test(String(d.map || "")) ? ecoPlain(d.map, 1500) : "",
    hours: Array.isArray(d.working_hours) ? d.working_hours.slice(0, 7) : []
  })).filter(d => {
    const key = d.wilaya + ":" + ecoStatusKey(d.name) + ":" + ecoStatusKey(d.commune);
    if (!d.wilaya || !d.commune || seen.has(key) || (active.size && !active.has(d.wilaya))) return false;
    seen.add(key); return true;
  });
  const fees = {};
  // "echnage" is the spelling in the published Postman example.
  const groups = { delivery: ["livraison", "delivery"], exchange: ["echange", "echnage"],
    pickup: ["pickup"], recovery: ["recouvrement"], return: ["retours", "retour"] };
  for (const [type, aliases] of Object.entries(groups)) {
    const table = aliases.map(k => raw.fees && raw.fees[k]).find(Boolean);
    for (const row of ecoList(table)) {
      const code = resolveWilayaCode(row.wilaya_id || row.code_wilaya);
      if (!code || (active.size && !active.has(code))) continue;
      fees[code] = fees[code] || {};
      fees[code][type] = { home: ecoNumber(row.tarif), office: ecoNumber(row.tarif_stopdesk) };
    }
  }
  return { fetchedAt: raw.fetchedAt, wilayas, communes, desks, fees,
    available: { wilayas: !raw.wilayas_error && raw.wilayas != null,
      communes: !raw.communes_error && raw.communes != null,
      desks: !raw.desks_error && raw.desks != null,
      fees: !raw.fees_error && raw.fees != null },
    errors: Object.keys(raw).filter(k => k.endsWith("_error")).map(k => k.replace("_error", "")) };
}

async function ecoReference(env, fresh = false) {
  const scope = await sha256Hex((env.ECOTRACK_API_URL || "") + "|" + (env.ECOTRACK_TOKEN || ""));
  const now = Date.now();
  if (!fresh && ecoReferenceMemory && ecoReferenceMemory.scope === scope &&
      now - ecoReferenceMemory.at < 3600000) return ecoReferenceMemory.value;
  const key = new Request("https://robuste-reference.invalid/ecotrack-v2/" + scope);
  const edge = typeof caches !== "undefined" ?
    /** @type {CacheStorage & { default?: Cache }} */ (caches).default || null : null;
  if (!fresh && edge) {
    try {
      const hit = await edge.match(key);
      if (hit) {
        const value = await hit.json();
        if (now - Date.parse(value.fetchedAt) < 3600000) {
          ecoReferenceMemory = { scope, at: Date.parse(value.fetchedAt), value };
          return value;
        }
      }
    } catch {}
  }
  const raw = { fetchedAt: new Date().toISOString() };
  for (const [name, route] of [["wilayas", "get/wilayas"], ["communes", "get/communes"],
    ["desks", "get/desks"], ["fees", "get/fees"]]) {
    try { raw[name] = await ecoCall(env, route); }
    catch (e) { raw[name] = null; raw[name + "_error"] = ecoPlain(e.message, 180); }
  }
  const value = ecoNormalizeReference(raw);
  if (value.available.fees && value.available.wilayas) {
    ecoReferenceMemory = { scope, at: now, value };
    if (edge) {
      try { await edge.put(key, new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" }
      })); } catch {}
    }
  }
  return value;
}

function ecoQuote(ref, wilaya, type = 1, stopDesk = 0) {
  const code = resolveWilayaCode(wilaya);
  const group = ({ 1: "delivery", 2: "exchange", 3: "pickup", 4: "recovery" })[type];
  const rows = ref && ref.fees && ref.fees[code];
  const table = rows && rows[group];
  const mode = stopDesk ? "office" : "home";
  return { wilaya: code, type: group, service: table ? table[mode] : null,
    returnFee: rows && rows.return ? rows.return[mode] : null,
    fetchedAt: ref && ref.fetchedAt };
}

function ecoValidateDestination(ref, payload) {
  if (ref.available.wilayas && !ref.wilayas.some(w => w.code === payload.code_wilaya))
    throw new Error("wilaya_not_served");
  if (ref.available.communes && ref.communes.length) {
    const match = ref.communes.some(c => c.wilaya === payload.code_wilaya &&
      ecoStatusKey(c.name) === ecoStatusKey(payload.commune));
    const deskMatch = payload.stop_desk && ref.desks.some(d => d.wilaya === payload.code_wilaya &&
      ecoStatusKey(d.commune) === ecoStatusKey(payload.commune));
    if (!match && !deskMatch) throw new Error("commune_not_served");
  }
  if (payload.stop_desk && ref.available.desks && ref.available.communes) {
    const available = ref.desks.some(d => d.wilaya === payload.code_wilaya &&
      ecoStatusKey(d.commune) === ecoStatusKey(payload.commune)) ||
      ref.communes.some(c => c.wilaya === payload.code_wilaya && c.stopDesk &&
        ecoStatusKey(c.name) === ecoStatusKey(payload.commune));
    if (!available) throw new Error("stop_desk_not_available");
  }
}

async function ecoPublicReference(env, cors) {
  try {
    const ref = await ecoReference(env);
    const fees = {};
    for (const [code, row] of Object.entries(ref.fees)) {
      if (row.delivery) fees[code] = { delivery: row.delivery };
    }
    return json({ ok: ref.available.fees && ref.available.wilayas,
      pricesEnabled: env.ECOTRACK_LIVE_DELIVERY_PRICES !== "false", fetchedAt: ref.fetchedAt,
      wilayas: ref.wilayas, communes: ref.communes, desks: ref.desks, fees,
      available: ref.available }, 200, Object.assign({}, cors, { "Cache-Control": "public, max-age=300" }));
  } catch { return json({ ok: false, error: "delivery_reference_unavailable" }, 503, cors); }
}

function ecoEventTime(a) {
  const date = ecoPlain(a.date || a.created_at || a.event_date, 50);
  return a.time && !date.includes("T") && !date.includes(" ") ? date + "T" + ecoPlain(a.time, 20) : date;
}

function ecoPaymentState(status, timeline) {
  if (/^(retour|return|annul|cancel)/.test(ecoStatusKey(status))) return "return_review";
  const keys = [status, ...timeline.map(a => a.activity || a.status)].map(ecoStatusKey);
  if (keys.some(k => ["payed", "paid", "paye_et_archive", "paiement_archive", "paiements_archives"].includes(k)))
    return "paid_reported";
  if (keys.some(k => ["encaissed", "encaisse", "encaisse_non_paye", "livre_encaisse_non_paye",
    "paiements_prets", "paiement_pret"].includes(k))) return "collected_unpaid";
  if (keys.some(k => ["livred", "livre", "livre_non_encaisse", "delivered"].includes(k))) return "delivered_uncollected";
  return "unknown";
}

function ecoDraftState(status) {
  const key = ecoStatusKey(status);
  if (["prete_a_expedier", "pret_a_expedier", "prete_a_preparer", "pret_a_preparer"].includes(key)) return "draft";
  if (!key) return "unknown";
  return "locked";
}

function ecoStageFor(status, timeline) {
  const key = ecoStatusKey(status);
  const explicit = {
    prete_a_expedier: ["preparing", "قيد التحضير"], pret_a_expedier: ["preparing", "قيد التحضير"],
    prete_a_preparer: ["preparing", "قيد التحضير"], en_preparation_stock: ["preparing", "قيد التحضير"],
    stock_en_preparation: ["preparing", "قيد التحضير"],
    en_ramassage: ["in_transit", "في الطريق"], vers_hub: ["in_transit", "في الطريق"],
    en_hub: ["in_transit", "في الطريق"], vers_wilaya: ["in_transit", "في الطريق"],
    en_preparation: ["in_transit", "في الطريق"], en_livraison: ["out_for_delivery", "خرج للتوصيل"],
    suspendu: ["delayed", "التوصيل معلّق"], suspendus: ["delayed", "التوصيل معلّق"],
    annule: ["cancelled", "ملغى"], cancelled: ["cancelled", "ملغى"], canceled: ["cancelled", "ملغى"],
    refused: ["refused", "رفض الاستلام"]
  };
  if (explicit[key]) return { stage: explicit[key][0], label: explicit[key][1] };
  if (/^retour|^return/.test(key)) {
    const received = /recu|received|archive|stock$/.test(key);
    return { stage: received ? "returned" : "returning", label: received ? "مرتجع" : "قيد الإرجاع" };
  }
  if (["paid_reported", "collected_unpaid", "delivered_uncollected"].includes(ecoPaymentState(status, timeline)))
    return { stage: "delivered", label: "تم التسليم" };
  const events = timeline.filter(t => {
    const k = ecoStatusKey(t.activity || t.status);
    return k !== "notification_on_order" && k !== "remarque";
  });
  const last = events[0];
  const raw = status && key !== "notification_on_order" ? status : (last && last.status) || "";
  if (!raw && !last) return { stage: "unknown", label: "الحالة غير متاحة" };
  const machine = ecoStatusKey((last && (last.activity || last.status)) || raw);
  if (!ECOTRACK_ACTIVITY_STAGES[machine] && !/prepar|ramass|hub|transit|transport|livraison|livr|deliver|ship|pick|dispatch|return|retour|cancel|annul|refus|suspend|delay|توصيل|تسليم|شحن|تحضير|مرتجع|إرجاع|رفض/i.test(raw))
    return { stage: "unknown", label: "الحالة غير متاحة" };
  return mapEcotrackStatus(raw, last ? last.activity || (ECOTRACK_ACTIVITY_STAGES[machine] ? machine : "") : machine);
}

function ecoAttention(status, timeline, stage, previous) {
  const key = ecoStatusKey(status);
  if (stage === "returned" || stage === "delivered" || stage === "cancelled") return "";
  if (stage === "refused") return "رفض العميل الاستلام";
  if (stage === "returning") return "طلب أو مسار إرجاع يحتاج متابعة";
  if (stage === "delayed" || /suspend/.test(key)) return "توصيل معلّق";
  const latest = timeline[0];
  const detail = latest && [latest.status, latest.reason, latest.details].join(" ");
  if (/refus|رفض/i.test(detail || "")) return "رفض العميل الاستلام";
  if (/ne r[eé]pond|absent|لا يرد|غائب/i.test(detail || "")) return "العميل غير متاح — راجع ملاحظات الناقل";
  if (latest && ecoStatusKey(latest.activity || latest.status) === "attempt_delivery") return "محاولة توصيل — راجع التحديثات";
  const firstShipped = previous && (previous.ecotrackValidatedAt || previous.validatedAt);
  if (firstShipped && Date.now() - Date.parse(firstShipped) > 7 * 86400000)
    return "الشحنة مفتوحة منذ أكثر من 7 أيام — هذا تنبيه محلي وليس تأخيراً مؤكداً من الناقل";
  return "";
}

function ecoSyncSnapshot(parcel, live, now) {
  const timeline = (live.timeline || []).slice(0, 40);
  const payment = live.paymentState || ecoPaymentState(live.rawStatus || "", timeline);
  const state = ecoStageFor(live.rawStatus || "", timeline);
  const fields = {
    ecotrackRawStatus: live.rawStatus || "",
    ecotrackStage: state.stage,
    ecotrackStageLabel: state.label,
    ecotrackTimeline: timeline,
    ecotrackLastSyncedAt: now,
    ecotrackSyncError: null,
    ecotrackNeedsAttention: ecoAttention(live.rawStatus, timeline, state.stage, parcel)
  };
  if (payment !== "unknown") fields.ecotrackPaymentState = payment;
  const draft = ecoDraftState(live.rawStatus);
  if (draft === "locked" && !["cancelled", "unknown"].includes(state.stage)) fields.ecotrackValidated = true;
  const canonical = { preparing: "قيد التحضير", in_transit: "تم الشحن",
    out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم",
    returning: "قيد الإرجاع", delayed: "التوصيل معلّق", refused: "رفض الاستلام",
    returned: "مرتجع", cancelled: "ملغى" };
  if (canonical[state.stage] && !(draft === "draft" && state.stage === "preparing"))
    fields.status = canonical[state.stage];
  return fields;
}

/** @returns {Promise<RobusteRecord | null>} */
async function ecoDocument(env, collection, id) {
  const token = await accessToken(env);
  const res = await fetch(baseUrl(env) + "/" + collection + "/" + encodeURIComponent(id),
    { headers: { Authorization: "Bearer " + token } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("database_lookup_failed");
  const document = await res.json();
  return Object.assign(decodeFields(document.fields || {}), { _firestoreUpdateTime: document.updateTime || null });
}

async function ecoPatchDocument(env, collection, id, fields, updateTime = null) {
  const token = await accessToken(env);
  const mask = Object.keys(fields).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const condition = updateTime ? "&currentDocument.updateTime=" + encodeURIComponent(updateTime) : "";
  const res = await fetch(baseUrl(env) + "/" + collection + "/" + encodeURIComponent(id) + "?" + mask + condition, {
    method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(fields) })
  });
  if (!res.ok) throw new Error("database_save_failed");
}

async function ecoCommitOrders(env, patches) {
  if (!patches.length) return;
  const token = await accessToken(env);
  const writes = patches.map(p => ({
    update: { name: "projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/orders/" + p.id,
      fields: encodeFields(p.fields) },
    updateMask: { fieldPaths: Object.keys(p.fields) },
    currentDocument: p.updateTime ? { updateTime: p.updateTime } : { exists: true }
  }));
  const res = await fetch(baseUrl(env) + ":commit", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
  if (!res.ok) throw new Error("sync_database_commit_failed");
}

async function ecoTrackedPage(env, cursor) {
  const query = { from: [{ collectionId: "orders" }],
    where: { fieldFilter: { field: { fieldPath: "ecotrackTracking" }, op: "GREATER_THAN", value: { stringValue: "" } } },
    orderBy: [{ field: { fieldPath: "ecotrackTracking" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: ECO_SYNC_PAGE_SIZE };
  if (cursor && cursor.tracking && cursor.id) query.startAt = {
    values: [{ stringValue: cursor.tracking },
      { referenceValue: "projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/orders/" + cursor.id }],
    before: false
  };
  const token = await accessToken(env);
  const res = await fetch(baseUrl(env) + ":runQuery", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: query })
  });
  if (!res.ok) throw new Error("sync_query_failed");
  return (await res.json()).filter(r => r.document).map(r =>
    Object.assign(decodeFields(r.document.fields || {}), { id: r.document.name.split("/").pop(),
      _firestoreUpdateTime: r.document.updateTime || null }));
}

async function ecoNotifyChanges(env, changes) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !changes.length) return;
  for (let offset = 0; offset < changes.length; offset += 12) {
    const messages = changes.slice(offset, offset + 12).map(c => c.tracking + " · " +
      ecoPlain(c.label, 60) + (c.attention ? "\n" + ecoPlain(c.attention, 120) : ""));
    const res = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: "ROBUSTE / Assil Delivery\n" + messages.join("\n\n") })
    });
    const data = await res.json();
    if (!res.ok || data.ok !== true) throw new Error("shipment_alert_failed");
    if (offset + 12 < changes.length) await new Promise(r => setTimeout(r, 1300));
  }
}

async function ecoSyncOrders(env, orders, notify = true) {
  const codes = [...new Set(orders.flatMap(o => [o.ecotrackTracking,
    ...(o.ecotrackRelatedParcels || []).filter(p => !p.deletedAt).map(p => p.tracking)])
    .filter(c => typeof c === "string" && /^[A-Za-z0-9_-]+$/.test(c)))];
  if (codes.length > 100) throw new Error("sync_batch_too_large");
  const live = codes.length ? await ecotrackTrackings(env, codes) : {};
  if (codes.length && !Object.keys(live).length) throw new Error("tracking_unavailable");
  const patches = [], alerts = [], results = [];
  const now = new Date().toISOString();
  for (const order of orders) {
    const fields = {};
    const targets = [{ parcel: order, code: order.ecotrackTracking, primary: true },
      ...(order.ecotrackRelatedParcels || []).map(p => ({ parcel: p, code: p.tracking, primary: false }))];
    const related = (order.ecotrackRelatedParcels || []).map(p => Object.assign({}, p));
    for (const target of targets) {
      if (!target.code || target.parcel.deletedAt) continue;
      const one = live[target.code];
      if (!one) { results.push({ id: order.id, tracking: target.code, ok: false, error: "no_live_status" }); continue; }
      const snapshot = ecoSyncSnapshot(target.parcel, one, now);
      // Unknown/empty carrier payloads must not replace a known state.
      if (snapshot.ecotrackStage === "unknown") {
        results.push({ id: order.id, tracking: target.code, ok: false, error: "unknown_live_status" }); continue;
      }
      const changed = target.parcel.ecotrackStage !== snapshot.ecotrackStage ||
        target.parcel.ecotrackNeedsAttention !== snapshot.ecotrackNeedsAttention ||
        (snapshot.ecotrackPaymentState && target.parcel.ecotrackPaymentState !== snapshot.ecotrackPaymentState);
      const signature = [target.code, snapshot.ecotrackStage, snapshot.ecotrackNeedsAttention,
        snapshot.ecotrackPaymentState || target.parcel.ecotrackPaymentState || "unknown"].join("|");
      if (notify && target.parcel.ecotrackAlertSignature !== signature &&
        (snapshot.ecotrackNeedsAttention || ["delivered", "returning", "returned", "refused", "delayed"].includes(snapshot.ecotrackStage))) {
        alerts.push({ tracking: target.code, label: snapshot.ecotrackStageLabel,
          attention: snapshot.ecotrackNeedsAttention, signature, id: order.id, primary: target.primary });
      }
      if (target.primary) Object.assign(fields, snapshot);
      else Object.assign(related.find(p => p.tracking === target.code), snapshot);
      results.push({ id: order.id, tracking: target.code, ok: true, stage: snapshot.ecotrackStage, changed });
    }
    if (related.length) fields.ecotrackRelatedParcels = related;
    if (Object.keys(fields).length) patches.push({ id: order.id, fields, updateTime: order._firestoreUpdateTime });
  }
  await ecoCommitOrders(env, patches);
  let notificationError = null;
  if (notify && alerts.length) {
    try {
      await ecoNotifyChanges(env, alerts);
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        // Mark notifications only AFTER Telegram accepted them; failures retry.
        const marks = [];
        for (const groupId of [...new Set(alerts.map(a => a.id))]) {
          const latest = await getOrderById(env, groupId);
          if (!latest) continue;
          const primary = alerts.find(a => a.id === groupId && a.primary);
          const patch = {};
          if (primary) patch.ecotrackAlertSignature = primary.signature;
          const relatedAlerts = alerts.filter(a => a.id === groupId && !a.primary);
          if (relatedAlerts.length) patch.ecotrackRelatedParcels = (latest.ecotrackRelatedParcels || []).map(p => {
            const alert = relatedAlerts.find(a => a.tracking === p.tracking);
            return alert ? Object.assign({}, p, { ecotrackAlertSignature: alert.signature }) : p;
          });
          marks.push({ id: groupId, fields: patch, updateTime: latest._firestoreUpdateTime });
        }
        await ecoCommitOrders(env, marks);
      }
    }
    catch (e) { notificationError = ecoPlain(e.message); }
  }
  return { ok: results.every(r => r.ok), checked: codes.length,
    changed: results.filter(r => r.changed).length, results, notificationError };
}

async function ecoHandleSync(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const ids = [...new Set(Array.isArray(body.ids) ? body.ids : [])];
  if (!ids.length || ids.length > ECO_SYNC_PAGE_SIZE || ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id)))
    return json({ error: "invalid_ids", max: ECO_SYNC_PAGE_SIZE }, 400, cors);
  try {
    const orders = [];
    for (const id of ids) {
      const order = await getOrderById(env, id);
      if (order && order.ecotrackTracking) orders.push(order);
    }
    return json(await ecoSyncOrders(env, orders, true), 200, cors);
  } catch (e) { return json({ error: "sync_failed", detail: ecoPlain(e.message) }, 502, cors); }
}

async function ecoScheduledSync(env) {
  if (!env.ECOTRACK_API_URL || !env.ECOTRACK_TOKEN) return { skipped: "not_configured" };
  if (env.ECOTRACK_SYNC_ENABLED === "false") return { skipped: "disabled" };
  /** @type {RobusteRecord} */
  const state = await ecoDocument(env, "config", "ecotrackSync") || {};
  const orders = await ecoTrackedPage(env, state.cursor);
  if (!orders.length) {
    await ecoPatchDocument(env, "config", "ecotrackSync", { cursor: null,
      completedAt: new Date().toISOString(), lastError: null });
    return { checked: 0, cycleComplete: true };
  }
  // Do not advance the cursor when carrier reads or database writes fail.
  const result = await ecoSyncOrders(env, orders, true);
  const last = orders[orders.length - 1];
  await ecoPatchDocument(env, "config", "ecotrackSync", {
    cursor: orders.length < ECO_SYNC_PAGE_SIZE ? null : { tracking: last.ecotrackTracking, id: last.id },
    lastRunAt: new Date().toISOString(), lastChecked: result.checked,
    lastError: result.ok ? null : "some_tracking_statuses_missing",
    lastNotificationError: result.notificationError
  });
  return result;
}

async function ecoHandleHealth(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  try {
    const state = await ecoDocument(env, "config", "ecotrackSync");
    return json({ ok: true, scheduler: state || null, cronRequired: true,
      telegramConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
      enabled: env.ECOTRACK_SYNC_ENABLED !== "false",
      limits: { manualBatch: ECO_SYNC_PAGE_SIZE, trackings: 100 } }, 200, cors);
  } catch { return json({ error: "health_read_failed" }, 502, cors); }
}

function ecoTarget(order, tracking) {
  if (!tracking || tracking === order.ecotrackTracking)
    return { parcel: order, tracking: order.ecotrackTracking, primary: true };
  const parcel = (order.ecotrackRelatedParcels || []).find(p => p.tracking === tracking && !p.deletedAt);
  if (!parcel) throw new Error("parcel_not_linked_to_order");
  return { parcel, tracking, primary: false };
}

async function ecoSaveTarget(env, order, target, patch) {
  if (target.primary) return updateOrderFields(env, order.id, patch, order._firestoreUpdateTime);
  const related = (order.ecotrackRelatedParcels || []).map(p =>
    p.tracking === target.tracking ? Object.assign({}, p, patch) : p);
  return updateOrderFields(env, order.id, { ecotrackRelatedParcels: related }, order._firestoreUpdateTime);
}

function ecoAudit(parcel, action, detail) {
  return [...(Array.isArray(parcel.ecotrackAudit) ? parcel.ecotrackAudit : []).slice(-29),
    { at: new Date().toISOString(), action, detail: ecoPlain(detail) }];
}

async function ecoRemoteOrder(env, tracking) {
  const result = await ecoCall(env, "get/orders", { params: { tracking } });
  const rows = Array.isArray(result) ? result : ecoList(result && result.data);
  return rows.find(row => String(row.tracking) === tracking) || null;
}

async function ecoAssertDraft(env, target) {
  if (target.parcel.ecotrackValidated) throw new Error("parcel_already_dispatched");
  const remote = await ecoRemoteOrder(env, target.tracking);
  // Absence can mean archived, unavailable or wrong tenant; never assume editable.
  if (!remote || ecoDraftState(remote.status) !== "draft") throw new Error("parcel_not_confirmed_as_draft");
  return remote;
}

function ecoUpdateFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("invalid_fields");
  const allowed = ["reference", "client", "tel", "tel2", "adresse", "code_postal",
    "commune", "wilaya", "montant", "remarque", "product", "boutique",
    "type", "stop_desk", "fragile", "gps_link"];
  const out = {};
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const v = fields[key];
    if (["wilaya", "montant", "type", "stop_desk", "fragile"].includes(key)) {
      const n = ecoNumber(v);
      if (n == null) throw new Error("invalid_" + key);
      if (key === "wilaya" && (!Number.isInteger(n) || n < 1 || n > 58)) throw new Error("invalid_wilaya");
      if (key === "type" && ![1, 2, 3, 4].includes(n)) throw new Error("invalid_type");
      if (["stop_desk", "fragile"].includes(key) && ![0, 1].includes(n)) throw new Error("invalid_" + key);
      out[key] = n;
    } else {
      const text = ecoPlain(v, key === "gps_link" ? 1500 : 255);
      if (["client", "adresse", "commune", "tel"].includes(key) && !text) throw new Error("missing_" + key);
      if (["tel", "tel2"].includes(key) && text && !PHONE_RE.test(text)) throw new Error("invalid_" + key);
      if (key === "gps_link" && text && !/^https:\/\//i.test(text)) throw new Error("invalid_gps_link");
      out[key] = text;
    }
  }
  if (!Object.keys(out).length) throw new Error("no_fields");
  return out;
}

async function ecoReserveAction(env, key, orderId, type) {
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(key)) throw new Error("invalid_action_id");
  const token = await accessToken(env);
  const res = await fetch(baseUrl(env) + "/ecotrackActions?documentId=" + encodeURIComponent(key), {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields({ orderId, type, state: "pending", at: new Date().toISOString() }) })
  });
  if (res.status === 409) {
    const old = await ecoDocument(env, "ecotrackActions", key);
    if (!old || old.orderId !== orderId || old.type !== type) throw new Error("action_id_conflict");
    if (old.state === "rejected") {
      // Only explicit carrier rejections can be retried automatically.
      await ecoPatchDocument(env, "ecotrackActions", key,
        { state: "pending", retryAt: new Date().toISOString() }, old._firestoreUpdateTime);
      return null;
    }
    return old;
  }
  if (!res.ok) throw new Error("action_reservation_failed");
  return null;
}

async function ecoCreateRelated(env, order, body) {
  const type = Number(body.type);
  if (![2, 3].includes(type)) throw new Error("only_exchange_or_pickup");
  if (!order.ecotrackTracking) throw new Error("source_parcel_required");
  const related = order.ecotrackRelatedParcels || [];
  if (related.length >= ECO_RELATED_LIMIT) throw new Error("related_parcel_limit");
  const overrides = Object.assign({}, body.fields || {}, { type });
  const payload = buildEcotrackPayload(order, overrides);
  const ref = await ecoReference(env);
  ecoValidateDestination(ref, payload);
  const quote = ecoQuote(ref, payload.code_wilaya, type, payload.stop_desk);
  const key = ecoPlain(body.actionId, 100);
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(key)) throw new Error("invalid_action_id");
  payload.reference = "RB-" + order.id.slice(-12) + "-" + key.slice(-12);
  const old = await ecoReserveAction(env, key, order.id, type);
  if (old) {
    if (!old.tracking) throw new Error("action_pending_reconciliation");
    const exists = related.some(p => p.tracking === old.tracking);
    if (!exists && old.parcel) await updateOrderFields(env, order.id,
      { ecotrackRelatedParcels: [...related, old.parcel] }, order._firestoreUpdateTime);
    return { ok: true, tracking: old.tracking, already: true };
  }
  // A failed/ambiguous POST must be reconciled; never blindly retry creation.
  let created;
  try { created = await ecotrackCreateOrder(env, payload); }
  catch (e) {
    if (e.safeToRetry) await ecoPatchDocument(env, "ecotrackActions", key,
      { state: "rejected", failure: ecoPlain(e.message, 180) });
    throw e;
  }
  const parcel = { tracking: created.tracking, ecotrackType: type, ecotrackValidated: false,
    ecotrackPayload: payload, ecotrackStage: "preparing", ecotrackStageLabel: "قيد التحضير",
    ecotrackPaymentState: "unknown", ecotrackServiceFeeEstimate: quote.service,
    ecotrackReturnFeeEstimate: quote.returnFee, ecotrackTariffFetchedAt: quote.fetchedAt,
    totalPrice: payload.montant, wilaya: payload.code_wilaya,
    customer: payload.nom_client, phone: payload.telephone, commune: payload.commune,
    address: payload.adresse, deliveryType: payload.stop_desk ? "office" : "home",
    createdAt: new Date().toISOString(), actionId: key };
  try { await ecoPatchDocument(env, "ecotrackActions", key, { state: "created", tracking: created.tracking, parcel }); }
  catch { return { ok: false, error: "parcel_created_action_save_failed", tracking: created.tracking,
    reference: payload.reference, detail: "Parcel created at Assil; reconcile before retrying." }; }
  try {
    const latest = await getOrderById(env, order.id);
    if (!latest || (latest.ecotrackRelatedParcels || []).length >= ECO_RELATED_LIMIT)
      throw new Error("related_parcel_limit");
    await updateOrderFields(env, order.id,
      { ecotrackRelatedParcels: [...(latest.ecotrackRelatedParcels || []), parcel] }, latest._firestoreUpdateTime);
  }
  catch { return { ok: false, error: "parcel_created_save_failed", tracking: created.tracking,
    detail: "Retry with the same actionId to link the already-created parcel; do not create another." }; }
  return { ok: true, tracking: created.tracking };
}

async function ecoHandleParcelAction(request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const id = ecoPlain(body.id, 100);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);
  try {
    const order = await getOrderById(env, id);
    if (!order) return json({ error: "order_not_found" }, 404, cors);
    if (body.action === "create-related") return json(await ecoCreateRelated(env, order, body), 200, cors);
    const target = ecoTarget(order, body.tracking);
    if (!target.tracking || !/^[A-Za-z0-9_-]+$/.test(target.tracking)) throw new Error("invalid_tracking");
    const params = { tracking: target.tracking };
    let data;
    /** @type {RobusteRecord} */
    let patch = {};
    if (body.action === "update") {
      await ecoAssertDraft(env, target);
      const fields = ecoUpdateFields(body.fields);
      const saved = target.parcel.ecotrackPayload || buildEcotrackPayload(order, {});
      const destination = { code_wilaya: fields.wilaya || saved.code_wilaya,
        commune: fields.commune || saved.commune,
        stop_desk: fields.stop_desk == null ? saved.stop_desk : fields.stop_desk };
      const ref = await ecoReference(env);
      ecoValidateDestination(ref, destination);
      data = await ecoCall(env, "update/order", { method: "POST", params: Object.assign(params, fields) });
      const payload = Object.assign({}, saved);
      const map = { client: "nom_client", tel: "telephone", tel2: "telephone_2",
        wilaya: "code_wilaya", product: "produit" };
      for (const [key, value] of Object.entries(fields)) payload[map[key] || key] = value;
      patch.ecotrackPayload = payload;
      const quote = ecoQuote(ref, payload.code_wilaya, payload.type, payload.stop_desk);
      Object.assign(patch, { ecotrackType: payload.type, ecotrackServiceFeeEstimate: quote.service,
        ecotrackReturnFeeEstimate: quote.returnFee, ecotrackTariffFetchedAt: quote.fetchedAt });
      // Do not rewrite the original purchase/customer data to match an after-sales parcel.
      if (target.primary) {
        if (fields.client != null) patch.customer = fields.client;
        if (fields.tel != null) patch.phone = fields.tel;
        if (fields.adresse != null) patch.address = fields.adresse;
        if (fields.commune != null) patch.commune = patch.baladiya = fields.commune;
        if (fields.wilaya != null) patch.wilaya = WILAYAS.find(w => w[0] === fields.wilaya)[2];
        if (fields.montant != null) patch.ecotrackCodAmount = fields.montant;
        if (fields.stop_desk != null) patch.deliveryType = fields.stop_desk ? "office" : "home";
      } else {
        Object.assign(patch, { customer: payload.nom_client, phone: payload.telephone,
          address: payload.adresse, commune: payload.commune, wilaya: payload.code_wilaya,
          totalPrice: payload.montant, deliveryType: payload.stop_desk ? "office" : "home" });
      }
    } else if (body.action === "delete") {
      if (body.confirm !== true) throw new Error("confirmation_required");
      await ecoAssertDraft(env, target);
      data = await ecoCall(env, "delete/order", { method: "DELETE", params });
      if (target.primary) {
        patch = { ecotrackTracking: null, ecotrackValidated: false, ecotrackValidatedAt: null,
          ecotrackStage: null, ecotrackStageLabel: null, ecotrackRawStatus: null,
          ecotrackTimeline: [], ecotrackPaymentState: "unknown", ecotrackPayload: null,
          ecotrackCodAmount: null, ecotrackNeedsAttention: "", status: "مؤكد",
          ecotrackDeletedDraftTracking: target.tracking, ecotrackDeletedDraftAt: new Date().toISOString() };
      } else patch = { deletedAt: new Date().toISOString(), ecotrackStage: "cancelled", ecotrackStageLabel: "مسودة محذوفة" };
    } else if (body.action === "dispatch") {
      if (body.confirm !== true) throw new Error("confirmation_required");
      data = await ecoCall(env, "valid/order", { method: "POST", params });
      patch = { ecotrackValidated: true, ecotrackValidatedAt: new Date().toISOString() };
    } else if (body.action === "note") {
      const content = ecoPlain(body.content);
      if (!content) throw new Error("empty_note");
      data = await ecoCall(env, "add/maj", { method: "POST", params: Object.assign(params, { content }) });
    } else if (body.action === "request-return") {
      if (body.confirm !== true) throw new Error("confirmation_required");
      data = await ecoCall(env, "ask/for/order/return", { method: "POST", params });
      // A request is not an accepted return and may be ignored by the courier.
      patch.ecotrackReturnRequestedAt = new Date().toISOString();
    } else if (body.action === "receive-return") {
      if (body.confirmPhysicalReceipt !== true) throw new Error("physical_receipt_confirmation_required");
      data = await ecoCall(env, "valid/returns", { method: "POST", body: { trackings: [target.tracking] } });
      if (!data || data.returned !== "success") throw new Error("no_eligible_return");
      patch.ecotrackReturnReceivedAt = new Date().toISOString();
    } else throw new Error("unknown_action");
    if (!data || (body.action !== "receive-return" && data.success !== true && data.success !== 1))
      throw new Error("courier_did_not_confirm_action");
    patch.ecotrackAudit = ecoAudit(target.parcel, body.action, body.content || target.tracking);
    try { await ecoSaveTarget(env, order, target, patch); }
    catch { return json({ ok: false, error: "courier_updated_save_failed", action: body.action,
      tracking: target.tracking, detail: "Action completed at Assil; reconcile locally before retrying." }, 502, cors); }
    return json({ ok: true, action: body.action, tracking: target.tracking,
      message: ecoPlain(data.message), patch }, 200, cors);
  } catch (e) {
    const error = ecoPlain(e.message, 220);
    const conflict = /draft|dispatched|reconciliation|conflict|pending/.test(error);
    return json({ error: "parcel_action_failed", detail: error }, conflict ? 409 : 400, cors);
  }
}

async function ecoHandleHistory(url, request, env, cors) {
  if (!(await adminOk(request, env))) return json({ error: "unauthorized" }, 401, cors);
  const id = ecoPlain(url.searchParams.get("id"), 100);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);
  try {
    const order = await getOrderById(env, id);
    if (!order) return json({ error: "order_not_found" }, 404, cors);
    const target = ecoTarget(order, url.searchParams.get("tracking"));
    if (!target.tracking || !/^[A-Za-z0-9_-]+$/.test(target.tracking)) throw new Error("invalid_tracking");
    const result = { ok: true, tracking: target.tracking, history: null, notes: [], order: null, errors: [] };
    for (const [key, path] of [["history", "get/tracking/info"], ["notes", "get/maj"], ["order", "get/orders"]]) {
      try { result[key] = await ecoCall(env, path, { params: { tracking: target.tracking } }); }
      catch { result.errors.push(key); }
    }
    const remote = result.order && ecoList(result.order.data || result.order)
      .find(row => String(row.tracking) === target.tracking);
    if (remote) {
      const patch = { ecotrackActualServiceFee: ecoNumber(remote.tarif_prestation),
        ecotrackActualReturnFee: ecoNumber(remote.tarif_retour),
        ecotrackPaymentReference: remote.payment_id == null ? null : String(remote.payment_id),
        ecotrackReturnReference: remote.return_id == null ? null : String(remote.return_id),
        ecotrackFeeCheckedAt: new Date().toISOString() };
      await ecoSaveTarget(env, order, target, patch);
      result.parcelPatch = patch;
    }
    return json(result, 200, cors);
  } catch (e) { return json({ error: "history_failed", detail: ecoPlain(e.message) }, 502, cors); }
}