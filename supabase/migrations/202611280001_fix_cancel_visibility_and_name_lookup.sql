-- Migration 202611280001: Fix cancel requests visibility in KDS, return customer name on OTP request
-- Safe to run multiple times (CREATE OR REPLACE, idempotent).

-- 1) New RPC: get pending cancel requests for authenticated staff.
--    Uses security definer to bypass RLS so the KDS always sees pending requests
--    regardless of table-level policy configuration quirks.
create or replace function public.get_pending_cancel_requests()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare rid uuid; result jsonb;
begin
  if not public.is_approved_staff() then
    raise exception 'Staff permission required';
  end if;
  rid := public.current_restaurant_id();
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'order_id', r.order_id,
      'order_number', r.order_number,
      'table_label', r.table_label,
      'customer_name', r.customer_name,
      'reason', r.reason,
      'status', r.status,
      'created_at', r.created_at
    ) order by r.created_at desc
  ), '[]'::jsonb) into result
  from public.order_cancel_requests r
  where r.restaurant_id = rid and r.status = 'pending';
  return result;
end $$;
revoke all on function public.get_pending_cancel_requests() from public, anon;
grant execute on function public.get_pending_cancel_requests() to authenticated;

-- 2) Update request_customer_otp to also return the customer's name from their last order.
--    This lets the login page pre-fill the name field for returning customers.
create or replace function public.request_customer_otp(p_phone text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare ph text := right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'), 10); otp text; test_mode boolean; nm text;
begin
  if length(ph) <> 10 then raise exception 'Enter a valid 10-digit mobile number'; end if;
  if (select count(*) from public.otp_challenges where phone = ph and purpose = 'customer_login' and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many codes requested. Please wait a few minutes and try again.';
  end if;
  otp := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.otp_challenges(phone, otp_hash, purpose, expires_at)
  values (ph, encode(digest(otp, 'sha256'), 'hex'), 'customer_login', now() + interval '5 minutes');
  -- Look up name from the most recent order placed with this phone number
  select o.customer_name into nm from public.orders o
   where right(o.customer_phone, 10) = ph and coalesce(o.customer_name, '') <> ''
   order by o.created_at desc limit 1;
  test_mode := coalesce((select value from public.app_settings where key = 'otp_test_mode'), 'true') = 'true';
  if test_mode then return jsonb_build_object('sent', true, 'expires_in', 300, 'test_otp', otp, 'name', nm); end if;
  return jsonb_build_object('sent', true, 'expires_in', 300, 'name', nm);
end $$;

revoke all on function public.request_customer_otp(text) from public;
grant execute on function public.request_customer_otp(text) to anon, authenticated;
