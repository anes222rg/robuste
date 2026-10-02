# Release validation — offline, not live deployment

## Automated regression suite

**26 tests passed; 0 failures.** This includes the 4 original integration checks plus 22 added feature/safety checks.

Run the included suite:

```bash
node --test tests/*.test.mjs
```

Covered behavior:

- Root GET preview intentionally returns 405 without contacting external services.
- Checkout repricing accepts confirmed commune-level office availability without requiring a separate detailed office address, and rejects an unavailable office.
- Existing parcel creation and legacy `baladiya`/commune overrides.
- Published reference-data shapes, confirmed zero tariffs and no silent Stop Desk-to-home downgrade.
- Separate delivery, collection and carrier-reported payment states; unknown/return states not misreported as delivered.
- Anonymous admin-route denial; live draft-state checks before editing/deleting.
- Documented update field names, DELETE draft removal and explicit JSON physical-return confirmation.
- Return request recorded without pretending that a return is complete.
- Related exchange linked to the original order without creating another sale.
- Creation reservations, known-tracking recovery after a database failure and safe handling of explicit rejection.
- Status persistence, failed-Telegram retry, successful-alert deduplication and immediate stop on carrier rate limiting.
- Scheduled cursor continuation beyond one batch; Firestore preconditions for concurrent edits.
- Public delivery reference without token/account-only after-sales tariffs.
- COD/report calculations including real zero-cost fees and exclusion of Pickup from sales collection.

These tests substitute local responses for courier, Firebase and Telegram calls. They do not validate your live account, secrets or network responses.

## Browser interaction checks

**14 grouped checks passed** using sandbox-local Chromium and synthetic data.

- Shipment, finance and location panels fit desktop (1360 px) and mobile (390 px) page widths.
- Draft editing, confirmed desk-address selection, required fields and rejection of negative COD amounts.
- Return confirmation required before submission; Pickup default COD zero.
- Localized timeline/notes and reachable modal actions at both widths.
- Actual `admin.html` initialization with a fake Firebase lifecycle and the existing shipping button posting reviewed values.
- A representative actual product page using its native delivery fee getter: live fee, genuine zero fee, unavailable desk and stable DOM.
- Confirmed desk absence is displayed as unavailable, not misleadingly free. Wide tables are keyboard-focusable and have mobile scroll guidance.

No shared/live browser login or courier actions were used.

## Visual review

The new admin panels/dialogs were rendered and individually inspected at desktop/mobile widths:

- Shipment overview, collection/report panel, account rates and offices.
- Draft edit, related exchange/Pickup and timeline/note dialogs.
- Return-request confirmation.
- Empty/error panels on mobile.
- Scrolled mobile form footers to verify that explanations and actions remain accessible.

Fixed during review: missing modal button borders from scoped CSS variables, misleading zero-price office display where no office exists, mobile table guidance and confirmation-label target size. Tables scroll within their own region rather than widening the page; long mobile forms scroll inside the modal.

This is a review of the new integration UI, not a claim that every unchanged product/assets page was visually audited.

## Source and package integrity

- All **759 original files** retained; product/image assets are not removed or substituted.
- **300 classic inline script blocks** in changed HTML files passed syntax checks.
- Updated standalone Worker and JavaScript modules passed syntax checks.
- Worker JavaScript static type-check passed with zero diagnostics using ES2022/WebWorker libraries and non-strict JavaScript settings; request options and dynamic records are documented with JSDoc. No global type-check suppression was added.
- Both ZIPs are verified for archive CRC integrity and exact correspondence with the release files.
- `ECOTRACK_CHANGED_FILES.md` lists updated/new files. The patch contains only those files; it needs your original site assets.

## Still required before production use

- Deploy the Worker, publish the rules and upload the static files.
- Configure/retain secrets, validate admin identity/origin and enable Cron.
- Compare real account tariffs, communes and available desks.
- Verify one genuine draft and current carrier response shape before live dispatch or returns.
- Verify Telegram delivery, current hosting behavior and expected volume/quota on your plan.
- Firebase rules were reviewed and syntax is preserved, but no Firebase rules-emulator or live permissions test was run here.
- Reconcile courier settlements against invoices and bank records; API Standard status/reporting is not bank-deposit verification.

See `ECOTRACK_SETUP.md` for the deployment and safe-retry checklist.

## Customer checkout correction

All 43 affected real checkout templates were exercised with the public reference data, without submitting genuine orders. The 85 main/quick-buy commune fields are actual dropdowns. Desktop/mobile checks cover commune-level office availability, disabled unavailable offices, home-address restoration, direct quick-buy click protection, stable DOM, and a bundled location fallback when the live reference is unavailable. Product prices, inventory, original assets and existing orders were not changed by this focused correction. See `CUSTOMER_CHECKOUT_FIX.md`.
