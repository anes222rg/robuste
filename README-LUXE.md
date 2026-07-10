# ROBUSTE — Luxe Layer v1

## What this is / واش هذا

A **pure-CSS** premium skin for the ROBUSTE storefront.

- ✅ **Zero JavaScript** — nothing executes, nothing can break
- ✅ **Zero HTML changes** — you add ONE `<link>` line only
- ✅ **Zero logic touched** — cart, orders, delivery, tracking, i18n, dark mode all untouched
- ✅ Every selector is verified against your existing files (`style.css`, `robuste-ui.css`, `mobile-ux.css`, `main.js`, `app.js`)
- ✅ Dark mode (`[data-theme="dark"]`) fully supported
- ✅ Respects `prefers-reduced-motion` (accessibility)

## Install / التركيب (دقيقة واحدة)

1. Upload `robuste-luxe.css` to the ROOT of the repo (same folder as `style.css`).
2. In **index.html** and **product.html** (and any `product-<id>.html` template source),
   add this line in `<head>` **AFTER all other stylesheets** (it must be the LAST css link):

```html
<link rel="stylesheet" href="robuste-luxe.css">
```

Load order must be:
`bootstrap.min.css` → `style.css` → `robuste-ui.css` → `mobile-ux.css` → **`robuste-luxe.css`**

⚠️ Note: `seo-build.js` reads `product.html` as the template — add the line there **before** running the SEO build so all `product-<id>.html` pages get it too.

3. Commit & push. GitHub Pages redeploys automatically.

## Rollback / التراجع

Delete that one `<link>` line. The site returns to exactly how it was. Nothing else changed.

## What it upgrades / واش يحسّن

| Area | Before | After |
|---|---|---|
| Navbar | flat glass | deep glass blur + hairline border + soft scroll shadow |
| Hero | mid-contrast overlay | cinematic gradient, tighter title, calmer subtitle |
| CTA buttons | flat orange | gradient + inner highlight + lift on hover + focus ring |
| Trust bar | plain boxes | boutique cards, tinted icon chips, hover lift |
| Offers | red bazaar badges | ink-black discount pill + glass badge (premium sale look) |
| Product cards | basic | gallery cards: hairline border, layered shadow, image zoom on hover |
| Category filter | grey buttons | refined pills, orange active state |
| Forms | default inputs | rounded, orange focus glow (trust at checkout moment) |
| Dark mode | partial polish | full parity for all the above |

No colors changed off-brand — it keeps your `#ff6b35` identity, just executed at a higher grade.
