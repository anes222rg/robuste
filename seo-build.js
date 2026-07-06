/* ROBUSTE SEO prerender build
 * Generates one static HTML page per product (product-<id>.html) with:
 *  - unique <title>, meta description, canonical, OG/Twitter
 *  - static JSON-LD Product (in raw HTML, before any JS runs)
 *  - visible server-rendered product content (h1, price, description, image, features)
 * Also regenerates sitemap.xml and patches internal links in index/main/app.
 */
const fs = require("fs");
const path = require("path");

const SRC = "/data";
const OUT = "/data/robuste-seo";
const DOMAIN = "https://www.robustedz.store";
const TODAY = new Date().toISOString().slice(0, 10);

fs.mkdirSync(OUT, { recursive: true });

const products = JSON.parse(fs.readFileSync(path.join(SRC, "products.json"), "utf8"));
let tpl = fs.readFileSync(path.join(SRC, "product.html"), "utf8");

/* ---------- helpers ---------- */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function absImg(u) {
  if (!u) return DOMAIN + "/images/og-default-product.jpg";
  if (/^https?:\/\//i.test(u)) return u;
  return DOMAIN + "/" + encodeURI(String(u).replace(/^\/+/, ""));
}
function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

/* ---------- 1. base template patches (applied once) ---------- */
// resolve product id from ?pid= OR the injected window.RB_PID (static pages have no query)
tpl = tpl.replace(
  "const productId = parseInt(urlParams.get('pid'));",
  "const productId = parseInt(urlParams.get('pid')) || (window.RB_PID||0);"
);
// keep JS-set canonical consistent with the new static URL form
tpl = tpl.replace(
  'var url = SEO_DOMAIN + "/product.html?pid=" + p.id;',
  'var url = SEO_DOMAIN + "/product-" + p.id + ".html";'
);

/* ---------- 2. per-product page generation ---------- */
const PID_TOKEN = "<!--RB_PID-->";
const JSONLD_TOKEN = "<!--RB_JSONLD-->";
// inject a placeholder for RB_PID right after charset, and JSON-LD right before </head>
let baseTpl = tpl.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + PID_TOKEN);
baseTpl = baseTpl.replace(/<body/i, JSONLD_TOKEN + "\n<body");

function buildSSR(p) {
  const img = esc(p.images && p.images[0] ? p.images[0] : "images/og-default-product.jpg");
  const disc = p.old_price ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : 0;
  const feats = (p.features || ["جودة عالية", "ضمان سنتان", "توصيل سريع"])
    .map(f => `<li><i class="bi bi-check-circle-fill"></i> ${esc(f)}</li>`).join("");
  const oldP = p.old_price ? `<span class="old-price text-decoration-line-through text-muted ms-2" dir="ltr">${p.old_price.toLocaleString()} DA</span>` : "";
  const discBadge = disc ? `<span class="discount-badge ms-2">-${disc}%</span>` : "";
  const inStock = (p.stock == null || Number(p.stock) > 0);
  return `
      <div class="col-12 col-md-5 col-lg-5 mb-4">
        <img src="${img}" alt="${esc(p.title)}" class="img-fluid rounded" width="600" height="600" decoding="async">
      </div>
      <div class="col-12 col-md-7 col-lg-7">
        <nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="index.html">الرئيسية</a></li><li class="breadcrumb-item"><a href="index.html#products">المنتجات</a></li><li class="breadcrumb-item active" aria-current="page">${esc(p.title)}</li></ol></nav>
        <h1 class="product-title">${esc(p.title)}</h1>
        <div class="price-section my-3">
          <span class="current-price fw-bold fs-3" dir="ltr">${Number(p.price).toLocaleString()} DA</span>${oldP}${discBadge}
        </div>
        <p class="product-availability">${inStock ? "متوفر في المخزون" : "غير متوفر حالياً"}</p>
        <p class="product-description">${esc(p.description_long || p.description_short || "")}</p>
        <ul class="product-features list-unstyled">${feats}</ul>
        <p class="text-muted">الدفع عند الاستلام • التوصيل لكل الولايات</p>
      </div>`;
}

function buildJsonLd(p) {
  const img = absImg(p.images && p.images[0]);
  const url = `${DOMAIN}/product-${p.id}.html`;
  const avail = (p.stock == null || Number(p.stock) > 0)
    ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const priceValid = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const ld = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: p.title,
    image: [img],
    description: clean(p.description_long || p.description_short || ""),
    sku: String(p.id),
    mpn: String(p.id),
    brand: { "@type": "Brand", name: "ROBUSTE" },
    offers: {
      "@type": "Offer",
      url: url,
      priceCurrency: "DZD",
      price: Number(p.price) || 0,
      priceValidUntil: priceValid,
      availability: avail,
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "ROBUSTE" }
    }
  };
  return '<script type="application/ld+json">' + JSON.stringify(ld) + "<\/script>";
}

