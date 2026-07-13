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
 *   ADMIN_KEY        long random string; gate for the /admin/* routes (you only)
 */

const PHONE_RE = /^0[5-7][0-9]{8}$/;
const COOLDOWN_SECONDS = 120;

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
      return handleTrack(url, env, cors);
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

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
    return handleIntake(request, env, ctx, cors);
  }
};

/* =========================================================================
   TRACKING  —  GET /track?phone=0XXXXXXXXX
   Privacy note: phone-only lookup means anyone with a valid phone can see
   that order. We therefore return MINIMAL, sanitized data (no full address,
   no email, first name only) and the front-end is rate-limited at the edge.
   ========================================================================= */
async function handleTrack(url, env, cors) {
  const phone = (url.searchParams.get("phone") || "").trim();
  if (!PHONE_RE.test(phone)) return json({ error: "invalid_phone" }, 400, cors);

  let docs = [];
  try { docs = await ordersByPhone(env, phone); }
  catch (e) { return json({ error: "lookup_failed", detail: String(e) }, 500, cors); }

  if (!docs.length) return json({ orders: [] }, 200, cors);

  // Collect tracking numbers that exist, fetch their live EcoTrack status in one call.
  const codes = docs.map(d => d.ecotrackTracking).filter(Boolean);
  const wantDebug = url.searchParams.get("debug") === "1";
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
      stage: liveOne ? liveOne.stage : internalStage(d.status),
      stageLabel: liveOne ? liveOne.label : internalLabel(d.status),
      tracking: code,
      timeline: liveOne ? liveOne.timeline : internalTimeline(d)
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
function adminOk(request, env) {
  return !!env.ADMIN_KEY && request.headers.get("X-Admin-Key") === env.ADMIN_KEY;
}

async function handleAdminOrders(url, request, env, cors) {
  if (!adminOk(request, env)) return json({ error: "unauthorized" }, 401, cors);
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
  if (!adminOk(request, env)) return json({ error: "unauthorized" }, 401, cors);
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
  if (!adminOk(request, env)) return json({ error: "unauthorized" }, 401, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);

  let order;
  try { order = await getOrderById(env, id); }
  catch (e) { return json({ error: "lookup_failed", detail: String(e) }, 500, cors); }
  if (!order) return json({ error: "order_not_found" }, 404, cors);
  if (order.ecotrackTracking) return json({ error: "already_shipped", tracking: order.ecotrackTracking }, 409, cors);

  let payload;
  try { payload = buildEcotrackPayload(order, body); }
  catch (e) { return json({ error: "invalid_parcel", detail: String(e.message || e) }, 400, cors); }

  let created;
  try { created = await ecotrackCreateOrder(env, payload); }
  catch (e) { return json({ error: "ecotrack_create_failed", detail: String(e.message || e) }, 502, cors); }

  const tracking = created.tracking;
  const fields = { ecotrackTracking: tracking, status: (body.status && String(body.status).trim()) || "\u062a\u0645 \u0627\u0644\u062a\u0623\u0643\u064a\u062f" };
  try { await updateOrderFields(env, id, fields); }
  catch (e) { return json({ error: "saved_parcel_but_db_update_failed", tracking, detail: String(e) }, 500, cors); }

  // Shipping a parcel = definitely a REAL order -> make sure the Meta Purchase went out.
  let capi = null;
  try { capi = await fireConfirmedPurchase(env, id, request); } catch (e) { capi = { ok: false, error: String(e) }; }

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
  if (!adminOk(request, env)) return json({ error: "unauthorized" }, 401, cors);
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
  const phone = String(order.phone || "").replace(/\s+/g, "");
  if (!/^0[5-7][0-9]{8}$/.test(phone)) throw new Error("telephone invalide");

  const wilayaRaw = (ov.code_wilaya != null && ov.code_wilaya !== "") ? ov.code_wilaya : order.wilaya;
  const code_wilaya = resolveWilayaCode(wilayaRaw);
  if (!code_wilaya) throw new Error("wilaya non reconnue: \"" + (order.wilaya || "") + "\" (envoyez code_wilaya entre 1 et 58)");

  const commune = String(ov.commune || order.commune || "").trim();
  if (!commune) throw new Error("commune manquante");

  const nom_client = String(order.customer || "").trim();
  if (!nom_client) throw new Error("nom client manquant");

  const adresse = (String(ov.adresse || order.address || "").trim()) || commune;
  const montant = Number(order.totalPrice || 0);
  if (!(montant > 0)) throw new Error("montant invalide");

  const produit = ((Array.isArray(order.products) ? order.products : [])
    .map(p => String(p.name || "") + (p.quantity ? " x" + p.quantity : "")).join(", ") || "Commande").slice(0, 255);

  const payload = {
    nom_client: nom_client.slice(0, 255),
    telephone: phone,
    adresse: adresse.slice(0, 255),
    commune: commune.slice(0, 255),
    code_wilaya,
    montant,
    produit,
    type: Number(ov.type || 1),
    stop_desk: ov.stop_desk != null ? Number(ov.stop_desk) : 0
  };
  const reference = order.id ? String(order.id).slice(-12) : "";
  if (reference) payload.reference = reference;
  if (ov.remarque) payload.remarque = String(ov.remarque).slice(0, 255);
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
  if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 300));
  if (data && data.success === false) throw new Error(data.message || "creation refusee");
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

