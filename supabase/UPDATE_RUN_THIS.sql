-- Migration 202611270001: Fix get_order_public to return subtotal, tax, total, unit_price, line_total
-- Ensures customer dine-in tracking and bill modal always display accurate amounts instead of 0

create or replace function public.get_order_public(p_order_id uuid, p_access_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  result jsonb;
begin
  if not exists(
    select 1 from public.order_access_tokens
    where order_id = p_order_id
      and token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
      and expires_at > now()
  ) then
    if not exists(
      select 1 from public.dining_sessions ds
      join public.orders o on o.dining_session_id = ds.id
      where o.id = p_order_id
        and ds.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
        and ds.status = 'open'
        and ds.access_expires_at > now()
    ) then
      raise exception 'Order access expired';
    end if;
  end if;

  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'payment_status', o.payment_status,
    'table_label', o.table_label,
    'subtotal', coalesce(o.subtotal, 0),
    'tax', coalesce(o.tax, 0),
    'discount', coalesce(o.discount, 0),
    'total', coalesce(o.total, 0),
    'estimated_minutes', o.estimated_minutes,
    'created_at', o.created_at,
    'order_items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'item_name', i.item_name,
          'quantity', i.quantity,
          'unit_price', coalesce(i.unit_price, 0),
          'line_total', coalesce(i.line_total, coalesce(i.unit_price, 0) * coalesce(i.quantity, 1)),
          'status', i.status,
          'menu_item_id', i.menu_item_id,
          'note', i.note
        )
      )
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  ) into result
  from public.orders o
  where o.id = p_order_id;

  return result;
end $$;

revoke all on function public.get_order_public(uuid, text) from public;
grant execute on function public.get_order_public(uuid, text) to anon, authenticated;
-- Shared check: does this access token give the caller access to this order?
-- Used by the customer-facing RPCs below. Customers never get table-level access.
create or replace function public.order_access_valid(p_order_id uuid, p_access_token text)
returns boolean language sql stable security definer set search_path=public,extensions as $$
  select p_access_token is not null and length(p_access_token) > 0 and (
    exists(select 1 from public.order_access_tokens
           where order_id = p_order_id
             and token_hash = encode(digest(p_access_token,'sha256'),'hex')
             and expires_at > now())
    or exists(select 1 from public.dining_sessions ds
              join public.orders o on o.dining_session_id = ds.id
              where o.id = p_order_id
                and ds.access_token_hash = encode(digest(p_access_token,'sha256'),'hex')
                and ds.status = 'open' and ds.access_expires_at > now())
  )
$$;
revoke all on function public.order_access_valid(uuid,text) from public;
grant execute on function public.order_access_valid(uuid,text) to anon, authenticated;

-- Live order + payment status for the customer's own order. Requires the order's access token.
create or replace function public.get_order_status_public(p_order_id uuid, p_access_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb;
begin
  if not public.order_access_valid(p_order_id, p_access_token) then
    raise exception 'Order access expired';
  end if;
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'status', o.status,
    'payment_status', o.payment_status, 'table_label', o.table_label,
    'subtotal', coalesce(o.subtotal,0), 'tax', coalesce(o.tax,0),
    'discount', coalesce(o.discount,0), 'total', coalesce(o.total,0),
    'estimated_minutes', o.estimated_minutes, 'created_at', o.created_at,
    'order_items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'item_name', i.item_name, 'quantity', i.quantity,
        'unit_price', coalesce(i.unit_price,0),
        'line_total', coalesce(i.line_total, coalesce(i.unit_price,0)*coalesce(i.quantity,1)),
        'status', i.status, 'menu_item_id', i.menu_item_id, 'note', i.note))
      from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  ) into result from public.orders o where o.id = p_order_id;
  return result;
end $$;
revoke all on function public.get_order_status_public(uuid,text) from public;
grant execute on function public.get_order_status_public(uuid,text) to anon, authenticated;
-- Only approved staff of the same restaurant can record a payment. Customers and anonymous
-- callers can never mark a bill as paid. Replaces any earlier anonymous-callable version.
drop function if exists public.mark_order_payment(uuid,text,text,boolean);

alter table public.orders add column if not exists payment_method text;

