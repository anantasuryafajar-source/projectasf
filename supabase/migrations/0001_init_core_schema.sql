-- =====================================================================
-- Migration : 0001_init_core_schema.sql
-- Project   : Ananta — Financial & Accounting System (Beverage Distribution ERP)
-- Reference : PRD v2.0 — Ch.3 (CoA/GL), Ch.4 (Inventory Costing &
--             Distribution) & Ch.6 (Technical Architecture & NFRs).
-- Engine    : PostgreSQL (Supabase)
--
-- Tables    : profiles, accounts, warehouses, products,
--             product_uom_conversions, inventory_batches,
--             journal_entries, journal_items.
-- Integrity : strict foreign keys, search indexes, idempotency_key on the
--             transactional table, deferred hard-balance trigger (FR-1.2),
--             and Row Level Security policies (§6.2 RBAC).
--
-- RBAC roles (per operational instruction):
--   owner        -> full CRUD on every table.
--   admin_gudang -> read accounting tables; full write on inventory tables.
--   sales_kasir  -> read accounting + inventory tables. (No sales/POS write
--                   table exists yet; operational write target is a follow-up.)
-- The backend service-role key bypasses RLS for automated journal posting.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------

-- RBAC operational roles (§6.2 RBAC).
create type user_role as enum (
  'owner',
  'admin_gudang',
  'sales_kasir'
);

-- CoA account classes (FR-1.1): Assets, Liabilities, Equity, Revenue, COGS, Expenses.
create type account_type as enum (
  'asset',
  'liability',
  'equity',
  'revenue',
  'cogs',
  'expense'
);

-- Standard side of an account (supports double-entry, FR-1.2).
create type normal_balance as enum ('debit', 'credit');

-- Inventory valuation rules (FR-3.1). Locked per item category at initialization.
create type valuation_method as enum ('moving_average', 'fifo');

-- Journal lifecycle. No hard delete (§6.2): corrections via void / reversal.
create type journal_status as enum ('draft', 'posted', 'voided');

-- Operational events that auto-generate journals (FR-2.x / §7).
create type journal_source as enum (
  'manual',
  'sales_order.shipped',
  'payment.received',
  'sales_return.approved'
);

-- ---------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- profiles (RBAC) — §6.2
-- One row per Supabase Auth user, carrying the RBAC role.
-- =====================================================================
create table profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  full_name   text        not null,
  role        user_role   not null default 'sales_kasir', -- least-privilege default
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_profiles_role on profiles (role);

create trigger trg_profiles_updated
before update on profiles
for each row execute function set_updated_at();

-- =====================================================================
-- accounts (Chart of Accounts) — FR-1.1
-- Multi-level hierarchy via self-referencing parent_account_id.
-- =====================================================================
create table accounts (
  id                uuid           primary key default gen_random_uuid(),
  account_code      varchar(32)    not null,
  account_name      text           not null,
  account_type      account_type   not null,
  normal_balance    normal_balance not null,
  parent_account_id uuid           references accounts (id) on delete restrict,
  currency          char(3)        not null default 'IDR', -- FR-1.3 base currency
  is_active         boolean        not null default true,
  created_at        timestamptz    not null default now(),
  updated_at        timestamptz    not null default now(),
  constraint uq_accounts_code unique (account_code),
  constraint chk_accounts_not_self_parent
    check (parent_account_id is null or parent_account_id <> id)
);

create index idx_accounts_parent on accounts (parent_account_id);
create index idx_accounts_type   on accounts (account_type);
create index idx_accounts_active on accounts (is_active);

create trigger trg_accounts_updated
before update on accounts
for each row execute function set_updated_at();

-- =====================================================================
-- warehouses (Multi-Warehouse) — FR-3.3
-- Physical/virtual fulfillment spaces. Referenced by inventory_batches.
-- =====================================================================
create table warehouses (
  id          uuid        primary key default gen_random_uuid(),
  code        varchar(64) not null,                 -- e.g. WH-KEBAGUSAN-01 (§7)
  name        text        not null,
  is_virtual  boolean     not null default false,   -- FR-3.3 virtual spaces
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_warehouses_code unique (code)
);

create index idx_warehouses_active on warehouses (is_active);

create trigger trg_warehouses_updated
before update on warehouses
for each row execute function set_updated_at();

-- =====================================================================
-- products (Multi-UOM) — FR-3.1, FR-3.4, FR-4.1
-- base_uom = lowest unit for ledger precision (e.g. 'bottle').
-- =====================================================================
create table products (
  id               uuid             primary key default gen_random_uuid(),
  sku              varchar(64)      not null,
  name             text             not null,
  category         text,
  base_uom         varchar(32)      not null,                 -- FR-3.4 lowest base unit
  valuation_method valuation_method not null,                 -- FR-3.1 (locked per category)
  taxable          boolean          not null default true,    -- FR-4.1 Taxable vs Non-Taxable
  is_active        boolean          not null default true,
  created_at       timestamptz      not null default now(),
  updated_at       timestamptz      not null default now(),
  constraint uq_products_sku unique (sku)
);

