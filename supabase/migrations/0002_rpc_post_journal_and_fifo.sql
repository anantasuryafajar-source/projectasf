-- =====================================================================
-- Migration : 0002_rpc_post_journal_and_fifo.sql
-- Project   : Ananta — Financial & Accounting System (Beverage Distribution ERP)
-- Purpose   : Atomic stored procedures invoked by the NestJS backend.
--             supabase-js cannot run multi-statement transactions, so the
--             journal-posting and FIFO-depletion workflows live here to
--             guarantee atomicity (§6.1) and hard-balance (FR-1.2).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- post_journal_entry(payload) -> journal_entries
-- Inserts a posted journal header + its lines in one transaction.
-- Idempotent on idempotency_key (§6.2): re-posting the same key returns
-- the original entry instead of creating a duplicate. Balance is enforced
-- by the deferred trigger from migration 0001 at transaction commit.
-- ---------------------------------------------------------------------
create or replace function post_journal_entry(p_payload jsonb)
returns journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry    journal_entries;
  v_existing journal_entries;
  v_idem     uuid;
  v_line     jsonb;
begin
  v_idem := nullif(p_payload->>'idempotency_key', '')::uuid;

  -- Fast path: return the already-posted entry for a known idempotency key.
  if v_idem is not null then
    select * into v_existing from journal_entries where idempotency_key = v_idem;
    if found then
      return v_existing;
    end if;
  end if;

  insert into journal_entries (
    journal_reference, entry_date, description, source,
    currency, exchange_rate, status, idempotency_key, created_by, posted_at
  ) values (
    p_payload->>'journal_reference',
    (p_payload->>'entry_date')::date,
    nullif(p_payload->>'description', ''),
    coalesce(nullif(p_payload->>'source', '')::journal_source, 'manual'),
    coalesce(nullif(p_payload->>'currency', ''), 'IDR'),
    coalesce((p_payload->>'exchange_rate')::numeric, 1.0),
    'posted',
    v_idem,
    nullif(p_payload->>'created_by', '')::uuid,
    now()
  )
  returning * into v_entry;

  for v_line in select * from jsonb_array_elements(p_payload->'items')
  loop
    insert into journal_items (
      journal_entry_id, account_id, line_number, memo,
      debit, credit, base_debit, base_credit
    ) values (
      v_entry.id,
      (v_line->>'account_id')::uuid,
      (v_line->>'line_number')::int,
      nullif(v_line->>'memo', ''),
      coalesce((v_line->>'debit')::numeric, 0),
      coalesce((v_line->>'credit')::numeric, 0),
      coalesce((v_line->>'base_debit')::numeric, 0),
      coalesce((v_line->>'base_credit')::numeric, 0)
    );
  end loop;

  return v_entry;

exception
  -- Concurrent posting with the same idempotency key: return the winner.
  when unique_violation then
    if v_idem is not null then
      select * into v_existing from journal_entries where idempotency_key = v_idem;
      if found then
        return v_existing;
      end if;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------
-- fulfill_inventory_fifo(product, warehouse, qty_base) -> jsonb
-- Depletes stock across batches in FIFO order by expiry (FR-3.5), locking
-- rows to stay safe under concurrency. Returns the total valuation cost
-- (for the COGS journal, FR-3.2) plus a per-batch breakdown.
-- Quantities are in the product base_uom (FR-3.4).
-- ---------------------------------------------------------------------
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
  v_remaining  numeric := p_qty_base;
  v_total_cost numeric := 0;
  v_take       numeric;
  v_batch      record;
  v_breakdown  jsonb   := '[]'::jsonb;
begin
  if p_qty_base is null or p_qty_base <= 0 then
    raise exception 'Quantity to fulfill must be positive (got %)', p_qty_base;
  end if;

  for v_batch in
    select *
      from inventory_batches
     where product_id = p_product_id
       and warehouse_id = p_warehouse_id
       and quantity_on_hand > 0
     order by expiry_date asc, received_at asc
     for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_batch.quantity_on_hand, v_remaining);

    update inventory_batches
       set quantity_on_hand = quantity_on_hand - v_take
     where id = v_batch.id;

    v_total_cost := v_total_cost + (v_take * v_batch.unit_cost);
    v_remaining  := v_remaining - v_take;

    v_breakdown := v_breakdown || jsonb_build_object(
      'batch_id',     v_batch.id,
      'batch_number', v_batch.batch_number,
      'expiry_date',  v_batch.expiry_date,
      'quantity',     v_take,
      'unit_cost',    v_batch.unit_cost
    );
  end loop;

  if v_remaining > 0 then
    raise exception
      'Insufficient stock for product % in warehouse %: short by % (base unit)',
      p_product_id, p_warehouse_id, v_remaining
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object(
    'total_cost', v_total_cost,
    'quantity',   p_qty_base,
    'batches',    v_breakdown
  );
end;
$$;

commit;
