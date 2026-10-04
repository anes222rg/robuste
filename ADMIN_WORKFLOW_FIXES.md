# Admin workflow repair

Use `admin.html`. The changes are local source changes; the live Worker and Firebase rules still need to be published.

## Daily flow

1. In **الطلبات**, confirm the customer's order. Authentication uses the signed-in Firebase session; confirming an order no longer prompts for a separate ADMIN_KEY.
2. In **الشحن**, search for the customer, review the address/commune and COD amount, then create the draft. This creates a parcel at Assil but does not dispatch it.
3. Print the label, physically hand the parcel to the courier, then confirm handover. Both shipping and tracking screens expose this action for the original parcel.
4. In **المتابعة والتحصيل**, use draft, active, attention and completed filters. Open the original order, refresh that order, edit a draft, add a note or handle a return from its row. The mobile view uses parcel cards.
5. Use the finance tab for linked-parcel COD reports and CSV export. Pickup is excluded from sales COD; its known delivery cost is included in completed-parcel costs.

## Reliability fixes

- Invalid communes cannot bypass checkout repricing or save a forged total.
- An incomplete live commune response cannot replace working customer fallback locations.
- Staff review dialogs also retain a bundled location fallback during outages, clearly marked as provisional.
- Scheduled/manual refresh includes related parcels when the original draft has been deleted.
- Batch handover checks that each tracking belongs to its order, verifies courier confirmation and surfaces database-save failures. Repeating a locally confirmed handover does not send another courier request.
- Successful edits and handovers update the visible parcel immediately. If the courier applied an action but saving failed, the dialog blocks another submission and shows the tracking to reconcile.
- Changing desk delivery back to home restores the typed home address. Phone formatting is normalized; negative COD values are rejected.
- Shipping search and selections survive normal list refreshes. More actions are grouped under each parcel, with direct access to the original order.
- Labels open a preview window before the asynchronous request; blocked previews fall back to downloading the PDF.
- `config/productCosts` is accessible only to the existing admin, allowing shared product costs to save.
- Automatic panel refresh backs off after a carrier rate-limit response. Worker calls have a bounded timeout.

## Publish these together

- Publish `cloudflare-worker.js` to the existing Worker, retaining its settings and secrets.
- Publish `firestore.rules` to the existing Firebase project.
- Upload the changed static files, including `admin.html`, both admin assets, `robuste-ecotrack-delivery.js` and the 44 checkout pages with the updated script version. Keep `robuste-delivery-locations.json` available.
- Retain/configure the existing Cron Trigger. The scheduler cursor format migrates automatically.

No real parcels, payments or messages were created during development. Browser checks use a fake Firebase lifecycle and intercepted Worker responses; live credentials, courier response shapes and deployed rules remain to be verified.

## Validation

Passed 34 backend/integration checks and 13 browser workflow checks. Desktop and 390px mobile screenshots were visually reviewed. JavaScript syntax and the final diff whitespace check passed.

```text
node --test tests/ecotrack-integration.test.mjs tests/ecotrack-features.test.mjs
node tests/admin-workflows.browser.mjs
```

The browser suite requires Playwright. Set `ROBUSTE_PLAYWRIGHT_PATH` to its package directory when it is bundled outside this repository; optionally set `ROBUSTE_BROWSER_PATH` to an installed Chromium/Edge executable. It intercepts all network requests and writes synthetic desktop/mobile screenshots to `reviews/`.
