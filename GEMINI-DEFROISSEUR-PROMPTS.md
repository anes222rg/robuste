# Gemini prompts — ROBUSTE défroisseur

## Before starting

Upload clear original photos of the actual product, all six sides of its box, its electrical label, accessories laid out separately, and the manual if available. Photograph small text straight on, without glare. Number the photos so Gemini can cite them.

Photos already in this project:

- `images/Robuste Defroisseur 2.jpg`: product beside the box, showing ROBUSTE, PRO STYLE and 1630W.
- `images/Robuste Defroisseur.jpg`: another product/box view.
- `images/Robuste Defroisseur 1.jpg`: existing styled product visual. Use it as a composition reference; use original photographs for product identity and specifications.

The existing homepage said 1800W, but the available box photographs say **1630W**. The page now uses 1630W. The previous catalog also claimed a 300ml tank, 60-second heating, adjustable steam and anti-drip protection. Those details were removed from the page because they cannot be confirmed from the available pictures. Reintroduce them only when the packaging, label or manual supports them.

## 1. Extract every supported feature from the photos

Attach the product and packaging photos, then paste:

```text
Act as a meticulous product researcher preparing an ecommerce product sheet for an Algerian store. Analyze ONLY the attached photos of this exact ROBUSTE handheld garment steamer, its box, electrical label, manual and accessories. Do not use specifications from similar products or search results.

First number the images. Transcribe all readable text on every box face, label and manual page, preserving original spelling, numbers and units. Write [unreadable] where text is unclear. Describe visible controls, shapes and components separately from printed claims. Never assume a button's function from its appearance.

Extract every supported detail: brand, product name, range, exact model/reference, power, voltage, frequency, water-tank capacity, heat-up time, steam output, operating modes, steam adjustment, removable parts, steam-lock function, soleplate material, anti-drip protection, automatic shutoff, dimensions, weight, cable length, plug, compatible fabrics, allowed operating positions, accessories, maintenance instructions and warranty. If any field is missing, write “not confirmed from the photos”. Do not confuse marketing words such as “professional” or “PRO STYLE” with a model reference.

For each detail return a table with: feature | exact printed wording or visual observation | normalized value | photo number and precise location | evidence type (printed specification / printed marketing claim / visible component) | confidence (high / medium / low).

Separate these groups:
A. Confirmed facts suitable for a product page.
B. Packaging marketing claims requiring qualification or independent evidence.
C. Unreadable, missing or conflicting details requiring another photo.

Explicitly check the power: the current box photos show 1630W, while old site copy said 1800W. Report what each source actually says. Prefer the electrical rating label for rated power, and flag any disagreement. Also verify rather than assume the old claims “300ml”, “60 seconds”, “adjustable steam” and “anti-drip”.

Convert each confirmed feature into one realistic customer benefit. Do not promise sterilization, killing bacteria, suitability for all fabrics, replacing every iron, a precise time saving, or an included accessory unless evidence supports it. Distinguish included accessories from props or illustrations printed on the box.

Finish with:
1. A concise French product sheet.
2. A natural Algerian Arabic product sheet.
3. A list of specific additional photos needed to resolve gaps.
4. A JSON object containing title, description_short_fr, description_short_ar, features_fr, features_ar, confirmed_specs, packaging_claims, conflicts and unknowns. Use null for unknown specification values. Every confirmed_specs entry must include its source photo and evidence. Do not invent price, stock, delivery policy, discounts, warranty or reviews.
```

## 2. Main gallery image — clean studio photograph

Attach at least two original product photos. Paste:

```text
Create one photorealistic ecommerce studio image of the EXACT ROBUSTE handheld garment steamer in the attached reference photos. Use the real product as the identity reference; do not redesign it.

Preserve its silhouette, proportions, broad oval steam head, real outlet-hole pattern, black glossy handle, grey body and base, purple buttons, existing ROBUSTE branding and attached power cord. Keep the cord naturally coiled beside the base. Preserve readable existing markings; do not invent or replace a logo. If a detail is hidden, select a camera angle supported by the photos.

Show the entire product in a flattering three-quarter front view, upright on a matte off-white surface, with a seamless warm white background, soft studio lighting, accurate materials, controlled reflections, sharp product edges and a gentle contact shadow. The product occupies about 75% of the frame, with clear margins on every side. Minimal, polished, believable product photography for the ROBUSTE website.

Square 1:1 composition, preferably 2000 × 2000 pixels if supported. No text overlays, floating badges, prices, watermark, extra accessories, people, duplicate product, exaggerated steam or artificial glow. Do not make the corded appliance look cordless. Produce only the image.
```

Target website file: `images/defroisseur-studio.webp`. This will become the first gallery image after visual approval. Suggested alt text: `Défroisseur vapeur à main ROBUSTE PRO STYLE, vue de trois quarts`.

## 3. Lifestyle image — believable clothing retouch

Attach the same original product photos and paste:

