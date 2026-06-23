/* ROBUSTE — Cloudflare Worker: secure order intake (Phase 3).
 * Receives {order, meta, risk} from the storefront, enriches with the REAL client
 * IP + geolocation, checks the watchlist, computes server-side risk, writes the
 * order to Firestore via a service account, and notifies Telegram + EmailJS using
 * server-side secrets (so no token ever ships to the browser).
 *
 * Worker secrets / vars to set (dashboard or `wrangler secret put`):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   EMAILJS_SERVICE, EMAILJS_TEMPLATE, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY (optional)
 *   ALLOWED_ORIGIN  e.g. https://www.yourdomain.com
 */

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    let payload;
    try { payload = await request.json(); } catch { return json({ error: "Bad JSON" }, 400, cors); }

    // Review notifications: token-free client relays here instead of calling Telegram directly.
    if (payload.type === "review") {
      const rp = notifyReviewTelegram(env, payload.review || {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(rp); else await rp;
      return json({ ok: true }, 200, cors);
    }

    const order = payload.order || {};
    const meta = payload.meta || {};

    // 1) Real IP + geo from the edge (client cannot spoof these)
    meta.ip = request.headers.get("CF-Connecting-IP") || "";
    const cf = request.cf || {};
    meta.country = cf.country || "";
    meta.city = cf.city || "";
    meta.region = cf.region || "";
    meta.isp = cf.asOrganization || "";
    meta.serverTimestamp = new Date().toISOString();

    // 2) Watchlist check (flags only — never blocks, per your choice)
    let watch = { phones: [], ips: [] };
    try { watch = await readWatchlist(env); } catch {}
    const flags = Array.isArray(payload.risk && payload.risk.flags) ? payload.risk.flags.slice() : [];
    if (order.phone && watch.phones.includes(order.phone)) flags.push({ key: "watchlisted_phone", level: "red", label: "Phone on watchlist" });
    if (meta.ip && watch.ips.includes(meta.ip)) flags.push({ key: "watchlisted_ip", level: "red", label: "IP on watchlist" });

    // 3) Velocity flag: orders from this IP in the last 24h
    try {
      const recent = await countRecentByIp(env, meta.ip);
      if (recent >= 3) flags.push({ key: "repeat_ip", level: recent >= 5 ? "red" : "yellow", label: "IP used " + recent + "x / 24h" });
    } catch {}

    const level = flags.some(f => f.level === "red") ? "red" : flags.some(f => f.level === "yellow") ? "yellow" : "green";
    const score = Math.min(100, flags.reduce((a, f) => a + (f.level === "red" ? 60 : 25), 0));
    const risk = { flags, level, score };

    order.meta = meta;
    order.risk = risk;
    if (!order.status) order.status = "\u062c\u062f\u064a\u062f";
    if (!order.timestamp) order.timestamp = new Date().toISOString();
    order.createdAt = new Date().toISOString();

    // 4) Persist to Firestore
    let id = null;
    try { id = await writeOrder(env, order); }
    catch (e) { return json({ error: "Firestore write failed", detail: String(e) }, 500, cors); }

    // 5) Notify (best-effort; order already saved)
    const notify = Promise.allSettled([ notifyTelegram(env, order, id, risk), notifyEmail(env, order, id) ]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(notify); else await notify;

    return json({ id, risk }, 200, cors);
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, cors || {}) });
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

/* ---------- Notifications ---------- */
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