create or replace function public.mark_order_payment(
  p_order_id uuid,
  p_payment_status text default 'paid',
  p_payment_method text default 'cash',
  p_mark_completed boolean default true
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare o public.orders%rowtype;
begin
  if not public.is_approved_staff() then raise exception 'Staff permission required'; end if;
  if p_payment_status not in ('unpaid','partially_paid','paid','refunded') then raise exception 'Invalid payment status'; end if;
  select * into o from public.orders where id = p_order_id and restaurant_id = public.current_restaurant_id() for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status = 'cancelled' and p_payment_status = 'paid' then raise exception 'A cancelled order cannot be paid'; end if;
  update public.orders
     set payment_status = p_payment_status,
         payment_method = p_payment_method,
         status = case when p_mark_completed and p_payment_status = 'paid'
                       and status in ('served','ready_for_collection','ready_for_serving') then 'completed' else status end,
         updated_at = now()
   where id = p_order_id;
  if p_payment_status = 'paid' then perform public.release_table_if_idle(o.table_id); end if;
  return jsonb_build_object('success', true, 'id', p_order_id, 'payment_status', p_payment_status, 'payment_method', p_payment_method);
end $$;
revoke all on function public.mark_order_payment(uuid,text,text,boolean) from public, anon;
grant execute on function public.mark_order_payment(uuid,text,text,boolean) to authenticated;

-- Free the table when the last open order on it is settled (waiters cannot edit tables directly).
create or replace function public.release_table_if_idle(p_table_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_table_id is not null and not exists(
       select 1 from public.orders x where x.table_id = p_table_id and x.status not in ('completed','cancelled') and x.payment_status <> 'paid') then
    update public.dining_tables set status = 'available' where id = p_table_id;
  end if;
end $$;
revoke all on function public.release_table_if_idle(uuid) from public, anon, authenticated;

-- Billing counter: settle one or more orders of a table in a single transaction.
-- Totals are calculated on the server from the stored orders; only the discount comes from staff.
create or replace function public.settle_table_bill(
  p_order_ids uuid[],
  p_payment_method text default 'cash',
  p_discount numeric default 0
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  rid uuid := public.current_restaurant_id();
  sub numeric(12,2); tx numeric(12,2); tot numeric(12,2); disc numeric(12,2);
  n_found int; b public.bills%rowtype; pay_method text; t record;
begin
  if not (public.is_approved_staff() and public.current_role() in ('admin','employee')) then
    raise exception 'Billing permission required';
  end if;
  if p_order_ids is null or array_length(p_order_ids,1) is null then raise exception 'No orders selected'; end if;
  if p_payment_method not in ('cash','upi','upi_manual','card','online') then raise exception 'Invalid payment method'; end if;
  pay_method := case when p_payment_method = 'cash' then 'cash' when p_payment_method in ('upi','upi_manual','card') then 'upi_manual' else 'online' end;

  select count(*), coalesce(sum(subtotal),0), coalesce(sum(tax),0), coalesce(sum(total),0)
    into n_found, sub, tx, tot
    from public.orders where id = any(p_order_ids) and restaurant_id = rid
     and status not in ('cancelled') and payment_status <> 'paid';
  if n_found <> array_length(p_order_ids,1) then
    raise exception 'Some orders are cancelled, already paid, or not found';
  end if;
  disc := least(greatest(coalesce(p_discount,0),0), tot);

  insert into public.bills(restaurant_id, subtotal, tax, discount, total, paid_amount, status)
  values (rid, sub, tx, disc, tot - disc, tot - disc, 'settled') returning * into b;
  insert into public.payments(bill_id, amount, method, status, verified_by)
  values (b.id, greatest(tot - disc, 0.01), pay_method, 'verified', auth.uid());

  update public.orders
     set payment_status = 'paid', payment_method = p_payment_method,
         status = case when status in ('served','ready_for_collection','ready_for_serving') then 'completed' else status end,
         updated_at = now()
   where id = any(p_order_ids) and restaurant_id = rid;

  for t in select distinct table_id from public.orders where id = any(p_order_ids) loop
    perform public.release_table_if_idle(t.table_id);
  end loop;

  return jsonb_build_object('success', true, 'bill_number', b.bill_number, 'subtotal', sub, 'tax', tx,
                            'discount', disc, 'total', tot - disc);
end $$;
revoke all on function public.settle_table_bill(uuid[],text,numeric) from public, anon;
grant execute on function public.settle_table_bill(uuid[],text,numeric) to authenticated;
-- Dine-in cancel requests: the customer asks, kitchen / billing counter staff approve or reject.
create table if not exists public.order_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_number bigint,
  table_label text,
  customer_name text,
  reason text not null default 'Customer requested cancellation',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decision_note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_cancel_one_pending on public.order_cancel_requests(order_id) where status = 'pending';
create index if not exists idx_cancel_status on public.order_cancel_requests(restaurant_id, status, created_at desc);

alter table public.order_cancel_requests enable row level security;
drop policy if exists "staff read cancel requests" on public.order_cancel_requests;
create policy "staff read cancel requests" on public.order_cancel_requests for select to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.is_approved_staff());
-- No insert / update / delete policies: all writes go through the functions below.

-- Customer: ask to cancel their own order (validated by the order access token).
create or replace function public.request_order_cancellation(p_order_id uuid, p_access_token text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare o public.orders%rowtype; existing public.order_cancel_requests%rowtype; new_id uuid; clean_reason text;
begin
  if not public.order_access_valid(p_order_id, p_access_token) then raise exception 'Order access expired'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled') then raise exception 'This order is already cancelled'; end if;
  if o.status in ('served','completed') or o.payment_status = 'paid' then
    raise exception 'This order has already been served or paid and can no longer be cancelled online. Please speak to your server.';
  end if;
  select * into existing from public.order_cancel_requests where order_id = p_order_id and status = 'pending';
  if found then return jsonb_build_object('success', true, 'id', existing.id, 'status', 'pending', 'already_requested', true); end if;
  clean_reason := left(coalesce(nullif(btrim(p_reason), ''), 'Customer requested cancellation'), 300);
  insert into public.order_cancel_requests(restaurant_id, order_id, order_number, table_label, customer_name, reason)
  values (o.restaurant_id, o.id, o.order_number, o.table_label, o.customer_name, clean_reason) returning id into new_id;
  return jsonb_build_object('success', true, 'id', new_id, 'status', 'pending');
end $$;
revoke all on function public.request_order_cancellation(uuid,text,text) from public;
grant execute on function public.request_order_cancellation(uuid,text,text) to anon, authenticated;

-- Customer: see the outcome of their latest request.
create or replace function public.get_order_cancel_status(p_order_id uuid, p_access_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.order_cancel_requests%rowtype;
begin
  if not public.order_access_valid(p_order_id, p_access_token) then raise exception 'Order access expired'; end if;
  select * into r from public.order_cancel_requests where order_id = p_order_id order by created_at desc limit 1;
  if not found then return jsonb_build_object('status', 'none'); end if;
  return jsonb_build_object('status', r.status, 'reason', r.reason, 'decision_note', r.decision_note, 'decided_at', r.decided_at);
end $$;
revoke all on function public.get_order_cancel_status(uuid,text) from public;
grant execute on function public.get_order_cancel_status(uuid,text) to anon, authenticated;

-- Staff (kitchen, billing counter / waiter, admin): approve or reject.
create or replace function public.decide_order_cancellation(p_request_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.order_cancel_requests%rowtype; o public.orders%rowtype;
begin
  if not public.is_approved_staff() then raise exception 'Staff permission required'; end if;
  select * into r from public.order_cancel_requests
   where id = p_request_id and restaurant_id = public.current_restaurant_id() for update;
  if not found then raise exception 'Cancel request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been %', r.status; end if;
  select * into o from public.orders where id = r.order_id for update;

  if p_approve then
    if o.status in ('served','completed') or o.payment_status = 'paid' then
      raise exception 'Order already served or paid. Reject this request instead.';
    end if;
    update public.orders set status = 'cancelled', updated_at = now() where id = o.id;
    update public.order_items set status = 'cancelled' where order_id = o.id and status <> 'served';
    if o.table_id is not null and not exists(
         select 1 from public.orders x where x.table_id = o.table_id and x.id <> o.id and x.status not in ('completed','cancelled')) then
      update public.dining_tables set status = 'available' where id = o.table_id;
    end if;
  end if;

  update public.order_cancel_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decision_note = left(nullif(btrim(coalesce(p_note,'')), ''), 300),
         decided_by = auth.uid(), decided_at = now()
   where id = r.id;
  return jsonb_build_object('success', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end $$;
revoke all on function public.decide_order_cancellation(uuid,boolean,text) from public, anon;
grant execute on function public.decide_order_cancellation(uuid,boolean,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_cancel_requests') then
    alter publication supabase_realtime add table public.order_cancel_requests;
  end if;
end $$;
-- Customer dashboard: load several of the caller's own orders in one call.
-- The browser sends [{id, token}, ...]. Only entries whose access token is valid are returned,
-- so a customer can never read another diner's order (no anonymous table access needed).
create or replace function public.get_my_orders(p_orders jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare result jsonb := '[]'::jsonb; entry jsonb; oid uuid; one jsonb; n int := 0;
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' then return result; end if;
  for entry in select * from jsonb_array_elements(p_orders) loop
    exit when n >= 20;
    begin
      oid := (entry->>'id')::uuid;
    exception when others then
      continue;
    end;
    continue when not public.order_access_valid(oid, entry->>'token');
    select jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'payment_status', o.payment_status, 'payment_method', o.payment_method,
      'table_label', o.table_label, 'customer_name', o.customer_name,
      'subtotal', coalesce(o.subtotal,0), 'tax', coalesce(o.tax,0),
      'discount', coalesce(o.discount,0), 'total', coalesce(o.total,0),
      'estimated_minutes', o.estimated_minutes, 'created_at', o.created_at, 'updated_at', o.updated_at,
      'order_items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'item_name', i.item_name, 'quantity', i.quantity,
          'unit_price', coalesce(i.unit_price,0),
          'line_total', coalesce(i.line_total, coalesce(i.unit_price,0)*coalesce(i.quantity,1)),
          'status', i.status, 'menu_item_id', i.menu_item_id, 'note', i.note))
        from public.order_items i where i.order_id = o.id), '[]'::jsonb)
    ) into one from public.orders o where o.id = oid;
    if one is not null then result := result || jsonb_build_array(one); n := n + 1; end if;
  end loop;
  return result;
end $$;
revoke all on function public.get_my_orders(jsonb) from public;
grant execute on function public.get_my_orders(jsonb) to anon, authenticated;
-- Customer login with a server-verified OTP and a server-issued session token.
-- Replaces the browser-only "OTP" check. A logged-in customer can see and track their own orders
-- (matched by the verified phone number) from any phone, without any open access to the orders table.

create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
-- OTP test mode shows the code on screen (no SMS provider yet). Set to 'false' once SMS delivery is connected.
insert into public.app_settings(key, value) values ('otp_test_mode', 'true') on conflict (key) do nothing;

create table if not exists public.customer_sessions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_customer_sessions_phone on public.customer_sessions(phone);
alter table public.customer_sessions enable row level security;   -- no policies: only the functions below touch it
create index if not exists idx_orders_phone10 on public.orders ((right(customer_phone, 10)));

-- 1) Ask for a code (rate limited)
create or replace function public.request_customer_otp(p_phone text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare ph text := right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'), 10); otp text; test_mode boolean;
begin
  if length(ph) <> 10 then raise exception 'Enter a valid 10-digit mobile number'; end if;
  if (select count(*) from public.otp_challenges where phone = ph and purpose = 'customer_login' and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many codes requested. Please wait a few minutes and try again.';
  end if;
  otp := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.otp_challenges(phone, otp_hash, purpose, expires_at)
  values (ph, encode(digest(otp, 'sha256'), 'hex'), 'customer_login', now() + interval '5 minutes');
  test_mode := coalesce((select value from public.app_settings where key = 'otp_test_mode'), 'true') = 'true';
  if test_mode then return jsonb_build_object('sent', true, 'expires_in', 300, 'test_otp', otp); end if;
  return jsonb_build_object('sent', true, 'expires_in', 300);
end $$;

-- 2) Check the code, open a 30 day session. Wrong codes are counted (5 tries per code).
create or replace function public.verify_customer_otp(p_phone text, p_otp text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare ph text := right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'), 10); ch public.otp_challenges%rowtype; tok text; nm text;
begin
  select * into ch from public.otp_challenges
   where phone = ph and purpose = 'customer_login' and consumed_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'This code has expired. Please request a new one.'); end if;
  if ch.attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'Too many wrong attempts. Please request a new code.'); end if;
  if ch.otp_hash <> encode(digest(coalesce(p_otp,''), 'sha256'), 'hex') then
    update public.otp_challenges set attempts = attempts + 1 where id = ch.id;
    return jsonb_build_object('ok', false, 'error', 'Invalid verification code. Please check and try again.');
  end if;
  update public.otp_challenges set consumed_at = now() where id = ch.id;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into public.customer_sessions(phone, token_hash, expires_at)
  values (ph, encode(digest(tok, 'sha256'), 'hex'), now() + interval '30 days');
  select o.customer_name into nm from public.orders o
   where right(o.customer_phone, 10) = ph and coalesce(o.customer_name, '') <> ''
   order by o.created_at desc limit 1;
  return jsonb_build_object('ok', true, 'token', tok, 'phone', ph, 'name', nm, 'expires_in_days', 30);
end $$;

create or replace function public.customer_session_ok(p_phone text, p_token text) returns boolean
language sql stable security definer set search_path=public,extensions as $$
  select exists(select 1 from public.customer_sessions cs
                where cs.phone = right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'), 10)
                  and cs.token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
                  and cs.expires_at > now())
$$;

-- 3) A logged-in customer may use their session token for orders placed with their verified phone number.
create or replace function public.order_access_valid(p_order_id uuid, p_access_token text)
returns boolean language sql stable security definer set search_path=public,extensions as $$
  select p_access_token is not null and length(p_access_token) > 0 and (
    exists(select 1 from public.order_access_tokens
           where order_id = p_order_id
             and token_hash = encode(digest(p_access_token,'sha256'),'hex')
             and expires_at > now())
    or exists(select 1 from public.dining_sessions ds
              join public.orders o on o.dining_session_id = ds.id
              where o.id = p_order_id
                and ds.access_token_hash = encode(digest(p_access_token,'sha256'),'hex')
                and ds.status = 'open' and ds.access_expires_at > now())
    or exists(select 1 from public.customer_sessions cs
              join public.orders o on o.id = p_order_id and right(o.customer_phone, 10) = cs.phone
              where cs.token_hash = encode(digest(p_access_token,'sha256'),'hex')
                and cs.expires_at > now())
  )
$$;

-- 4) Orders for the verified phone (last 90 days, newest first)
create or replace function public.get_customer_orders(p_phone text, p_token text) returns jsonb
language plpgsql stable security definer set search_path=public,extensions as $$
declare ph text := right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'), 10); result jsonb;
begin
  if not public.customer_session_ok(ph, p_token) then raise exception 'Session expired. Please sign in again.'; end if;
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into result from (
    select o.created_at, jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'payment_status', o.payment_status, 'payment_method', o.payment_method,
      'table_label', o.table_label, 'customer_name', o.customer_name,
      'subtotal', coalesce(o.subtotal,0), 'tax', coalesce(o.tax,0), 'discount', coalesce(o.discount,0), 'total', coalesce(o.total,0),
      'estimated_minutes', o.estimated_minutes, 'created_at', o.created_at, 'updated_at', o.updated_at,
      'order_items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'item_name', i.item_name, 'quantity', i.quantity,
          'unit_price', coalesce(i.unit_price,0),
          'line_total', coalesce(i.line_total, coalesce(i.unit_price,0) * coalesce(i.quantity,1)),
          'status', i.status, 'menu_item_id', i.menu_item_id, 'note', i.note))
        from public.order_items i where i.order_id = o.id), '[]'::jsonb)) as j
    from public.orders o
    where right(o.customer_phone, 10) = ph and o.created_at > now() - interval '90 days'
    order by o.created_at desc limit 50) x;
  return result;
