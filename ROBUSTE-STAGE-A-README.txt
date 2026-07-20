ROBUSTE REDESIGN — STAGE A: HOMEPAGE
====================================

Files
- index.html: complete redesigned homepage
- robuste.css: single Precision Red stylesheet and documented token layer
- validation.json: static compatibility audit

Deployment
1. Add robuste.css beside index.html.
2. Replace the existing index.html with this version.
3. Keep every existing JavaScript file and the images/ directory unchanged.
4. The homepage no longer loads style.css, premium.css, robuste-ui.css, _fable5.css or _luxe-*.css.

Compatibility guarantees checked
- No JavaScript file was modified.
- Existing data-* attributes were retained.
- Required static homepage hook IDs are present and unique.
- orderHp remains visually hidden as an anti-spam honeypot.
- Bootstrap 5.3 components and defer-loaded integrations remain in place.
- [data-theme] light/dark tokens and logical RTL/LTR properties are included.

Note
The supplied source ZIP did not include the images/ directory. Original image paths remain unchanged so production assets continue to resolve after deployment.
