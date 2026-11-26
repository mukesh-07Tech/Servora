-- Tighten kitchen reads to the employee's assigned station.
-- Admin and waiter/employee roles retain restaurant-wide operational visibility.
drop policy if exists "stations staff read" on public.kitchen_stations;
create policy "stations staff read assigned" on public.kitchen_stations
for select to authenticated
using (
  restaurant_id = public.current_restaurant_id()
  and public.is_approved_staff()
  and (
    public.current_role() in ('admin','employee')
    or id = (select station_id from public.profiles where id = auth.uid())
  )
);

drop policy if exists "staff read items" on public.order_items;
create policy "staff read authorized order items" on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.restaurant_id = public.current_restaurant_id()
      and public.is_approved_staff()
      and (
        public.current_role() in ('admin','employee')
        or (public.current_role() = 'kitchen' and station_id = (select station_id from public.profiles where id = auth.uid()))
      )
  )
);

-- The app uses soft deletion so historical order snapshots are never removed.
create index if not exists menu_items_active_catalogue_idx
  on public.menu_items(restaurant_id, sort_order, name)
  where deleted_at is null;

create index if not exists orders_restaurant_created_idx
  on public.orders(restaurant_id, created_at desc);

create index if not exists station_tickets_fcfs_idx
  on public.station_tickets(station_id, queue_sequence)
  where status not in ('completed','cancelled');

-- Safe boolean helper lets anonymous customers check restaurant availability without
-- granting direct anonymous access to the restaurants table.
create or replace function public.is_restaurant_open(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select is_open from public.restaurants where id=p_restaurant_id),false)
$$;
revoke all on function public.is_restaurant_open(uuid) from public;
grant execute on function public.is_restaurant_open(uuid) to anon, authenticated;

-- Public customer menu: expose only active, orderable catalogue records.
drop policy if exists "public menu catalogue read" on public.menu_items;
create policy "public menu catalogue read" on public.menu_items
for select to anon
using (
  is_available = true
  and deleted_at is null
  and public.is_restaurant_open(restaurant_id)
);

drop policy if exists "public active categories read" on public.menu_categories;
create policy "public active categories read" on public.menu_categories
for select to anon
using (
  is_active = true
  and public.is_restaurant_open(restaurant_id)
);

drop policy if exists "public active stations read" on public.kitchen_stations;
create policy "public active stations read" on public.kitchen_stations
for select to anon
using (
  is_active = true
  and public.is_restaurant_open(restaurant_id)
);

-- Keep station tickets and the customer-facing master order in sync as kitchen items advance.
create or replace function public.update_kitchen_item_status(p_item_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  i public.order_items%rowtype;
  role_name text;
  assigned_station uuid;
  old_order_status text;
  next_order_status text;
  ticket_id uuid;
begin
  if p_status not in ('accepted','preparing','ready') then raise exception 'Invalid kitchen status'; end if;
  select role,station_id into role_name,assigned_station
  from public.profiles where id=auth.uid() and approval_status='approved';
  if role_name is null then raise exception 'Approved staff access required'; end if;
  if role_name not in ('admin','kitchen') then raise exception 'Kitchen permission required'; end if;

  select * into i from public.order_items where id=p_item_id for update;
  if not found then raise exception 'Order item not found'; end if;
  if not exists(select 1 from public.orders o where o.id=i.order_id and o.restaurant_id=public.current_restaurant_id()) then raise exception 'Not authorized for this restaurant'; end if;
  if role_name='kitchen' and i.station_id is distinct from assigned_station then raise exception 'This item belongs to another kitchen station'; end if;
  if exists(select 1 from public.orders where id=i.order_id and status in ('served','completed','cancelled')) then raise exception 'This order is already closed'; end if;

  if i.status='new' and p_status<>'accepted' then raise exception 'Accept this item before preparing it'; end if;
  if i.status='accepted' and p_status not in ('preparing','accepted') then raise exception 'Start preparation before marking ready'; end if;
  if i.status='preparing' and p_status not in ('ready','preparing') then raise exception 'Invalid item status transition'; end if;
  if i.status not in ('new','accepted','preparing') then raise exception 'Item is not in an active preparation state'; end if;
  update public.order_items set status=p_status where id=p_item_id;

  select st.id into ticket_id
  from public.station_tickets st
  join public.station_ticket_items sti on sti.ticket_id=st.id
  where sti.order_item_id=p_item_id limit 1;
  if ticket_id is not null then
    update public.station_tickets st set
      status=case
        when not exists(select 1 from public.station_ticket_items sti join public.order_items oi on oi.id=sti.order_item_id where sti.ticket_id=st.id and oi.status<>'ready') then 'ready'
        when exists(select 1 from public.station_ticket_items sti join public.order_items oi on oi.id=sti.order_item_id where sti.ticket_id=st.id and oi.status='preparing') then 'preparing'
        when exists(select 1 from public.station_ticket_items sti join public.order_items oi on oi.id=sti.order_item_id where sti.ticket_id=st.id and oi.status='accepted') then 'accepted'
        else 'new' end,
      started_at=case when p_status in ('preparing','ready') then coalesce(started_at,now()) else started_at end,
      ready_at=case when not exists(select 1 from public.station_ticket_items sti join public.order_items oi on oi.id=sti.order_item_id where sti.ticket_id=st.id and oi.status<>'ready') then now() else null end
    where st.id=ticket_id;
  end if;

  select status into old_order_status from public.orders where id=i.order_id for update;
  select case
    when bool_and(status in ('ready','served','cancelled')) then 'ready_for_collection'
    when bool_or(status='ready') then 'partially_ready'
    when bool_or(status='preparing') then 'preparing'
    when bool_or(status='accepted') then 'accepted'
    else 'received' end
  into next_order_status from public.order_items where order_id=i.order_id;
  update public.orders set status=next_order_status,updated_at=now() where id=i.order_id;
  if old_order_status is distinct from next_order_status then
    insert into public.order_status_history(order_id,old_status,new_status,changed_by,note)
    values(i.order_id,old_order_status,next_order_status,auth.uid(),'Kitchen item status updated');
  end if;
  return jsonb_build_object('success',true,'item_status',p_status,'order_status',next_order_status);
end $$;
revoke all on function public.update_kitchen_item_status(uuid,text) from public;
grant execute on function public.update_kitchen_item_status(uuid,text) to authenticated;

-- Realtime events are used by the kitchen and service workspaces.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='station_tickets') then alter publication supabase_realtime add table public.station_tickets; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='station_ticket_items') then alter publication supabase_realtime add table public.station_ticket_items; end if;
  end if;
