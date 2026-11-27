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