end $$;

create or replace function public.customer_logout(p_token text) returns void
language sql security definer set search_path=public,extensions as $$
  delete from public.customer_sessions where token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
$$;

revoke all on function public.request_customer_otp(text), public.verify_customer_otp(text,text), public.customer_session_ok(text,text),
  public.get_customer_orders(text,text), public.customer_logout(text) from public;
grant execute on function public.request_customer_otp(text), public.verify_customer_otp(text,text),
  public.get_customer_orders(text,text), public.customer_logout(text) to anon, authenticated;
-- Safety cleanup. Earlier experimental migrations opened the orders tables to anonymous visitors.
-- Customers now use token or login based functions only, so remove anything left over.
-- Safe to run on any database (every statement is "if exists").
drop policy if exists "anon read order by id" on public.orders;
drop policy if exists "anon read order items by order id" on public.order_items;
drop policy if exists "anon update order payment status" on public.orders;
drop policy if exists "staff update order payment status" on public.orders;
drop function if exists public.get_order_status_public(uuid);
revoke execute on function public.mark_order_payment(uuid, text, text, boolean) from anon;

-- ---------------------------------------------------------------------------
-- Migration 202611280001: Fix cancel requests visibility in KDS & customer name on OTP
-- ---------------------------------------------------------------------------
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
  select o.customer_name into nm from public.orders o
   where right(o.customer_phone, 10) = ph and coalesce(o.customer_name, '') <> ''
   order by o.created_at desc limit 1;
  test_mode := coalesce((select value from public.app_settings where key = 'otp_test_mode'), 'true') = 'true';
  if test_mode then return jsonb_build_object('sent', true, 'expires_in', 300, 'test_otp', otp, 'name', nm); end if;
  return jsonb_build_object('sent', true, 'expires_in', 300, 'name', nm);
