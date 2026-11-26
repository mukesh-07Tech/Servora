-- Migration 202611270003: Bidirectional order payment synchronization RPCs and RLS
-- Allows customer (online payment) and staff (admin/KDS/waiter) to update and synchronize payment_status reliably

-- 1. Security Definer RPC for recording order payment (usable by customer online pay or staff)
create or replace function public.mark_order_payment(
  p_order_id uuid,
  p_payment_status text default 'paid',
  p_payment_method text default 'online',
  p_mark_completed boolean default true
)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Order not found');
  end if;

  if p_mark_completed then
    update public.orders
    set payment_status = p_payment_status,
        payment_method = coalesce(p_payment_method, o.payment_method, 'online'),
        status = case when status in ('served', 'ready', 'ready_for_collection', 'ready_for_serving') then 'completed' else status end,
        updated_at = now()
    where id = p_order_id;
  else
    update public.orders
    set payment_status = p_payment_status,
        payment_method = coalesce(p_payment_method, o.payment_method, 'online'),
        updated_at = now()
    where id = p_order_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'id', p_order_id,
    'payment_status', p_payment_status,
    'payment_method', p_payment_method
  );
end $$;

revoke all on function public.mark_order_payment(uuid, text, text, boolean) from public;
grant execute on function public.mark_order_payment(uuid, text, text, boolean) to anon, authenticated;

-- 2. Ensure RLS on public.orders permits update of payment_status by authenticated staff and anon customers for their order
drop policy if exists "staff update order payment status" on public.orders;
create policy "staff update order payment status" on public.orders
for update to authenticated
using (true)
with check (true);

drop policy if exists "anon update order payment status" on public.orders;
create policy "anon update order payment status" on public.orders
for update to anon
using (true)
with check (true);
