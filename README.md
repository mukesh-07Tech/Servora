# SERVORA — Dine-in QR & Restaurant Operations

This project keeps the uploaded SERVORA marketing page and its existing visual identity, while replacing the browser-only demo application with a React + Vite + TypeScript workspace.

## What is implemented in this build

- Existing landing-page markup, typography, palette, food photography and marketing sections are retained in `index.html`. The old demo engine (`localStorage`, seeded demo orders, hard-coded `123456` OTP and unrestricted role switcher) has been removed.
- React application shell with mobile-responsive staff workspace and customer ordering page.
- Supabase client configuration and secure staff phone/password sign-in.
- Staff registration Edge Function. New accounts are created as pending staff; the user cannot enter the workspace until an administrator approves them. Kitchen staff must be assigned a station.
- Admin overview, live order list, kitchen display, menu CRUD starter (create + availability), station creation, table creation, QR generation/download, staff approvals, daily attendance code generation, attendance check-in/out, service request queue, and a testing-safe billing information screen.
- Customer menu, category/search filtering, cart, server-validated order submission, consolidated order tracking, customer service requests, and OTP-protected order-history flow.
- SQL schema, RLS policies, transactional and idempotent order placement RPC, multi-station ticket splitting, FCFS queue sequence, station-capacity-based preparation estimate, item-to-master-order status roll-up, public table QR validation, and role-checked waiter delivery confirmation.
- Test OTP is generated per request, stored as a hash, expires after five minutes and is displayed only in non-production Edge Function mode. There is no fixed OTP.
- Razorpay is deliberately not integrated in this testing build. No browser callback can mark a payment as paid.

## Important implementation boundary

This is a substantial working foundation, not yet a fully certified production restaurant ERP. Advanced inventory consumption/recipes, complete split-bill settlement/refunds, menu time-slot scheduler, customer feedback, full analytics, real AI semantic voice ordering, real WhatsApp/SMS/email delivery, and automated production OTP delivery have database foundations or configuration boundaries but are not fully wired into finished screens/workflows yet. Do not deploy for live financial operations until these are completed and the security checklist is passed.

## Requirements

- Node.js 20+
- A Supabase project
- Supabase CLI (recommended for migrations and Edge Functions)

## 1. Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Set the public project credentials in `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_APP_ENV=development
```

Only the Supabase URL and anon/public key belong in frontend environment variables. Never put a service-role key in a `VITE_` variable.

## 2. Configure Supabase

Link the CLI to your project, then apply the migration:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration is `supabase/migrations/202611220001_initial_schema.sql`.

Set server-only Edge Function secrets:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set APP_ENV=development
supabase secrets set RESTAURANT_ID=YOUR_RESTAURANT_UUID
supabase secrets set PUBLIC_APP_URL=https://YOUR_VERCEL_DOMAIN
```

`PUBLIC_APP_URL` is used to create table QR links. `RESTAURANT_ID` is used by the public staff registration endpoint. Keep `APP_ENV=development` only while testing; set it to `production` before launch. In production, the test OTP is never returned to the browser and a real SMS delivery provider must be configured.

Deploy the functions:

```bash
supabase functions deploy request-test-otp
supabase functions deploy verify-test-otp
supabase functions deploy place-order
supabase functions deploy staff-register
supabase functions deploy create-table-qr
supabase functions deploy create-attendance-code
supabase functions deploy attendance-action
```

Function JWT settings are in `supabase/config.toml`.

## 3. Bootstrap the first administrator

1. In Supabase Dashboard → Authentication → Users, create the first staff user with a phone number and password. Confirm the phone for this initial administrator account.
2. Run the following SQL in the Supabase SQL editor. Replace the placeholders with your real values and use the Auth user's UUID:

```sql
insert into public.restaurants(name,slug,phone,address)
values ('SERVORA','servora','YOUR_RESTAURANT_PHONE','YOUR_RESTAURANT_ADDRESS')
returning id;

-- Use the returned restaurant UUID and the Auth user UUID:
update public.profiles
set restaurant_id = 'YOUR_RESTAURANT_UUID',
    role = 'admin',
    approval_status = 'approved',
    full_name = 'Restaurant Administrator'
where id = 'YOUR_AUTH_USER_UUID';
```

3. Set `RESTAURANT_ID` to the same restaurant UUID using `supabase secrets set`.
4. Sign in at `/staff-login` using the admin's phone number and password.
5. Create kitchen stations first, then assign each menu item to a station. Create tables and generate a QR for each table.

For a 10-digit Indian mobile number, staff sign-in normalizes the number to `+91` automatically. Existing Auth accounts should be stored in Supabase in E.164 format.

## 4. Customer QR ordering test

1. Sign in as administrator.
2. Open **Menu management** and create at least one kitchen station.
3. Create menu items and assign each item to a station.
4. Open **Tables & QR codes**, create a table and generate its QR.
5. Download/scan the QR. It opens `/order?table=<opaque-token>`.
6. Enter customer name and mobile, add menu items, then place the order.
7. The `place-order` Edge Function calls the transactional `place_order` database function. It validates the QR token, table state, menu availability and server-side prices, then creates one master order and station-specific tickets.
8. Kitchen users must be approved and assigned a station to access the corresponding queue.

