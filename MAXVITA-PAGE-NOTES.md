# ROBUSTE maxVita 600 — product page 109

Created 2026-10-15 in the existing ROBUSTE storefront.

## Product information

The supplied packaging photos support:

- Brand: ROBUSTE, range maxVita.
- Model: MAXVITA 600.
- Electric citrus press for oranges, yellow/green lemons and grapefruit.
- Jug capacity: 0.6 L / 600 ml.
- Effective power: 30 W.
- Supply: 220–240 V, 50/60 Hz.
- Two rotation directions: left/right.
- Two pressing cones of different sizes.
- Cover described on the box as preserving the flavour of fresh juice.

The visible jug has a handle, pouring lip and measurement markings.
The original box photo is linked beside the specification table.
Pomegranate compatibility has not been established and is not advertised.
No cold/flu prevention claims, invented reviews, former price or scarcity counter were added.

## Commercial settings

- Price: 3,500 DZD, from the seller's instruction.
- Delivery is charged separately using the existing delivery integration.
- Existing cash-on-delivery checkout, cart and tracking are retained.
- Exact stock quantity was not supplied. `stock: null` means quantity unspecified;
  it follows the product pages' existing availability convention. Setting stock to
  zero disables purchase. The homepage now follows the same convention without
  displaying an invented quantity.

## Images and styling

Four seller-supplied generated images are converted to WebP without changing their content.
The printed markings inside those generated images are illustrative; the specification
table uses the original packaging, not generated markings.
The page is Arabic, with local Readex Pro font, Bootstrap icons and Bootstrap JS.
License files accompany the vendor assets.

## Files to upload together

- `product-109.html`
- `maxvita.css`
- `products.json`
- `main.js`
- `index.html` (homepage script cache version)
- `sitemap.xml`
- `images/maxvita/` (five images including packaging)
- `assets/maxvita-ui/` (fonts, icons, Bootstrap JS and licenses)

These files belong in the current storefront; they are not a standalone replacement
for the whole site. Existing shared scripts and styles remain necessary.
The Worker source was not modified. Its existing catalog validation reads `products.json`.
No commit, push or production deployment was performed.

## Validation

`tests/maxvita.browser.mjs` checks product metadata, gallery keyboard controls,
3500 DZD pricing, separate delivery fees, quantity totals, cart, phone validation,
invalid quantities, a mocked successful order, narrow layouts, sticky CTA, FAQ,
dark theme, zero-stock guards and homepage availability.
All order/courier/analytics API requests are intercepted; no test order is sent to the store.

Run a local HTTP server on port 8093, then run the test with Playwright available.
The test uses installed Microsoft Edge in headless mode.
Screenshots are saved in `reviews/maxvita/`.