create index idx_products_category on products (category);
create index idx_products_active   on products (is_active);

create trigger trg_products_updated
before update on products
for each row execute function set_updated_at();

-- =====================================================================
-- product_uom_conversions (Nested UOM) — FR-3.4
-- Each row maps one named unit of a product to its quantity expressed in
-- the product base_uom. Nested chains (Pallet > Carton > Bottle) are
-- flattened to the base unit for ledger precision, e.g. for a 'bottle'
-- base: bottle=1, carton=24, pallet=960 (40*24).
-- =====================================================================
create table product_uom_conversions (
  id               uuid          primary key default gen_random_uuid(),
  product_id       uuid          not null references products (id) on delete cascade,
  uom_name         varchar(32)   not null,                  -- e.g. 'pallet','carton','bottle'
  quantity_in_base numeric(18,4) not null,                  -- units of base_uom per 1 uom_name
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),
  constraint uq_product_uom unique (product_id, uom_name),
  constraint chk_uom_qty_pos check (quantity_in_base > 0)
);

create index idx_uom_product on product_uom_conversions (product_id);

create trigger trg_uom_conversions_updated
before update on product_uom_conversions
for each row execute function set_updated_at();

-- =====================================================================
-- inventory_batches (Batch & Expiry / FIFO) — FR-3.5, FR-3.3, FR-3.4
-- Quantities stored in product base_uom (FR-3.4).
-- batch_number & expiry_date are mandatory (FR-3.5).
-- warehouse_id is now a strict FK to warehouses (FR-3.3).
-- =====================================================================
create table inventory_batches (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references products (id) on delete restrict,
  warehouse_id      uuid        not null references warehouses (id) on delete restrict, -- FR-3.3 strict FK
  batch_number      varchar(64) not null,                      -- FR-3.5 mandatory
  expiry_date       date        not null,                      -- FR-3.5 mandatory
  quantity_on_hand  numeric(18,4) not null default 0,          -- in base_uom (FR-3.4)
  unit_cost         numeric(18,2) not null default 0,          -- valuation (FR-3.1)
  received_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_inventory_batch unique (product_id, warehouse_id, batch_number),
  constraint chk_inventory_qty_nonneg  check (quantity_on_hand >= 0),
  constraint chk_inventory_cost_nonneg check (unit_cost >= 0)
);

-- FIFO depletion by expiry (FR-3.5): outbound picks earliest expiry first.
create index idx_inventory_fifo      on inventory_batches (product_id, warehouse_id, expiry_date);
create index idx_inventory_warehouse on inventory_batches (warehouse_id);
create index idx_inventory_expiry    on inventory_batches (expiry_date);

create trigger trg_inventory_batches_updated
before update on inventory_batches
for each row execute function set_updated_at();

-- =====================================================================
-- journal_entries (GL header / transaction) — FR-1.2, FR-1.3, §6.2
-- idempotency_key (§6.2) is UNIQUE; NULL allowed for manual entries.
-- No hard delete (§6.2): use status='voided' and/or reversal_of.
-- =====================================================================
create table journal_entries (
  id                uuid           primary key default gen_random_uuid(),
  journal_reference varchar(64)    not null,                   -- e.g. JV/20260628/8810 (§7)
  entry_date        date           not null,
  description       text,
  source            journal_source not null default 'manual',  -- FR-2.x / §7
  currency          char(3)        not null default 'IDR',     -- FR-1.3 original currency
  exchange_rate     numeric(18,6)  not null default 1.0,       -- FR-1.3 -> IDR translation
  status            journal_status not null default 'posted',
  idempotency_key   uuid,                                      -- §6.2 retry-safe dedupe
  reversal_of       uuid           references journal_entries (id) on delete restrict, -- §6.2 reversal
  created_by        uuid           references profiles (id) on delete set null,
  created_at        timestamptz    not null default now(),
  updated_at        timestamptz    not null default now(),
  posted_at         timestamptz,
  constraint uq_journal_reference   unique (journal_reference),
  constraint uq_journal_idempotency unique (idempotency_key),
  constraint chk_journal_rate_pos   check (exchange_rate > 0)
);

create index idx_journal_entry_date  on journal_entries (entry_date);
create index idx_journal_source      on journal_entries (source);
create index idx_journal_status      on journal_entries (status);
create index idx_journal_reversal_of on journal_entries (reversal_of);
create index idx_journal_created_by  on journal_entries (created_by);

create trigger trg_journal_entries_updated
before update on journal_entries
for each row execute function set_updated_at();

