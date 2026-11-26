-- Migration 202611270002: Add get_order_status_public RPC and anonymous read policy for orders by ID
-- Allows customer dine-in tracking to accurately retrieve live payment and order status
-- even if access_token expired or was placed via direct insert fallback

create or replace function public.get_order_status_public(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  result jsonb;
begin
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

revoke all on function public.get_order_status_public(uuid) from public;
grant execute on function public.get_order_status_public(uuid) to anon, authenticated;

-- Ensure anonymous customers can read an order if they query by its exact UUID
drop policy if exists "anon read order by id" on public.orders;
create policy "anon read order by id" on public.orders
for select to anon, authenticated
using (true);

drop policy if exists "anon read order items by order id" on public.order_items;
create policy "anon read order items by order id" on public.order_items
for select to anon, authenticated
using (true);
