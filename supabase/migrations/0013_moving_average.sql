-- =====================================================================
-- Migration : 0013_moving_average.sql
-- Reference : PRD FR-3.1 — support Moving Average AND FIFO valuation,
--             configured per item (category) and not alterable mid-period.
-- Physical depletion is always earliest-expiry (FEFO, FR-3.5); only the
-- COGS valuation differs by the product's valuation_method.
-- =====================================================================

begin;

-- Method-aware depletion. Keeps the same name/signature so create_sales_invoice
-- and the audited wrapper need no changes.
create or replace function fulfill_inventory_fifo(
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_qty_base     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method     valuation_method;
  v_remaining  numeric := p_qty_base;
  v_total_qty  numeric := 0;
  v_total_val  numeric := 0;
  v_avg        numeric := 0;
  v_take       numeric;
  v_batch      record;
  v_total_cost numeric := 0;
  v_breakdown  jsonb   := '[]'::jsonb;
begin
  if p_qty_base is null or p_qty_base <= 0 then
    raise exception 'Quantity to fulfill must be positive (got %)', p_qty_base
      using errcode = 'check_violation';
  end if;

  select valuation_method into v_method from products where id = p_product_id;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND: %', p_product_id using errcode = 'no_data_found';
  end if;

  -- Moving Average: snapshot the weighted-average cost BEFORE depletion,
  -- across all on-hand batches of this product in this warehouse.
  if v_method = 'moving_average' then
    select coalesce(sum(quantity_on_hand), 0),
           coalesce(sum(quantity_on_hand * unit_cost), 0)
      into v_total_qty, v_total_val
      from inventory_batches
     where product_id = p_product_id and warehouse_id = p_warehouse_id
       and quantity_on_hand > 0;
    if v_total_qty > 0 then
      v_avg := v_total_val / v_total_qty;
    end if;
  end if;

  -- Physical depletion: earliest expiry first (FEFO, FR-3.5).
  for v_batch in
    select * from inventory_batches
     where product_id = p_product_id and warehouse_id = p_warehouse_id
       and quantity_on_hand > 0
     order by expiry_date asc, received_at asc
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_batch.quantity_on_hand, v_remaining);

    update inventory_batches
       set quantity_on_hand = quantity_on_hand - v_take
     where id = v_batch.id;

    -- FIFO costing uses the actual batch cost; MA accumulates later.
    if v_method = 'fifo' then
      v_total_cost := v_total_cost + (v_take * v_batch.unit_cost);
    end if;

    v_remaining := v_remaining - v_take;
    v_breakdown := v_breakdown || jsonb_build_object(
      'batch_id', v_batch.id, 'batch_number', v_batch.batch_number,
      'expiry_date', v_batch.expiry_date, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost);
  end loop;

  if v_remaining > 0 then
    raise exception
      'Insufficient stock for product % in warehouse %: short by % (base unit)',
      p_product_id, p_warehouse_id, v_remaining
      using errcode = 'check_violation';
  end if;

  if v_method = 'moving_average' then
    v_total_cost := round(p_qty_base * v_avg, 2);
  end if;

  return jsonb_build_object(
    'total_cost', v_total_cost,
    'quantity', p_qty_base,
    'method', v_method,
    'avg_cost', round(v_avg, 4),
    'batches', v_breakdown
  );
end;
$$;

-- FR-3.1: valuation_method cannot be altered after initialization.
create or replace function lock_valuation_method()
returns trigger language plpgsql as $$
begin
  if new.valuation_method <> old.valuation_method then
    raise exception
      'valuation_method cannot be changed after initialization (FR-3.1)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_lock_valuation_method
before update on products
for each row execute function lock_valuation_method();

commit;
