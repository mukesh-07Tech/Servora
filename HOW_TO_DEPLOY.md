# Servora: what to do after downloading the zip

## 1. Update your Supabase database (5 minutes, do this first)

Most "not working" problems come from the database not having the new functions yet.

1. Open your Supabase project, then **SQL Editor > New query**.
2. Open `supabase/UPDATE_RUN_THIS.sql` from this project, copy everything, paste it, press **Run**.
3. It must finish with "Success". It is safe to run again at any time (nothing is deleted, no data is touched).

What it adds: cancel requests with kitchen/billing approval, secure bill settlement for waiters, a server checked customer login, "my orders" lookups, and it **removes the old open access policies** that let any visitor read or change orders.

> If you also use the Supabase CLI, the same SQL is split into numbered files in `supabase/migrations` (`202611270001` to `202611270007`).

## 2. Put the code on GitHub and deploy on Vercel

1. The folder already contains a clean git repository. In a terminal inside the folder:
   ```
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
   (or create a new repo and push; the old repository history contained secrets, so do not reuse it.)
2. In Vercel: **Add New > Project**, import the repo, keep the detected **Vite** settings, press **Deploy**.
3. You do **not** need to add environment variables in Vercel. `.env` is committed on purpose and holds only the public Supabase URL and public anon key (they are visible in every browser anyway; your data is protected by Row Level Security).
4. Never put a service-role key or database password in `.env`. Use `.env.local` (git-ignored) for private values.

## 3. Quick test after deploying (10 minutes)

| Step | Expected result |
|---|---|
| Scan a table QR on a phone, enter name and phone, order 2 dishes | Order tracker opens with the table number |
| Reload the page at every step (details, menu, tracker) | Table, name, guests and cart are still there |
| Admin > Orders, click the order | Customer name, phone, items and amount are shown |
| Kitchen (KDS) | The order appears with the customer name |
| On the phone tap **Request Cancellation** | Kitchen/Orders/Bills show **Approve Cancel / Decline**; after approve the customer sees Cancelled |
| Order again, mark served, then Waiter > Bills > settle | Customer sees **Bill Paid & Settled**, table becomes available |
| Customer login on any phone (same number) | Dashboard lists live orders, past orders, bills |
| Dashboard > **Order More** | A popup opens (choose table if needed), add dishes, place order, tracker updates |

## 4. What was fixed (your list)

1. **Live tracking, multiple orders, pinned selection, auto-hide paid orders, table on reload**: working. Order tabs stay where you click; paid orders move to Past Orders.
2. **Payment sync (both directions)**: waiter or admin settlement updates the customer screen, KDS and Orders. Waiters can now settle bills (only admins could before). The browser can no longer mark a bill paid by itself; online payment stays off until a payment gateway is connected.
3. **Admin selection retention**: done.
4. **Zero bill amount**: staff screens no longer show made-up amounts (an order with no total used to show Rs 180). Amounts come from the saved order, then items.
5. **Cancellation flow**: customer asks, staff approve or decline in Kitchen, Orders or Bills, with a real database table behind it.
6. **Customer dashboard "no page working"**: customers could only see orders placed on the same phone. Login is now verified by the server, and the dashboard shows every order for the verified number on any device. All four pages (Live Tracker, Past Orders, Visits & Bills, Loyalty) were opened on mobile and desktop with no errors.
7. **Table number missing on reload**: table, guest details, step and cart are remembered for 12 hours; an unreadable QR no longer silently becomes table T01.
8. **Customer details and amount in Admin/KDS**: customer name and phone now show in Admin Orders (list and details) and Waiter Bills; fake default values removed. Two real bugs were also fixed: the Kitchen screen crashed when its profile loaded late, and the staff list query asked for a column that does not exist so it was always empty.
9. **Cancel order not working**: works end to end once step 1 above has been run.
10. **Order more after login**: new "Order More" popup inside the dashboard, same look as the dine-in menu (table choice, guests, search, categories, cart, place order).

## 5. Customer login (OTP) you must know about

- The server now creates and checks the code, limits attempts and gives a 30 day session.
- There is **no SMS provider connected**, so the code is shown on screen ("test mode"). This is only as safe as before: anyone who knows a phone number can sign in as it.
- To go live: connect an SMS service (for example a Supabase Edge Function calling your SMS provider), then run `update public.app_settings set value = 'false' where key = 'otp_test_mode';`. Do not switch test mode off before SMS works, or nobody can log in.

## 6. Good to know

- A diner's quick tracking works for 12 hours per order from the device that placed it; logging in with the phone number shows all orders from the last 90 days.
- Changes to the UI were limited to what the new features needed; layouts for phone and desktop were re-tested (390 to 1440 px).
- Rotate your old database password and Supabase keys if you have not already (they were in the previous git history).
- `scratch/` holds old maintenance scripts with credentials removed; it is git-ignored.
