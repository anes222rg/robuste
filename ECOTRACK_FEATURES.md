# Assil / Ecotrack — selected feature update

Implemented for ROBUSTE's existing Assil Delivery integration:

## 1. Shipment status synchronization and alerts

- Background Worker Cron polling with a persisted round-robin cursor.
- Admin-open polling and manual refresh; Firestore live updates in the panel.
- Separate shipment stages and collection/payment states; unknown states stay unknown.
- Courier timeline/notes, customer-tracking snapshot fallback and Telegram exception/status alerts.

## 2. Delivery prices and locations

- Normalized wilayas, communes, confirmed Stop Desks and account tariffs.
- Updated checkout fee getters and home/office selection, with explicit cached fallback.
- Live reference refresh for staff; zero tariffs distinct from missing service.
- Historical COD totals preserved; optional native customer-price mode.

## 3. Parcel controls and after-sales

- Existing parcel creation now has a review modal; original shipment flow retained.
- Live draft checks before edit/delete; original order is kept when deleting a draft.
- Notes, return requests and explicitly confirmed physical return receipt.
- Linked exchange/Pickup parcels without duplicate store sales or extra purchase conversions.
- Existing label/dispatch controls retained; safer creation reservations and partial-save recovery.

## 4. COD and delivery reports

- Linked-shipment collection summaries and reference delivery/return costs.
- Period/search filters, CSV export and wilaya outcome breakdown.
- Bank/payment and estimate limitations are visible, not hidden behind a “net payout” number.

## Not added

- New bulk creation or combined PDF workflow: not selected for this update.
- Warehouse/product-inventory synchronization, a verified bank-transfer ledger or webhooks: not claimed by this implementation.
- Live deployment or changes to your real Assil parcels: not performed.

## Release checklist

1. Back up the current deployment.
2. Deploy `cloudflare-worker.js` to the existing Worker, retaining secrets.
3. Add `*/5 * * * *` Cron and publish `firestore.rules`.
4. Upload all changed/new website files; use `admin.html`.
5. Verify reference data and one genuine draft before using live dispatch/returns.

See `ECOTRACK_SETUP.md` for settings, safe retries and financial limitations.
