// Run with Playwright installed, or ROBUSTE_PLAYWRIGHT_PATH pointing to its package.
// All Firebase, Worker, courier and external requests are replaced by fixtures.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ROBUSTE_PLAYWRIGHT_PATH || 'playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const browser = await chromium.launch({ headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  ...(process.env.ROBUSTE_BROWSER_PATH ? { executablePath: process.env.ROBUSTE_BROWSER_PATH } : {}) });
const reference = {
  ok: true, fetchedAt: new Date().toISOString(), wilayas: [{ code: 19, name: 'Sétif', arabic: 'سطيف' }, { code: 16, name: 'Alger', arabic: 'الجزائر' }],
  communes: [{ wilaya: 19, name: 'El Eulma', stopDesk: false }, { wilaya: 19, name: 'Setif', stopDesk: true }, { wilaya: 16, name: 'Alger Centre', stopDesk: true }],
  desks: [{ wilaya: 19, name: 'Setif Desk', commune: 'Setif', address: 'Desk address' }],
  fees: { 19: { delivery: { home: 550, office: 350 }, exchange: { home: 950, office: 550 }, pickup: { home: 450, office: 300 } }, 16: { delivery: { home: 500, office: 300 } } },
  available: { wilayas: true, communes: true, desks: true, fees: true }
};
const base = { customer: 'عميل تجريبي', phone: '0551234567', wilaya: 'سطيف', commune: 'El Eulma', address: 'Home address', deliveryType: 'home',
  totalPrice: 6550, deliveryFee: 550, products: [{ id: 1, name: 'منتج تجريبي', quantity: 1, price: 6000 }], createdAt: new Date().toISOString() };
const initial = {
  new: { ...base, customer: 'طلب جديد', status: 'جديد' },
  ready: { ...base, customer: 'طلب جاهز', status: 'مؤكد' },
  draft: { ...base, customer: 'مسودة تجريبية', status: 'مؤكد', ecotrackTracking: 'ECO_DRAFT', ecotrackStage: 'preparing', ecotrackValidated: false,
    ecotrackPayload: { nom_client: 'مسودة تجريبية', telephone: base.phone, code_wilaya: 19, commune: base.commune, adresse: base.address, montant: 6550, type: 1, stop_desk: 0 } },
  active: { ...base, customer: 'شحنة في الطريق', status: 'تم الشحن', ecotrackTracking: 'ECO_ACTIVE', ecotrackStage: 'in_transit', ecotrackStageLabel: 'في الطريق', ecotrackValidated: true, ecotrackNeedsAttention: 'راجع ملاحظات الناقل' },
  paid: { ...base, customer: 'شحنة مسلّمة', status: 'تم التسليم', ecotrackTracking: 'ECO_PAID', ecotrackStage: 'delivered', ecotrackStageLabel: 'تم التسليم', ecotrackValidated: true, ecotrackPaymentState: 'paid_reported', ecotrackActualServiceFee: 0 },
  orphan: { ...base, customer: 'طرد مرتبط', status: 'مؤكد', ecotrackTracking: null, ecotrackRelatedParcels: [{ tracking: 'ECO_PICKUP', ecotrackType: 3, ecotrackStage: 'in_transit', ecotrackValidated: true, totalPrice: 0, createdAt: new Date().toISOString() }] }
};

