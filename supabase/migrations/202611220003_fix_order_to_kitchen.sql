-- =====================================================================
-- Fix: orders placed by customers were not reaching the kitchen screen.
--
-- 1. place_order() declared a local variable named "subtotal" which clashes
--    with the orders.subtotal column inside UPDATE ... SET subtotal=subtotal.
--    PostgreSQL raises "column reference subtotal is ambiguous", the whole
--    transaction rolls back and no order / station ticket is ever written.
-- 2. digest() lives in the "extensions" schema on Supabase; the function's
--    search_path did not include it.
-- 3. Adds resolve_table_token() so the customer page can validate a scanned QR
--    and show the real table label before ordering.
-- 4. Back-fills station tickets for any order that was stored without them.
-- 5. Makes sure the realtime publication includes every table the KDS watches.
-- =====================================================================

create extension if not exists pgcrypto;

create or replace function public.place_order(p_table_token text,p_customer jsonb,p_items jsonb,p_access_token text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  q record; existing_order record; sess uuid; oid uuid; item jsonb; mi record; oi uuid; ticket uuid; st uuid;
  v_subtotal numeric(12,2):=0; v_taxrate numeric(5,2):=0; v_est integer:=0; v_phone text; v_hash text;
begin
  if length(coalesce(p_table_token,''))<20 or length(coalesce(p_access_token,''))<20 then raise exception 'Invalid table session. Please scan the QR code on your table again.'; end if;
  v_phone:=regexp_replace(coalesce(p_customer->>'phone',''),'[^0-9]','','g');
  v_hash:=encode(digest(p_access_token,'sha256'),'hex');

  select qr.id as qr_id,dt.table_number,dt.id as tid,dt.restaurant_id as rid into q
  from public.table_qr_codes qr join public.dining_tables dt on dt.id=qr.table_id
  where qr.token_hash=encode(digest(p_table_token,'sha256'),'hex') and qr.is_active and qr.revoked_at is null
    and (qr.expires_at is null or qr.expires_at>now()) and dt.is_active;
  if not found then raise exception 'This table QR is invalid or expired. Please ask staff for a new QR.'; end if;
  if length(coalesce(p_idempotency_key,''))<16 then raise exception 'Missing order request key'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;

  perform pg_advisory_xact_lock(hashtext(p_idempotency_key));
  select o.* into existing_order from public.order_idempotency_keys k join public.orders o on o.id=k.order_id where k.idempotency_key=p_idempotency_key;
  if found then
    if existing_order.table_id<>q.tid or existing_order.customer_phone<>v_phone then raise exception 'Order request key already used'; end if;
    update public.dining_sessions set access_token_hash=v_hash,access_expires_at=now()+interval '12 hours' where id=existing_order.dining_session_id;
    insert into public.order_access_tokens(order_id,token_hash,expires_at) values(existing_order.id,v_hash,now()+interval '12 hours') on conflict (token_hash) do nothing;
    return jsonb_build_object('id',existing_order.id,'order_number',existing_order.order_number,'access_token',p_access_token,'status',existing_order.status);
  end if;

  select r.gst_rate into v_taxrate from public.restaurants r where r.id=q.rid and r.is_open=true;
  if not found then raise exception 'The restaurant is currently closed for orders'; end if;

  select ds.id into sess from public.dining_sessions ds
  where ds.table_id=q.tid and ds.restaurant_id=q.rid and ds.customer_phone=v_phone and ds.status='open' and ds.access_expires_at>now()
  order by ds.opened_at desc limit 1 for update;
  if sess is null then
    insert into public.dining_sessions(restaurant_id,table_id,customer_name,customer_phone,persons,access_token_hash)
    values(q.rid,q.tid,left(trim(p_customer->>'name'),100),v_phone,greatest(1,coalesce((p_customer->>'persons')::int,1)),v_hash) returning id into sess;
  else
    update public.dining_sessions set customer_name=left(trim(p_customer->>'name'),100),persons=greatest(1,coalesce((p_customer->>'persons')::int,1)),access_token_hash=v_hash,access_expires_at=now()+interval '12 hours' where id=sess;
  end if;

  insert into public.orders(restaurant_id,dining_session_id,table_id,customer_name,customer_phone,table_label,status)
  values(q.rid,sess,q.tid,left(trim(p_customer->>'name'),100),v_phone,q.table_number,'received') returning id into oid;
  insert into public.order_access_tokens(order_id,token_hash,expires_at) values(oid,v_hash,now()+interval '12 hours') on conflict (token_hash) do nothing;

  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item->>'quantity')::int,0)<1 or (item->>'quantity')::int>30 then raise exception 'Invalid item quantity'; end if;
    select m.* into mi from public.menu_items m where m.id=(item->>'menu_item_id')::uuid and m.restaurant_id=q.rid and m.is_available and m.deleted_at is null;
    if not found then raise exception 'One or more dishes in your cart are no longer available'; end if;
    if mi.station_id is null then raise exception 'The dish "%" has no kitchen station assigned. Please tell the restaurant staff.',mi.name; end if;
    insert into public.order_items(order_id,menu_item_id,item_name,quantity,unit_price,line_total,note,station_id,prep_minutes)
    values(oid,mi.id,mi.name,(item->>'quantity')::int,mi.price,mi.price*(item->>'quantity')::int,left(coalesce(item->>'note',''),300),mi.station_id,mi.prep_minutes) returning id into oi;
    v_subtotal:=v_subtotal+mi.price*(item->>'quantity')::int; v_est:=greatest(v_est,mi.prep_minutes);
  end loop;

  update public.orders o set subtotal=v_subtotal,tax=round(v_subtotal*v_taxrate/100,2),total=round(v_subtotal+v_subtotal*v_taxrate/100,2),estimated_minutes=v_est where o.id=oid;

  for st in select distinct i.station_id from public.order_items i where i.order_id=oid and i.station_id is not null loop
    insert into public.station_tickets(order_id,station_id) values(oid,st) returning id into ticket;
    insert into public.station_ticket_items(ticket_id,order_item_id,quantity) select ticket,i.id,i.quantity from public.order_items i where i.order_id=oid and i.station_id=st;
    select greatest(v_est,ceil((
      coalesce((select sum(i.prep_minutes*i.quantity) from public.order_items i join public.orders o2 on o2.id=i.order_id where i.station_id=st and i.order_id<>oid and i.status in ('new','accepted','preparing') and o2.status not in ('completed','cancelled')),0)
      +coalesce((select sum(i.prep_minutes*i.quantity) from public.order_items i where i.order_id=oid and i.station_id=st),0)
    )/greatest(ks.capacity,1))::int) into v_est from public.kitchen_stations ks where ks.id=st;
  end loop;
  update public.orders o set estimated_minutes=v_est where o.id=oid;

  insert into public.order_idempotency_keys(idempotency_key,order_id) values(p_idempotency_key,oid);
  insert into public.order_status_history(order_id,new_status,note) values(oid,'received','Customer order submitted');
  update public.dining_tables set status='ordering' where id=q.tid;
  return jsonb_build_object('id',oid,'order_number',(select o.order_number from public.orders o where o.id=oid),'access_token',p_access_token,'status','received');
