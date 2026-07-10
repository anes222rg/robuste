ROBUSTE — PREMIUM UI UPGRADE (FINAL MERGED PACKAGE)
====================================================

WHAT'S IN THIS PACKAGE
----------------------
Everything here mirrors your repo root. Push the whole folder — file
names match your repo, so they overwrite in place.

CHANGED FILES (only 2):
- style.css       = your original + LUXE layer + your v3 Conversion layer
- robuste-ui.css  = your original + LUXE layer + your v3 Conversion layer

EVERYTHING ELSE IS YOUR ORIGINAL, UNCHANGED:
index.html, product.html, product-1.html, product-100.html,
tracking.html, products.json, seo-build.js, main.js, app.js, i18n.js,
analytics.js, telegram.js, robuste-tracking.js, robuste-delivery-index.js,
robuste-orders.js, premium.css, bootstrap.min.css, bootstrap.rtl.min.css,
README-SEO.txt.
(Repo files not in this package — product-2..29.html, product-101..105.html,
admin pages, sitemap, CNAME, etc. — need no changes; product pages inherit
the new look automatically from robuste-ui.css.)

THE MERGE
---------
The two CSS files now carry BOTH premium layers, appended in order:
1. LUXE layer — cinematic hero overlay + entrance animation, glass navbar,
   carded trust bar / reviews (quote marks) / contact, gradient-text price,
   image zoom on hover, footer gradient, premium scrollbar + selection.
2. Your v3 Conversion layer (from the files you sent) — loaded last so its
   conversion-focused choices win: pill CTAs, 900-weight editorial titles,
   soft-gradient price block, brand-gradient announcement bar + modal
   header, refined countdown, focus-visible outlines, dark-theme variants.
Verified: every CSS variable used is defined; both files pass syntax
validation; original bytes of both files are untouched (append-only);
full before/after render QA on desktop + mobile showed no layout breaks
and no new console errors.

GUARANTEES
----------
- No HTML or JS modified. Cart, quick order, express buy, Firestore,
  i18n, dark mode, tracking: untouched.
- All 34 product-<id>.html pages upgrade automatically. No need to
  re-run seo-build.js.

DEPLOY
------
1. Copy these files over your repo root (or just style.css +
   robuste-ui.css if you prefer the minimal diff).
2. Commit + push.
3. Hard-refresh (Ctrl+Shift+R) to bust CSS cache.

ROLLBACK
--------
backup/style.css.orig and backup/robuste-ui.css.orig are your exact
originals — rename and push to restore the old look.
