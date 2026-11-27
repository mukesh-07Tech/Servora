-- SERVORA: initial production schema.
create extension if not exists pgcrypto;

create table if not exists public.restaurants (
 id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
 phone text, email text, address text, gstin text, timezone text not null default 'Asia/Kolkata',
 currency text not null default 'INR', gst_rate numeric(5,2) not null default 5 check(gst_rate between 0 and 100),
 service_charge_rate numeric(5,2) not null default 0 check(service_charge_rate between 0 and 100),
 is_open boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, restaurant_id uuid references public.restaurants(id),
 full_name text not null, phone text not null, role text not null default 'employee' check(role in ('admin','kitchen','employee','customer')),
 approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected','suspended')),
 station_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(restaurant_id,phone)
);
create table if not exists public.staff_applications (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
 restaurant_id uuid references public.restaurants(id), full_name text not null, phone text not null,
 requested_role text not null default 'employee' check(requested_role in ('kitchen','employee')),
 status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.kitchen_stations (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 name text not null, capacity integer not null default 5 check(capacity>0), is_active boolean not null default true,
 created_at timestamptz not null default now(), unique(restaurant_id,name)
);
alter table public.profiles drop constraint if exists profiles_station_id_fkey;
alter table public.profiles add constraint profiles_station_id_fkey foreign key(station_id) references public.kitchen_stations(id) on delete set null;
create table if not exists public.menu_categories (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 name text not null, name_ta text, sort_order integer not null default 0, is_active boolean not null default true,
 created_at timestamptz not null default now(), unique(restaurant_id,name)
);
create table if not exists public.menu_items (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 category_id uuid references public.menu_categories(id) on delete set null, station_id uuid references public.kitchen_stations(id) on delete set null,
 name text not null, name_ta text, description text, price numeric(12,2) not null check(price>=0),
 prep_minutes integer not null default 10 check(prep_minutes>0), is_vegetarian boolean not null default true,
 is_available boolean not null default true, image_url text, sort_order integer not null default 0,
 deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dining_tables (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 table_number text not null, capacity integer not null default 2 check(capacity>0), status text not null default 'available',
 is_active boolean not null default true, created_at timestamptz not null default now(), unique(restaurant_id,table_number)
);
create table if not exists public.table_qr_codes (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 table_id uuid not null references public.dining_tables(id) on delete cascade, token_hash text not null unique,
 is_active boolean not null default true, expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.dining_sessions (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 table_id uuid not null references public.dining_tables(id), customer_name text not null, customer_phone text not null,
 persons integer not null default 1 check(persons>0), status text not null default 'open' check(status in ('open','closed')),
 access_token_hash text not null unique, access_expires_at timestamptz not null default now()+interval '12 hours', opened_at timestamptz not null default now(), closed_at timestamptz
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 dining_session_id uuid references public.dining_sessions(id), table_id uuid references public.dining_tables(id),
 order_number bigint generated always as identity, customer_name text not null, customer_phone text not null,
 table_label text, status text not null default 'received' check(status in ('received','accepted','preparing','partially_ready','ready_for_collection','ready_for_serving','served','completed','cancelled')),
 subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0, tax numeric(12,2) not null default 0,
 service_charge numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
 estimated_minutes integer, payment_status text not null default 'unpaid' check(payment_status in ('unpaid','partially_paid','paid','refunded')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.order_access_tokens (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 token_hash text not null unique, expires_at timestamptz not null default now()+interval '12 hours', created_at timestamptz not null default now()
);
create table if not exists public.order_idempotency_keys (
 idempotency_key text primary key, order_id uuid not null references public.orders(id) on delete cascade, created_at timestamptz not null default now()
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 menu_item_id uuid references public.menu_items(id) on delete set null, item_name text not null,
 quantity integer not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0),
 line_total numeric(12,2) not null check(line_total>=0), note text, station_id uuid references public.kitchen_stations(id),
 prep_minutes integer not null default 10, status text not null default 'new' check(status in ('new','accepted','preparing','ready','served','cancelled')),
 created_at timestamptz not null default now()
);
create table if not exists public.station_tickets (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 station_id uuid not null references public.kitchen_stations(id), status text not null default 'new',
 queue_sequence bigint generated always as identity, created_at timestamptz not null default now(), started_at timestamptz, ready_at timestamptz
);
create table if not exists public.station_ticket_items (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.station_tickets(id) on delete cascade,
 order_item_id uuid not null references public.order_items(id) on delete cascade, quantity integer not null check(quantity>0), unique(ticket_id,order_item_id)
);
create table if not exists public.order_status_history (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 old_status text, new_status text not null, changed_by uuid references public.profiles(id), note text, created_at timestamptz not null default now()
);
create table if not exists public.service_requests (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 dining_session_id uuid references public.dining_sessions(id), table_id uuid references public.dining_tables(id),
 table_label text, request_type text not null check(request_type in ('call_waiter','water','bill','plates','assistance','other')),
 status text not null default 'new' check(status in ('new','assigned','in_progress','completed','cancelled')),
 assigned_to uuid references public.profiles(id), note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.bills (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 dining_session_id uuid references public.dining_sessions(id), bill_number bigint generated always as identity,
 subtotal numeric(12,2) not null default 0, tax numeric(12,2) not null default 0, service_charge numeric(12,2) not null default 0,
 discount numeric(12,2) not null default 0, total numeric(12,2) not null default 0, paid_amount numeric(12,2) not null default 0,
 status text not null default 'open' check(status in ('open','partially_paid','settled','void')), created_at timestamptz not null default now()
);
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(), bill_id uuid not null references public.bills(id), amount numeric(12,2) not null check(amount>0),
 method text not null check(method in ('cash','upi_manual','online')), status text not null default 'pending' check(status in ('pending','verified','failed','refunded')),
 reference text, verified_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.attendance_daily_codes (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 code_hash text not null unique, work_date date not null, expires_at timestamptz not null, is_active boolean not null default true,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(restaurant_id,work_date)
);
create table if not exists public.attendance_records (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 employee_id uuid not null references public.profiles(id), work_date date not null, check_in timestamptz, check_out timestamptz,
 status text not null default 'present', verification_method text not null default 'qr' check(verification_method in ('qr','manual','admin_adjustment')),
 created_at timestamptz not null default now(), unique(employee_id,work_date)
);
create table if not exists public.employee_shifts (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 employee_id uuid not null references public.profiles(id), starts_at timestamptz not null, ends_at timestamptz not null,
 created_at timestamptz not null default now(), check(ends_at>starts_at)
);
create table if not exists public.calendar_events (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 title text not null, description text, starts_at timestamptz not null, ends_at timestamptz,
 event_type text not null default 'general', created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.activity_logs (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid references public.restaurants(id),
 actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id uuid,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.notification_logs (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid references public.restaurants(id),
 channel text not null, recipient text, event_type text not null, status text not null default 'queued',
 provider_message_id text, error_message text, created_at timestamptz not null default now()
);
create table if not exists public.otp_challenges (
 id uuid primary key default gen_random_uuid(), phone text not null, otp_hash text not null,
 purpose text not null, attempts integer not null default 0, expires_at timestamptz not null,
 consumed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_orders_restaurant_created on public.orders(restaurant_id,created_at desc);
create index if not exists idx_orders_status on public.orders(restaurant_id,status,created_at);
create index if not exists idx_station_queue on public.station_tickets(station_id,status,created_at,queue_sequence);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_attendance_date on public.attendance_records(restaurant_id,work_date desc);
create index if not exists idx_service_status on public.service_requests(restaurant_id,status,created_at);

create or replace function public.current_restaurant_id() returns uuid language sql stable security definer set search_path=public as $$ select restaurant_id from public.profiles where id=auth.uid() $$;
create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_restaurant_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and approval_status='approved') $$;
create or replace function public.is_approved_staff() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','kitchen','employee') and approval_status='approved') $$;

-- Staff profiles are provisioned from Auth metadata. No user can self-select admin.
create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=public as $$
declare requested text; rid uuid; fulln text; ph text;
begin
 requested := coalesce(new.raw_user_meta_data->>'requested_role','employee');
 if requested not in ('kitchen','employee') then requested := 'employee'; end if;
 rid := nullif(new.raw_user_meta_data->>'restaurant_id','')::uuid;
 fulln := coalesce(new.raw_user_meta_data->>'full_name','Restaurant staff');
 ph := coalesce(new.phone,new.raw_user_meta_data->>'phone','');
 insert into public.profiles(id,restaurant_id,full_name,phone,role,approval_status) values(new.id,rid,fulln,ph,requested,'pending') on conflict(id) do nothing;
 insert into public.staff_applications(user_id,restaurant_id,full_name,phone,requested_role) values(new.id,rid,fulln,ph,requested) on conflict do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_auth_user();

-- Atomically create the master order and one ticket per kitchen station. The QR token is never stored in plaintext.
create or replace function public.place_order(p_table_token text,p_customer jsonb,p_items jsonb,p_access_token text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q record; existing_order record; sess uuid; oid uuid; item jsonb; mi record; oi uuid; ticket uuid; st uuid; subtotal numeric(12,2):=0; taxrate numeric(5,2):=0; est integer:=0;
begin
 if length(coalesce(p_table_token,''))<20 or length(coalesce(p_access_token,''))<20 then raise exception 'Invalid table session'; end if;
 select qr.*,dt.table_number,dt.id as tid,dt.restaurant_id as rid into q from public.table_qr_codes qr join public.dining_tables dt on dt.id=qr.table_id where qr.token_hash=encode(digest(p_table_token,'sha256'),'hex') and qr.is_active and qr.revoked_at is null and (qr.expires_at is null or qr.expires_at>now()) and dt.is_active;
 if not found then raise exception 'This table QR is invalid or expired'; end if;
 if length(coalesce(p_idempotency_key,''))<16 then raise exception 'Missing order request key'; end if;
 perform pg_advisory_xact_lock(hashtext(p_idempotency_key));
 select o.* into existing_order from public.order_idempotency_keys k join public.orders o on o.id=k.order_id where k.idempotency_key=p_idempotency_key;
 if found then
   if existing_order.table_id<>q.tid or existing_order.customer_phone<>regexp_replace(p_customer->>'phone','[^0-9]','','g') then raise exception 'Order request key already used'; end if;
   update public.dining_sessions set access_token_hash=encode(digest(p_access_token,'sha256'),'hex'),access_expires_at=now()+interval '12 hours' where id=existing_order.dining_session_id;
   return jsonb_build_object('id',existing_order.id,'order_number',existing_order.order_number,'access_token',p_access_token,'status',existing_order.status);
 end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Cart is empty'; end if;
 select gst_rate into taxrate from public.restaurants where id=q.restaurant_id and is_open=true;
 if not found then raise exception 'Restaurant is currently closed'; end if;
 insert into public.dining_sessions(restaurant_id,table_id,customer_name,customer_phone,persons,access_token_hash)
 values(q.rid,q.tid,trim(p_customer->>'name'),regexp_replace(p_customer->>'phone','[^0-9]','','g'),greatest(1,coalesce((p_customer->>'persons')::int,1)),encode(digest(p_access_token,'sha256'),'hex')) returning id into sess;
 insert into public.orders(restaurant_id,dining_session_id,table_id,customer_name,customer_phone,table_label,status)
 values(q.rid,sess,q.tid,trim(p_customer->>'name'),regexp_replace(p_customer->>'phone','[^0-9]','','g'),q.table_number,'received') returning id into oid;
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

create or replace function public.get_order_public(p_order_id uuid,p_access_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$ declare result jsonb; begin
 if not exists(select 1 from public.order_access_tokens where order_id=p_order_id and token_hash=encode(digest(p_access_token,'sha256'),'hex') and expires_at>now()) then
   if not exists(select 1 from public.dining_sessions ds join public.orders o on o.dining_session_id=ds.id where o.id=p_order_id and ds.access_token_hash=encode(digest(p_access_token,'sha256'),'hex') and ds.status='open' and ds.access_expires_at>now()) then raise exception 'Order access expired'; end if;
 end if;
 select jsonb_build_object(
   'id',o.id,
   'order_number',o.order_number,
   'status',o.status,
   'payment_status',o.payment_status,
   'table_label',o.table_label,
   'subtotal',coalesce(o.subtotal,0),
   'tax',coalesce(o.tax,0),
   'discount',coalesce(o.discount,0),
   'total',coalesce(o.total,0),
   'estimated_minutes',o.estimated_minutes,
   'created_at',o.created_at,
   'order_items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'item_name',i.item_name,'quantity',i.quantity,'unit_price',coalesce(i.unit_price,0),'line_total',coalesce(i.line_total,coalesce(i.unit_price,0)*coalesce(i.quantity,1)),'status',i.status,'menu_item_id',i.menu_item_id,'note',i.note)) from public.order_items i where i.order_id=o.id),'[]'::jsonb)
 ) into result from public.orders o where o.id=p_order_id;
 return result;
end $$;

-- RLS: no anonymous table access. Customer order placement and tracking use the narrow security-definer RPCs above.
alter table public.restaurants enable row level security; alter table public.profiles enable row level security;
alter table public.staff_applications enable row level security; alter table public.kitchen_stations enable row level security;
alter table public.menu_categories enable row level security; alter table public.menu_items enable row level security;
alter table public.dining_tables enable row level security; alter table public.table_qr_codes enable row level security;
alter table public.dining_sessions enable row level security; alter table public.orders enable row level security;
alter table public.order_access_tokens enable row level security; alter table public.order_items enable row level security;
alter table public.station_tickets enable row level security; alter table public.station_ticket_items enable row level security;
alter table public.order_status_history enable row level security; alter table public.service_requests enable row level security;
alter table public.bills enable row level security; alter table public.payments enable row level security;
alter table public.attendance_daily_codes enable row level security; alter table public.attendance_records enable row level security;
alter table public.employee_shifts enable row level security; alter table public.calendar_events enable row level security;
alter table public.activity_logs enable row level security; alter table public.notification_logs enable row level security;
alter table public.otp_challenges enable row level security;
alter table public.order_idempotency_keys enable row level security;
create policy "profiles self or admin" on public.profiles for select to authenticated using(id=auth.uid() or (public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()));
create policy "profiles admin update" on public.profiles for update to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(restaurant_id=public.current_restaurant_id());
create policy "staff applications admin read" on public.staff_applications for select to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id());
create policy "staff applications admin update" on public.staff_applications for update to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(restaurant_id=public.current_restaurant_id());
create policy "staff applications self read" on public.staff_applications for select to authenticated using(user_id=auth.uid());
create policy "restaurant staff read" on public.restaurants for select to authenticated using( id=public.current_restaurant_id() and public.is_approved_staff());
create policy "stations staff read" on public.kitchen_stations for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff());
create policy "admin manage stations" on public.kitchen_stations for all to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id());
create policy "staff read menu" on public.menu_items for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff());
create policy "admin manage menu" on public.menu_items for all to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id());
create policy "staff read categories" on public.menu_categories for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff());
create policy "admin manage categories" on public.menu_categories for all to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id());
create policy "staff read tables" on public.dining_tables for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff());
create policy "admin manage tables" on public.dining_tables for all to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id());
create policy "admin manage qr" on public.table_qr_codes for all to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id());
create policy "staff read orders" on public.orders for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff());
create policy "admin update orders" on public.orders for update to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(restaurant_id=public.current_restaurant_id());
create policy "staff read items" on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id() and public.is_approved_staff()));
create policy "kitchen update assigned items" on public.order_items for update to authenticated using(public.is_approved_staff() and (public.is_restaurant_admin() or (public.current_role()='kitchen' and station_id=(select station_id from public.profiles where id=auth.uid())))) with check(public.is_approved_staff());
create policy "staff read tickets" on public.station_tickets for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id() and public.is_approved_staff()) and (public.is_restaurant_admin() or public.current_role()<>'kitchen' or station_id=(select station_id from public.profiles where id=auth.uid())));
create policy "admin manage tickets" on public.station_tickets for all to authenticated using(public.is_restaurant_admin() and exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id())) with check(public.is_restaurant_admin());
create policy "staff read ticket items" on public.station_ticket_items for select to authenticated using(exists(select 1 from public.station_tickets t join public.orders o on o.id=t.order_id where t.id=ticket_id and o.restaurant_id=public.current_restaurant_id() and public.is_approved_staff()));
create policy "staff read order history" on public.order_status_history for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id() and public.is_approved_staff()));
create policy "staff read service" on public.service_requests for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff());
create policy "staff update service" on public.service_requests for update to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff()) with check(restaurant_id=public.current_restaurant_id());
create policy "admin read bills" on public.bills for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "admin manage bills" on public.bills for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id());
create policy "admin read payments" on public.payments for select to authenticated using(exists(select 1 from public.bills b where b.id=bill_id and b.restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()));
create policy "admin manage payments" on public.payments for all to authenticated using(exists(select 1 from public.bills b where b.id=bill_id and b.restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin())) with check(exists(select 1 from public.bills b where b.id=bill_id and b.restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()));
create policy "staff read attendance" on public.attendance_records for select to authenticated using(restaurant_id=public.current_restaurant_id() and (public.is_restaurant_admin() or employee_id=auth.uid()));
create policy "admin read shifts" on public.employee_shifts for select to authenticated using(restaurant_id=public.current_restaurant_id() and (public.is_restaurant_admin() or employee_id=auth.uid()));
create policy "admin manage shifts" on public.employee_shifts for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id());
create policy "staff read calendar" on public.calendar_events for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_approved_staff());
create policy "admin manage calendar" on public.calendar_events for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id());
create policy "admin read activity" on public.activity_logs for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "admin read notifications" on public.notification_logs for select to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());