async function fixture(width = 1360, partial = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), calls = [], pageErrors = [], dialogs = [];
  let rejectSave = false;
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('dialog', async d => { dialogs.push(d.type()); await d.accept(); });
  await page.addInitScript(({ initial }) => {
    window.__orders = structuredClone(initial);
    const listeners = [];
    window.__emit = () => listeners.forEach(fn => fn({ forEach(cb) { Object.entries(window.__orders).forEach(([id, data]) => cb({ id, data: () => structuredClone(data) })); } }));
    const user = { email: 'anescareer@gmail.com', getIdToken: async () => 'offline-id-token' };
    const auth = { currentUser: user, onAuthStateChanged(fn) { setTimeout(() => fn(user), 0); }, signOut: async () => {}, signInWithEmailAndPassword: async () => ({ user }) };
    const db = { collection(name) { return {
      onSnapshot(fn) { listeners.push(fn); setTimeout(window.__emit, 0); return () => {}; },
      doc(id) { return { get: async () => ({ exists: true, data: () => ({ map: {} }) }), set: async () => {},
        update: async patch => { Object.assign(window.__orders[id], patch); window.__emit(); } }; }
    }; } };
    const firestore = () => db; firestore.FieldValue = { arrayUnion: (...v) => v };
    window.firebase = { apps: [], initializeApp() { this.apps.push({}); }, auth: () => auth, firestore };
    const instances = new WeakMap();
    window.bootstrap = { Modal: class {
      constructor(node) { this.node = typeof node === 'string' ? document.querySelector(node) : node; instances.set(this.node, this); }
      static getInstance(node) { return instances.get(node); }
      static getOrCreateInstance(node) { return instances.get(node) || new this(node); }
      show() { this.node.style.display = 'block'; this.node.classList.add('show'); document.body.classList.add('modal-open'); this.node.dispatchEvent(new Event('shown.bs.modal')); }
      hide() { this.node.style.display = 'none'; this.node.classList.remove('show'); document.body.classList.remove('modal-open'); this.node.dispatchEvent(new Event('hidden.bs.modal')); }
    } };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.__copied = text; } } });
  }, { initial });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.hostname.endsWith('workers.dev')) {
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      calls.push({ path, body, headers: request.headers() });
      let result = { ok: true }, status = 200;
      if (path.endsWith('/reference')) result = partial ? { ...reference, communes: [], available: { ...reference.available, communes: false } } : reference;
      else if (path.endsWith('/health')) result = { ok: true, telegramConfigured: true, scheduler: { lastRunAt: new Date().toISOString() } };
      else if (path.endsWith('/history')) result = { ok: true, history: { activity: [{ status: 'picked', date: '2026-10-04' }] }, notes: [], errors: [], parcelPatch: { ecotrackActualServiceFee: 0 } };
      else if (path.endsWith('/label')) { await route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); return; }
      else if (path.endsWith('/confirm-ship')) {
        const patch = { ecotrackTracking: 'ECO_CREATED', ecotrackStage: 'preparing', ecotrackValidated: false,
          ecotrackPayload: body, ecotrackCodAmount: body.montant };
        await page.evaluate(({ id, patch }) => { Object.assign(window.__orders[id], patch); window.__emit(); }, { id: body.id, patch });
        result = { ok: true, tracking: 'ECO_CREATED', status: 'مؤكد' };
      } else if (path.endsWith('/sync')) result = { ok: true, changed: 0, checked: body.ids.length, results: body.ids.map(id => ({ id, ok: true })) };
      else if (path.endsWith('/parcel')) {
        let patch = {};
        if (body.action === 'update') patch = { ecotrackCodAmount: body.fields.montant, customer: body.fields.client };
        if (body.action === 'dispatch') patch = { ecotrackValidated: true, ecotrackValidatedAt: new Date().toISOString() };
        if (body.action === 'request-return') patch = { ecotrackReturnRequestedAt: new Date().toISOString() };
        if (rejectSave) { status = 502; result = { error: 'courier_updated_save_failed', courierApplied: true, tracking: body.tracking, patch }; }
        else {
          if (body.action !== 'create-related' && body.action !== 'note') await page.evaluate(({ id, patch }) => { Object.assign(window.__orders[id], patch); window.__emit(); }, { id: body.id, patch });
          result = { ok: true, patch, tracking: body.action === 'create-related' ? 'ECO_EXCHANGE' : body.tracking };
        }
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) }); return;
    }
    if (url.hostname === 'robuste.test') {
      const file = resolve(root, '.' + decodeURIComponent(path));
      if (!file.startsWith(root + '\\') && !file.startsWith(root + '/')) throw new Error('Invalid fixture path');
      try {
        const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' }[extname(file)] || 'application/octet-stream';
        await route.fulfill({ contentType: mime, body: readFileSync(file) });
      } catch { await route.fulfill({ status: 404, body: '' }); }
      return;
    }
    if (path.includes('bootstrap.rtl.min.css')) await route.fulfill({ contentType: 'text/css', body: readFileSync(resolve(root, 'bootstrap.rtl.min.css')) });
    else await route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' });
  });
  await page.goto('http://robuste.test/admin.html');
  await page.waitForSelector('#sec-dashboard .dash');
  return { page, context, calls, pageErrors, dialogs, rejectSave() { rejectSave = true; } };
}