async function updateOrderFields(env, id, fields) {
  const token = await accessToken(env);
  const masks = Object.keys(fields).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const res = await fetch(baseUrl(env) + "/orders/" + encodeURIComponent(id) + "?" + masks, {
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
  // Try the common path first, then the Noest-style public path as a fallback.
  const candidates = [
    base + "/api/v1/get/trackings/info",
    base + "/api/public/get/trackings/info"
  ];
  let data = null;
  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.ECOTRACK_TOKEN,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ trackings: codes, api_token: env.ECOTRACK_TOKEN })
      });
      const text = await res.text();
      const attempt = { endpoint, status: res.status, body: String(text).slice(0, 1000) };
      if (diag) diag.attempts.push(attempt);
      if (!res.ok) continue;
      try { data = JSON.parse(text); } catch (e) { if (diag) attempt.parseError = String(e); data = null; continue; }
      if (data) break;
    } catch (e) {
      if (diag) diag.attempts.push({ endpoint, error: String(e) });
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
      date: a.date || a.created_at || a.event_date || "",
      status: a.event || a.status || a.activity || a.libelle || ""
    })).filter(t => t.status);
    const lastRaw = timeline.length ? timeline[0].status : (node.status || node.last_status || "");
    const mapped = mapEcotrackStatus(lastRaw);
    out[code] = { stage: mapped.stage, label: mapped.label, timeline };
  }
  return out;
}

/* Map raw EcoTrack status text (FR/AR) to a customer-facing stage + Arabic label. */
function mapEcotrackStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (/livr|livr\u00e9|delivered|\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645/.test(s)) return { stage: "delivered", label: "\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645" };
  if (/retour|returned|\u0625\u0631\u062c\u0627\u0639|\u0631\u0627\u062c\u0639/.test(s)) return { stage: "returned", label: "\u0645\u0631\u062a\u062c\u0639" };
  if (/sortie|out for|en livraison|\u062e\u0631\u062c|\u0644\u0644\u062a\u0648\u0635\u064a\u0644/.test(s)) return { stage: "out_for_delivery", label: "\u062e\u0631\u062c \u0644\u0644\u062a\u0648\u0635\u064a\u0644" };
  if (/transit|achemin|exp\u00e9di|ramass|collect|\u0641\u064a \u0627\u0644\u0637\u0631\u064a\u0642/.test(s)) return { stage: "in_transit", label: "\u0641\u064a \u0627\u0644\u0637\u0631\u064a\u0642" };
  if (/pr\u00eat|ready|prepar|\u062c\u0627\u0647\u0632/.test(s)) return { stage: "preparing", label: "\u0642\u064a\u062f \u0627\u0644\u062a\u062d\u0636\u064a\u0631" };
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
  const meta = payload.meta || {};

  // Minimal schema validation before persisting.
  if (!order.phone || !PHONE_RE.test(String(order.phone))) return json({ error: "invalid_order_phone", message: "\u0631\u0642\u0645 \u0647\u0627\u062a\u0641 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d" }, 400, cors);
  if (isLazyPhone(order.phone)) return json({ error: "suspicious_phone", message: "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0631\u0642\u0645 \u0647\u0627\u062a\u0641 \u062d\u0642\u064a\u0642\u064a" }, 400, cors);
  if (!order.customer) return json({ error: "missing_fields", message: "\u064a\u0631\u062c\u0649 \u0645\u0644\u0621 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629" }, 400, cors);
  if (!isRealName(order.customer)) return json({ error: "invalid_name", message: "\u0627\u0644\u0631\u062c\u0627\u0621 \u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0627\u0633\u0645 \u0648\u0627\u0644\u0644\u0642\u0628 (\u0643\u0644\u0645\u062a\u0627\u0646 \u0641\u0642\u0637)" }, 400, cors);
  if (!order.wilaya) return json({ error: "missing_wilaya", message: "\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0648\u0644\u0627\u064a\u0629" }, 400, cors);
  if (!order.address || String(order.address).trim().length < 8) return json({ error: "missing_address", message: "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0628\u0634\u0643\u0644 \u0648\u0627\u0636\u062d" }, 400, cors);
  if (!Array.isArray(order.products) || order.products.length === 0) return json({ error: "empty_cart", message: "\u0627\u0644\u0633\u0644\u0629 \u0641\u0627\u0631\u063a\u0629" }, 400, cors);

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
    const ph = await hashField(normPhoneE164(order.phone)); if (ph) user_data.ph = [ph];
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
