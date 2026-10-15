// Isolated storefront checks: all order, analytics and courier API calls are mocked.
// Set ROBUSTE_PLAYWRIGHT_PATH if Playwright is not installed locally.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ROBUSTE_PLAYWRIGHT_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..');
const browser = await chromium.launch({ headless:true, channel:'msedge' });
const output = process.env.ROBUSTE_QA_DIR || resolve(root, 'reviews/maxvita');
mkdirSync(output,{recursive:true});
const reference={ok:true,fetchedAt:new Date().toISOString(),wilayas:[{code:19,name:'Sétif',arabic:'سطيف'}],communes:[{wilaya:19,name:'Setif',stopDesk:true},{wilaya:19,name:'El Eulma',stopDesk:false}],desks:[{wilaya:19,name:'Setif Desk',commune:'Setif',address:'Test desk'}],fees:{19:{delivery:{home:550,office:350}}},available:{wilayas:true,communes:true,desks:true,fees:true}};
let checks=0;
async function check(name,fn){await fn();console.log('PASS '+name);checks++;}
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],orders=[];
  let outOfStock=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname==='127.0.0.1'){
      if(outOfStock && u.pathname==='/products.json'){
        const products=JSON.parse(readFileSync(resolve(root,'products.json'),'utf8'));
        products.find(p=>p.id===109).stock=0;
        return route.fulfill({json:products});
      }
      return route.continue();
    }
    if(u.pathname.endsWith('/delivery/reference'))return route.fulfill({json:reference});
    if(req.method()==='POST'){
      const body=req.postDataJSON();
      if(body?.order)orders.push(body.order);
      return route.fulfill({json:{ok:true,id:'TEST-MAXVITA-109'}});
    }
    if(u.pathname.endsWith('bootstrap.bundle.min.js'))return route.fulfill({contentType:'application/javascript',body:readFileSync(resolve(root,'assets/maxvita-ui/bootstrap.bundle.min.js'))});
    if(['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net','i.postimg.cc'].includes(u.hostname))return route.continue();
    return route.fulfill({contentType:'application/javascript',body:''});
  });
  await page.goto('http://127.0.0.1:8093/product-109.html',{waitUntil:'networkidle'});
  await page.waitForSelector('#expressForm');
  await page.evaluate(()=>document.fonts.ready);
  await check('catalog, metadata and hero use product 109 at 3500 DZD',async()=>{
    assert.match(await page.locator('h1').innerText(),/maxVita/);
    const ld=JSON.parse(await page.locator('#product-jsonld').textContent());
    assert.equal(ld.sku,'109');assert.equal(ld.offers.price,'3500.00');assert.equal(ld.mpn,'MAXVITA 600');
    assert.equal(await page.locator('.rb-promo,.rb-stock').count(),0);
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://www.robustedz.store/product-109.html');
  });
  await check('all product assets load and the gallery changes with keyboard',async()=>{
    await page.locator('.thumbnail').nth(1).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#mainProductImg').complete);
    assert.match(await page.locator('#mainProductImg').getAttribute('src'),/in-use/);
    assert.equal(await page.locator('.thumbnail').nth(1).getAttribute('aria-pressed'),'true');
    await page.locator('.thumbnail').first().click();
    const images=await page.locator('img[src*="images/maxvita/"]').evaluateAll(els=>els.filter(e=>e.loading!=='lazy').map(e=>e.complete&&e.naturalWidth>0));
    assert.ok(images.every(Boolean));
  });
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:resolve(output,'desktop-top.png')});
  await page.screenshot({path:resolve(output,'desktop-full.png'),fullPage:true});
  await check('delivery remains separate and totals respond to quantity',async()=>{
    await page.selectOption('#expressWilaya','سطيف');
    await page.selectOption('#expressBaladiya','Setif');
    await page.check('[name=expDeliveryType][value=home]');
    await page.waitForFunction(()=>document.querySelector('#expTotal').textContent.includes('4,050'));
    await page.fill('#expressQty','2');
    assert.match(await page.locator('#expTotal').innerText(),/7,550/);
    await page.fill('#expressQty','1');
    await page.check('[name=expDeliveryType][value=office]');
    assert.match(await page.locator('#expTotal').innerText(),/3,850/);
  });
  await check('cart receives the correct new product and price',async()=>{
    await page.locator('.action-buttons .btn-orange').click();
    const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('robuste_cart')));
    assert.equal(cart[0].id,109);assert.equal(cart[0].price,3500);
  });
  await check('invalid phone cannot submit; valid checkout sends one mocked order',async()=>{
    await page.fill('#expressName','عميل تجريبي');await page.fill('#expressPhone','123');
    await page.check('[name=expDeliveryType][value=home]');
    await page.fill('#expressAddress','عنوان اختبار');
    await page.locator('.btn-submit-express').click();assert.equal(orders.length,0);
    await page.fill('#expressPhone','0551234567');
    await page.fill('#expressQty','21');await page.locator('.btn-submit-express').click();assert.equal(orders.length,0);
    await page.fill('#expressQty','1');
    await page.locator('.btn-submit-express').click();
    await page.waitForFunction(()=>document.body.textContent.includes('TEST-MAXVITA-109'));
    assert.equal(orders.length,1);assert.equal(orders[0].products[0].id,109);assert.equal(orders[0].subtotal,3500);assert.equal(orders[0].deliveryFee,550);assert.equal(orders[0].totalPrice,4050);
  });
  await page.reload({waitUntil:'networkidle'});
  await check('FAQ and mobile sticky CTA work without horizontal overflow',async()=>{
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.mv-faq summary').first().click();assert.ok(await page.locator('.mv-faq details').first().getAttribute('open')!==null);
    await page.locator('.rb-sb-btn').click();
    await page.waitForFunction(()=>document.activeElement.id==='expressName');
    await page.screenshot({path:resolve(output,'mobile-checkout.png')});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:resolve(output,'mobile-top.png')});
    await page.screenshot({path:resolve(output,'mobile-full.png'),fullPage:true});
  });
  await check('no browser runtime errors',async()=>assert.deepEqual(errors,[]));
  await check('dark theme and narrow viewport remain usable',async()=>{
    await page.evaluate(()=>window.scrollTo(0,0));await page.click('#themeToggle');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.screenshot({path:resolve(output,'mobile-dark.png')});
    await page.click('#themeToggle');
  });
  await check('out-of-stock blocks checkout even through a direct function call',async()=>{
    outOfStock=true;await page.reload({waitUntil:'networkidle'});
    assert.ok(await page.locator('.btn-submit-express').isDisabled());
    assert.ok(await page.locator('.rb-sb-btn').isDisabled());
    await page.evaluate(()=>submitExpressOrder());assert.equal(orders.length,1);
    outOfStock=false;
  });
  await check('storefront lists maxVita as available without inventing a stock count',async()=>{
    await page.goto('http://127.0.0.1:8093/index.html',{waitUntil:'networkidle'});
    const button=page.locator('#productsContainer .add-to-cart-btn[data-id="109"]');
    await button.waitFor();assert.ok(await button.isEnabled());
    const zero=JSON.parse(readFileSync(resolve(root,'products.json'),'utf8')).find(p=>p.stock===0);
    if(zero)assert.ok(await page.locator('#productsContainer .add-to-cart-btn[data-id="'+zero.id+'"]').isDisabled());
  });
  console.log(`${checks} checks passed. Screenshots: ${output}`);
  await context.close();
} finally { await browser.close(); }