```text
Create one photorealistic lifestyle photograph for an Algerian home-appliance ecommerce product page. The hero product is the EXACT ROBUSTE handheld garment steamer in the attached reference photos. Preserve its body geometry, broad oval head, actual steam outlets, black and grey finish, purple buttons, ROBUSTE branding and attached electric cord. Do not substitute another model or add features.

Scene: a bright, tidy dressing corner in a contemporary home, warm neutral walls, a cotton shirt hanging on a stable wooden hanger. Show an adult's hand holding the real steamer naturally beside the suspended shirt. The garment is not being worn. Keep the face optional/out of frame and keep hands anatomically realistic. Fingers stay away from the hot head and steam outlet. Keep the cord visible trailing naturally downwards outside the frame. Show only a subtle, physically plausible trace of steam.

Natural side-window lighting, restrained cream and beige palette, realistic fabric texture, clear focus on the appliance and shirt, gently blurred background. Frame the product large enough to recognize it on a phone. No ironing board, invented included accessories, exaggerated before/after result or theatrical cloud of steam.

Portrait 4:5 composition, preferably 1600 × 2000 pixels if supported. No captions, prices, logos added outside the product, watermark or health claims. Produce only the image.
```

Target: `images/defroisseur-lifestyle.webp`. Suggested alt text: `Défroisseur ROBUSTE utilisé pour une retouche sur une chemise suspendue`.

## 4. Detail image — visible head and controls

```text
Using the attached original photographs of the EXACT ROBUSTE handheld steamer, create one realistic close-up product photograph of the steam head, handle and purple controls. Preserve the real outlet-hole layout, button count and positions, surface materials, existing markings and proportions. Use an angle clearly supported by a reference image. Do not invent the underside, a screen, accessory or internal mechanism.

Warm white studio background, soft directional light, crisp detail with restrained reflections. Show enough of the body for the product to remain recognizable. Square 1:1 composition, preferably 2000 × 2000 pixels if supported. No text, arrows, annotations, performance claims, new branding, steam cloud or watermark. Produce only the image.
```

Target: `images/defroisseur-detail.webp`. Suggested alt text: `Gros plan sur la tête vapeur et les commandes du défroisseur ROBUSTE`.

## 5. Wide image — product-page banner

```text
Create one photorealistic wide website banner using the EXACT ROBUSTE handheld garment steamer from the attached original photos. Preserve every visible product detail, brand marking, black and grey finish, purple controls and power cord. Do not redesign or beautify the appliance into another model.

Place the steamer upright on a pale dressing-room shelf on the LEFT third of the frame, with a neutral hanging cotton shirt softly blurred behind it. Keep the RIGHT half quiet and uncluttered so the website can display an Arabic headline there. Warm off-white and beige surroundings, soft daylight, realistic scale, gentle shadows, premium home-product photography. The product remains entirely inside the image with generous crop-safe margins.

Landscape 16:9 composition, preferably 2400 × 1350 pixels if supported. No generated text, prices, discount badges, added logo, watermark, accessories presented as included or exaggerated steam. Produce only the image.
```

Target: `images/defroisseur-banner.webp`. The site should render headings and buttons as HTML, rather than baking them into the image.

## 6. Check each generated image against the real product

Attach the generated image and the original product photos, then paste:

```text
Compare the generated ecommerce image with the attached original product photos. Audit product identity rather than artistic appeal.

Return a table: aspect | original reference | generated image | match / mismatch / unverifiable | required correction. Check silhouette, proportions, head shape, steam-outlet pattern, number and location of controls, colours, finishes, brand markings, base, power cord, visible accessories, scale, hand anatomy and depiction of use. Identify any invented hardware, unsupported claim or accessory that could mislead a customer. Report unreadable or distorted branding.

Give a final decision: ACCEPT, REVISE or REJECT, with specific reasons. ACCEPT only if all essential identity details match. If revision is needed, write one precise correction prompt that preserves the parts already correct.
```

## Page structure used

References inspected: `product-107.html` (friteuse Inox 3L) and `product-25.html` (Pétrin Pro Max). Both use the shared static HTML/CSS structure and fetch `products.json` for the product gallery, price, availability and order form.

Updated `product-100.html` keeps that structure and adds:

1. Algerian Arabic outcome headline.
2. Existing product gallery, price and quick order form.
3. Mobile order bar and WhatsApp access, matching the reference renderer.
4. Three grounded benefit cards.
5. Product-and-box photograph with confirmed visible specifications.
6. General usage guidance referring to the product manual.
7. FAQs on fabrics, steaming versus ironing, delivery fees and payment.
8. Final order link connected to the express form after product loading.

Current catalog values: 6,300 DA, previous price 7,000 DA, stock 15. Friteuse customer screenshots were not reused as défroisseur testimonials, and generic seed reviews were removed from this page. Existing product review loading is preserved.

Generated images have not been created or installed: the page currently uses the existing images. Review generated assets against the originals before replacing gallery paths in `products.json` and the static/social-preview images in `product-100.html`.
