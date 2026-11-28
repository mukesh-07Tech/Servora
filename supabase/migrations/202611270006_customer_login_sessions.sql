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
