import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import vm from "node:vm";

const source = readFileSync(new URL("../cloudflare-worker.js", import.meta.url), "utf8");
const worker = await import("data:text/javascript;base64," + Buffer.from(source + `
export { ecoNormalizeReference, ecoQuote, ecoDraftState, ecoPaymentState,
  ecoStageFor, ecoUpdateFields, ecoValidateDestination, ecoSyncSnapshot,
  ecoSyncOrders, ecoScheduledSync, ecoCreateRelated, getOrderById,
  ecotrackTrackings, encodeFields, decodeFields, repriceOrder };
`).toString("base64"));
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});
const referenceRaw = {
  fetchedAt: "2026-09-30T10:00:00Z",
  wilayas: [{ wilaya_id: 19, wilaya_name: "Sétif" }, { wilaya_id: 16, wilaya_name: "Alger" },
    { wilaya_id: 14, wilaya_name: "Tiaret" }],
  communes: {
    0: { nom: "El Eulma", wilaya_id: 19, code_postal: "19600", has_stop_desk: 0 },
    1: { nom: "Setif", wilaya_id: 19, code_postal: "19000", has_stop_desk: 1 },
    2: { nom: "Alger Centre", wilaya_id: 16, has_stop_desk: 1 },
    3: { nom: "Tiaret", wilaya_id: 14, has_stop_desk: 0 }
  },
  desks: {
    my_desk: { hub_name: "Station Sétif", location: { wilaya: "Sétif", commune: "Setif", adresse: "Station address" } },
    other_desks: [{ name: "Station Alger", code_wilaya: "16", commune: "Alger Centre", adresse: "Desk address" }]
  },
  fees: {
    livraison: [{ wilaya_id: 19, tarif: "550", tarif_stopdesk: "350" },
      { wilaya_id: 16, tarif: "0", tarif_stopdesk: "0" }, { wilaya_id: 14, tarif: "700", tarif_stopdesk: "0" }],
    echnage: [{ wilaya_id: 19, tarif: "950", tarif_stopdesk: "550" }],
    pickup: [{ wilaya_id: 19, tarif: "450", tarif_stopdesk: "300" }],
    retours: [{ wilaya_id: 19, tarif: "200", tarif_stopdesk: "100" }]
  }
};
let fixtureNumber = 0;
function order(extra = {}) {
  return { customer: "Test Customer", phone: "0551234567", wilaya: "سطيف", baladiya: "El Eulma",
    address: "Test address El Eulma", deliveryType: "home", totalPrice: 6500, deliveryFee: 500,
    products: [{ id: 1, name: "Test Product", price: 6000, quantity: 1 }],
    status: "مؤكد", ...extra };
}
function fixture(initial = { "order-1": order({ ecotrackTracking: "ECO_ONE" }) }, options = {}) {
  const env = { FIREBASE_PROJECT_ID: "offline-project", FIREBASE_CLIENT_EMAIL: "offline@example.test",
    FIREBASE_PRIVATE_KEY: privateKey, ADMIN_KEY: "offline-admin-key",
    ECOTRACK_API_URL: "https://assil-fixture-" + (++fixtureNumber) + ".test", ECOTRACK_TOKEN: "offline-api-token" };
  const docs = new Map(), calls = [];
  let tick = 0;
  const time = () => new Date(Date.UTC(2026, 0, 1) + (++tick)).toISOString();
  function set(path, value) { docs.set(path, { value: structuredClone(value), updateTime: time() }); }
  Object.entries(initial).forEach(([id, value]) => set("orders/" + id, value));
  const originalFetch = globalThis.fetch;
  const ctx = { env, docs, calls, remote: {}, live: {}, createCount: 0, telegramCount: 0,
    telegramFailure: false, trackFailure: false, failOrderPatchOnce: false, createRejectOnce: false };
  Object.values(initial).forEach(o => { if (o.ecotrackTracking) {
    ctx.remote[o.ecotrackTracking] = { tracking: o.ecotrackTracking, status: "prete_a_expedier", montant: o.totalPrice };
    ctx.live[o.ecotrackTracking] = { status: "en_livraison", activity: [
      { date: "2026-09-30", time: "10:00:00", status: "dispatched_to_driver" }] };
  } });
  const response = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" }
  });
  const document = (path, entry) => ({ name: "projects/offline-project/databases/(default)/documents/" + path,
    fields: worker.encodeFields(entry.value), updateTime: entry.updateTime });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method || "GET";
    let body = null;
    if (init.body) { try { body = JSON.parse(init.body); } catch { body = String(init.body); } }
    calls.push({ url: String(url), method, body, headers: new Headers(init.headers) });
    if (url.hostname === "oauth2.googleapis.com") return response({ access_token: "offline-access-token", expires_in: 3600 });
    if (url.hostname === "api.telegram.org") {
      ctx.telegramCount++; return response({ ok: !ctx.telegramFailure });
    }
    if (url.origin === env.ECOTRACK_API_URL) {
      const path = url.pathname.replace("/api/v1/", "");
      if (path === "get/wilayas") return response(referenceRaw.wilayas);
      if (path === "get/communes") return response(referenceRaw.communes);
      if (path === "get/desks") return response(referenceRaw.desks);
      if (path === "get/fees") return response(referenceRaw.fees);
      if (path === "get/trackings/info") {
        if (ctx.trackFailure) return response({ message: "Too Many Attempts." }, 429);
        return response(ctx.live);
      }
      if (path === "get/orders") {
        const tracking = url.searchParams.get("tracking");
        return response({ data: ctx.remote[tracking] ? [ctx.remote[tracking]] : [] });
      }
      if (path === "get/tracking/info") return response({ activity: [] });
      if (path === "get/maj") return response([]);
      if (path === "update/order") {
        assert.equal(method, "POST"); return response({ success: true });
      }
      if (path === "delete/order") { assert.equal(method, "DELETE"); return response({ success: true }); }
      if (path === "valid/returns") {
        assert.equal(method, "POST"); assert.ok(Array.isArray(body.trackings));
        return response({ returned: "success" });
      }
      if (path === "ask/for/order/return" || path === "add/maj" || path === "valid/order")
        return response({ success: true, message: "Confirmed by test courier" });
      if (path === "create/order") {
        if (ctx.createRejectOnce) { ctx.createRejectOnce = false; return response({ message: "invalid address" }, 422); }
        ctx.createCount++; return response({ success: true, tracking: "ECO_NEW_" + ctx.createCount });
      }
      throw new Error("Unexpected courier route in offline test: " + path);
    }
    if (url.hostname === "firestore.googleapis.com") {
      const prefix = "/v1/projects/offline-project/databases/(default)/documents";
      const path = decodeURIComponent(url.pathname).slice(prefix.length);
      if (path === ":runQuery") {
        const q = body.structuredQuery, filter = q.where && q.where.fieldFilter;
        let rows = [...docs].filter(([p]) => p.startsWith("orders/"));
        if (filter && filter.field.fieldPath === "ecotrackTracking") rows = rows.filter(([, e]) => typeof e.value.ecotrackTracking === "string" && e.value.ecotrackTracking);
        if (filter && filter.field.fieldPath === "phone") rows = rows.filter(([, e]) => e.value.phone === filter.value.stringValue);
        const byId = q.orderBy && q.orderBy[0].field.fieldPath === "__name__";
        rows.sort(([a, av], [b, bv]) => byId ? a.localeCompare(b) : String(av.value.ecotrackTracking).localeCompare(String(bv.value.ecotrackTracking)) || a.localeCompare(b));
        if (q.startAt) {
          if (byId) {
            const id = q.startAt.values[0].referenceValue.split("/").pop();
            rows = rows.filter(([p]) => p.split("/").pop() > id);
          } else {
            const tracking = q.startAt.values[0].stringValue;
            const id = q.startAt.values[1].referenceValue.split("/").pop();
            rows = rows.filter(([p, e]) => String(e.value.ecotrackTracking) > tracking ||
              e.value.ecotrackTracking === tracking && p.split("/").pop() > id);
          }
        }
        return response(rows.slice(0, q.limit || 100).map(([p, e]) => ({ document: document(p, e) })));
      }
      if (path === ":commit") {
        for (const w of body.writes) {
          const p = w.update.name.split("/documents/")[1], current = docs.get(p);
          if (!current || w.currentDocument.updateTime && current.updateTime !== w.currentDocument.updateTime)
            return response({ error: "precondition failed" }, 409);
        }
        body.writes.forEach(w => {
          const p = w.update.name.split("/documents/")[1];
          set(p, Object.assign({}, docs.get(p).value, worker.decodeFields(w.update.fields)));
        });
        return response({ writeResults: body.writes.map(() => ({ updateTime: time() })) });
      }
      const p = path.replace(/^\//, "");
      if (method === "POST" && p === "ecotrackActions") {
        const id = url.searchParams.get("documentId"), key = p + "/" + id;
        if (docs.has(key)) return response({ error: "ALREADY_EXISTS" }, 409);
        set(key, worker.decodeFields(body.fields)); return response(document(key, docs.get(key)), 201);
      }
      if (method === "GET") return docs.has(p) ? response(document(p, docs.get(p))) : response({}, 404);
      if (method === "PATCH") {
        if (ctx.failOrderPatchOnce && p.startsWith("orders/")) {
          ctx.failOrderPatchOnce = false; return response({ error: "test outage" }, 503);
        }
        const old = docs.get(p);
        const condition = url.searchParams.get("currentDocument.updateTime");
        if (condition && (!old || old.updateTime !== condition)) return response({ error: "precondition failed" }, 409);
        set(p, Object.assign({}, old ? old.value : {}, worker.decodeFields(body.fields)));
        return response(document(p, docs.get(p)));
      }
      throw new Error("Unexpected database request in offline test: " + path + " " + method);
    }
    throw new Error("Network is blocked in offline tests: " + url.hostname);
  };
  ctx.set = set;
  ctx.read = id => docs.get("orders/" + id).value;
  ctx.restore = () => { globalThis.fetch = originalFetch; };
  ctx.action = async body => {
    const req = new Request("https://worker.test/admin/ecotrack/parcel", {
      method: "POST", headers: { "X-Admin-Key": env.ADMIN_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const r = await worker.default.fetch(req, env, { waitUntil() {} });
    return { status: r.status, body: await r.json() };
  };
  ctx.primary = async () => {
    const req = new Request("https://worker.test/admin/confirm-ship", {
      method: "POST", headers: { "X-Admin-Key": env.ADMIN_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "order-1", commune: "El Eulma", stop_desk: 0 })
    });
    const r = await worker.default.fetch(req, env, { waitUntil() {} });
    return { status: r.status, body: await r.json() };
  };
  return ctx;
}

test("GET root preview intentionally returns 405 without contacting the courier", async () => {
  const previousFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async () => {
    outboundCalls++;
    throw new Error("Root preview must not call an external service");
  };
  try {
    const response = await worker.default.fetch(new Request("https://offline-worker.test/"), {}, {});
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { error: "Method not allowed" });
    assert.equal(outboundCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("checkout repricing trusts confirmed commune desk flags, not missing detailed desk addresses", async () => {
  const desks = referenceRaw.desks;
  referenceRaw.desks = { my_desk: desks.my_desk, other_desks: [] };
  const f = fixture();
  try {
    const valid = order({ wilaya: "الجزائر", baladiya: "Alger Centre", deliveryType: "office", deliveryFee: 0, totalPrice: 6000 });
    await worker.repriceOrder(f.env, valid);
    assert.equal(valid.deliveryFee, 0);
    assert.equal(valid.totalPrice, 6000);
    assert.equal(valid.ecotrackRateSource, "live_account_tariff");
    const invalid = order({ baladiya: "El Eulma", deliveryType: "office" });
    await assert.rejects(worker.repriceOrder(f.env, invalid), /stop_desk_not_available/);
  } finally { referenceRaw.desks = desks; f.restore(); }
});

test("reference normalization accepts published shapes and preserves zero tariffs", () => {
  const ref = worker.ecoNormalizeReference(referenceRaw);
  assert.equal(ref.communes.length, 4);
  assert.equal(ref.desks.length, 2);
  assert.equal(ref.fees[19].exchange.home, 950);
  assert.equal(worker.ecoQuote(ref, 16, 1, 0).service, 0);
  assert.equal(worker.ecoQuote(ref, 19, 3, 1).service, 300);
  assert.equal(worker.ecoQuote(ref, 19, 1, 0).returnFee, 200);
});
test("Stop Desk is never silently downgraded to home delivery", () => {
  const ref = worker.ecoNormalizeReference(referenceRaw);
  assert.throws(() => worker.ecoValidateDestination(ref, { code_wilaya: 14, commune: "Tiaret", stop_desk: 1 }), /stop_desk_not_available/);
  assert.doesNotThrow(() => worker.ecoValidateDestination(ref, { code_wilaya: 19, commune: "Setif", stop_desk: 1 }));
});
test("payment lifecycle separates delivered, collected and reported-paid", () => {
  assert.equal(worker.ecoPaymentState("Livre non encaissé", []), "delivered_uncollected");
  assert.equal(worker.ecoPaymentState("encaisse_non_paye", []), "collected_unpaid");
  assert.equal(worker.ecoPaymentState("Paiement archivé", []), "paid_reported");
  assert.equal(worker.ecoPaymentState("", [{ status: "payed" }]), "paid_reported");
  assert.equal(worker.ecoPaymentState("retour_recu", [{ status: "payed" }]), "return_review");
});
test("return status is not misread as delivered; unrecognized status remains unknown", () => {
  assert.equal(worker.ecoStageFor("Retours chez livreur", []).stage, "returning");
  assert.equal(worker.ecoStageFor("Retours reçu", []).stage, "returned");
  assert.equal(worker.ecoStageFor("NOT_A_COURIER_STATUS", []).stage, "unknown");
  assert.equal(worker.ecoStageFor("En livraison", []).stage, "out_for_delivery");
});
test("update uses documented client/tel/wilaya/product names and rejects invalid values", () => {
  const fields = worker.ecoUpdateFields({ client: "Test Customer", tel: "0551234567", wilaya: 19, montant: 0, injected: "ignored" });
  assert.deepEqual(Object.keys(fields), ["client", "tel", "wilaya", "montant"]);
  assert.throws(() => worker.ecoUpdateFields({ stop_desk: 2 }), /invalid_stop_desk/);
  assert.throws(() => worker.ecoUpdateFields({ gps_link: "javascript:alert(1)" }), /invalid_gps_link/);
  assert.throws(() => worker.ecoUpdateFields({ tel: "123" }), /invalid_tel/);
});
test("new admin mutation routes deny anonymous requests without contacting the courier", async () => {
  const f = fixture();
  try {
    const r = await worker.default.fetch(new Request("https://worker.test/admin/ecotrack/parcel", {
      method: "POST", body: JSON.stringify({ id: "order-1", action: "delete" })
    }), f.env, {});
    assert.equal(r.status, 401); assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});
test("draft editing checks live carrier status, not just a local flag", async () => {
  const f = fixture();
  try {
    f.remote.ECO_ONE.status = "en_livraison";
    const r = await f.action({ id: "order-1", action: "update", fields: { montant: 6000 } });
    assert.equal(r.status, 409);
    assert.ok(!f.calls.some(c => c.url.includes("/update/order")));
  } finally { f.restore(); }
});
test("draft deletion is DELETE upstream and keeps the store order", async () => {
  const f = fixture();
  try {
    const r = await f.action({ id: "order-1", action: "delete", confirm: true });
    assert.equal(r.status, 200); assert.equal(f.read("order-1").ecotrackTracking, null);
    assert.equal(f.read("order-1").status, "مؤكد");
    assert.ok(f.docs.has("orders/order-1"));
    assert.ok(f.calls.some(c => c.url.includes("/delete/order") && c.method === "DELETE"));
  } finally { f.restore(); }
});
test("return request records a request without pretending the parcel was returned", async () => {
  const f = fixture({ "order-1": order({ ecotrackTracking: "ECO_ONE", ecotrackStage: "out_for_delivery" }) });
  try {
    const r = await f.action({ id: "order-1", action: "request-return", confirm: true });
    assert.equal(r.status, 200); assert.ok(f.read("order-1").ecotrackReturnRequestedAt);
    assert.equal(f.read("order-1").ecotrackStage, "out_for_delivery");
  } finally { f.restore(); }
});
test("return receipt requires explicit physical confirmation and sends documented JSON", async () => {
  const f = fixture();
  try {
    const blocked = await f.action({ id: "order-1", action: "receive-return" });
    assert.equal(blocked.status, 400);
    assert.ok(!f.calls.some(c => c.url.includes("/valid/returns")));
    const good = await f.action({ id: "order-1", action: "receive-return", confirmPhysicalReceipt: true });
    assert.equal(good.status, 200);
    assert.deepEqual(f.calls.find(c => c.url.includes("/valid/returns")).body, { trackings: ["ECO_ONE"] });
  } finally { f.restore(); }
});
test("related exchange is linked to its parent without creating a duplicate sale", async () => {
  const f = fixture();
  try {
    const sourceOrder = await worker.getOrderById(f.env, "order-1");
    const body = { type: 2, actionId: "exchange-test-action-123", fields: { commune: "El Eulma", montant: 0, stop_desk: 0 } };
    const first = await worker.ecoCreateRelated(f.env, sourceOrder, body);
    const second = await worker.ecoCreateRelated(f.env, await worker.getOrderById(f.env, "order-1"), body);
    assert.equal(first.tracking, second.tracking); assert.equal(f.createCount, 1);
    assert.equal([...f.docs.keys()].filter(p => p.startsWith("orders/")).length, 1);
    assert.equal(f.read("order-1").ecotrackRelatedParcels.length, 1);
    const payload = f.calls.find(c => c.url.includes("/create/order")).body;
    assert.equal(payload.type, 2); assert.equal(payload.montant, 0);
    assert.match(payload.reference, /^RB-order-1-/);
  } finally { f.restore(); }
});
test("primary parcel can be recovered after a database failure without recreating it", async () => {
  const f = fixture({ "order-1": order() });
  try {
    f.failOrderPatchOnce = true;
    const first = await f.primary(); assert.equal(first.status, 502); assert.ok(first.body.tracking);
    const retry = await f.primary();
    assert.equal(retry.status, 200); assert.equal(retry.body.tracking, first.body.tracking);
    assert.equal(f.createCount, 1); assert.equal(f.read("order-1").ecotrackTracking, first.body.tracking);
  } finally { f.restore(); }
});
test("explicitly rejected primary creation is safely retryable", async () => {
  const f = fixture({ "order-1": order() });
  try {
    f.createRejectOnce = true;
    const first = await f.primary(); assert.equal(first.status, 502); assert.equal(first.body.requiresReconciliation, false);
    const second = await f.primary(); assert.equal(second.status, 200); assert.equal(f.createCount, 1);
  } finally { f.restore(); }
});
test("sync persists delivery and payment state without treating notification events as delivery", async () => {
  const f = fixture();
  try {
    f.live.ECO_ONE = { status: "paye_et_archive", activity: [{ date: "2026-09-30", time: "11:20:00", status: "payed" }] };
    const r = await worker.ecoSyncOrders(f.env, [await worker.getOrderById(f.env, "order-1")], false);
    assert.equal(r.changed, 1); assert.equal(f.read("order-1").status, "تم التسليم");
    assert.equal(f.read("order-1").ecotrackPaymentState, "paid_reported");
    assert.equal(f.read("order-1").ecotrackTimeline[0].date, "2026-09-30T11:20:00");
  } finally { f.restore(); }
});
test("failed Telegram delivery is retried and successful alerts are not duplicated", async () => {
  const f = fixture();
  f.env.TELEGRAM_BOT_TOKEN = "offline-telegram"; f.env.TELEGRAM_CHAT_ID = "offline-chat";
  f.live.ECO_ONE = { status: "livre_non_encaisse", activity: [{ date: "2026-09-30", status: "livred" }] };
  try {
    f.telegramFailure = true;
    const first = await worker.ecoSyncOrders(f.env, [await worker.getOrderById(f.env, "order-1")], true);
    assert.equal(first.notificationError, "shipment_alert_failed"); assert.ok(!f.read("order-1").ecotrackAlertSignature);
    f.telegramFailure = false;
    await worker.ecoSyncOrders(f.env, [await worker.getOrderById(f.env, "order-1")], true);
    await worker.ecoSyncOrders(f.env, [await worker.getOrderById(f.env, "order-1")], true);
    assert.equal(f.telegramCount, 2);
  } finally { f.restore(); }
});
test("carrier rate-limit errors stop immediately rather than hammering fallback routes", async () => {
  const f = fixture();
  try {
    f.trackFailure = true;
    await assert.rejects(worker.ecotrackTrackings(f.env, ["ECO_ONE"]), /rate_limited/);
    assert.equal(f.calls.filter(c => c.url.includes("/get/trackings/info")).length, 1);
  } finally { f.restore(); }
});
test("scheduled sync resumes its cursor and covers more than one page", async () => {
  const initial = {};
  for (let i = 0; i < 18; i++) initial["order-" + String(i).padStart(2, "0")] = order({ ecotrackTracking: "ECO_" + String(i).padStart(2, "0") });
  const f = fixture(initial);
  try {
    const a = await worker.ecoScheduledSync(f.env), b = await worker.ecoScheduledSync(f.env);
    assert.equal(a.checked, 15); assert.equal(b.checked, 3);
    assert.equal(f.docs.get("config/ecotrackSync").value.cursor, null);
    assert.ok([...f.docs].filter(([p]) => p.startsWith("orders/")).every(([, e]) => e.value.ecotrackLastSyncedAt));
  } finally { f.restore(); }
});
test("sync preconditions prevent overwriting a concurrently edited order", async () => {
  const f = fixture();
  try {
    const stale = await worker.getOrderById(f.env, "order-1");
    f.set("orders/order-1", { ...f.read("order-1"), customer: "Edited concurrently" });
    await assert.rejects(worker.ecoSyncOrders(f.env, [stale], false), /commit_failed/);
    assert.equal(f.read("order-1").customer, "Edited concurrently");
  } finally { f.restore(); }
});
test("public delivery reference strips exchange/return pricing and never includes token", async () => {
  const f = fixture();
  try {
    const response = await worker.default.fetch(new Request("https://worker.test/delivery/reference"), f.env, {});
    const raw = await response.text(), data = JSON.parse(raw);
    assert.equal(data.ok, true); assert.equal(data.fees[19].delivery.home, 550);
    assert.equal(data.fees[19].exchange, undefined); assert.equal(data.fees[19].return, undefined);
    assert.ok(!raw.includes(f.env.ECOTRACK_TOKEN));
  } finally { f.restore(); }
});
test("report math preserves zero-cost fees and excludes Pickup from COD totals", () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(new URL("../robuste-ecotrack-admin.js", import.meta.url), "utf8"), context);
  const rows = [
    { type: 1, amount: 1000, data: { ecotrackStage: "delivered", ecotrackPaymentState: "paid_reported", ecotrackActualServiceFee: 0 } },
    { type: 3, amount: 5000, data: { ecotrackStage: "delivered", ecotrackPaymentState: "paid_reported" } }
  ];
  const s = context.window.RBEcoAdmin.statistics(rows);
  assert.equal(s.paid, 1000); assert.equal(s.fees, 0); assert.equal(s.missingFees, 1); assert.equal(s.pickupCount, 1);
  assert.ok(context.window.RBEcoAdmin.csvCell("=HYPERLINK(\"bad\")").startsWith('"\'='));
});

test("invalid commune rejects checkout before any order can be persisted", async () => {
  const f = fixture({});
  try {
    const response = await worker.default.fetch(new Request("https://worker.test/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: order({ commune: "Not Served", totalPrice: 1 }) })
    }), f.env, {});
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "commune_not_served");
    assert.ok(!f.calls.some(c => c.method === "POST" && c.url.endsWith("/documents/orders")));
  } finally { f.restore(); }
});

test("related parcels continue scheduled and manual sync after primary draft deletion", async () => {
  const f = fixture({ "order-1": order({ ecotrackTracking: "ECO_ONE",
    ecotrackRelatedParcels: [{ tracking: "ECO_RELATED", ecotrackType: 3 }] }) });
  f.live.ECO_RELATED = { status: "en_livraison" };
  try {
    assert.equal((await f.action({ id: "order-1", action: "delete", confirm: true })).status, 200);
    assert.equal((await worker.ecoScheduledSync(f.env)).checked, 1);
    assert.equal(f.read("order-1").ecotrackRelatedParcels[0].ecotrackStage, "out_for_delivery");
    const req = new Request("https://worker.test/admin/ecotrack/sync", {
      method: "POST", headers: { "X-Admin-Key": f.env.ADMIN_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["order-1"] })
    });
    const response = await worker.default.fetch(req, f.env, {});
    assert.equal((await response.json()).checked, 1);
  } finally { f.restore(); }
});

