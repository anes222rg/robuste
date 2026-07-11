ROBUSTE — SEO FIX PACKAGE
=========================

WHY YOUR PRODUCTS DON'T APPEAR IN GOOGLE
----------------------------------------
Your product.html is an EMPTY SHELL. The product name, price, description and
the Product structured data (JSON-LD) are all injected by JavaScript AFTER the
page loads (after fetch('products.json')).

Two fatal problems for Google:
1) CANONICAL BUG: every product served the SAME raw HTML with
   <link rel="canonical" href=".../product.html"> (no pid). Google treats every
   product as a DUPLICATE of one page and drops them.
2) On a static host, product.html?pid=1 and ?pid=2 are the SAME physical file,
   so Google can never receive distinct pre-rendered product HTML. Amazon /
   WooCommerce send full product HTML + JSON-LD from the server, so Google
   indexes them immediately.

WHAT THIS PACKAGE DOES
----------------------
Generates one REAL static page per product: product-<id>.html, each with:
  - unique <title>, meta description, canonical (its own URL)
  - unique OpenGraph / Twitter tags
  - a static JSON-LD Product block IN THE RAW HTML (price, currency DZD,
    availability, condition, brand) -> eligible for Google product rich results
  - visible product content (H1, price, description, features) in the raw HTML
The existing JavaScript still runs and hydrates the page, so cart / order /
carousel keep working exactly as before.

FILES IN THIS PACKAGE
---------------------
  product-<id>.html  (x34)  NEW - upload all to your site ROOT
  product.html              REPLACE existing (adds RB_PID fallback + fixes
                            JS canonical). Old ?pid= links still work.
  index.html                REPLACE - internal links now point to product-<id>.html
  main.js                   REPLACE - link building + click handlers updated
  app.js                    REPLACE - legacy links updated
  sitemap.xml               REPLACE - lists all product-<id>.html URLs

HOW TO DEPLOY (static host / GitHub Pages / Cloudflare Pages)
------------------------------------------------------------
1. Copy ALL files from this package into your site's ROOT folder
   (same folder as images/, products.json, bootstrap css). Overwrite when asked.
2. Commit & push / redeploy.
3. Confirm live: open  https://www.robustedz.store/product-1.html  and
   "View Source" — you must SEE the product name, price and the
   <script type="application/ld+json"> block in the RAW source.

GOOGLE SEARCH CONSOLE (do this to get indexed fast)
---------------------------------------------------
1. Verify the domain in Google Search Console (if not already).
2. Sitemaps -> submit:  https://www.robustedz.store/sitemap.xml
3. URL Inspection -> paste a product-<id>.html URL -> "Request indexing".
4. Test rich results: https://search.google.com/test/rich-results  -> paste a
   product URL -> should detect a valid "Product" (a warning about missing
   review/rating is OK; add reviews later for star ratings).

RE-RUN WHEN PRODUCTS CHANGE
---------------------------
Whenever you edit products.json, re-run the generator (seo-build.js, included
separately) to regenerate all product-<id>.html files and the sitemap.

OPTIONAL NEXT WINS
------------------
- Add aggregateRating / review to JSON-LD to get star ratings in Google.
- Add priceValidUntil is already set (1 year out) — keep it fresh on rebuilds.
- Keep image URLs absolute and reachable (they are set to full https URLs).
