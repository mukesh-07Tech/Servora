# Servora audit report

## Security fixes (most important)
- Removed login bypasses in the staff login. Typing `admin`, `waiter` or `kitchen` (any password, or KDS mode with anything) used to grant that role instantly from client-side code. Every sign-in now goes through Supabase Auth and the role is read only from the `profiles` table.
- If the profile could not be loaded, the old code fell back to role `admin`. It now signs the user out.
- The cached profile in localStorage was trusted. It is now validated against the real session and cleared when there is no session, or the profile is not approved.
- `/kitchen` and `/kds` are limited to kitchen and admin accounts.
- Removed pre-filled kitchen credentials (`kitchen@servora.com` / `Password123!`) and the "Auto-fill" button.
- Removed hardcoded Supabase URL and anon key fallbacks from `src/lib/supabase.ts`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
- Seed scripts no longer contain a database host or password. They read `DATABASE_URL` and `DEMO_PASSWORD` from the environment.
- Customer "online payment" marked bills paid from the browser. It now never marks a bill paid; update errors are checked.

## Other fixes
- Emojis removed from the landing page (replaced with Lucide SVG icons); decorative glyphs (arrows, check marks, flourish) removed from the app.
- Removed the hardcoded waiter name/photo ("Arun Kumar"), the fake "3 notifications" badge, and fake card numbers.
- Occupancy figure spacing on the admin dashboard.

## Not done / needs you
- Rotate the Postgres password and Supabase keys. They were committed in git history and in `scratch/` (not shipped in this ZIP).
- Live Supabase flows (real login, RLS, order placement, realtime) were not tested. The sandbox cannot reach Supabase. UI was tested against a mocked API.
- Remaining demo data: Reports and Customers pages contain fixed sample figures (e.g. trend percentages, sample revenue cards). Replace with real queries.
- Online payment needs a real gateway (Razorpay) with server-side verification.
- App.tsx (7,500 lines) and the 15k-line CSS were not refactored. The bundle is a single 1.1 MB chunk.

## Update: Cancel Request, bill and pay (merged from Servora__2_.zip)
Merged the reference's cancel-request flow and bill fixes into the corrected project (three-way merge against the original, so the security fixes above are kept).
- **Cancel Request** (dine-in tracker and customer dashboard) goes to Kitchen, Orders and the Billing counter. Staff approve or decline. Approval cancels the order and its items and frees the table; decline tells the customer.
- The reference stored requests as text notes in `service_requests`. Replaced with a real table, `order_cancel_requests`, and three functions: `request_order_cancellation` (customer, needs the order access token), `get_order_cancel_status` (customer) and `decide_order_cancellation` (approved staff of the same restaurant only). Served or paid orders cannot be cancelled online.
- **Not ported from the reference:** its migrations let any anonymous visitor read every order and mark any order paid (`using (true)` policies and an anon-callable `mark_order_payment`). Replaced with: `get_order_status_public` (needs access token), `mark_order_payment` (approved staff only), and `settle_table_bill` (admin/employee only; totals computed on the server; records the bill and payment, marks orders paid, frees the table). The billing counter previously failed for waiters because only admins may insert bills.
- Removed browser-stored "paid" flags; paid status now comes only from the server.
- Reference reintroduced emojis and arrows; removed again.
- **Run the new migrations** in order: `202611270001` to `202611270004`.
- **Tested:** migrations executed on a real PostgreSQL 16 with stubbed Supabase roles; permission tests for anon, customer token, kitchen, waiter, admin, unapproved and other-restaurant staff all behave as intended. UI tested with a mocked API (Approve calls the function from Kitchen, Orders and Billing; desktop and 390px). Not tested against your live Supabase, real RLS with the JS client, or the customer-side Cancel button end to end.

## Update: customer mobile UI and deployment
- New `src/customer-mobile.css` (loaded last) restyles the QR dine-in flow under 640px; desktop layout is unchanged. Same palette, fonts and logo.
- **Check-in:** compact sticky bar, single-row stepper, table confirmed state with Change / Scan QR, collapsed table picker, large inputs (16px, no iOS zoom), sticky confirm button.
- **Menu:** two-row header, sticky category tabs, scrollable quick-help chips, list-style dish cards with description and photo, bottom "View order" bar and slide-up order sheet, toasts moved to the top.
- **Tracker, login and My Orders dashboard:** tidy summary row, vertical progress steps, fixed price/status overlap, login header alignment.
- Removed the dead "favourite" heart button, fixed broken cart thumbnails, renamed Cancel Order to Cancel Request.
- Tested at 360, 375, 390, 414, 430, 768, 820, 1024, 1280 and 1440 px: no horizontal overflow, no page errors (mocked API).
- Known limitation: the customer "OTP login" only stores a flag in the browser; it is not a server session. Treat the customer dashboard as convenience, not security.