-- Restrict privileged RPC execution to the public ordering flow; the function validates table QR + all prices.
revoke all on function public.place_order(text,jsonb,jsonb,text,text) from public;
grant execute on function public.place_order(text,jsonb,jsonb,text,text) to anon, authenticated;
revoke all on function public.get_order_public(uuid,text) from public;
grant execute on function public.get_order_public(uuid,text) to anon, authenticated;

-- Public customer menu is read-only and exposes only active, available menu entries.
create policy "public read available menu" on public.menu_items for select to anon, authenticated using(is_available=true and deleted_at is null);
create policy "public read active categories" on public.menu_categories for select to anon, authenticated using(is_active=true);
create policy "public read active stations" on public.kitchen_stations for select to anon, authenticated using(is_active=true);
create policy "employee reads own attendance" on public.attendance_records for select to authenticated using(employee_id=auth.uid() or (public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()));
create policy "admin manage attendance codes" on public.attendance_daily_codes for all to authenticated using(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id()) with check(public.is_restaurant_admin() and restaurant_id=public.current_restaurant_id());
create policy "staff read own attendance code not allowed" on public.attendance_daily_codes for select to authenticated using(false);

create or replace function public.sync_staff_approval() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status then
   update public.profiles set approval_status=new.status, role=case when new.status='approved' then new.requested_role else role end, updated_at=now() where id=new.user_id;
   insert into public.activity_logs(restaurant_id,actor_id,action,entity_type,entity_id,details)
   values(new.restaurant_id,auth.uid(),'staff_application_'||new.status,'staff_application',new.id,jsonb_build_object('user_id',new.user_id));
 end if;
 return new;
