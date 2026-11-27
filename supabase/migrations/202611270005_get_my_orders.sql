-- Customer dashboard: load several of the caller's own orders in one call.
-- The browser sends [{id, token}, ...]. Only entries whose access token is valid are returned,
-- so a customer can never read another diner's order (no anonymous table access needed).
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