let generated = 0;
for (const p of products) {
  if (p.id == null) continue;
  const title = esc(p.title) + " | ROBUSTE";
  const desc = esc(clean(p.description_short || p.description_long || "منتج عالي الجودة من ROBUSTE").slice(0, 160));
  const url = `${DOMAIN}/product-${p.id}.html`;
  const img = esc(absImg(p.images && p.images[0]));

  let html = baseTpl;
  // head: title / description / canonical
  html = html.replace("<title>ROBUSTE | تفاصيل المنتج</title>", `<title>${title}</title>`);
  html = html.replace(
    '<meta name="description" content="Robuste eulma - أجهزة منزلية فاخرة، ضمان سنتان، توصيل سريع في الجزائر">',
    `<meta name="description" content="${desc}">`
  );
  html = html.replace(
    '<link rel="canonical" href="https://www.robustedz.store/product.html">',
    `<link rel="canonical" href="${url}">`
  );
  // OG / Twitter
  html = html.replace('<meta property="og:title" content="ROBUSTE — تفاصيل المنتج">', `<meta property="og:title" content="${title}">`);
  html = html.replace('<meta property="og:description" content="أجهزة منزلية فاخرة بأسعار تنافسية، ضمان وتوصيل سريع. الدفع عند الاستلام.">', `<meta property="og:description" content="${desc}">`);
  html = html.replace('<meta property="og:url" content="https://www.robustedz.store/product.html">', `<meta property="og:url" content="${url}">`);
  html = html.replace('<meta property="og:image" content="https://www.robustedz.store/images/og-default-product.jpg">', `<meta property="og:image" content="${img}">`);
  html = html.replace('<meta name="twitter:title" content="ROBUSTE — تفاصيل المنتج">', `<meta name="twitter:title" content="${title}">`);
  html = html.replace('<meta name="twitter:description" content="أجهزة منزلية فاخرة بأسعار تنافسية، توصيل سريع.">', `<meta name="twitter:description" content="${desc}">`);
  html = html.replace('<meta name="twitter:image" content="https://www.robustedz.store/images/og-default-product.jpg">', `<meta name="twitter:image" content="${img}">`);
  // tokens
  html = html.replace(PID_TOKEN, `<script>window.RB_PID=${Number(p.id)};</script>`);
  html = html.replace(JSONLD_TOKEN, buildJsonLd(p));
  // SSR body
  html = html.replace('<div class="row g-5" id="productDetailRow">', `<div class="row g-5" id="productDetailRow">${buildSSR(p)}`);

  fs.writeFileSync(path.join(OUT, `product-${p.id}.html`), html, "utf8");
  generated++;
}

/* ---------- 3. patched product.html (so ?pid= still works + new canonical form) ---------- */
fs.writeFileSync(path.join(OUT, "product.html"), tpl, "utf8");

/* ---------- 4. sitemap.xml ---------- */
let sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
sm += `  <url>\n    <loc>${DOMAIN}/</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
for (const p of products) {
  if (p.id == null) continue;
  sm += `  <url>\n    <loc>${DOMAIN}/product-${p.id}.html</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
}
sm += `  <url>\n    <loc>${DOMAIN}/privacy.html</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.3</priority>\n  </url>\n`;
sm += "</urlset>\n";
fs.writeFileSync(path.join(OUT, "sitemap.xml"), sm, "utf8");

/* ---------- 5. patch internal links in index.html / main.js / app.js ---------- */
function patchLinks(name) {
  const fp = path.join(SRC, name);
  if (!fs.existsSync(fp)) return null;
  let s = fs.readFileSync(fp, "utf8");
  const before = s;
  // hardcoded numeric: product.html?pid=100 -> product-100.html
  s = s.replace(/product\.html\?pid=(\d+)/g, "product-$1.html");
  // template literal: product.html?pid=${x} -> product-${x}.html
  s = s.replace(/product\.html\?pid=\$\{([^}]+)\}/g, "product-${$1}.html");
  // concatenation: "product.html?pid="+encodeURIComponent(x) -> "product-"+encodeURIComponent(x)+".html"
  s = s.replace(/"product\.html\?pid="\+encodeURIComponent\((\w+)\)/g, '"product-"+encodeURIComponent($1)+".html"');
  // selectors & matchers in main.js
  s = s.replace(/a\[href\*=\\"product\.html\?pid=\\"\]/g, 'a[href*=\\"product-\\"]');
  s = s.replace(/href\.includes\("product\.html\?pid="\)/g, 'href.includes("product-")');
  s = s.replace(/href\.match\(\/pid=\(\\d\+\)\/\)/g, 'href.match(/product-(\\d+)\\.html/)');
  fs.writeFileSync(path.join(OUT, name), s, "utf8");
  return { name, changed: before !== s, remaining: (s.match(/product\.html\?pid=/g) || []).length };
}
const reports = ["index.html", "main.js", "app.js"].map(patchLinks).filter(Boolean);

console.log(JSON.stringify({ generated, products: products.length, reports }, null, 2));