## 5. Test OTP behaviour

- In development only, `request-test-otp` returns a newly generated six-digit OTP. The customer verification UI displays it under the OTP field for testing.
- Each challenge expires after five minutes, is hashed in the database, has a five-attempt limit, and can be consumed only once.
- `APP_ENV=production` suppresses the OTP from the response. A production SMS provider still needs to be connected.

## 6. Build and deploy

```bash
npm run build
```

Deploy the repository to Vercel as a Vite project. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_ENV=production` in Vercel project environment variables. The included `index.html` is the preserved marketing page and contains the React mount at the existing demo section. Configure SPA rewrites so `/order`, `/staff-login`, `/staff-register` and `/app/*` serve `index.html`.

Suggested `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## 7. Testing checklist

- [ ] Apply the migration to a fresh Supabase project.
- [ ] Bootstrap the first admin account and restaurant.
- [ ] Verify pending staff cannot access `/app` or any protected table through direct API calls.
- [ ] Create stations, menu items and tables.
- [ ] Generate and revoke/regenerate QR tokens; old tokens must fail after regeneration.
- [ ] Place an order from a real table QR; verify prices and station routing in PostgreSQL.
- [ ] Verify each kitchen user sees only their assigned station tickets.
- [ ] Update item statuses and verify the master order status roll-up.
- [ ] Verify waiter delivery is blocked until every item is ready.
- [ ] Test OTP expiry, attempt limits, one-time use and production suppression.
- [ ] Test attendance code expiry and duplicate check-in/check-out.
- [ ] Test RLS with anon, kitchen, employee and admin accounts separately.
- [ ] Configure actual SMS/email/WhatsApp providers before enabling production notifications.
- [ ] Complete billing, split payments, refunds, inventory and analytics acceptance tests before live launch.

## Security notes

- The service-role key is used only inside Edge Functions.
- Public customer ordering uses opaque QR tokens and a security-definer transaction; public clients do not receive broad table/order read access.
- Customer order tracking uses a short-lived access token and the `get_order_public` RPC.
- Staff role and approval are read from `profiles`, not chosen in the browser.
- Razorpay is not connected. Do not accept online payments until a verified server-side payment flow is implemented.

## Implementation stage 2 — operational workflows

This stage adds the following working source changes:

- Admin menu catalogue now supports create, edit, soft-delete, availability toggle, category creation, station creation, English/Tamil dish names, descriptions and menu-image upload to the `menu-images` Supabase Storage bucket.
- Admin menu loading includes unavailable items so they can be re-enabled; the public customer menu only receives active and available items.
- Customer menu displays uploaded food images, supports an English/Tamil name toggle, and supports item-specific preparation notes.
- Kitchen staff database reads are narrowed to their assigned station. The KDS exposes explicit Accept → Start preparation → Mark ready transitions.
- Kitchen item status changes now update station-ticket status, master-order status and order-status history in one database transaction.
- Repeat orders from the same table and verified mobile number reuse the active dining session, enabling a consolidated dining-session bill. Each order receives its own tracking access token.
- Billing now supports session bill generation/refresh, GST and configured service-charge calculation, cash payment recording, manual UPI payment recording, and administrator verification of pending UPI payments. There is no payment gateway integration.
- Staff workspace route rendering is role-checked so a user cannot open an admin-only screen by typing its URL.
- Added migration `202611220002_kitchen_scope_and_menu_workflows.sql` for the above database changes and RLS rules.

### Stage 2 database update

After applying the original migration, apply the new migration:

```bash
supabase db push
```

### Environment file

Keep `.env.example` in source control. Copy it to `.env` locally:

```powershell
Copy-Item .env.example .env
```

Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and the non-secret `VITE_APP_ENV` are used in the frontend. Configure `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENV`, `RESTAURANT_ID` and `PUBLIC_APP_URL` using `supabase secrets set`; never put the service-role key in `.env` or a `VITE_` variable.

### Validation performed for stage 2

- TypeScript/TSX transpile syntax checks passed for the app and library source files.
- CSS parser check passed.
- Confirmed the landing-page anchors and React mount remain present.
- Confirmed the old localStorage demo engine, fixed `123456` OTP and demo seed function are absent from the active `index.html`.
- A full dependency install and production build could not be completed in this environment because the npm registry request timed out. Run `npm install` and `npm run build` locally before deployment.

## Remaining work before production

The project is not yet production-certified. Still required: full order cancellation/modification approval UI, table merge/transfer and close-visit workflows, full inventory/recipe deduction, configurable menu time schedules, complete customer feedback and customer management, detailed analytics, settings forms, QR camera scanning for attendance, real SMS/WhatsApp/email provider delivery, AI semantic voice ordering, PDF invoice/receipt output, and a full browser/device/RLS acceptance test. Do not use this build for live financial operations until those items and the production security review are complete.
