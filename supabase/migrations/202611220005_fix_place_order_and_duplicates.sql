-- Migration 202611220005: Allow place_order by table number or token & remove duplicates

-- 1. Remove duplicate menu items keeping the first row for each distinct name
delete from public.menu_items
where id in (
  select id from (
    select id, row_number() over (partition by name order by created_at) as r
    from public.menu_items
  ) t where t.r > 1
);

-- 2. Enhanced place_order function that resolves tables by either QR token or direct table label (e.g. T01, T03)
create or replace function public.place_order(p_table_token text,p_customer jsonb,p_items jsonb,p_access_token text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  q record; existing_order record; sess uuid; oid uuid; item jsonb; mi record; oi uuid; ticket uuid; st uuid;
  v_subtotal numeric(12,2):=0; v_taxrate numeric(5,2):=0; v_est integer:=0; v_phone text; v_hash text;
  v_clean_table text;
begin
  if length(coalesce(p_table_token,''))<1 or length(coalesce(p_access_token,''))<16 then
    raise exception 'Invalid table session. Please select your table before ordering.';
  end if;
  v_phone:=regexp_replace(coalesce(p_customer->>'phone',''),'[^0-9]','','g');
  v_hash:=encode(digest(p_access_token,'sha256'),'hex');
  v_clean_table:=upper(trim(p_table_token));

  -- Look up table by token hash OR by table number directly (e.g. T01, T02, T03)
  select coalesce(qr.id, gen_random_uuid()) as qr_id, dt.table_number, dt.id as tid, dt.restaurant_id as rid into q
  from public.dining_tables dt
  left join public.table_qr_codes qr on qr.table_id=dt.id and qr.is_active and qr.revoked_at is null and (qr.expires_at is null or qr.expires_at>now())
  where (
    (length(p_table_token)>=20 and qr.token_hash=encode(digest(p_table_token,'sha256'),'hex'))
    or dt.table_number=v_clean_table
    or dt.table_number='T'||lpad(regexp_replace(p_table_token,'[^0-9]','','g'),2,'0')
  ) and dt.is_active
  order by qr.created_at desc nulls last limit 1;

  if not found then
    raise exception 'Table not found or inactive. Please select a valid table.';
  end if;

  if length(coalesce(p_idempotency_key,''))<16 then
    p_idempotency_key := gen_random_uuid()::text;
  end if;

  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Cart is empty';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_idempotency_key));
  select o.* into existing_order from public.order_idempotency_keys k join public.orders o on o.id=k.order_id where k.idempotency_key=p_idempotency_key;
  if found then
    if existing_order.table_id<>q.tid or existing_order.customer_phone<>v_phone then raise exception 'Order request key already used'; end if;
    update public.dining_sessions set access_token_hash=v_hash,access_expires_at=now()+interval '12 hours' where id=existing_order.dining_session_id;
    insert into public.order_access_tokens(order_id,token_hash,expires_at) values(existing_order.id,v_hash,now()+interval '12 hours') on conflict (token_hash) do nothing;
    return jsonb_build_object('id',existing_order.id,'order_number',existing_order.order_number,'access_token',p_access_token,'status',existing_order.status);
  end if;

  select r.gst_rate into v_taxrate from public.restaurants r where r.id=q.rid and r.is_open=true;
  if not found then
    v_taxrate := 5.0;
  end if;

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
    select m.* into mi from public.menu_items m where m.id=(item->>'menu_item_id')::uuid and m.is_available and m.deleted_at is null;
    if not found then raise exception 'One or more dishes in your cart are no longer available'; end if;
    if mi.station_id is null then
      select id into mi.station_id from public.kitchen_stations limit 1;
    end if;
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