end $$;

-- Reuse the active dining visit for repeat orders from the same table and mobile number.
create or replace function public.place_order(p_table_token text,p_customer jsonb,p_items jsonb,p_access_token text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q record; existing_order record; sess uuid; oid uuid; item jsonb; mi record; oi uuid; ticket uuid; st uuid; subtotal numeric(12,2):=0; taxrate numeric(5,2):=0; est integer:=0;
begin
 if length(coalesce(p_table_token,''))<20 or length(coalesce(p_access_token,''))<20 then raise exception 'Invalid table session'; end if;
 select qr.*,dt.table_number,dt.id as tid,dt.restaurant_id as rid into q
 from public.table_qr_codes qr join public.dining_tables dt on dt.id=qr.table_id
 where qr.token_hash=encode(digest(p_table_token,'sha256'),'hex') and qr.is_active and qr.revoked_at is null
   and (qr.expires_at is null or qr.expires_at>now()) and dt.is_active;
 if not found then raise exception 'This table QR is invalid or expired'; end if;
 if length(coalesce(p_idempotency_key,''))<16 then raise exception 'Missing order request key'; end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Cart is empty'; end if;
 perform pg_advisory_xact_lock(hashtext(p_idempotency_key));
 select o.* into existing_order from public.order_idempotency_keys k join public.orders o on o.id=k.order_id where k.idempotency_key=p_idempotency_key;
 if found then
   if existing_order.table_id<>q.tid or existing_order.customer_phone<>regexp_replace(p_customer->>'phone','[^0-9]','','g') then raise exception 'Order request key already used'; end if;
   update public.dining_sessions set access_token_hash=encode(digest(p_access_token,'sha256'),'hex'),access_expires_at=now()+interval '12 hours' where id=existing_order.dining_session_id;
   insert into public.order_access_tokens(order_id,token_hash,expires_at) values(existing_order.id,encode(digest(p_access_token,'sha256'),'hex'),now()+interval '12 hours');
   return jsonb_build_object('id',existing_order.id,'order_number',existing_order.order_number,'access_token',p_access_token,'status',existing_order.status);
 end if;
 select gst_rate into taxrate from public.restaurants where id=q.rid and is_open=true;
 if not found then raise exception 'Restaurant is currently closed'; end if;
 select id into sess from public.dining_sessions
 where table_id=q.tid and restaurant_id=q.rid and customer_phone=regexp_replace(p_customer->>'phone','[^0-9]','','g')
   and status='open' and access_expires_at>now()
 order by opened_at desc limit 1 for update;
 if sess is null then
   insert into public.dining_sessions(restaurant_id,table_id,customer_name,customer_phone,persons,access_token_hash)
   values(q.rid,q.tid,trim(p_customer->>'name'),regexp_replace(p_customer->>'phone','[^0-9]','','g'),greatest(1,coalesce((p_customer->>'persons')::int,1)),encode(digest(p_access_token,'sha256'),'hex')) returning id into sess;
 else
   update public.dining_sessions set customer_name=trim(p_customer->>'name'),persons=greatest(1,coalesce((p_customer->>'persons')::int,1)),access_token_hash=encode(digest(p_access_token,'sha256'),'hex'),access_expires_at=now()+interval '12 hours' where id=sess;
 end if;
 insert into public.orders(restaurant_id,dining_session_id,table_id,customer_name,customer_phone,table_label,status)
 values(q.rid,sess,q.tid,trim(p_customer->>'name'),regexp_replace(p_customer->>'phone','[^0-9]','','g'),q.table_number,'received') returning id into oid;
 insert into public.order_access_tokens(order_id,token_hash,expires_at) values(oid,encode(digest(p_access_token,'sha256'),'hex'),now()+interval '12 hours');
 for item in select * from jsonb_array_elements(p_items) loop
   if coalesce((item->>'quantity')::int,0)<1 or (item->>'quantity')::int>30 then raise exception 'Invalid item quantity'; end if;
   select * into mi from public.menu_items where id=(item->>'menu_item_id')::uuid and restaurant_id=q.rid and is_available and deleted_at is null;
   if not found then raise exception 'One or more menu items are unavailable'; end if;
   if mi.station_id is null then raise exception 'A kitchen station must be assigned to every orderable dish'; end if;
   insert into public.order_items(order_id,menu_item_id,item_name,quantity,unit_price,line_total,note,station_id,prep_minutes)
   values(oid,mi.id,mi.name,(item->>'quantity')::int,mi.price,mi.price*(item->>'quantity')::int,left(coalesce(item->>'note',''),300),mi.station_id,mi.prep_minutes) returning id into oi;
   subtotal:=subtotal+mi.price*(item->>'quantity')::int; est:=greatest(est,mi.prep_minutes);
 end loop;
 update public.orders set subtotal=subtotal,tax=round(subtotal*taxrate/100,2),total=round(subtotal+subtotal*taxrate/100,2),estimated_minutes=est where id=oid;
 for st in select distinct station_id from public.order_items where order_id=oid and station_id is not null loop
   insert into public.station_tickets(order_id,station_id) values(oid,st) returning id into ticket;
   insert into public.station_ticket_items(ticket_id,order_item_id,quantity) select ticket,id,quantity from public.order_items where order_id=oid and station_id=st;
   select greatest(est,ceil((coalesce((select sum(i.prep_minutes*i.quantity) from public.order_items i join public.orders o on o.id=i.order_id where i.station_id=st and i.order_id<>oid and i.status in ('new','accepted','preparing') and o.status not in ('completed','cancelled')),0)+coalesce((select sum(i.prep_minutes*i.quantity) from public.order_items i where i.order_id=oid and i.station_id=st),0))/greatest(ks.capacity,1))::int) into est from public.kitchen_stations ks where ks.id=st;
 end loop;
 update public.orders set estimated_minutes=est where id=oid;
 insert into public.order_idempotency_keys(idempotency_key,order_id) values(p_idempotency_key,oid);
 insert into public.order_status_history(order_id,new_status,note) values(oid,'received','Customer order submitted');
 update public.dining_tables set status='ordering' where id=q.tid;
 return jsonb_build_object('id',oid,'order_number',(select order_number from public.orders where id=oid),'access_token',p_access_token,'status','received');
end $$;
revoke all on function public.place_order(text,jsonb,jsonb,text,text) from public;
grant execute on function public.place_order(text,jsonb,jsonb,text,text) to anon,authenticated;

create unique index if not exists bills_one_active_per_dining_session
  on public.bills(dining_session_id) where dining_session_id is not null and status <> 'void';

drop policy if exists "employee read bills" on public.bills;
create policy "employee read bills" on public.bills for select to authenticated
using (restaurant_id=public.current_restaurant_id() and public.is_approved_staff() and public.current_role() in ('admin','employee'));
drop policy if exists "employee read payments" on public.payments;
create policy "employee read payments" on public.payments for select to authenticated
using (exists(select 1 from public.bills b where b.id=bill_id and b.restaurant_id=public.current_restaurant_id()) and public.is_approved_staff() and public.current_role() in ('admin','employee'));

create or replace function public.create_bill_for_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.dining_sessions%rowtype; b public.bills%rowtype; sub numeric(12,2); tax_total numeric(12,2); charge numeric(12,2); disc numeric(12,2); total_due numeric(12,2); paid numeric(12,2); rate numeric(5,2);
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved' and role in ('admin','employee')) then raise exception 'Billing permission required'; end if;
 select * into s from public.dining_sessions where id=p_session_id and restaurant_id=public.current_restaurant_id() for update;
 if not found then raise exception 'Dining session not found'; end if;
 select coalesce(sum(subtotal),0),coalesce(sum(tax),0) into sub,tax_total from public.orders where dining_session_id=s.id and status not in ('cancelled');
 if sub<=0 then raise exception 'There are no billable orders in this dining session'; end if;
 select service_charge_rate into rate from public.restaurants where id=s.restaurant_id;
 charge:=round(sub*coalesce(rate,0)/100,2);
 select * into b from public.bills where dining_session_id=s.id and status<>'void' for update;
 disc:=coalesce(b.discount,0);
 total_due:=greatest(0,sub+tax_total+charge-disc);
 select coalesce(sum(amount),0) into paid from public.payments where bill_id=b.id and status='verified';
 if b.id is null then
   insert into public.bills(restaurant_id,dining_session_id,subtotal,tax,service_charge,discount,total,paid_amount,status)
   values(s.restaurant_id,s.id,sub,tax_total,charge,disc,total_due,paid,case when paid>=total_due then 'settled' when paid>0 then 'partially_paid' else 'open' end)
   returning * into b;
 else
   if b.status='settled' then raise exception 'This dining session bill is already settled'; end if;
   update public.bills set subtotal=sub,tax=tax_total,service_charge=charge,total=total_due,paid_amount=paid,status=case when paid>=total_due then 'settled' when paid>0 then 'partially_paid' else 'open' end where id=b.id returning * into b;
 end if;
 return jsonb_build_object('id',b.id,'bill_number',b.bill_number,'subtotal',b.subtotal,'tax',b.tax,'service_charge',b.service_charge,'discount',b.discount,'total',b.total,'paid_amount',b.paid_amount,'status',b.status);
end $$;
revoke all on function public.create_bill_for_session(uuid) from public;
grant execute on function public.create_bill_for_session(uuid) to authenticated;

create or replace function public.record_manual_payment(p_bill_id uuid,p_amount numeric,p_method text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.bills%rowtype; pending numeric(12,2); payment_id uuid; payment_status text;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved' and role in ('admin','employee')) then raise exception 'Billing permission required'; end if;
 if p_method not in ('cash','upi_manual') then raise exception 'Choose cash or manual UPI'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Enter a valid payment amount'; end if;
 select * into b from public.bills where id=p_bill_id and restaurant_id=public.current_restaurant_id() for update;
 if not found or b.status in ('settled','void') then raise exception 'Bill is not open'; end if;
 select coalesce(sum(amount),0) into pending from public.payments where bill_id=b.id and status='pending';
 if p_amount>b.total-b.paid_amount-pending then raise exception 'Payment exceeds the remaining balance'; end if;
 payment_status:=case when p_method='cash' then 'verified' else 'pending' end;
 insert into public.payments(bill_id,amount,method,status,reference,verified_by)
 values(b.id,p_amount,p_method,payment_status,left(p_reference,120),case when p_method='cash' then auth.uid() else null end) returning id into payment_id;
 if payment_status='verified' then
   update public.bills set paid_amount=paid_amount+p_amount,status=case when paid_amount+p_amount>=total then 'settled' else 'partially_paid' end where id=b.id;
 end if;
 return jsonb_build_object('success',true,'payment_id',payment_id,'status',payment_status);
end $$;
revoke all on function public.record_manual_payment(uuid,numeric,text,text) from public;
grant execute on function public.record_manual_payment(uuid,numeric,text,text) to authenticated;

create or replace function public.verify_manual_payment(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; b public.bills%rowtype;
begin
 if not public.is_restaurant_admin() then raise exception 'Administrator approval required'; end if;
 select * into p from public.payments where id=p_payment_id for update;
 if not found or p.status<>'pending' or p.method<>'upi_manual' then raise exception 'Pending manual UPI payment not found'; end if;
 select * into b from public.bills where id=p.bill_id and restaurant_id=public.current_restaurant_id() for update;
 if not found or b.status='void' or p.amount>b.total-b.paid_amount then raise exception 'Payment cannot be verified against this bill'; end if;
 update public.payments set status='verified',verified_by=auth.uid() where id=p.id;
 update public.bills set paid_amount=paid_amount+p.amount,status=case when paid_amount+p.amount>=total then 'settled' else 'partially_paid' end where id=b.id;
 return jsonb_build_object('success',true,'bill_id',b.id);
end $$;
revoke all on function public.verify_manual_payment(uuid) from public;
grant execute on function public.verify_manual_payment(uuid) to authenticated;
