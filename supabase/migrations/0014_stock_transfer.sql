-- =====================================================================
-- Migration : 0014_stock_transfer.sql
-- Reference : PRD FR-3.3 — internal stock movement between warehouses
--             WITHOUT a P&L effect (inventory asset unchanged; only the
--             physical location/batch moves). No journal is posted.
-- =====================================================================

begin;

create table stock_transfers (
  id                 uuid        primary key default gen_random_uuid(),
  transfer_number    varchar(64) not null,
  from_warehouse_id  uuid        not null references warehouses (id) on delete restrict,
  to_warehouse_id    uuid        not null references warehouses (id) on delete restrict,
  transfer_date      date        not null,
  idempotency_key    uuid,
  created_at         timestamptz not null default now(),
  constraint uq_transfer_number      unique (transfer_number),
  constraint uq_transfer_idempotency unique (idempotency_key),
  constraint chk_transfer_diff_wh    check (from_warehouse_id <> to_warehouse_id)
);

create index idx_transfers_from on stock_transfers (from_warehouse_id);
create index idx_transfers_to   on stock_transfers (to_warehouse_id);

create table stock_transfer_items (
  id                 uuid          primary key default gen_random_uuid(),
  stock_transfer_id  uuid          not null references stock_transfers (id) on delete cascade,
  product_id         uuid          not null references products (id) on delete restrict,
  sku                varchar(64)   not null,
  quantity           numeric(18,4) not null,
  uom                varchar(32)   not null,
  conversion_to_base numeric(18,4) not null,
  base_quantity      numeric(18,4) not null,
  batch_number       varchar(64)   not null,
  expiry_date        date          not null,
  unit_cost          numeric(18,2) not null default 0,
  created_at         timestamptz   not null default now(),
  constraint chk_transfer_item_qty check (base_quantity > 0)
);

create index idx_transfer_items on stock_transfer_items (stock_transfer_id);

alter table stock_transfers      enable row level security;
alter table stock_transfer_items enable row level security;

create policy transfers_select on stock_transfers for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy transfers_write on stock_transfers for all
  using (public.current_app_role() in ('owner', 'admin_gudang'))
  with check (public.current_app_role() in ('owner', 'admin_gudang'));
create policy transfer_items_select on stock_transfer_items for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy transfer_items_write on stock_transfer_items for all
  using (public.current_app_role() in ('owner', 'admin_gudang'))
  with check (public.current_app_role() in ('owner', 'admin_gudang'));

grant all privileges on stock_transfers, stock_transfer_items
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- transfer_stock(payload) -> jsonb  (FR-3.3, no P&L)
-- Moves a specific batch quantity from one warehouse to another, carrying
-- the batch's cost basis. Idempotent on idempotency_key.
-- ---------------------------------------------------------------------
create or replace function transfer_stock(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idem     uuid;
  v_existing stock_transfers;
  v_from     warehouses;
  v_to       warehouses;
  v_transfer stock_transfers;
  v_item     jsonb;
  v_product  products;
  v_src      inventory_batches;
  v_qty      numeric;
  v_moved    int := 0;
begin
  v_idem := nullif(p->>'idempotency_key', '')::uuid;
  if v_idem is not null then
    select * into v_existing from stock_transfers where idempotency_key = v_idem;
    if found then
      return jsonb_build_object('status', 'success', 'transfer_id', v_existing.id,
        'idempotent_replay', true);
    end if;
  end if;

  select * into v_from from warehouses where code = p->>'from_warehouse_code';
  if not found then
    raise exception 'WAREHOUSE_NOT_FOUND: %', p->>'from_warehouse_code' using errcode = 'no_data_found';
  end if;
  select * into v_to from warehouses where code = p->>'to_warehouse_code';
  if not found then
    raise exception 'WAREHOUSE_NOT_FOUND: %', p->>'to_warehouse_code' using errcode = 'no_data_found';
  end if;
  if v_from.id = v_to.id then
    raise exception 'SAME_WAREHOUSE: source and destination must differ' using errcode = 'check_violation';
  end if;

  insert into stock_transfers (transfer_number, from_warehouse_id, to_warehouse_id, transfer_date, idempotency_key)
  values (p->>'transfer_number', v_from.id, v_to.id, (p->>'transfer_date')::date, v_idem)
  returning * into v_transfer;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    select * into v_product from products where sku = v_item->>'sku';
    if not found then
      raise exception 'PRODUCT_NOT_FOUND: %', v_item->>'sku' using errcode = 'no_data_found';
    end if;
    v_qty := (v_item->>'base_quantity')::numeric;

    -- Deplete the named batch at the source warehouse.
    select * into v_src from inventory_batches
      where product_id = v_product.id and warehouse_id = v_from.id
        and batch_number = v_item->>'batch_number' for update;
    if not found then
      raise exception 'SOURCE_BATCH_NOT_FOUND: % @ %', v_item->>'batch_number', v_from.code
        using errcode = 'no_data_found';
    end if;
    if v_src.quantity_on_hand < v_qty then
      raise exception 'INSUFFICIENT_STOCK: batch % has % < % requested',
        v_src.batch_number, v_src.quantity_on_hand, v_qty using errcode = 'check_violation';
    end if;

    update inventory_batches set quantity_on_hand = quantity_on_hand - v_qty where id = v_src.id;

    -- Add to the destination warehouse (same batch/expiry, carrying cost).
    if exists (select 1 from inventory_batches
                where product_id = v_product.id and warehouse_id = v_to.id
                  and batch_number = v_src.batch_number) then
      update inventory_batches set quantity_on_hand = quantity_on_hand + v_qty
        where product_id = v_product.id and warehouse_id = v_to.id
          and batch_number = v_src.batch_number;
    else
      insert into inventory_batches (product_id, warehouse_id, batch_number, expiry_date, quantity_on_hand, unit_cost)
      values (v_product.id, v_to.id, v_src.batch_number, v_src.expiry_date, v_qty, v_src.unit_cost);
    end if;

    insert into stock_transfer_items (stock_transfer_id, product_id, sku, quantity, uom,
      conversion_to_base, base_quantity, batch_number, expiry_date, unit_cost)
    values (v_transfer.id, v_product.id, v_item->>'sku', (v_item->>'quantity')::numeric,
      v_item->>'uom', (v_item->>'conversion_to_base')::numeric, v_qty,
      v_src.batch_number, v_src.expiry_date, v_src.unit_cost);

    v_moved := v_moved + 1;
  end loop;

  return jsonb_build_object('status', 'success', 'transfer_id', v_transfer.id,
    'items_moved', v_moved, 'idempotent_replay', false);

exception
  when unique_violation then
    if v_idem is not null then
      select * into v_existing from stock_transfers where idempotency_key = v_idem;
      if found then
        return jsonb_build_object('status', 'success', 'transfer_id', v_existing.id,
          'idempotent_replay', true);
      end if;
    end if;
    raise;
end;
$$;

-- Audited wrapper (actor/IP from JWT; helper from migration 0012).
create or replace function audited_transfer_stock(
  p jsonb, _actor text default null, _ip text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return transfer_stock(p);
end;
$$;

grant execute on function
  transfer_stock(jsonb), audited_transfer_stock(jsonb, text, text)
  to anon, authenticated, service_role;

commit;
