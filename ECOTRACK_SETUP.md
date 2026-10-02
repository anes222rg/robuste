# ROBUSTE — Assil Delivery / Ecotrack update

## Before deployment

This package is a code update, **not a deployed or live-verified connection**. It extends the existing working parcel-creation flow. Local tests use mocked courier, Firebase and Telegram responses: no real parcels were created, dispatched, edited, deleted or returned during testing.

Back up the current website, Worker source and Firestore rules. Keep the current Cloudflare Worker URL and existing secrets. Do not put the courier token, Firebase private key or Telegram bot token into frontend JavaScript, screenshots or chat.

Official API Standard documentation: https://documenter.getpostman.com/view/14517169/Tz5je15g

## Deployment order

### 1. Update the existing Cloudflare Worker

Publish the included **`cloudflare-worker.js`** to the existing Worker used by `admin.html`, `robuste-tracking.js` and the storefront. It is a standalone file suitable for the existing dashboard deployment workflow; no new service or package installation is required.

Retain/configure these Worker settings:

| Setting | Value / purpose |
| --- | --- |
| `ECOTRACK_API_URL` | `https://assildelivery.ecotrack.dz` — base only, without `/home`, `/market` or `/api/v1` |
| `ECOTRACK_TOKEN` | Your existing active API Standard token; store as a secret |
| `FIREBASE_PROJECT_ID` | Existing store Firebase project |
| `FIREBASE_CLIENT_EMAIL` | Existing Firestore service-account email |
| `FIREBASE_PRIVATE_KEY` | Existing service-account private key; store as a secret |
| `ADMIN_EMAIL` | Existing authorized Firebase admin account, consistent with `isAdmin()` in `firestore.rules` |
| `ALLOWED_ORIGIN` | Exact live store origin, including `https://` and the correct `www` choice |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Existing Telegram configuration, if you want status/exception alerts |

The package preserves the original Firestore admin identity. **Do not replace it with an unrelated Notion or ChatGPT account email.** If you intentionally change the store owner later, update both the Worker setting and Firestore rule.

Optional flags:

- `ECOTRACK_LIVE_DELIVERY_PRICES=false`: retain the storefront's original customer-facing delivery prices. Staff can still view Assil reference tariffs. Leave unset to use live Assil delivery tariffs for new checkouts.
- `ECOTRACK_SYNC_ENABLED=false`: disable scheduled synchronization. This does not disable staff-triggered refreshes.

### 2. Add background synchronization

Add a **Cron Trigger** to this same Worker, for example:

```text
*/5 * * * *
```

Each run processes up to **15 parent orders**, rotates through the linked orders using a persisted cursor, and includes their related exchange/Pickup parcels. A full sweep takes more than one run when there are more than 15 parents. Larger volumes therefore have a longer refresh delay; this is polling, not a real-time webhook.

The admin panel also refreshes a batch every **two minutes while it is open**. The manual status refresh covers the selected local orders in batches. Opening the panel is not a replacement for a Cron Trigger if you need unattended updates.

The scheduled batch stays within the documented 100-tracking bulk limit and is sized conservatively for Worker subrequest limits. Monitor Cloudflare usage and Assil API quota when scaling. Stop automatic retries after rate-limit responses until the quota resets.

### 3. Publish Firestore rules

Publish the included **`firestore.rules`** in the existing Firebase project. It retains the current owner and prevents public order creation from supplying courier tracking or payment fields. Action reservations are server-only; do not make `ecotrackActions` publicly writable to resolve permission errors.

The Worker service account must retain access to `orders`, server configuration and action reservations. These are server operations; browsers do not receive the service-account credentials.

### 4. Upload the website files

Upload the full package, preserving paths, or apply all files in the update-only ZIP to your current site. The patch ZIP is not a standalone website.

Important files include:

- `admin.html`, `robuste-ecotrack-admin.js`, `robuste-ecotrack-admin.css`;
- `robuste-ecotrack-delivery.js`, `robuste-delivery-index.js` and the updated checkout HTML pages;
- `tracking.html` and the updated Worker/rules above.

Use **`admin.html`**, not the older `admin.patched.html` retained from the original archive. Deploying website files does not automatically deploy the Cloudflare Worker or Firebase rules. Clear your hosting/CDN cache after publishing so HTML and the new modules are served together.

## First live verification — start with one genuine order

