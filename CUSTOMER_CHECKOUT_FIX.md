# Customer checkout correction — commune list and Stop Desk availability

## What customers now see

1. Choose a wilaya.
2. Choose a commune from a real, required dropdown — not a text box or optional suggestions.
3. The commune options and an adjacent message show **desk available** or **home delivery only**.
4. Unavailable Stop Desk choices are disabled. Home delivery is the initial default.
5. Home and office fees are shown beside the delivery choices and in the total. Missing prices are not substituted with a free fee or a home-delivery price.
6. Where the courier publishes a detailed office, its name/address are displayed. Otherwise the confirmed commune-level availability is used and the customer is explicitly told that the exact office address will be confirmed before shipment. No address is invented.
7. Office selection fills the pickup location; switching back to home restores the customer's previous home address.

The same behavior is included in normal checkout and quick-buy. New customer-facing labels follow the existing Arabic, English or French language selection; commune values remain canonical carrier names. The primary and quick-buy commune controls keep their original IDs so existing order submission reads the chosen canonical commune name.

## Why this correction was necessary

The previous customer module attached a datalist to a text field instead of providing a real dropdown. It also checked only detailed desks by wilaya, even though the API publishes confirmed Stop Desk availability per commune. A commune may support office pickup without its detailed office address appearing in the separate desk response.

The correction uses the commune's `stopDesk` flag and any matching detailed office. A fee alone does not prove that a desk is available.

## Apply the focused patch

1. Back up the current site and Worker.
2. In the existing Cloudflare Worker, replace all source with the included `cloudflare-worker.js` and deploy it. Keep your existing variables, token and Cron trigger. The server-side intake rule now accepts the same confirmed commune-level desk choices as checkout.
3. Merge the patch's `robuste/` folder into the same existing website folder, replacing the listed files. It is not a standalone site: your current images and other unchanged assets remain in place.
4. Upload **all affected HTML pages**, `main.js`, `robuste-delivery-index.js`, `robuste-ecotrack-delivery.js`, the new `robuste-ecotrack-delivery.css` and `robuste-delivery-locations.json`. The patch also includes an admin module compatibility update so these valid customer office choices can be shipped.
5. Clear the hosting/CDN cache and reload the customer page. The affected HTML now requests the customer module/stylesheet with `?v=3`.

You do not need new credentials, a new Worker or a new Firestore rules change for this focused correction if the earlier rules were already deployed.

## Reference outage behavior

The bundled JSON contains only the public delivery locations from the already-working reference endpoint. It keeps the commune dropdown usable if the live reference cannot load. This fallback is explicitly labelled as last-known location data and preliminary pricing to be confirmed before shipping. It does not claim that a cached desk is freshly verified.

Setting `ECOTRACK_LIVE_DELIVERY_PRICES=false` retains the store's original customer-facing prices, while still providing the live commune dropdown and desk availability.

## Check as a customer — without submitting an order

- Choose **سطيف / Hamma**: a commune dropdown is present, the message says home delivery only, and office is disabled.
- Choose **سطيف / Setif**: office becomes available, the courier's published office information and fee appear when selected.
- Choose **الجزائر / Bab Ezzouar**: its confirmed commune flag permits office pickup even without a detailed address in the separate desk list; the address-confirmation caveat is shown.
- Change wilaya: the previous commune is cleared instead of remaining attached to another wilaya.
- Repeat in quick-buy on mobile.

These examples use the public reference data obtained during preparation; if the carrier changes availability or prices, the live response is authoritative.

This patch was prepared and locally validated, not uploaded to your live website by the agent. No genuine order or courier parcel was created, edited or dispatched in the tests.
