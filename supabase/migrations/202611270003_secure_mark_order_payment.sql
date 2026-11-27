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
       select 1 from public.orders x where x.table_id = p_table_id and x.status not in ('completed','cancelled')) then
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