1. Sign in to `admin.html` using the existing store admin. Open **الشحن** and use the connection check. An unauthorized response usually indicates admin/session settings; a carrier authentication failure points to the tenant base or token.
2. Open **Assil Delivery / Ecotrack**, refresh **التعرفة والمكاتب**, and compare several wilayas, communes, office addresses and prices with your Assil account. Confirm that zero is genuinely free; a missing value or absent office must not be treated as free service.
3. Test a storefront checkout without placing a fake live order. Check home delivery and a confirmed Stop Desk. The new price is the courier account tariff, not a guaranteed merchant retail policy. Use the price flag above if you charge different customer prices.
4. For one genuine confirmed order, use the existing shipping button. Review the customer, phone, wilaya, commune, office/address and COD amount in the new modal. Old order totals are not silently repriced; explicitly approve any desired change.
5. Create the draft once and compare its tracking number with Assil. Test editing while Assil still confirms that it is a draft. Draft deletion removes the courier draft, **not the store order**. Post-dispatch editing/deletion is blocked.
6. Print the label through the existing label action. Use dispatch validation only when the physical parcel is actually ready/handed to the courier. This is a real courier action, not a preview.
7. Verify customer `tracking.html`, the staff timeline/notes and Telegram delivery when the courier reports a status change. If the live API is temporarily unavailable, customer tracking can show the saved snapshot rather than invent a fresh state.
8. Test exchange/Pickup only for a real after-sales need. They remain linked to the original sale; they are not new sale records. Pickup starts with COD zero; confirm the intended amount and service type.
9. A **return request is not acceptance or completed return**. Confirm physical return receipt only after receiving the parcel. The interface requires an explicit confirmation before sending that action.

## Prices and reference-data behavior

- Wilaya, commune, office and account-tariff responses are cached for one hour. Staff can request a refresh. Storefront fallback uses cached/native prices with a visible availability/fallback message.
- A confirmed zero tariff is preserved. Unknown fees display a dash/unknown state. An office tariff does not prove that an office exists; Stop Desk selection requires a confirmed available desk.
- New checkout UI uses the selected home/office tariff. Existing orders retain their original total unless explicitly edited. Checkout paths already routed through the Worker can be repriced server-side; the package preserves legacy direct-Firestore paths rather than claiming all paths have been migrated.
- Only delivery locations/prices are public. Exchange, return and account-only reference data remain behind admin authentication.

## COD and reports — read the labels carefully

Reports cover **only shipments linked to local ROBUSTE orders**, including linked after-sales parcels. They are not your complete Assil account statement.

- Delivered, collected-but-unpaid and carrier-reported-paid are separate states. **Carrier-reported-paid does not confirm money reached your bank.**
- The reference-cost total uses available completed-shipment tariffs/API-reported fee fields. It is not an invoice or payout balance. Assil may charge outbound and return costs together; the displayed reference sum must not be assumed to represent every debit.
- Missing payment/fee data remain unknown, not zero. Pickup is not counted as a new sales collection. Returned/cancelled items require manual settlement review rather than staying in paid/unpaid sales buckets.
- The documented API Standard endpoints used here do not provide a verified bank-transfer ledger. No fabricated “net payout received” or confirmed bank balance is shown.
- CSV export reflects the same scope and labels; formula-like text is escaped for spreadsheet safety. Reconcile actual settlements against your courier invoices and bank records.

## If an action times out or saving fails

Duplicate prevention uses server-side action reservations. Never bypass an uncertain result by repeatedly creating parcels.

1. If a tracking number is shown despite a saving error, keep it and check that parcel in Assil. The Worker retains known successful tracking where possible so a retry can link it instead of creating another parcel.
2. If the result is marked **pending reconciliation**, search Assil for the same order/reference first. A network timeout can occur after the courier created the parcel.
3. Do not clear server-side reservations or courier fields blindly. Confirm whether a parcel exists before repairing the link or permitting a new creation.
4. Explicit courier rejections are distinguished from ambiguous transport errors; only the safe rejected cases are automatically retryable.
5. On authentication/quota errors, repair the settings or wait for quota reset rather than dispatching repeated calls. Telegram failures are retried; successful status alerts are deduplicated.

## Local validation and rollback

Run the included mocked regression suite with Node:

```bash
node --test tests/*.test.mjs
```

The release includes `ECOTRACK_VALIDATION.md` with tested behavior and limitations. Browser interaction/visual checks use synthetic data, never your live carrier account.

If rolling back, restore the backed-up Worker, website files and compatible Firestore rules together. Keep genuine courier tracking and action records: a code rollback does not cancel already-created courier parcels, and deleting their local links can cause duplicate shipments.