test("scheduler advances through unlinked orders and migrates its old cursor safely", async () => {
  const initial = {};
  for (let i = 0; i < 60; i++) initial["order-" + String(i).padStart(2, "0")] = order({ ecotrackTracking: null });
  initial["order-60"] = order({ ecotrackTracking: "ECO_LAST" });
  const f = fixture(initial);
  f.set("config/ecotrackSync", { cursor: { tracking: "ECO_OLD", id: "order-60" } });
  try {
    assert.equal((await worker.ecoScheduledSync(f.env)).checked, 0);
    assert.equal(f.docs.get("config/ecotrackSync").value.cursor.id, "order-49");
    assert.equal((await worker.ecoScheduledSync(f.env)).checked, 1);
    assert.equal(f.docs.get("config/ecotrackSync").value.cursor, null);
  } finally { f.restore(); }
});

async function validateBatch(f, tracking = "ECO_ONE") {
  const req = new Request("https://worker.test/admin/ecotrack/validate", {
    method: "POST", headers: { "X-Admin-Key": f.env.ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ ids: ["order-1"], trackings: [tracking] })
  });
  const response = await worker.default.fetch(req, f.env, {});
  return { status: response.status, data: await response.json() };
}

test("batch dispatch validates ownership and never dispatches an unlinked tracking", async () => {
  const f = fixture();
  try {
    const r = await validateBatch(f, "OTHER_PARCEL");
    assert.equal(r.data.ok, false); assert.equal(r.data.validated, 0);
    assert.ok(!f.calls.some(c => c.url.includes("/valid/order")));
  } finally { f.restore(); }
});

