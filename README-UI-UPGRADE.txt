ROBUSTE — PREMIUM UI UPGRADE (LUXE LAYER)
==========================================

WHAT THIS IS
------------
A pure-CSS visual upgrade that makes the store look like a premium,
$9K+ professionally designed e-commerce site — with ZERO functional risk.

GUARANTEES
----------
1. NO HTML changed. NO JavaScript changed. NO file renamed.
2. Only 2 files were modified: style.css and robuste-ui.css.
3. Both changes are APPEND-ONLY: every original byte of your CSS is
   still there, byte-for-byte identical (verified with cmp). The new
   "LUXE LAYER" is added at the end of each file, so it only overrides
   visual properties (colors, shadows, radius, typography, transitions).
4. Cart, quick order (طلب سريع), express buy, Firestore orders,
   i18n, dark mode toggle, tracking, carousels — all untouched.
5. Because robuste-ui.css is shared, ALL 34 generated product-<id>.html
   pages get the upgrade automatically. No need to re-run seo-build.js.

WHAT CHANGED VISUALLY
---------------------
Home (style.css luxe layer):
- Hero: cinematic dark gradient overlay (much better text contrast),
  bigger display-scale headline with soft shadow, glowing gradient CTA,
  subtle entrance animation, frosted secondary button.
- Header: glass blur + hairline border + soft depth shadow.
- Buttons (.btn-orange): brand gradient, inner highlight, hover lift +
  orange glow, press feedback.
- Trust bar: white tactile cards with tinted icon tiles + hover lift.
- Flash offers: refined countdown cards with gradient tabular numerals,
  deal cards with warm layered shadows, gradient pill badges.
- Product grid: 18px-radius cards, hover lift + border glow + slow image
  zoom, bold tabular prices, gradient discount pills, pill category filters.
- Reviews: quote-mark cards with soft borders.
- Forms: brand-colored focus rings, rounded inputs.
- Footer: rich dark gradient with gradient top border, social hover lift.
- Premium scrollbar, selection color, font smoothing.
- Dark mode still works (rules use your existing CSS variables and have
  [data-theme="dark"] variants).
- prefers-reduced-motion respected (accessibility).

Product pages (robuste-ui.css luxe layer):
- Price: gradient-text price, muted old price, gradient discount pill.
- Product info + quick order cards: 20px radius, layered warm shadows.
- Gallery: bordered wrapper with hover zoom, active thumbnail ring.
- CTAs (أضف للسلة / تأكيد الطلب / express): gradient + glow + lift.
- Trust chips, description, related products, reviews: carded, hover
  polish, image zoom.
- Order summary: warm gradient panel with brand border.
- Focus rings on all form fields, premium modals/scrollbar.

HOW TO DEPLOY
-------------
1. Upload style.css and robuste-ui.css from this package to your site
   ROOT (overwrite the old ones). That's it — 2 files.
2. Hard-refresh (Ctrl+Shift+R) to bust the CSS cache.

ROLLBACK
--------
backup/style.css.orig and backup/robuste-ui.css.orig are your exact
original files. Copy them back to restore the previous look.

NOTES
-----
- The standalone _luxe-index.css and _luxe-product.css files are included
  for reference only (they are already appended inside the two CSS files).
- QA was rendered locally with placeholder product images; your real
  photos will look even better inside the new cards.