end $$;
drop trigger if exists staff_application_status_sync on public.staff_applications;
create trigger staff_application_status_sync after update of status on public.staff_applications for each row execute procedure public.sync_staff_approval();

create or replace function public.create_service_request(p_table_token text,p_request_type text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$ declare q record; rid uuid;
begin
 if p_request_type not in ('call_waiter','water','bill','plates','assistance','other') then raise exception 'Invalid service request'; end if;
 select dt.id as table_id,dt.restaurant_id,dt.table_number into q from public.table_qr_codes qr join public.dining_tables dt on dt.id=qr.table_id where qr.token_hash=encode(digest(p_table_token,'sha256'),'hex') and qr.is_active and qr.revoked_at is null and (qr.expires_at is null or qr.expires_at>now()) and dt.is_active;
 if not found then raise exception 'Invalid table QR'; end if;
 insert into public.service_requests(restaurant_id,table_id,table_label,request_type,note) values(q.restaurant_id,q.table_id,q.table_number,p_request_type,left(p_note,300)) returning id into rid;
 return jsonb_build_object('id',rid,'status','new','table_label',q.table_number);
end $$;
revoke all on function public.create_service_request(text,text,text) from public;
grant execute on function public.create_service_request(text,text,text) to anon,authenticated;

-- Tighten kitchen visibility to the staff member's assigned station.
drop policy if exists "staff read orders" on public.orders;
create policy "staff read authorized orders" on public.orders for select to authenticated using(
 restaurant_id=public.current_restaurant_id() and public.is_approved_staff() and
 (public.current_role()<>'kitchen' or exists(select 1 from public.station_tickets st join public.profiles p on p.id=auth.uid() where st.order_id=orders.id and st.station_id=p.station_id))
);
drop policy if exists "staff read items" on public.order_items;
create policy "staff read authorized items" on public.order_items for select to authenticated using(
 exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id() and public.is_approved_staff()) and
 (public.current_role()<>'kitchen' or station_id=(select station_id from public.profiles where id=auth.uid()))
);
drop policy if exists "staff read ticket items" on public.station_ticket_items;
create policy "staff read authorized ticket items" on public.station_ticket_items for select to authenticated using(
 exists(select 1 from public.station_tickets t join public.orders o on o.id=t.order_id where t.id=ticket_id and o.restaurant_id=public.current_restaurant_id() and public.is_approved_staff() and (public.current_role()<>'kitchen' or t.station_id=(select station_id from public.profiles where id=auth.uid())))
);