test("batch dispatch reports database failure after a successful courier action", async () => {
  const f = fixture(); f.failOrderPatchOnce = true;
  try {
    const r = await validateBatch(f);
    assert.equal(r.data.ok, false); assert.equal(r.data.validated, 0);
    assert.equal(r.data.results[0].courierApplied, true);
    assert.equal(f.read("order-1").ecotrackValidated, undefined);
  } finally { f.restore(); }
});

test("repeating a confirmed dispatch does not call the courier twice", async () => {
  const f = fixture();
  try {
    assert.equal((await validateBatch(f)).data.validated, 1);
    assert.equal((await validateBatch(f)).data.validated, 1);
    assert.equal(f.calls.filter(c => c.url.includes("/valid/order")).length, 1);
  } finally { f.restore(); }
});

test("courier rejection cannot be reported as a successful batch dispatch", async () => {
  const f = fixture(), original = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).includes("/valid/order")
    ? new Response(JSON.stringify({ success: false, message: "Parcel not ready" })) : original(input, init);
  try {
    const r = await validateBatch(f);
    assert.equal(r.data.ok, false); assert.equal(r.data.validated, 0);
    assert.equal(f.read("order-1").ecotrackValidated, undefined);
  } finally { f.restore(); }
});

test("incomplete live communes do not replace usable customer fallback locations", async () => {
  const original = readFileSync(new URL("../robuste-ecotrack-delivery.js", import.meta.url), "utf8");
  const source = original.slice(0, original.lastIndexOf("})();")) +
    "window.setReference = function(data){reference=data;}; window.fetchLive = fetchLive;})();";
  const fallback = { available: { wilayas: true, communes: true, fees: false }, wilayas: [{ code: 19 }],
    communes: [{ wilaya: 19, name: "El Eulma" }], desks: [] };
  const context = { window: {}, document: { readyState: "loading", baseURI: "https://store.test/",
    addEventListener() {}, querySelectorAll() { return []; }, getElementById() { return null; } },
    AbortController, setTimeout() { return 1; }, clearTimeout() {}, sessionStorage: { setItem() {} },
    fetch: async () => new Response(JSON.stringify({ ok: true, wilayas: [{ code: 19 }], communes: [], desks: [],
      available: { wilayas: true, communes: false, fees: true } })) };
  vm.runInNewContext(source, context); context.window.setReference(fallback);
  await context.window.fetchLive();
  assert.equal(context.window.RBEcoDelivery.locationsReady(), true);
  assert.equal(context.window.RBEcoDelivery.communeList(19).length, 1);
});
