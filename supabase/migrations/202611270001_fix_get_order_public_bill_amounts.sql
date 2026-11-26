-- Migration 202611270001: Fix get_order_public to return subtotal, tax, total, unit_price, line_total
-- Ensures customer dine-in tracking and bill modal always display accurate amounts instead of 0

create or replace function public.get_order_public(p_order_id uuid, p_access_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  result jsonb;
begin
  if not exists(
    select 1 from public.order_access_tokens
    where order_id = p_order_id
      and token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
      and expires_at > now()
  ) then
    if not exists(
      select 1 from public.dining_sessions ds
      join public.orders o on o.dining_session_id = ds.id
      where o.id = p_order_id
        and ds.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
        and ds.status = 'open'
        and ds.access_expires_at > now()
    ) then
      raise exception 'Order access expired';
    end if;
  end if;

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

revoke all on function public.get_order_public(uuid, text) from public;
grant execute on function public.get_order_public(uuid, text) to anon, authenticated;
