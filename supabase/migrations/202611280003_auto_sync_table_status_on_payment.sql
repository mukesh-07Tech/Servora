-- Migration 202611280003: Auto sync table status on order creation, status change, and payment

create or replace function public.sync_table_status_on_order()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare
  v_table_id uuid := NEW.table_id;
  v_table_label text := NEW.table_label;
begin
  -- Resolve table_id from table_label if missing
  if v_table_id is null and v_table_label is not null and length(trim(v_table_label)) > 0 then
    select id into v_table_id from public.dining_tables where upper(trim(table_number)) = upper(trim(v_table_label)) limit 1;
  end if;

  -- 1. If order is paid, completed, or cancelled: release table if no other open orders exist
  if NEW.payment_status = 'paid' or NEW.status in ('completed', 'cancelled') then
    if v_table_id is not null then
      if not exists (
        select 1 from public.orders o
        where o.table_id = v_table_id
          and o.id <> NEW.id
          and o.status not in ('completed', 'cancelled')
          and coalesce(o.payment_status, 'unpaid') <> 'paid'
      ) then
        update public.dining_tables set status = 'available' where id = v_table_id;
      end if;
    elsif v_table_label is not null and length(trim(v_table_label)) > 0 then
      if not exists (
        select 1 from public.orders o
        where upper(trim(o.table_label)) = upper(trim(v_table_label))
          and o.id <> NEW.id
          and o.status not in ('completed', 'cancelled')
          and coalesce(o.payment_status, 'unpaid') <> 'paid'
      ) then
        update public.dining_tables set status = 'available' where upper(trim(table_number)) = upper(trim(v_table_label));
      end if;
    end if;

  -- 2. If order is active and unpaid: mark table occupied
  elsif NEW.status not in ('completed', 'cancelled') and coalesce(NEW.payment_status, 'unpaid') <> 'paid' then
    if v_table_id is not null then
      update public.dining_tables set status = 'occupied' where id = v_table_id;
    elsif v_table_label is not null and length(trim(v_table_label)) > 0 then
      update public.dining_tables set status = 'occupied' where upper(trim(table_number)) = upper(trim(v_table_label));
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_table_status_on_order on public.orders;
create trigger trg_sync_table_status_on_order
after insert or update of status, payment_status, table_id, table_label on public.orders
for each row execute function public.sync_table_status_on_order();

-- Grant permissions for table releasing
grant execute on function public.release_table_if_idle(uuid) to anon, authenticated;