-- Roll item readiness up to its station ticket and consolidated customer order.
create or replace function public.rollup_order_progress() returns trigger language plpgsql security definer set search_path=public as $$
declare oid uuid; stid uuid; old_order_status text; next_status text;
begin
 oid:=coalesce(new.order_id,old.order_id); stid:=coalesce(new.station_id,old.station_id);
 update public.station_tickets t set status=case
   when not exists(select 1 from public.station_ticket_items ti join public.order_items i on i.id=ti.order_item_id where ti.ticket_id=t.id and i.status not in ('ready','served','cancelled')) then 'ready'
   when exists(select 1 from public.station_ticket_items ti join public.order_items i on i.id=ti.order_item_id where ti.ticket_id=t.id and i.status in ('accepted','preparing')) then 'preparing'
   else 'new' end,
   ready_at=case when not exists(select 1 from public.station_ticket_items ti join public.order_items i on i.id=ti.order_item_id where ti.ticket_id=t.id and i.status not in ('ready','served','cancelled')) then coalesce(t.ready_at,now()) else null end
 where t.order_id=oid and t.station_id=stid;
 select status into old_order_status from public.orders where id=oid;
 select case
   when bool_and(status='cancelled') then 'cancelled'
   when bool_and(status in ('served','cancelled')) then 'served'
   when bool_and(status in ('ready','served','cancelled')) then 'ready_for_collection'
   when bool_or(status='ready') then 'partially_ready'
   when bool_or(status in ('accepted','preparing')) then 'preparing'
   else 'received' end into next_status from public.order_items where order_id=oid;
 if next_status is not null and next_status is distinct from old_order_status then
   update public.orders set status=next_status,updated_at=now() where id=oid;
   insert into public.order_status_history(order_id,old_status,new_status,note) values(oid,old_order_status,next_status,'Automatically updated from kitchen item statuses');
 end if;
 return new;