end $$;

revoke all on function public.request_customer_otp(text) from public;
grant execute on function public.request_customer_otp(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Migration 202611280002: Fix KDS cancel requests, sync customers on order, return customer_phone in get_my_orders
-- ---------------------------------------------------------------------------
update public.profiles
set restaurant_id = 'a0000000-0000-0000-0000-000000000001'
where restaurant_id is null;

alter table public.order_cancel_requests enable row level security;
drop policy if exists "staff read cancel requests" on public.order_cancel_requests;
create policy "staff read cancel requests" on public.order_cancel_requests
  for select to anon, authenticated using (true);

create or replace function public.get_pending_cancel_requests()
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare result jsonb;
begin
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
  where r.status = 'pending';
  return result;
end $$;
revoke all on function public.get_pending_cancel_requests() from public;
grant execute on function public.get_pending_cancel_requests() to anon, authenticated;

create or replace function public.decide_order_cancellation(p_request_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.order_cancel_requests%rowtype; o public.orders%rowtype;
begin
  select * into r from public.order_cancel_requests
   where id = p_request_id for update;
  if not found then raise exception 'Cancel request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been %', r.status; end if;
  select * into o from public.orders where id = r.order_id for update;

  if p_approve then
    if o.status in ('served','completed') or o.payment_status = 'paid' then
      raise exception 'Order already served or paid. Reject this request instead.';
    end if;
    update public.orders set status = 'cancelled', updated_at = now() where id = o.id;
    update public.order_items set status = 'cancelled' where order_id = o.id and status <> 'served';
    if o.table_id is not null and not exists(
         select 1 from public.orders x where x.table_id = o.table_id and x.id <> o.id and x.status not in ('completed','cancelled')) then
      update public.dining_tables set status = 'available' where id = o.table_id;
    end if;
  end if;

  update public.order_cancel_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decision_note = left(nullif(btrim(coalesce(p_note,'')), ''), 300),
         decided_by = auth.uid(), decided_at = now()
   where id = r.id;
  return jsonb_build_object('success', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end $$;
revoke all on function public.decide_order_cancellation(uuid,boolean,text) from public;
grant execute on function public.decide_order_cancellation(uuid,boolean,text) to anon, authenticated;

create or replace function public.get_my_orders(p_orders jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare result jsonb := '[]'::jsonb; entry jsonb; oid uuid; one jsonb; n int := 0;
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' then return result; end if;
  for entry in select * from jsonb_array_elements(p_orders) loop
    exit when n >= 20;
    begin
      oid := (entry->>'id')::uuid;
    exception when others then
      continue;
    end;
    continue when not public.order_access_valid(oid, entry->>'token');
    select jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'payment_status', o.payment_status, 'payment_method', o.payment_method,
      'table_label', o.table_label, 'customer_name', o.customer_name,
      'customer_phone', o.customer_phone,
      'subtotal', coalesce(o.subtotal,0), 'tax', coalesce(o.tax,0),
      'discount', coalesce(o.discount,0), 'total', coalesce(o.total,0),
      'estimated_minutes', o.estimated_minutes, 'created_at', o.created_at, 'updated_at', o.updated_at,
      'order_items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'item_name', i.item_name, 'quantity', i.quantity,
          'unit_price', coalesce(i.unit_price,0),
          'line_total', coalesce(i.line_total, coalesce(i.unit_price,0)*coalesce(i.quantity,1)),
          'status', i.status, 'menu_item_id', i.menu_item_id, 'note', i.note))
        from public.order_items i where i.order_id = o.id), '[]'::jsonb)
    ) into one from public.orders o where o.id = oid;
    if one is not null then result := result || jsonb_build_array(one); n := n + 1; end if;
  end loop;
  return result;
