-- =====================================================================
-- Migration : 0003_sales_invoice.sql
-- Project   : Ananta — Financial & Accounting System (Beverage Distribution ERP)
-- Reference : PRD §3.2 (Sales & AR), FR-2.4 (Credit Limit & TOP),
--             FR-3.2/FR-3.5 (COGS + FIFO), §7 (sales-invoice API).
-- Adds      : customers, sales_invoices, sales_invoice_items and the atomic
--             create_sales_invoice() RPC.
-- =====================================================================

begin;

create type sales_invoice_status as enum ('issued', 'paid', 'void');

-- =====================================================================
-- customers — FR-2.4 (credit limit + Term of Payment)
-- =====================================================================
create table customers (
  id                   uuid        primary key default gen_random_uuid(),
  code                 varchar(64) not null,                 -- e.g. CUST-BRW-099 (§7)
  name                 text        not null,
  credit_limit         numeric(18,2) not null default 0,     -- FR-2.4 (0 = unlimited)
  term_of_payment_days int         not null default 0,       -- FR-2.4 TOP
  is_active            boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint uq_customers_code unique (code),
  constraint chk_customers_credit_nonneg check (credit_limit >= 0),
  constraint chk_customers_top_nonneg check (term_of_payment_days >= 0)
);

create index idx_customers_active on customers (is_active);

create trigger trg_customers_updated
before update on customers
for each row execute function set_updated_at();

-- =====================================================================
-- sales_invoices — AR header (§3.2, §7)
-- =====================================================================
create table sales_invoices (
  id                    uuid        primary key default gen_random_uuid(),
  invoice_number        varchar(64) not null,                -- §7
  customer_id           uuid        not null references customers (id) on delete restrict,
  warehouse_id          uuid        not null references warehouses (id) on delete restrict,
  transaction_date      date        not null,
  term_of_payment_days  int         not null default 0,
  due_date              date        not null,
  currency              char(3)     not null default 'IDR',
  exchange_rate         numeric(18,6) not null default 1.0,
  subtotal              numeric(18,2) not null,
  discount_total        numeric(18,2) not null default 0,
  vat_amount            numeric(18,2) not null default 0,
  total_amount          numeric(18,2) not null,
  status                sales_invoice_status not null default 'issued',
  idempotency_key       uuid,                                -- §6.2
  journal_entry_id      uuid references journal_entries (id) on delete restrict,
  cogs_journal_entry_id uuid references journal_entries (id) on delete restrict,
  created_by            uuid references profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  posted_at             timestamptz,
  constraint uq_sales_invoice_number unique (invoice_number),
  constraint uq_sales_invoice_idempotency unique (idempotency_key),
  constraint chk_sales_invoice_totals_nonneg
    check (subtotal >= 0 and discount_total >= 0 and vat_amount >= 0 and total_amount >= 0)
);

create index idx_sales_invoices_customer on sales_invoices (customer_id);
create index idx_sales_invoices_status   on sales_invoices (status);
create index idx_sales_invoices_due_date on sales_invoices (due_date);
create index idx_sales_invoices_txn_date on sales_invoices (transaction_date);

create trigger trg_sales_invoices_updated
before update on sales_invoices
for each row execute function set_updated_at();

-- =====================================================================
-- sales_invoice_items — invoice lines (§7)
-- =====================================================================
create table sales_invoice_items (
  id                 uuid        primary key default gen_random_uuid(),
  sales_invoice_id   uuid        not null references sales_invoices (id) on delete cascade,
  product_id         uuid        not null references products (id) on delete restrict,
  sku                varchar(64) not null,
  quantity           numeric(18,4) not null,
  uom                varchar(32) not null,
  conversion_to_base numeric(18,4) not null,                 -- §7 conversion_to_base
  base_quantity      numeric(18,4) not null,                 -- quantity * conversion (FR-3.4)
  unit_price         numeric(18,2) not null,
  taxable            boolean     not null default true,      -- FR-4.1
  batch_number       varchar(64),                            -- §7 / FR-3.5
  expiry_date        date,                                   -- §7 / FR-3.5
  line_subtotal      numeric(18,2) not null,
  line_vat           numeric(18,2) not null default 0,
  created_at         timestamptz not null default now(),
  constraint chk_sales_item_qty_pos check (quantity > 0 and base_quantity > 0)
);

create index idx_sales_items_invoice on sales_invoice_items (sales_invoice_id);
create index idx_sales_items_product on sales_invoice_items (product_id);

-- =====================================================================
-- RLS (§6.2). Sales tables are sales_kasir's operational write tables.
-- =====================================================================
alter table customers           enable row level security;
alter table sales_invoices      enable row level security;
alter table sales_invoice_items enable row level security;

