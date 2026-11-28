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

## Update: your new features merged (Servora__2__1.zip)
Merged without changing the UI: multiple active orders with an order switcher, a pinned selection that survives live polling (customer dashboard and staff Orders), Pay Bill enabled only after the order is served plus the 10 minute timer, "Order More / Fresh Booking" after a paid bill without login, and the table number persisting across reloads.
- **One change under the hood (security):** those features read orders by phone number, table name and order number straight from the database as an anonymous visitor. That only worked with open read policies that would expose every guest's orders to anyone. Instead, every order placed from a device keeps its own access token and the dashboard loads them with the new `get_my_orders` function (migration `202611270005`), which returns only orders whose token is valid.
- **Behaviour difference:** the dashboard shows the orders placed from this phone or browser during the last 12 hours (the order token lifetime). Other diners' orders at the same table, and lookups by phone number from another device, are no longer visible; those need a real OTP login.
- Browser-stored "paid" flags are not trusted; paid status comes from the server.
- **Run migration `202611270005` in Supabase** (in addition to 0001 to 0004).
- Tested: database isolation on PostgreSQL (own orders only, wrong or missing tokens ignored, anonymous direct reads return nothing), multi-order switching and pin persistence, pay gating, fresh booking, table persistence, at 390, 820 and 1440px; staff roles and cancel approval re-run with no regressions.

## Update: customer dashboard, Order More, staff sync, reload (final round)
See HOW_TO_DEPLOY.md for the deployment steps and the issue-by-issue list.
- New migrations `202611270006` (server verified customer login and sessions) and `202611270007` (removes leftover open-access policies). `supabase/UPDATE_RUN_THIS.sql` bundles 0001 to 0007 and was run twice on a database that had the old open policies and once on the original schema.
- Tested against the real schema and row-level security by running the website against a local PostgREST: order placement, staff views, cancel request and approval, waiter settlement, payment shown to customer, second-device login, every dashboard page, Order More popup, sign out.
- Fixed: Kitchen crash (hooks order), redirect to login on reload with a valid session, staff list query using a missing column, wrong-table fallback (T01), invented amounts on Orders, bills page not detecting busy tables or skipping cancelled orders.
