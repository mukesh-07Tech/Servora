-- Safety cleanup. Earlier experimental migrations opened the orders tables to anonymous visitors.
-- Customers now use token or login based functions only, so remove anything left over.
-- Safe to run on any database (every statement is "if exists").
drop policy if exists "anon read order by id" on public.orders;
drop policy if exists "anon read order items by order id" on public.order_items;
drop policy if exists "anon update order payment status" on public.orders;
drop policy if exists "staff update order payment status" on public.orders;
drop function if exists public.get_order_status_public(uuid);
revoke execute on function public.mark_order_payment(uuid, text, text, boolean) from anon;