end $$;
revoke all on function public.get_my_orders(jsonb) from public;
grant execute on function public.get_my_orders(jsonb) to anon, authenticated;

create or replace function public.sync_customer_profile_on_order()
returns trigger language plpgsql security definer as $$
declare
  v_rid uuid;
  v_phone text;
  v_name text;
begin
  v_rid := coalesce(NEW.restaurant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);
  v_phone := right(regexp_replace(coalesce(NEW.customer_phone, ''), '[^0-9]', '', 'g'), 10);
  v_name := coalesce(nullif(trim(NEW.customer_name), ''), 'Dine-in Guest');

  if length(v_phone) = 10 then
    insert into public.customer_profiles (
      restaurant_id, phone, full_name, created_at, visits, total_spent, status, last_visit
    ) values (
      v_rid, v_phone, v_name, coalesce(NEW.created_at, now()), 1, coalesce(NEW.total, 0), 'New', coalesce(NEW.created_at, now())
    )
    on conflict (restaurant_id, phone) do update set
      full_name = case
        when length(v_name) > 1 and v_name <> 'Dine-in Guest' then v_name
        else public.customer_profiles.full_name
      end,
      visits = coalesce(public.customer_profiles.visits, 0) + 1,
      total_spent = coalesce(public.customer_profiles.total_spent, 0) + coalesce(NEW.total, 0),
      last_visit = coalesce(NEW.created_at, now()),
      status = case
        when (coalesce(public.customer_profiles.visits, 0) + 1) >= 10 then 'VIP'
        when (coalesce(public.customer_profiles.visits, 0) + 1) >= 5 then 'Loyal'
        else 'Regular'
      end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_customer_profile on public.orders;