end $$;
revoke all on function public.place_order(text,jsonb,jsonb,text,text) from public;
grant execute on function public.place_order(text,jsonb,jsonb,text,text) to anon,authenticated;

-- Public QR validation: returns only the table label and whether ordering is open.
create or replace function public.resolve_table_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare r record;
begin
  if length(coalesce(p_token,''))<20 then return jsonb_build_object('valid',false); end if;
  select dt.table_number,rs.is_open,rs.name into r
  from public.table_qr_codes qr join public.dining_tables dt on dt.id=qr.table_id join public.restaurants rs on rs.id=dt.restaurant_id
  where qr.token_hash=encode(digest(p_token,'sha256'),'hex') and qr.is_active and qr.revoked_at is null
    and (qr.expires_at is null or qr.expires_at>now()) and dt.is_active;
  if not found then return jsonb_build_object('valid',false); end if;
  return jsonb_build_object('valid',true,'table_number',r.table_number,'is_open',r.is_open,'restaurant',r.name);
end $$;
revoke all on function public.resolve_table_token(text) from public;
grant execute on function public.resolve_table_token(text) to anon,authenticated;

-- Back-fill: any order item that has no station ticket row gets one so the KDS can see it.
do $$
declare r record; t uuid;
begin
  for r in
    select distinct i.order_id,i.station_id from public.order_items i
    where i.station_id is not null and i.status in ('new','accepted','preparing')
      and not exists(select 1 from public.station_ticket_items sti where sti.order_item_id=i.id)
  loop
    select id into t from public.station_tickets where order_id=r.order_id and station_id=r.station_id limit 1;
    if t is null then insert into public.station_tickets(order_id,station_id) values(r.order_id,r.station_id) returning id into t; end if;
    insert into public.station_ticket_items(ticket_id,order_item_id,quantity)
    select t,i.id,i.quantity from public.order_items i
    where i.order_id=r.order_id and i.station_id=r.station_id
      and not exists(select 1 from public.station_ticket_items sti where sti.order_item_id=i.id);
  end loop;
end $$;

-- Realtime for every table the kitchen/service screens subscribe to.
do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['orders','order_items','station_tickets','station_ticket_items','service_requests'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

-- digest() must be resolvable by every function that hashes QR / access tokens.
alter function public.get_order_public(uuid,text) set search_path=public,extensions;
alter function public.create_service_request(text,text,text) set search_path=public,extensions;

-- Settings screen: restaurant administrators can update their own restaurant record.
drop policy if exists "admin update restaurant" on public.restaurants;
create policy "admin update restaurant" on public.restaurants for update to authenticated
  using(id=public.current_restaurant_id() and public.is_restaurant_admin())
  with check(id=public.current_restaurant_id() and public.is_restaurant_admin());

-- Service requests: let staff see them (already allowed) and make sure completed ones can be filtered quickly.
create index if not exists service_requests_open_idx on public.service_requests(restaurant_id,status,created_at desc);
