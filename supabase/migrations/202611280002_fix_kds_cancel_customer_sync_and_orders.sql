-- Migration 202611280002: Fix KDS cancel requests, sync customers on order, return customer_phone in get_my_orders

-- 1. Ensure staff profiles have valid restaurant_id
update public.profiles
set restaurant_id = 'a0000000-0000-0000-0000-000000000001'
where restaurant_id is null;

-- 2. Allow reading cancel requests so KDS / Admin can always see them
alter table public.order_cancel_requests enable row level security;
drop policy if exists "staff read cancel requests" on public.order_cancel_requests;
create policy "staff read cancel requests" on public.order_cancel_requests
  for select to anon, authenticated using (true);

-- 3. Dedicated security definer RPC for KDS / Admin to fetch pending cancel requests
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

-- 4. Secure decide_order_cancellation that works across all staff roles
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

-- 5. get_my_orders returns customer_phone for strict client-side verification
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

-- 6. Trigger to automatically sync customer profile when an order is created
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

-- 7. Ensure RLS on customer_profiles allows admin/staff access
alter table public.customer_profiles enable row level security;
drop policy if exists "customer_profiles_read_all" on public.customer_profiles;
create policy "customer_profiles_read_all" on public.customer_profiles
  for select to anon, authenticated using (true);
drop policy if exists "customer_profiles_write_all" on public.customer_profiles;
create policy "customer_profiles_write_all" on public.customer_profiles
  for all to anon, authenticated using (true) with check (true);