let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
try {
  const f = await fixture(), { page } = f;
  await check('all main sections render without runtime errors', async () => {
    for (const name of ['orders', 'shipping', 'ecotrack', 'settlement', 'products', 'fake', 'settings']) {
      await page.locator('.sidebar [data-sec="' + name + '"]').click();
      assert.ok((await page.locator('#sec-' + name).innerText()).trim().length);
    }
    assert.deepEqual(f.pageErrors, []);
  });
  await page.locator('.sidebar [data-sec="ecotrack"]').click();
  await check('draft filter exposes primary handover and hides return requests', async () => {
    await page.locator('[data-filter="draft"]').click();
    assert.equal(await page.locator('[data-action="dispatch"]').count(), 1);
    assert.equal(await page.locator('[data-action="request-return"]').count(), 0);
  });
  await check('cancel and physical handover confirmation behave correctly', async () => {
    await page.locator('[data-action="dispatch"]').click();
    await page.locator('.eco-dialog [type="submit"]').click();
    assert.equal(f.calls.filter(c => c.body?.action === 'dispatch').length, 0);
    await page.locator('.eco-dialog input[name="confirm"]').check();
    await page.locator('.eco-dialog [type="submit"]').click();
    await page.waitForSelector('.eco-modal-layer', { state: 'detached' });
    assert.equal(f.calls.filter(c => c.body?.action === 'dispatch').length, 1);
    assert.equal(await page.locator('[data-action="dispatch"]').count(), 0);
  });
  await check('search and single-order refresh include an orphan related parcel', async () => {
    await page.locator('[data-filter="all"]').click();
    await page.locator('#ecoSearch').fill('ECO_PICKUP');
    await page.waitForTimeout(350);
    await page.locator('.eco-more summary').click();
    await page.locator('[data-action="sync"]').click();
    await page.waitForFunction(() => document.querySelector('#sec-ecotrack').textContent.includes('تم تحديث حالات هذا الطلب'));
    assert.deepEqual(f.calls.filter(c => c.path.endsWith('/sync')).at(-1).body.ids, ['orphan']);
  });
  await check('finance filter accepts Firebase timestamps', async () => {
    await page.evaluate(() => { window.__orders.paid.createdAt = { seconds: Math.floor(Date.now() / 1000) }; window.__emit(); });
    await page.locator('[data-tab="finance"]').click();
    await page.locator('#ecoSearch').fill(''); await page.waitForTimeout(350);
    await page.locator('#ecoPeriod').selectOption('7');
    assert.ok((await page.locator('#sec-ecotrack').innerText()).includes('ECO_PAID'));
  });
  await check('shipping review restores home address after desk selection', async () => {
    await page.locator('.sidebar [data-sec="shipping"]').click();
    await page.locator('tr[data-id="ready"] .ship-btn').click();
    await page.locator('.eco-dialog [name="stop_desk"]').selectOption('1');
    await page.locator('.eco-dialog [name="commune"]').selectOption('Setif');
    assert.equal(await page.locator('.eco-dialog [name="adresse"]').inputValue(), 'Desk address');
    await page.locator('.eco-dialog [name="stop_desk"]').selectOption('0');
    assert.equal(await page.locator('.eco-dialog [name="adresse"]').inputValue(), 'Home address');
    await page.locator('.eco-dialog [name="tel"]').fill('+213 551 234 567');
    await page.locator('.eco-dialog [type="submit"]').click();
    await page.waitForSelector('.eco-modal-layer', { state: 'detached' });
    await page.waitForFunction(() => window.__orders.ready.ecotrackTracking === 'ECO_CREATED');
    assert.equal(f.calls.find(c => c.path.endsWith('/confirm-ship')).body.telephone, '0551234567');
  });
  await check('shipping search remains usable while typing', async () => {
    await page.locator('#shipSearch').fill('ECO_CREATED');
    assert.equal(await page.locator('tr[data-tracking]').count(), 1);
    assert.equal(await page.locator('#shipSearch').inputValue(), 'ECO_CREATED');
  });
  await check('editing a draft rejects negative COD and updates the visible amount immediately', async () => {
    await page.locator('.sidebar [data-sec="ecotrack"]').click();
    await page.locator('[data-tab="parcels"]').click();
    await page.locator('#ecoSearch').fill('ECO_CREATED'); await page.waitForTimeout(350);
    await page.locator('.eco-more summary').click();
    await page.locator('[data-action="update"]').click();
    await page.locator('.eco-dialog [name="montant"]').fill('-1');
    await page.locator('.eco-dialog [type="submit"]').click();
    assert.equal(f.calls.filter(c => c.body?.action === 'update').length, 0);
    await page.locator('.eco-dialog [name="montant"]').fill('7000');
    await page.locator('.eco-dialog [type="submit"]').click();
    await page.waitForSelector('.eco-modal-layer', { state: 'detached' });
    assert.ok((await page.locator('.eco-table').innerText()).replace(/\s/g, '').includes('7000'));
  });
  await check('Pickup defaults to zero COD and keeps its creation reservation', async () => {
    await page.locator('#ecoSearch').fill('ECO_ACTIVE'); await page.waitForTimeout(350);
    await page.locator('.eco-more summary').click();
    await page.locator('[data-action="related"]').click();
    await page.locator('.eco-dialog [name="montant"]').fill('1200');
    await page.locator('.eco-dialog [name="type"]').selectOption('3');
    assert.equal(await page.locator('.eco-dialog [name="montant"]').inputValue(), '0');
    assert.equal(await page.locator('.eco-dialog [name="produit_a_recuperer"]').isVisible(), false);
    await page.locator('.eco-dialog [type="submit"]').click();
    await page.waitForSelector('.eco-modal-layer', { state: 'detached' });
    const call = f.calls.find(c => c.body?.action === 'create-related');
    assert.equal(call.body.fields.montant, 0); assert.equal(call.body.type, 3); assert.ok(call.body.actionId);
  });
  await check('confirmed purchase uses the signed-in session without admin-key prompts', async () => {
    await page.locator('.sidebar [data-sec="orders"]').click();
    await page.locator('#sec-orders [data-id="new"] [data-qa="confirm"]').click();
    await page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/admin/confirm-purchase'), { timeout: 12000 });
    assert.ok(!f.dialogs.includes('prompt'));
    const call = f.calls.find(c => c.path.endsWith('/confirm-purchase'));
    assert.ok(call); assert.equal(call.headers.authorization, 'Bearer offline-id-token');
  });
  mkdirSync(resolve(root, 'reviews'), { recursive: true });
  await page.locator('.sidebar [data-sec="ecotrack"]').click();
  await page.locator('[data-tab="parcels"]').click();
  await page.locator('#ecoSearch').fill(''); await page.waitForTimeout(350);
  await page.evaluate(() => { document.querySelector('#ecoSearch').blur(); document.querySelector('#rbToastBox')?.remove(); });
  await page.screenshot({ path: resolve(root, 'reviews/admin-desktop.png'), fullPage: true, animations: 'disabled' });
  await check('a courier-applied failure blocks repeating the same modal action', async () => {
    f.rejectSave();
    await page.locator('#ecoSearch').fill('ECO_CREATED'); await page.waitForTimeout(350);
    await page.locator('[data-action="dispatch"]').click();
    await page.locator('.eco-dialog [name="confirm"]').check();
    await page.locator('.eco-dialog [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('.eco-dialog [data-error]')?.hidden === false);
    assert.ok(await page.locator('.eco-dialog [type="submit"]').isDisabled());
    await page.locator('.eco-dialog [data-close]').first().click();
  });
  assert.deepEqual(f.pageErrors, []);
  await f.context.close();

  const mobile = await fixture(390, true);
  await mobile.page.locator('#bottomNav [data-sec="ecotrack"]').click();
  await check('mobile parcel cards fit the page width', async () => {
    assert.equal(await mobile.page.locator('.eco-table:has([data-label]) thead').isVisible(), false);
    assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  });
  await check('partial reference outage keeps an editable shipping review', async () => {
    await mobile.page.locator('#bottomNav [data-sec="shipping"]').click();
    await mobile.page.locator('tr[data-id="ready"] .ship-btn').click();
    assert.ok(await mobile.page.locator('.eco-dialog [name="commune"] option').count() > 1);
    assert.ok(await mobile.page.locator('.eco-dialog .eco-warning').isVisible());
    await mobile.page.locator('.eco-dialog [data-close]').first().click();
  });
  await mobile.page.locator('#bottomNav [data-sec="ecotrack"]').click();
  await mobile.page.screenshot({ path: resolve(root, 'reviews/admin-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(mobile.pageErrors, []);
  await mobile.context.close();
  console.log(checks + ' browser workflow checks passed. No live requests were sent.');
} finally { await browser.close(); }