create trigger trg_sync_customer_profile
after insert on public.orders
for each row execute function public.sync_customer_profile_on_order();

alter table public.customer_profiles enable row level security;
drop policy if exists "customer_profiles_read_all" on public.customer_profiles;
create policy "customer_profiles_read_all" on public.customer_profiles
  for select to anon, authenticated using (true);
drop policy if exists "customer_profiles_write_all" on public.customer_profiles;
create policy "customer_profiles_write_all" on public.customer_profiles
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Migration 202611280003: Auto sync table status on order creation, status change, and payment
-- ---------------------------------------------------------------------------
create or replace function public.sync_table_status_on_order()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare
  v_table_id uuid := NEW.table_id;
  v_table_label text := NEW.table_label;
begin
  if v_table_id is null and v_table_label is not null and length(trim(v_table_label)) > 0 then
    select id into v_table_id from public.dining_tables where upper(trim(table_number)) = upper(trim(v_table_label)) limit 1;
  end if;

  if NEW.payment_status = 'paid' or NEW.status in ('completed', 'cancelled') then
    if v_table_id is not null then
      if not exists (
        select 1 from public.orders o
        where o.table_id = v_table_id
          and o.id <> NEW.id
          and o.status not in ('completed', 'cancelled')
          and coalesce(o.payment_status, 'unpaid') <> 'paid'
      ) then
        update public.dining_tables set status = 'available' where id = v_table_id;
      end if;
    elsif v_table_label is not null and length(trim(v_table_label)) > 0 then
      if not exists (
        select 1 from public.orders o
        where upper(trim(o.table_label)) = upper(trim(v_table_label))
          and o.id <> NEW.id
          and o.status not in ('completed', 'cancelled')
          and coalesce(o.payment_status, 'unpaid') <> 'paid'
      ) then
        update public.dining_tables set status = 'available' where upper(trim(table_number)) = upper(trim(v_table_label));
      end if;
    end if;

  elsif NEW.status not in ('completed', 'cancelled') and coalesce(NEW.payment_status, 'unpaid') <> 'paid' then
    if v_table_id is not null then
      update public.dining_tables set status = 'occupied' where id = v_table_id;
    elsif v_table_label is not null and length(trim(v_table_label)) > 0 then
      update public.dining_tables set status = 'occupied' where upper(trim(table_number)) = upper(trim(v_table_label));
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_table_status_on_order on public.orders;
create trigger trg_sync_table_status_on_order
after insert or update of status, payment_status, table_id, table_label on public.orders
for each row execute function public.sync_table_status_on_order();

grant execute on function public.release_table_if_idle(uuid) to anon, authenticated;