-- =====================================================================
-- journal_items (GL lines / double-entry) — FR-1.2, FR-1.3
-- Each line is strictly a debit XOR a credit.
-- Original-currency amounts plus IDR base amounts (FR-1.3).
-- =====================================================================
create table journal_items (
  id               uuid          primary key default gen_random_uuid(),
  journal_entry_id uuid          not null references journal_entries (id) on delete cascade,
  account_id       uuid          not null references accounts (id) on delete restrict,
  line_number      integer       not null,
  memo             text,
  -- Transaction-currency amounts (FR-1.3 original value)
  debit            numeric(18,2) not null default 0,
  credit           numeric(18,2) not null default 0,
  -- Base-currency (IDR) equivalents (FR-1.3 translation)
  base_debit       numeric(18,2) not null default 0,
  base_credit      numeric(18,2) not null default 0,
  created_at       timestamptz   not null default now(),
  constraint uq_item_line unique (journal_entry_id, line_number),
  constraint chk_item_amounts_nonneg
    check (debit >= 0 and credit >= 0 and base_debit >= 0 and base_credit >= 0),
  -- A line is either a debit or a credit, never both, never neither.
  constraint chk_item_one_side
    check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index idx_journal_items_entry   on journal_items (journal_entry_id);
create index idx_journal_items_account on journal_items (account_id);

-- ---------------------------------------------------------------------
-- Hard balance enforcement (FR-1.2 + §6.1 transactional constraints)
-- Deferred constraint trigger: at COMMIT, every POSTED journal must satisfy
-- sum(debit) == sum(credit) and sum(base_debit) == sum(base_credit).
-- Drafts are exempt so multi-line entries can be built up within a tx.
-- ---------------------------------------------------------------------
create or replace function enforce_journal_balance()
returns trigger
language plpgsql
as $$
declare
  v_entry        uuid;
  v_status       journal_status;
  v_debit        numeric(18,2);
  v_credit       numeric(18,2);
  v_base_debit   numeric(18,2);
  v_base_credit  numeric(18,2);
begin
  v_entry := coalesce(new.journal_entry_id, old.journal_entry_id);

  select status into v_status from journal_entries where id = v_entry;

  -- Entry removed in same tx, or still a draft: nothing to enforce.
  if v_status is null or v_status = 'draft' then
    return null;
  end if;

  select coalesce(sum(debit), 0),      coalesce(sum(credit), 0),
         coalesce(sum(base_debit), 0), coalesce(sum(base_credit), 0)
    into v_debit, v_credit, v_base_debit, v_base_credit
    from journal_items
   where journal_entry_id = v_entry;

  if v_debit <> v_credit then
    raise exception
      'Unbalanced journal % : debit % <> credit % (FR-1.2)',
      v_entry, v_debit, v_credit
      using errcode = 'check_violation';
  end if;

  if v_base_debit <> v_base_credit then
    raise exception
      'Unbalanced journal % (IDR base): debit % <> credit % (FR-1.2)',
      v_entry, v_base_debit, v_base_credit
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger trg_journal_items_balance
after insert or update or delete on journal_items
deferrable initially deferred
for each row execute function enforce_journal_balance();

-- =====================================================================
-- Row Level Security (§6.2 RBAC)
-- =====================================================================

-- Resolve the current user's role. SECURITY DEFINER so it can read profiles
-- without being subject to (and recursing into) profiles' own RLS policies.
create or replace function public.current_app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table profiles                enable row level security;
alter table accounts                enable row level security;
alter table warehouses              enable row level security;
alter table products                enable row level security;
alter table product_uom_conversions enable row level security;
alter table inventory_batches       enable row level security;
alter table journal_entries         enable row level security;
alter table journal_items           enable row level security;

-- profiles: a user reads their own row; owner manages all.
create policy profiles_select_self_or_owner on profiles for select
  using (id = auth.uid() or public.current_app_role() = 'owner');
create policy profiles_owner_write on profiles for all
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

-- Accounting tables: all roles may read; only owner may write.
create policy accounts_select on accounts for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy accounts_owner_write on accounts for all
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

create policy journal_entries_select on journal_entries for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy journal_entries_owner_write on journal_entries for all
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

create policy journal_items_select on journal_items for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy journal_items_owner_write on journal_items for all
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

-- Inventory/operational tables: all roles read; owner + admin_gudang write.
create policy warehouses_select on warehouses for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy warehouses_ops_write on warehouses for all
  using (public.current_app_role() in ('owner', 'admin_gudang'))
  with check (public.current_app_role() in ('owner', 'admin_gudang'));

create policy products_select on products for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy products_ops_write on products for all
  using (public.current_app_role() in ('owner', 'admin_gudang'))
  with check (public.current_app_role() in ('owner', 'admin_gudang'));

create policy uom_select on product_uom_conversions for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy uom_ops_write on product_uom_conversions for all
  using (public.current_app_role() in ('owner', 'admin_gudang'))
  with check (public.current_app_role() in ('owner', 'admin_gudang'));

create policy inventory_batches_select on inventory_batches for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy inventory_batches_ops_write on inventory_batches for all
  using (public.current_app_role() in ('owner', 'admin_gudang'))
  with check (public.current_app_role() in ('owner', 'admin_gudang'));

commit;