end $$;
drop trigger if exists order_item_progress_rollup on public.order_items;
create trigger order_item_progress_rollup after update of status on public.order_items for each row execute procedure public.rollup_order_progress();

-- Additional operational tables reserved for the next activation modules.
create table if not exists public.menu_schedules (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 name text not null, starts_at time not null, ends_at time not null, weekdays integer[] not null default array[0,1,2,3,4,5,6], is_active boolean not null default true
);
create table if not exists public.menu_item_schedules (
 menu_item_id uuid not null references public.menu_items(id) on delete cascade, schedule_id uuid not null references public.menu_schedules(id) on delete cascade, primary key(menu_item_id,schedule_id)
);
create table if not exists public.menu_customizations (
 id uuid primary key default gen_random_uuid(), menu_item_id uuid not null references public.menu_items(id) on delete cascade,
 name text not null, is_required boolean not null default false, max_selections integer not null default 1
);
create table if not exists public.menu_addons (
 id uuid primary key default gen_random_uuid(), menu_item_id uuid not null references public.menu_items(id) on delete cascade,
 name text not null, price numeric(12,2) not null default 0 check(price>=0), is_available boolean not null default true
);
create table if not exists public.ingredients (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 name text not null, unit text not null, reorder_level numeric(12,3) not null default 0, is_active boolean not null default true
);
create table if not exists public.recipes (
 id uuid primary key default gen_random_uuid(), menu_item_id uuid not null unique references public.menu_items(id) on delete cascade, yield_quantity numeric(12,3) not null default 1
);
create table if not exists public.recipe_items (
 recipe_id uuid not null references public.recipes(id) on delete cascade, ingredient_id uuid not null references public.ingredients(id), quantity numeric(12,3) not null check(quantity>0), primary key(recipe_id,ingredient_id)
);
create table if not exists public.inventory_stock (
 ingredient_id uuid primary key references public.ingredients(id), quantity numeric(12,3) not null default 0, updated_at timestamptz not null default now()
);
create table if not exists public.stock_movements (
 id uuid primary key default gen_random_uuid(), ingredient_id uuid not null references public.ingredients(id), movement_type text not null check(movement_type in ('purchase','consumption','adjustment','waste')),
 quantity numeric(12,3) not null, reference_type text, reference_id uuid, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.suppliers (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), name text not null, phone text, email text, address text
);
create table if not exists public.purchase_records (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), supplier_id uuid references public.suppliers(id), invoice_reference text, total numeric(12,2) not null default 0, purchased_at timestamptz not null default now(), created_by uuid references public.profiles(id)
);
create table if not exists public.bill_splits (
 id uuid primary key default gen_random_uuid(), bill_id uuid not null references public.bills(id) on delete cascade, split_type text not null check(split_type in ('equal','items','custom')),
 label text, amount numeric(12,2) not null check(amount>=0), paid_amount numeric(12,2) not null default 0
);
create table if not exists public.refunds (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id), amount numeric(12,2) not null check(amount>0), reason text, status text not null default 'requested', approved_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.customer_profiles (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), phone text not null, full_name text, email text, created_at timestamptz not null default now(), unique(restaurant_id,phone)
);
create table if not exists public.customer_feedback (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), rating integer not null check(rating between 1 and 5), comments text, created_at timestamptz not null default now()
);
create table if not exists public.waiter_assignments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), employee_id uuid not null references public.profiles(id), assigned_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.employee_schedule_assignments (
 id uuid primary key default gen_random_uuid(), shift_id uuid not null references public.employee_shifts(id) on delete cascade, calendar_event_id uuid references public.calendar_events(id) on delete cascade, employee_id uuid not null references public.profiles(id)
);
create table if not exists public.voice_order_sessions (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), dining_session_id uuid references public.dining_sessions(id), language text not null default 'ta-IN', status text not null default 'started', created_at timestamptz not null default now()
);
create table if not exists public.voice_order_transcripts (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.voice_order_sessions(id) on delete cascade, speaker text not null, transcript text not null, created_at timestamptz not null default now()
);