create policy customers_select on customers for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy customers_ops_write on customers for all
  using (public.current_app_role() in ('owner', 'sales_kasir'))
  with check (public.current_app_role() in ('owner', 'sales_kasir'));

create policy sales_invoices_select on sales_invoices for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy sales_invoices_ops_write on sales_invoices for all
  using (public.current_app_role() in ('owner', 'sales_kasir'))
  with check (public.current_app_role() in ('owner', 'sales_kasir'));

create policy sales_items_select on sales_invoice_items for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy sales_items_ops_write on sales_invoice_items for all
  using (public.current_app_role() in ('owner', 'sales_kasir'))
  with check (public.current_app_role() in ('owner', 'sales_kasir'));

-- =====================================================================
-- create_sales_invoice(payload) -> jsonb
-- Atomic sales-invoice processing for §7. Amounts (VAT/totals) are computed
-- by the NestJS layer and passed in; this RPC performs the DB-side workflow:
--   1. idempotency replay (§6.2)
--   2. resolve customer/warehouse
--   3. credit-limit + overdue checks (FR-2.4)
--   4. FIFO depletion per item (FR-3.5) accumulating COGS
--   5. post AR/Revenue/VAT journal (§3.2) + COGS journal (FR-3.2)
--   6. persist invoice + items
-- Business-rule failures raise tagged exceptions the API maps to HTTP codes.
-- =====================================================================
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

  -- 1. Idempotency replay (§6.2)
  if v_idem is not null then
    select * into v_existing from sales_invoices where idempotency_key = v_idem;
    if found then
      return jsonb_build_object(
        'status', 'success',
        'invoice_id', v_existing.id,
        'journal_reference',
          (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
        'total_amount', v_existing.total_amount,
        'vat_amount', v_existing.vat_amount,
        'posted_at', v_existing.posted_at,
        'idempotent_replay', true
      );
    end if;
  end if;

  v_subtotal := (p->>'subtotal')::numeric;
  v_discount := coalesce((p->>'discount_total')::numeric, 0);
  v_vat      := (p->>'vat_amount')::numeric;
  v_total    := (p->>'total_amount')::numeric;

  -- 2. Resolve customer / warehouse
  select * into v_customer from customers where code = p->>'customer_code';
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND: %', p->>'customer_code'
      using errcode = 'no_data_found';
  end if;
  if not v_customer.is_active then
    raise exception 'CUSTOMER_INACTIVE: %', v_customer.code
      using errcode = 'check_violation';
  end if;

  select * into v_warehouse from warehouses where code = p->>'warehouse_code';
  if not found then
    raise exception 'WAREHOUSE_NOT_FOUND: %', p->>'warehouse_code'
      using errcode = 'no_data_found';
  end if;

  -- 3. Credit-limit + overdue enforcement (FR-2.4)
  select coalesce(sum(total_amount), 0) into v_outstanding
    from sales_invoices
   where customer_id = v_customer.id and status = 'issued';

  select count(*) into v_overdue
    from sales_invoices
   where customer_id = v_customer.id
     and status = 'issued'
     and due_date < current_date;

  if v_overdue > 0 then
    raise exception
      'OVERDUE_INVOICES: customer % has % overdue unpaid invoice(s) (FR-2.4)',
      v_customer.code, v_overdue
      using errcode = 'check_violation';
  end if;

  if v_customer.credit_limit > 0
     and (v_outstanding + v_total) > v_customer.credit_limit then
    raise exception
      'CREDIT_LIMIT_EXCEEDED: customer % outstanding % + new % exceeds limit % (FR-2.4)',
      v_customer.code, v_outstanding, v_total, v_customer.credit_limit
      using errcode = 'check_violation';
  end if;

  -- Account mapping (codes passed from backend config)
  select id into v_acc_ar   from accounts where account_code = p->'accounts'->>'ar';
  select id into v_acc_rev  from accounts where account_code = p->'accounts'->>'revenue';
  select id into v_acc_vat  from accounts where account_code = p->'accounts'->>'vat_out';
  select id into v_acc_cogs from accounts where account_code = p->'accounts'->>'cogs';
  select id into v_acc_inv  from accounts where account_code = p->'accounts'->>'inventory';
  if v_acc_ar is null or v_acc_rev is null or v_acc_vat is null then
    raise exception 'ACCOUNT_MAPPING_MISSING: AR/Revenue/VAT account code not found'
      using errcode = 'check_violation';
  end if;

  -- 4. FIFO depletion per item (FR-3.5) -> COGS (FR-3.2)
  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    select * into v_product from products where sku = v_item->>'sku';
    if not found then
      raise exception 'PRODUCT_NOT_FOUND: %', v_item->>'sku'
        using errcode = 'no_data_found';
    end if;
    v_fifo := fulfill_inventory_fifo(
      v_product.id, v_warehouse.id, (v_item->>'base_quantity')::numeric
    );
    v_cogs_cost := v_cogs_cost + (v_fifo->>'total_cost')::numeric;
  end loop;

  -- 5a. AR / Revenue / VAT journal (§3.2 sales_order.shipped)
  v_ar_items := jsonb_build_array(
    jsonb_build_object('account_id', v_acc_ar, 'line_number', 1,
                       'debit', v_total, 'base_debit', v_total),
    jsonb_build_object('account_id', v_acc_rev, 'line_number', 2,
                       'credit', (v_subtotal - v_discount),
                       'base_credit', (v_subtotal - v_discount))
  );
  if v_vat > 0 then
    v_ar_items := v_ar_items || jsonb_build_object(
      'account_id', v_acc_vat, 'line_number', 3,
      'credit', v_vat, 'base_credit', v_vat
    );
  end if;

  v_ar_entry := post_journal_entry(jsonb_build_object(
    'journal_reference', 'JV/AR/' || (p->>'invoice_number'),
    'entry_date', p->>'transaction_date',
    'description', 'Sales invoice ' || (p->>'invoice_number'),
    'source', 'sales_order.shipped',
    'currency', coalesce(p->>'currency', 'IDR'),
    'exchange_rate', coalesce((p->>'exchange_rate')::numeric, 1),
    'items', v_ar_items
  ));

  -- 5b. COGS journal (FR-3.2)
  if v_cogs_cost > 0 then
    v_cogs_entry := post_journal_entry(jsonb_build_object(
      'journal_reference', 'JV/COGS/' || (p->>'invoice_number'),
      'entry_date', p->>'transaction_date',
      'description', 'COGS for ' || (p->>'invoice_number'),
      'source', 'sales_order.shipped',
      'items', jsonb_build_array(
        jsonb_build_object('account_id', v_acc_cogs, 'line_number', 1,
                           'debit', v_cogs_cost, 'base_debit', v_cogs_cost),
        jsonb_build_object('account_id', v_acc_inv, 'line_number', 2,
                           'credit', v_cogs_cost, 'base_credit', v_cogs_cost)
      )
    ));
  end if;

  -- 6. Persist invoice + items
  v_due := (p->>'transaction_date')::date
           + coalesce((p->>'term_of_payment_days')::int, 0);

  insert into sales_invoices (
    invoice_number, customer_id, warehouse_id, transaction_date,
    term_of_payment_days, due_date, currency, exchange_rate,
    subtotal, discount_total, vat_amount, total_amount, status,
    idempotency_key, journal_entry_id, cogs_journal_entry_id, posted_at
  ) values (
    p->>'invoice_number', v_customer.id, v_warehouse.id,
    (p->>'transaction_date')::date,
    coalesce((p->>'term_of_payment_days')::int, 0), v_due,
    coalesce(p->>'currency', 'IDR'),
    coalesce((p->>'exchange_rate')::numeric, 1),
    v_subtotal, v_discount, v_vat, v_total, 'issued',
    v_idem, v_ar_entry.id,
    case when v_cogs_cost > 0 then v_cogs_entry.id else null end,
    now()
  )
  returning * into v_invoice;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    select * into v_product from products where sku = v_item->>'sku';
    insert into sales_invoice_items (
      sales_invoice_id, product_id, sku, quantity, uom,
      conversion_to_base, base_quantity, unit_price, taxable,
      batch_number, expiry_date, line_subtotal, line_vat
    ) values (
      v_invoice.id, v_product.id, v_item->>'sku',
      (v_item->>'quantity')::numeric, v_item->>'uom',
      (v_item->>'conversion_to_base')::numeric,
      (v_item->>'base_quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'taxable')::boolean, true),
      nullif(v_item->>'batch_number', ''),
      nullif(v_item->>'expiry_date', '')::date,
      (v_item->>'line_subtotal')::numeric,
      coalesce((v_item->>'line_vat')::numeric, 0)
    );
  end loop;

  return jsonb_build_object(
    'status', 'success',
    'invoice_id', v_invoice.id,
    'journal_reference', v_ar_entry.journal_reference,
    'total_amount', v_invoice.total_amount,
    'vat_amount', v_invoice.vat_amount,
    'posted_at', v_invoice.posted_at,
    'idempotent_replay', false
  );

exception
  -- Concurrent idempotent create: return the winning invoice.
  when unique_violation then
    if v_idem is not null then
      select * into v_existing from sales_invoices where idempotency_key = v_idem;
      if found then
        return jsonb_build_object(
          'status', 'success',
          'invoice_id', v_existing.id,
          'journal_reference',
            (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
          'total_amount', v_existing.total_amount,
          'vat_amount', v_existing.vat_amount,
          'posted_at', v_existing.posted_at,
          'idempotent_replay', true
        );
      end if;
    end if;
    raise;
end;
$$;

commit;
