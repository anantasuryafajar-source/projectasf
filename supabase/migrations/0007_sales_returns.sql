-- =====================================================================
-- Migration : 0007_sales_returns.sql
-- Reference : PRD §3.2 (sales_return.approved) — credit note, reverse
--             revenue + VAT, restock inventory + reverse COGS.
-- =====================================================================

begin;

alter table sales_invoices
  add column if not exists returned_amount numeric(18,2) not null default 0;

create table sales_returns (
  id                     uuid          primary key default gen_random_uuid(),
  return_number          varchar(64)   not null,
  sales_invoice_id       uuid          not null references sales_invoices (id) on delete restrict,
  customer_id            uuid          not null references customers (id) on delete restrict,
  warehouse_id           uuid          not null references warehouses (id) on delete restrict,
  return_date            date          not null,
  subtotal               numeric(18,2) not null,
  discount_total         numeric(18,2) not null default 0,
  vat_amount             numeric(18,2) not null default 0,
  total_amount           numeric(18,2) not null,
  cogs_amount            numeric(18,2) not null default 0,
  credit_note_journal_id uuid          references journal_entries (id) on delete restrict,
  cogs_journal_id        uuid          references journal_entries (id) on delete restrict,
  idempotency_key        uuid,
  created_at             timestamptz   not null default now(),
  posted_at             timestamptz,
  constraint uq_sales_return_number      unique (return_number),
  constraint uq_sales_return_idempotency unique (idempotency_key)
);

create index idx_sales_returns_invoice  on sales_returns (sales_invoice_id);
create index idx_sales_returns_customer on sales_returns (customer_id);

create table sales_return_items (
  id                 uuid          primary key default gen_random_uuid(),
  sales_return_id    uuid          not null references sales_returns (id) on delete cascade,
  product_id         uuid          not null references products (id) on delete restrict,
  sku                varchar(64)   not null,
  quantity           numeric(18,4) not null,
  uom                varchar(32)   not null,
  conversion_to_base numeric(18,4) not null,
  base_quantity      numeric(18,4) not null,
  unit_price         numeric(18,2) not null,
  unit_cost          numeric(18,2) not null default 0,
  taxable            boolean       not null default true,
  batch_number       varchar(64)   not null,
  expiry_date        date          not null,
  line_subtotal      numeric(18,2) not null,
  line_vat           numeric(18,2) not null default 0,
  created_at         timestamptz   not null default now(),
  constraint chk_return_item_qty_pos check (quantity > 0 and base_quantity > 0)
);

create index idx_return_items_return on sales_return_items (sales_return_id);

alter table sales_returns      enable row level security;
alter table sales_return_items enable row level security;

create policy sales_returns_select on sales_returns for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy sales_returns_write on sales_returns for all
  using (public.current_app_role() in ('owner', 'sales_kasir'))
  with check (public.current_app_role() in ('owner', 'sales_kasir'));
create policy return_items_select on sales_return_items for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy return_items_write on sales_return_items for all
  using (public.current_app_role() in ('owner', 'sales_kasir'))
  with check (public.current_app_role() in ('owner', 'sales_kasir'));

grant all privileges on sales_returns, sales_return_items
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Helper: a customer's outstanding AR (nets payments and returns).
-- Centralised so credit-limit logic has one source of truth (FR-2.4).
-- ---------------------------------------------------------------------
create or replace function customer_outstanding(p_customer uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(total_amount - amount_paid - returned_amount), 0)
  from sales_invoices
  where customer_id = p_customer and status <> 'void';
$$;