-- All additional operational/financial tables are private by default; policies are scoped through their restaurant-owned parent.
do $$ declare t text; begin
 foreach t in array array['menu_schedules','menu_item_schedules','menu_customizations','menu_addons','ingredients','recipes','recipe_items','inventory_stock','stock_movements','suppliers','purchase_records','bill_splits','refunds','customer_profiles','customer_feedback','waiter_assignments','employee_schedule_assignments','voice_order_sessions','voice_order_transcripts'] loop
   execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy "menu schedules admin" on public.menu_schedules for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "menu item schedules admin" on public.menu_item_schedules for all to authenticated using(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "menu customizations admin" on public.menu_customizations for all to authenticated using(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "menu addons admin" on public.menu_addons for all to authenticated using(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "ingredients admin" on public.ingredients for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "recipes admin" on public.recipes for all to authenticated using(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.menu_items m where m.id=menu_item_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "recipe items admin" on public.recipe_items for all to authenticated using(exists(select 1 from public.recipes r join public.menu_items m on m.id=r.menu_item_id where r.id=recipe_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.recipes r join public.menu_items m on m.id=r.menu_item_id where r.id=recipe_id and m.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "inventory stock admin" on public.inventory_stock for all to authenticated using(exists(select 1 from public.ingredients i where i.id=ingredient_id and i.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.ingredients i where i.id=ingredient_id and i.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "stock movements admin" on public.stock_movements for all to authenticated using(exists(select 1 from public.ingredients i where i.id=ingredient_id and i.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.ingredients i where i.id=ingredient_id and i.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "suppliers admin" on public.suppliers for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "purchases admin" on public.purchase_records for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "bill splits admin" on public.bill_splits for all to authenticated using(exists(select 1 from public.bills b where b.id=bill_id and b.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.bills b where b.id=bill_id and b.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "refunds admin" on public.refunds for all to authenticated using(exists(select 1 from public.payments p join public.bills b on b.id=p.bill_id where p.id=payment_id and b.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.payments p join public.bills b on b.id=p.bill_id where p.id=payment_id and b.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "customer profiles admin" on public.customer_profiles for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "customer feedback admin" on public.customer_feedback for all to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "waiter assignments admin" on public.waiter_assignments for all to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "employee schedule assignments admin" on public.employee_schedule_assignments for all to authenticated using(exists(select 1 from public.employee_shifts s where s.id=shift_id and s.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.employee_shifts s where s.id=shift_id and s.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());
create policy "voice sessions admin" on public.voice_order_sessions for all to authenticated using(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin()) with check(restaurant_id=public.current_restaurant_id() and public.is_restaurant_admin());
create policy "voice transcripts admin" on public.voice_order_transcripts for all to authenticated using(exists(select 1 from public.voice_order_sessions s where s.id=session_id and s.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin()) with check(exists(select 1 from public.voice_order_sessions s where s.id=session_id and s.restaurant_id=public.current_restaurant_id()) and public.is_restaurant_admin());

alter table public.staff_applications add column if not exists station_id uuid references public.kitchen_stations(id) on delete set null;
create or replace function public.sync_staff_approval() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status then
   update public.profiles set approval_status=new.status, role=case when new.status='approved' then new.requested_role else role end, station_id=case when new.status='approved' then new.station_id else station_id end, updated_at=now() where id=new.user_id;
   insert into public.activity_logs(restaurant_id,actor_id,action,entity_type,entity_id,details)
   values(new.restaurant_id,auth.uid(),'staff_application_'||new.status,'staff_application',new.id,jsonb_build_object('user_id',new.user_id,'station_id',new.station_id));
 end if;
 return new;
end $$;

create or replace function public.mark_order_served(p_order_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o record; old_status text;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and restaurant_id=o.restaurant_id and approval_status='approved' and role in ('admin','employee')) then raise exception 'Waiter or administrator permission required'; end if;
 if exists(select 1 from public.order_items where order_id=p_order_id and status not in ('ready','served','cancelled')) then raise exception 'All kitchen items must be ready before collection'; end if;
 old_status:=o.status;
 update public.order_items set status='served' where order_id=p_order_id and status='ready';
 update public.orders set status='served',updated_at=now() where id=p_order_id;
 insert into public.order_status_history(order_id,old_status,new_status,changed_by,note) values(p_order_id,old_status,'served',auth.uid(),'Waiter confirmed collection and delivery');
 return jsonb_build_object('success',true,'status','served');
end $$;
revoke all on function public.mark_order_served(uuid) from public;
grant execute on function public.mark_order_served(uuid) to authenticated;

-- Realtime feeds used by the staff workspace and KDS.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then alter publication supabase_realtime add table public.orders; end if;
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_items') then alter publication supabase_realtime add table public.order_items; end if;
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_requests') then alter publication supabase_realtime add table public.service_requests; end if;
 end if;
end $$;

-- Public menu photography bucket. Uploads are restricted to approved restaurant administrators.
insert into storage.buckets(id,name,public) values('menu-images','menu-images',true) on conflict(id) do nothing;
create policy "public menu image read" on storage.objects for select to anon,authenticated using(bucket_id='menu-images');
create policy "admin menu image upload" on storage.objects for insert to authenticated with check(bucket_id='menu-images' and public.is_restaurant_admin());
create policy "admin menu image update" on storage.objects for update to authenticated using(bucket_id='menu-images' and public.is_restaurant_admin()) with check(bucket_id='menu-images' and public.is_restaurant_admin());

-- Security-definer predicates avoid recursive RLS joins between orders and station tickets.
create or replace function public.is_current_restaurant_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.orders o join public.profiles p on p.id=auth.uid() where o.id=p_order_id and o.restaurant_id=p.restaurant_id and p.approval_status='approved' and p.role in ('admin','kitchen','employee'))
$$;
create or replace function public.has_assigned_station_ticket(p_order_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.station_tickets t join public.profiles p on p.id=auth.uid() where t.order_id=p_order_id and t.station_id=p.station_id and p.approval_status='approved' and p.role='kitchen')
$$;
drop policy if exists "staff read authorized orders" on public.orders;
create policy "staff read authorized orders" on public.orders for select to authenticated using(
 public.is_current_restaurant_order(id) and (public.current_role()<>'kitchen' or public.has_assigned_station_ticket(id))
);
drop policy if exists "staff read tickets" on public.station_tickets;
drop policy if exists "staff read authorized tickets" on public.station_tickets;
create policy "staff read authorized tickets" on public.station_tickets for select to authenticated using(
 public.is_current_restaurant_order(order_id) and (public.current_role()<>'kitchen' or station_id=(select station_id from public.profiles where id=auth.uid()))
);
drop policy if exists "staff read authorized ticket items" on public.station_ticket_items;
create policy "staff read authorized ticket items" on public.station_ticket_items for select to authenticated using(
 exists(select 1 from public.station_tickets t where t.id=ticket_id and public.is_current_restaurant_order(t.order_id) and (public.current_role()<>'kitchen' or t.station_id=(select station_id from public.profiles where id=auth.uid())))
);

-- Kitchen clients may change only the item preparation status, never prices, quantities or ownership.
drop policy if exists "kitchen update assigned items" on public.order_items;
create policy "admin update order items" on public.order_items for update to authenticated using(
 public.is_restaurant_admin() and exists(select 1 from public.orders o where o.id=order_id and o.restaurant_id=public.current_restaurant_id())
) with check(public.is_restaurant_admin());
create or replace function public.update_kitchen_item_status(p_item_id uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=public as $$ declare i record; r text; sid uuid;
begin
 if p_status not in ('accepted','preparing','ready') then raise exception 'Invalid kitchen status'; end if;
 select role,station_id into r,sid from public.profiles where id=auth.uid() and approval_status='approved';
 if r is null then raise exception 'Approved staff access required'; end if;
 select * into i from public.order_items where id=p_item_id for update;
 if not found then raise exception 'Order item not found'; end if;
 if not exists(select 1 from public.orders o where o.id=i.order_id and o.restaurant_id=public.current_restaurant_id()) then raise exception 'Not authorized for this restaurant'; end if;
 if r='kitchen' and i.station_id is distinct from sid then raise exception 'This item belongs to another kitchen station'; end if;
 if r not in ('admin','kitchen') then raise exception 'Kitchen permission required'; end if;
 if (i.status='new' and p_status<>'accepted') or (i.status='accepted' and p_status not in ('preparing','accepted')) or (i.status='preparing' and p_status not in ('ready','preparing')) or (i.status=p_status) then
   update public.order_items set status=p_status where id=p_item_id;
 else raise exception 'Invalid item status transition'; end if;
 return jsonb_build_object('success',true,'status',p_status);
end $$;
revoke all on function public.update_kitchen_item_status(uuid,text) from public;
grant execute on function public.update_kitchen_item_status(uuid,text) to authenticated;

-- Employee service actions are restricted to a request in their own restaurant.
drop policy if exists "staff update service" on public.service_requests;
create or replace function public.update_service_request(p_request_id uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=public as $$ declare r public.service_requests%rowtype; role_name text;
begin
 if p_status not in ('assigned','in_progress','completed','cancelled') then raise exception 'Invalid service status'; end if;
 select role into role_name from public.profiles where id=auth.uid() and approval_status='approved';
 if role_name not in ('admin','employee') then raise exception 'Employee permission required'; end if;
 select * into r from public.service_requests where id=p_request_id and restaurant_id=public.current_restaurant_id() for update;
 if not found then raise exception 'Service request not found'; end if;
 if role_name='employee' and r.assigned_to is not null and r.assigned_to<>auth.uid() then raise exception 'This request is assigned to another employee'; end if;
 update public.service_requests set status=p_status,assigned_to=case when p_status in ('assigned','in_progress') then coalesce(assigned_to,auth.uid()) else assigned_to end,updated_at=now() where id=p_request_id;
 return jsonb_build_object('success',true,'status',p_status);
end $$;
revoke all on function public.update_service_request(uuid,text) from public;
grant execute on function public.update_service_request(uuid,text) to authenticated;

revoke all on function public.current_restaurant_id() from public;
revoke all on function public.current_role() from public;
revoke all on function public.is_restaurant_admin() from public;
revoke all on function public.is_approved_staff() from public;
revoke all on function public.is_current_restaurant_order(uuid) from public;
revoke all on function public.has_assigned_station_ticket(uuid) from public;
grant execute on function public.current_restaurant_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_restaurant_admin() to authenticated;
grant execute on function public.is_approved_staff() to authenticated;
grant execute on function public.is_current_restaurant_order(uuid) to authenticated;
grant execute on function public.has_assigned_station_ticket(uuid) to authenticated;
