-- =====================================================================
-- Migration : 0015_receive_stock_rpc.sql
-- Purpose   : Move stock-in into an RPC so it runs in one transaction and
--             carries the audit actor/IP (§6.2). Previously the receive
--             path used direct PostgREST writes (no actor on audit rows).
-- =====================================================================

begin;

-- Upsert a batch's on-hand quantity (quantity already in base unit, FR-3.4).
create or replace function receive_stock(p jsonb)
returns inventory_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch inventory_batches;
begin
  select * into v_batch from inventory_batches
    where product_id = (p->>'product_id')::uuid
      and warehouse_id = (p->>'warehouse_id')::uuid
      and batch_number = p->>'batch_number'
    for update;

  if found then
    update inventory_batches
       set quantity_on_hand = quantity_on_hand + (p->>'base_quantity')::numeric,
           unit_cost = (p->>'unit_cost')::numeric
     where id = v_batch.id
     returning * into v_batch;
  else
    insert into inventory_batches (product_id, warehouse_id, batch_number, expiry_date,
      quantity_on_hand, unit_cost)
    values ((p->>'product_id')::uuid, (p->>'warehouse_id')::uuid, p->>'batch_number',
      (p->>'expiry_date')::date, (p->>'base_quantity')::numeric, (p->>'unit_cost')::numeric)
    returning * into v_batch;
  end if;

  return v_batch;
end;
$$;

create or replace function audited_receive_stock(
  p jsonb, _actor text default null, _ip text default null
) returns inventory_batches
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return receive_stock(p);
end;
$$;

grant execute on function
  receive_stock(jsonb),
  audited_receive_stock(jsonb, text, text)
  to anon, authenticated, service_role;

commit;