-- ---------------------------------------------------------------------
-- create_sales_return(payload) -> jsonb  (§3.2 sales_return.approved)
-- Restocks inventory, reverses COGS, and posts a credit note reversing
-- revenue + VAT against AR. Amounts computed by the NestJS layer.
-- ---------------------------------------------------------------------
create or replace function create_sales_return(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idem       uuid;
  v_existing   sales_returns;
  v_invoice    sales_invoices;
  v_subtotal   numeric;
  v_discount   numeric;
  v_vat        numeric;
  v_total      numeric;
  v_acc_ar     uuid;
  v_acc_rev    uuid;
  v_acc_vat    uuid;
  v_acc_cogs   uuid;
  v_acc_inv    uuid;
  v_item       jsonb;
  v_product    products;
  v_base_qty   numeric;
  v_unit_cost  numeric;
  v_cogs       numeric := 0;
  v_batch      inventory_batches;
  v_return     sales_returns;
  v_cn_items   jsonb;
  v_cn_entry   journal_entries;
  v_cogs_entry journal_entries;
begin
  v_idem := nullif(p->>'idempotency_key', '')::uuid;
  if v_idem is not null then
    select * into v_existing from sales_returns where idempotency_key = v_idem;
    if found then
      return jsonb_build_object('status', 'success', 'return_id', v_existing.id,
        'credit_note_reference',
          (select journal_reference from journal_entries where id = v_existing.credit_note_journal_id),
        'total_amount', v_existing.total_amount, 'idempotent_replay', true);
    end if;
  end if;

  select * into v_invoice from sales_invoices where invoice_number = p->>'original_invoice_number';
  if not found then
    raise exception 'INVOICE_NOT_FOUND: %', p->>'original_invoice_number'
      using errcode = 'no_data_found';
  end if;

  v_subtotal := (p->>'subtotal')::numeric;
  v_discount := coalesce((p->>'discount_total')::numeric, 0);
  v_vat      := (p->>'vat_amount')::numeric;
  v_total    := (p->>'total_amount')::numeric;

  if v_total > (v_invoice.total_amount - v_invoice.returned_amount) then
    raise exception 'RETURN_EXCEEDS_INVOICE: return % exceeds remaining %',
      v_total, (v_invoice.total_amount - v_invoice.returned_amount)
      using errcode = 'check_violation';
  end if;

  select id into v_acc_ar   from accounts where account_code = p->'accounts'->>'ar';
  select id into v_acc_rev  from accounts where account_code = p->'accounts'->>'revenue';
  select id into v_acc_vat  from accounts where account_code = p->'accounts'->>'vat_out';
  select id into v_acc_cogs from accounts where account_code = p->'accounts'->>'cogs';
  select id into v_acc_inv  from accounts where account_code = p->'accounts'->>'inventory';
  if v_acc_ar is null or v_acc_rev is null or v_acc_vat is null then
    raise exception 'ACCOUNT_MAPPING_MISSING' using errcode = 'check_violation';
  end if;

  insert into sales_returns (
    return_number, sales_invoice_id, customer_id, warehouse_id, return_date,
    subtotal, discount_total, vat_amount, total_amount, idempotency_key
  ) values (
    p->>'return_number', v_invoice.id, v_invoice.customer_id, v_invoice.warehouse_id,
    (p->>'return_date')::date, v_subtotal, v_discount, v_vat, v_total, v_idem
  ) returning * into v_return;

  -- Restock each item + accumulate COGS reversal (FR-3.5 restock, FR-3.2 reverse).
  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    select * into v_product from products where sku = v_item->>'sku';
    if not found then
      raise exception 'PRODUCT_NOT_FOUND: %', v_item->>'sku' using errcode = 'no_data_found';
    end if;
    v_base_qty := (v_item->>'base_quantity')::numeric;

    select * into v_batch from inventory_batches
      where product_id = v_product.id and warehouse_id = v_invoice.warehouse_id
        and batch_number = v_item->>'batch_number';
    if found then
      v_unit_cost := v_batch.unit_cost; -- restock at the batch's existing cost
      update inventory_batches set quantity_on_hand = quantity_on_hand + v_base_qty
        where id = v_batch.id;
    else
      v_unit_cost := coalesce((v_item->>'unit_cost')::numeric, 0);
      insert into inventory_batches (product_id, warehouse_id, batch_number, expiry_date,
        quantity_on_hand, unit_cost)
      values (v_product.id, v_invoice.warehouse_id, v_item->>'batch_number',
        (v_item->>'expiry_date')::date, v_base_qty, v_unit_cost);
    end if;

    v_cogs := v_cogs + (v_base_qty * v_unit_cost);

    insert into sales_return_items (sales_return_id, product_id, sku, quantity, uom,
      conversion_to_base, base_quantity, unit_price, unit_cost, taxable,
      batch_number, expiry_date, line_subtotal, line_vat)
    values (v_return.id, v_product.id, v_item->>'sku', (v_item->>'quantity')::numeric,
      v_item->>'uom', (v_item->>'conversion_to_base')::numeric, v_base_qty,
      (v_item->>'unit_price')::numeric, v_unit_cost,
      coalesce((v_item->>'taxable')::boolean, true),
      v_item->>'batch_number', (v_item->>'expiry_date')::date,
      (v_item->>'line_subtotal')::numeric, coalesce((v_item->>'line_vat')::numeric, 0));
  end loop;

  -- Credit note: Debit Revenue (net) + Debit VAT, Credit AR (total). §3.2
  v_cn_items := jsonb_build_array(
    jsonb_build_object('account_id', v_acc_rev, 'line_number', 1,
      'debit', (v_subtotal - v_discount), 'base_debit', (v_subtotal - v_discount))
  );
  if v_vat > 0 then
    v_cn_items := v_cn_items || jsonb_build_object('account_id', v_acc_vat,
      'line_number', 2, 'debit', v_vat, 'base_debit', v_vat);
  end if;
  v_cn_items := v_cn_items || jsonb_build_object('account_id', v_acc_ar,
    'line_number', 3, 'credit', v_total, 'base_credit', v_total);

  v_cn_entry := post_journal_entry(jsonb_build_object(
    'journal_reference', 'JV/CN/' || (p->>'return_number'),
    'entry_date', p->>'return_date',
    'description', 'Credit note ' || (p->>'return_number') || ' for ' || v_invoice.invoice_number,
    'source', 'sales_return.approved',
    'items', v_cn_items));

  -- COGS reversal: Debit Inventory, Credit COGS. (FR-3.2)
  if v_cogs > 0 then
    v_cogs_entry := post_journal_entry(jsonb_build_object(
      'journal_reference', 'JV/CNCOGS/' || (p->>'return_number'),
      'entry_date', p->>'return_date',
      'description', 'COGS reversal for ' || (p->>'return_number'),
      'source', 'sales_return.approved',
      'items', jsonb_build_array(
        jsonb_build_object('account_id', v_acc_inv, 'line_number', 1,
          'debit', v_cogs, 'base_debit', v_cogs),
        jsonb_build_object('account_id', v_acc_cogs, 'line_number', 2,
          'credit', v_cogs, 'base_credit', v_cogs))));
  end if;

  update sales_returns
     set credit_note_journal_id = v_cn_entry.id,
         cogs_journal_id = case when v_cogs > 0 then v_cogs_entry.id else null end,
         cogs_amount = v_cogs, posted_at = now()
   where id = v_return.id;

  update sales_invoices set returned_amount = returned_amount + v_total
   where id = v_invoice.id;

  return jsonb_build_object('status', 'success', 'return_id', v_return.id,
    'credit_note_reference', v_cn_entry.journal_reference,
    'total_amount', v_total, 'cogs_reversed', v_cogs, 'idempotent_replay', false);

exception
  when unique_violation then
    if v_idem is not null then
      select * into v_existing from sales_returns where idempotency_key = v_idem;
      if found then
        return jsonb_build_object('status', 'success', 'return_id', v_existing.id,
          'credit_note_reference',
            (select journal_reference from journal_entries where id = v_existing.credit_note_journal_id),
          'total_amount', v_existing.total_amount, 'idempotent_replay', true);
      end if;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------
-- Update create_sales_invoice to use customer_outstanding() (nets returns).
-- ---------------------------------------------------------------------
create or replace function create_sales_invoice(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idem        uuid;
  v_existing    sales_invoices;
  v_customer    customers;
  v_warehouse   warehouses;
  v_subtotal    numeric;
  v_discount    numeric;
  v_vat         numeric;
  v_total       numeric;
  v_outstanding numeric;
  v_overdue     int;
  v_acc_ar      uuid;
  v_acc_rev     uuid;
  v_acc_vat     uuid;
  v_acc_cogs    uuid;
  v_acc_inv     uuid;
  v_item        jsonb;
  v_product     products;
  v_fifo        jsonb;
  v_cogs_cost   numeric := 0;
  v_ar_items    jsonb;
  v_ar_entry    journal_entries;
  v_cogs_entry  journal_entries;
  v_invoice     sales_invoices;
  v_due         date;
begin
  v_idem := nullif(p->>'idempotency_key', '')::uuid;
  if v_idem is not null then
    select * into v_existing from sales_invoices where idempotency_key = v_idem;
    if found then
      return jsonb_build_object('status', 'success', 'invoice_id', v_existing.id,
        'journal_reference',
          (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
        'total_amount', v_existing.total_amount, 'vat_amount', v_existing.vat_amount,
        'posted_at', v_existing.posted_at, 'idempotent_replay', true);
    end if;
  end if;

  v_subtotal := (p->>'subtotal')::numeric;
  v_discount := coalesce((p->>'discount_total')::numeric, 0);
  v_vat      := (p->>'vat_amount')::numeric;
  v_total    := (p->>'total_amount')::numeric;

  select * into v_customer from customers where code = p->>'customer_code';
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND: %', p->>'customer_code' using errcode = 'no_data_found';
  end if;
  if not v_customer.is_active then
    raise exception 'CUSTOMER_INACTIVE: %', v_customer.code using errcode = 'check_violation';
  end if;

  select * into v_warehouse from warehouses where code = p->>'warehouse_code';
  if not found then
    raise exception 'WAREHOUSE_NOT_FOUND: %', p->>'warehouse_code' using errcode = 'no_data_found';
  end if;

  v_outstanding := customer_outstanding(v_customer.id);

  select count(*) into v_overdue from sales_invoices
   where customer_id = v_customer.id and status = 'issued' and due_date < current_date;
  if v_overdue > 0 then
    raise exception 'OVERDUE_INVOICES: customer % has % overdue unpaid invoice(s) (FR-2.4)',
      v_customer.code, v_overdue using errcode = 'check_violation';
  end if;
  if v_customer.credit_limit > 0 and (v_outstanding + v_total) > v_customer.credit_limit then
    raise exception 'CREDIT_LIMIT_EXCEEDED: customer % outstanding % + new % exceeds limit % (FR-2.4)',
      v_customer.code, v_outstanding, v_total, v_customer.credit_limit using errcode = 'check_violation';
  end if;

  select id into v_acc_ar   from accounts where account_code = p->'accounts'->>'ar';
  select id into v_acc_rev  from accounts where account_code = p->'accounts'->>'revenue';
  select id into v_acc_vat  from accounts where account_code = p->'accounts'->>'vat_out';
  select id into v_acc_cogs from accounts where account_code = p->'accounts'->>'cogs';
  select id into v_acc_inv  from accounts where account_code = p->'accounts'->>'inventory';
  if v_acc_ar is null or v_acc_rev is null or v_acc_vat is null then
    raise exception 'ACCOUNT_MAPPING_MISSING: AR/Revenue/VAT account code not found'
      using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    select * into v_product from products where sku = v_item->>'sku';
    if not found then
      raise exception 'PRODUCT_NOT_FOUND: %', v_item->>'sku' using errcode = 'no_data_found';
    end if;
    v_fifo := fulfill_inventory_fifo(v_product.id, v_warehouse.id, (v_item->>'base_quantity')::numeric);
    v_cogs_cost := v_cogs_cost + (v_fifo->>'total_cost')::numeric;
  end loop;

  v_ar_items := jsonb_build_array(
    jsonb_build_object('account_id', v_acc_ar, 'line_number', 1, 'debit', v_total, 'base_debit', v_total),
    jsonb_build_object('account_id', v_acc_rev, 'line_number', 2,
      'credit', (v_subtotal - v_discount), 'base_credit', (v_subtotal - v_discount)));
  if v_vat > 0 then
    v_ar_items := v_ar_items || jsonb_build_object('account_id', v_acc_vat, 'line_number', 3,
      'credit', v_vat, 'base_credit', v_vat);
  end if;

  v_ar_entry := post_journal_entry(jsonb_build_object(
    'journal_reference', 'JV/AR/' || (p->>'invoice_number'),
    'entry_date', p->>'transaction_date',
    'description', 'Sales invoice ' || (p->>'invoice_number'),
    'source', 'sales_order.shipped',
    'currency', coalesce(p->>'currency', 'IDR'),
    'exchange_rate', coalesce((p->>'exchange_rate')::numeric, 1),
    'items', v_ar_items));

  if v_cogs_cost > 0 then
    v_cogs_entry := post_journal_entry(jsonb_build_object(
      'journal_reference', 'JV/COGS/' || (p->>'invoice_number'),
      'entry_date', p->>'transaction_date',
      'description', 'COGS for ' || (p->>'invoice_number'),
      'source', 'sales_order.shipped',
      'items', jsonb_build_array(
        jsonb_build_object('account_id', v_acc_cogs, 'line_number', 1, 'debit', v_cogs_cost, 'base_debit', v_cogs_cost),
        jsonb_build_object('account_id', v_acc_inv, 'line_number', 2, 'credit', v_cogs_cost, 'base_credit', v_cogs_cost))));
  end if;

  v_due := (p->>'transaction_date')::date + coalesce((p->>'term_of_payment_days')::int, 0);

  insert into sales_invoices (invoice_number, customer_id, warehouse_id, transaction_date,
    term_of_payment_days, due_date, currency, exchange_rate, subtotal, discount_total,
    vat_amount, total_amount, status, idempotency_key, journal_entry_id, cogs_journal_entry_id, posted_at)
  values (p->>'invoice_number', v_customer.id, v_warehouse.id, (p->>'transaction_date')::date,
    coalesce((p->>'term_of_payment_days')::int, 0), v_due, coalesce(p->>'currency', 'IDR'),
    coalesce((p->>'exchange_rate')::numeric, 1), v_subtotal, v_discount, v_vat, v_total, 'issued',
    v_idem, v_ar_entry.id, case when v_cogs_cost > 0 then v_cogs_entry.id else null end, now())
  returning * into v_invoice;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    select * into v_product from products where sku = v_item->>'sku';
    insert into sales_invoice_items (sales_invoice_id, product_id, sku, quantity, uom,
      conversion_to_base, base_quantity, unit_price, taxable, batch_number, expiry_date,
      line_subtotal, line_vat)
    values (v_invoice.id, v_product.id, v_item->>'sku', (v_item->>'quantity')::numeric,
      v_item->>'uom', (v_item->>'conversion_to_base')::numeric, (v_item->>'base_quantity')::numeric,
      (v_item->>'unit_price')::numeric, coalesce((v_item->>'taxable')::boolean, true),
      nullif(v_item->>'batch_number', ''), nullif(v_item->>'expiry_date', '')::date,
      (v_item->>'line_subtotal')::numeric, coalesce((v_item->>'line_vat')::numeric, 0));
  end loop;

  return jsonb_build_object('status', 'success', 'invoice_id', v_invoice.id,
    'journal_reference', v_ar_entry.journal_reference,
    'total_amount', v_invoice.total_amount, 'vat_amount', v_invoice.vat_amount,
    'posted_at', v_invoice.posted_at, 'idempotent_replay', false);

exception
  when unique_violation then
    if v_idem is not null then
      select * into v_existing from sales_invoices where idempotency_key = v_idem;
      if found then
        return jsonb_build_object('status', 'success', 'invoice_id', v_existing.id,
          'journal_reference',
            (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
          'total_amount', v_existing.total_amount, 'vat_amount', v_existing.vat_amount,
          'posted_at', v_existing.posted_at, 'idempotent_replay', true);
      end if;
    end if;
    raise;
end;
$$;

commit;
