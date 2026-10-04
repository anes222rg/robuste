import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The Worker has a default export for Cloudflare. Add named exports only in
// this in-memory test module so the deployed module stays unchanged.
const source = readFileSync(new URL('../cloudflare-worker.js', import.meta.url), 'utf8');
const worker = await import('data:text/javascript;base64,' + Buffer.from(
  source + '\nexport { buildEcotrackPayload, ecotrackCreateOrder, ecotrackTrackings };'
).toString('base64'));

const oldOrder = {
  id: 'order-123',
  customer: 'Amine Bouzid',
  phone: '0551234567',
  wilaya: 'سطيف',
  baladiya: 'العلمة',
  address: 'شارع الاستقلال، العلمة',
  totalPrice: 6500,
  products: [{ name: 'Panineuse', quantity: 1 }]
};

test('an existing baladiya order creates an EcoTrack parcel with its commune', async () => {
  const payload = worker.buildEcotrackPayload(oldOrder, { stop_desk: 0 });
  assert.equal(payload.commune, 'العلمة');
  assert.equal(payload.code_wilaya, 19);
  assert.equal(payload.montant, 6500);

  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ tracking: 'ECO123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const result = await worker.ecotrackCreateOrder({
      ECOTRACK_API_URL: 'https://courier.example',
      ECOTRACK_TOKEN: 'test-token'
    }, payload);
    assert.equal(result.tracking, 'ECO123');
    assert.equal(request.url, 'https://courier.example/api/v1/create/order');
    assert.equal(JSON.parse(request.options.body).commune, 'العلمة');
    assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the admin commune override wins for an older order', () => {
  const payload = worker.buildEcotrackPayload(oldOrder, { commune: 'El Eulma' });
  assert.equal(payload.commune, 'El Eulma');
});

test('the connection check reports an invalid token as a failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: 0, message: 'invalid token' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    const request = new Request('https://worker.example/admin/ecotrack/ping', {
      headers: { 'X-Admin-Key': 'test-admin-key' }
    });
    const response = await worker.default.fetch(request, {
      ADMIN_KEY: 'test-admin-key',
      ECOTRACK_API_URL: 'https://courier.example',
      ECOTRACK_TOKEN: 'invalid'
    }, {});
    assert.equal(response.status, 502);
    assert.equal((await response.json()).ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('live tracking tries another route after an API-level failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const data = calls.length === 1
      ? { success: false, message: 'unsupported route' }
      : { ECO123: { activity: [
        { date: '2026-09-30T10:00:00Z', status: 'En livraison' },
        { date: '2026-10-01T10:00:00Z', status: 'Livré' }
      ] } };
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const result = await worker.ecotrackTrackings({
      ECOTRACK_API_URL: 'https://courier.example',
      ECOTRACK_TOKEN: 'test-token'
    }, ['ECO123']);
    assert.equal(calls.length, 2);
    assert.equal(result.ECO123.stage, 'delivered');
    assert.equal(result.ECO123.timeline[0].status, 'Livré');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
