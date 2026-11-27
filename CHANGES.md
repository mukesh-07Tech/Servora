# Stage 3 — "orders not reaching the kitchen" fix, real QR flow, staff UI redesign

## Apply these steps
```bash
supabase db push          # applies 202611220003_fix_order_to_kitchen.sql  (REQUIRED)
npm install               # adds jsqr (real QR decoding)
npm run build
```
No Edge Function redeploy is needed. After the migration, **regenerate each table's QR** in
Admin → Tables & QR and print the new one (old "T01/T03"-style QR links never worked).

## Why food orders never showed in the kitchen
1. **Customer page faked success.** If `place-order` failed for any reason, `submitOrder()` swallowed the error and
   displayed "Order confirmed and dispatched to kitchen!" with a made-up order number. Nothing was saved.
2. **Wrong table value was sent.** It sent the table label (`T03`) instead of the secret QR token, so the server
   always rejected it (→ fake success above). The demo menu items had non-UUID ids (`m1`, `m2`) which also failed.
3. **Database bug in `place_order()`.** A local variable named `subtotal` collided with the `orders.subtotal`
   column (`SET subtotal = subtotal`) → "column reference is ambiguous" → the whole order rolled back.
4. `digest()` was not on the function's `search_path` on Supabase.
5. **Kitchen query** fetched the *oldest* 100 orders, so new orders disappeared once history grew.

## Fixed / added
- `place_order()` rewritten (variables renamed, search_path, clearer errors); back-fill of missing station tickets.
- New `resolve_table_token()` RPC so the customer page validates the scanned table QR and shows the real table.
- Customer: no more mock orders; real error messages; live menu only (no demo dishes when connected); dynamic
  categories; veg / non-veg badge; image fallback; language toggle; **live order timeline** (placed → preparing →
  ready → served) with per-dish status; **Call waiter / Water / Plates / Bill** buttons (feed Service Requests).
- **QR scanner now actually reads QR codes** (camera via BarcodeDetector/jsQR, photo upload, or paste link). The old one
  returned a hard-coded `T01`.
- Kitchen display: realtime + 10 s polling backup, new-order chime, order-age colours, dish notes, per-station filter,
  Accept-all / Start-all / All-ready, summary counters; kitchen users land on it by default.
- Orders: filters (In kitchen / Ready to serve / Served), items + total columns, newest first, live refresh.
- Overview: real "orders today" / "order value today", newest-first recent orders.
- Tables & QR: no silent fallback to an unusable QR; confirmation before replacing a printed QR; activate/deactivate.
- Service requests: open/completed tabs, "I'll go" / "Done", live.
- Settings: now real (GST, service charge, open/closed switch, profile) + admin RLS policy.
- Staff & attendance reachable by kitchen staff too; readable Edge Function error messages.
- Billing: fixed re-subscribing realtime loop.
- **Staff UI redesigned to match the customer theme** (dining backdrop, frosted cards, #422116 / #ea580c, rounded
  pills, Marcellus headings, larger touch targets, responsive drawer).

## Not verified here
No Supabase project or browser was available in my environment, so I could not click through the live app.
The TypeScript build passes and the new SQL parses with the PostgreSQL parser, but please run the checklist:
1. Admin: create station → menu item (with station) → table → generate QR.
2. Open the QR link on a phone, enter details, order. Kitchen screen should show it within seconds.
3. Kitchen: Accept → Start → Mark ready. Customer timeline updates. Waiter marks served.
