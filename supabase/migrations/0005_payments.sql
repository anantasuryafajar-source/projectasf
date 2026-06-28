-- =====================================================================
-- Migration : 0005_payments.sql
-- Reference : PRD §3.2 (payment.received) — match invoice, record cash
--             inflow, close AR. Completes the Accounts Receivable cycle.
-- Adds      : sales_invoices.amount_paid, payments, payment_allocations,
--             record_payment() RPC, and an updated credit-limit calc that
--             nets out partial payments (FR-2.4).
-- =====================================================================

begin;

-- Track how much of each invoice has been settled (supports partial payment).
alter table sales_invoices
  add column if not exists amount_paid numeric(18,2) not null default 0;

-- =====================================================================
-- payments — cash receipts header (§3.2)
-- =====================================================================
create table payments (
  id               uuid          primary key default gen_random_uuid(),
  payment_number   varchar(64)   not null,
  customer_id      uuid          not null references customers (id) on delete restrict,
  payment_date     date          not null,
  amount           numeric(18,2) not null,
  allocated_amount numeric(18,2) not null default 0,
  currency         char(3)       not null default 'IDR',
  exchange_rate    numeric(18,6) not null default 1.0,
  debit_account_id uuid          references accounts (id) on delete restrict, -- Bank/Cash
  journal_entry_id uuid          references journal_entries (id) on delete restrict,
  idempotency_key  uuid,
  created_by       uuid          references profiles (id) on delete set null,
  created_at       timestamptz   not null default now(),
  posted_at        timestamptz,
  constraint uq_payments_number      unique (payment_number),
  constraint uq_payments_idempotency unique (idempotency_key),
  constraint chk_payments_amount_pos check (amount > 0)
);

create index idx_payments_customer on payments (customer_id);
create index idx_payments_date     on payments (payment_date);

-- =====================================================================
-- payment_allocations — links a payment to the invoices it settles
-- =====================================================================
create table payment_allocations (
  id               uuid          primary key default gen_random_uuid(),
  payment_id       uuid          not null references payments (id) on delete cascade,
  sales_invoice_id uuid          not null references sales_invoices (id) on delete restrict,
  amount_applied   numeric(18,2) not null,
  created_at       timestamptz   not null default now(),
  constraint chk_alloc_pos check (amount_applied > 0)
);

create index idx_alloc_payment on payment_allocations (payment_id);
create index idx_alloc_invoice on payment_allocations (sales_invoice_id);

-- RLS (§6.2): receipts are an operational write for owner + sales_kasir.
alter table payments            enable row level security;
alter table payment_allocations enable row level security;

create policy payments_select on payments for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy payments_ops_write on payments for all
  using (public.current_app_role() in ('owner', 'sales_kasir'))
  with check (public.current_app_role() in ('owner', 'sales_kasir'));

create policy alloc_select on payment_allocations for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy alloc_ops_write on payment_allocations for all
  using (public.current_app_role() in ('owner', 'sales_kasir'))
  with check (public.current_app_role() in ('owner', 'sales_kasir'));

grant all privileges on payments, payment_allocations
  to anon, authenticated, service_role;

-- =====================================================================
-- record_payment(payload) -> jsonb  (§3.2 payment.received)
-- Allocates a cash receipt to the customer's invoices (explicit list, or
-- auto oldest-first), updates amount_paid/status, and posts the journal:
--   Debit Bank/Cash | Credit Accounts Receivable.
-- Idempotent on idempotency_key (§6.2).
-- =====================================================================
create or replace function record_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idem      uuid;
  v_existing  payments;
  v_customer  customers;
  v_acc_debit uuid;
  v_acc_ar    uuid;
  v_amount    numeric;
  v_remaining numeric;
  v_allocated numeric := 0;
  v_alloc     jsonb;
  v_inv       sales_invoices;
  v_apply     numeric;
  v_inv_out   numeric;
  v_payment   payments;
  v_entry     journal_entries;
  v_invoices  jsonb := '[]'::jsonb;
  v_has_alloc boolean;
begin
  v_idem := nullif(p->>'idempotency_key', '')::uuid;

  if v_idem is not null then
    select * into v_existing from payments where idempotency_key = v_idem;
    if found then
      return jsonb_build_object(
        'status', 'success', 'payment_id', v_existing.id,
        'journal_reference',
          (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
        'amount', v_existing.amount, 'allocated', v_existing.allocated_amount,
        'posted_at', v_existing.posted_at, 'idempotent_replay', true,
        'invoices', '[]'::jsonb
      );
    end if;
  end if;

  v_amount := (p->>'amount')::numeric;
  if v_amount is null or v_amount <= 0 then
    raise exception 'INVALID_AMOUNT: payment amount must be positive'
      using errcode = 'check_violation';
  end if;

  select * into v_customer from customers where code = p->>'customer_code';
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND: %', p->>'customer_code'
      using errcode = 'no_data_found';
  end if;

  select id into v_acc_debit from accounts where account_code = p->>'account_code';
  select id into v_acc_ar    from accounts where account_code = p->>'ar_account_code';
  if v_acc_debit is null or v_acc_ar is null then
    raise exception 'ACCOUNT_MAPPING_MISSING: bank/AR account code not found'
      using errcode = 'check_violation';
  end if;

  insert into payments (
    payment_number, customer_id, payment_date, amount,
    currency, exchange_rate, idempotency_key, debit_account_id
  ) values (
    p->>'payment_number', v_customer.id, (p->>'payment_date')::date, v_amount,
    coalesce(p->>'currency', 'IDR'), coalesce((p->>'exchange_rate')::numeric, 1),
    v_idem, v_acc_debit
  )
  returning * into v_payment;

  v_remaining := v_amount;
  v_has_alloc := (p ? 'allocations')
                 and jsonb_typeof(p->'allocations') = 'array'
                 and jsonb_array_length(p->'allocations') > 0;

  if v_has_alloc then
    for v_alloc in select * from jsonb_array_elements(p->'allocations')
    loop
      exit when v_remaining <= 0;
      select * into v_inv from sales_invoices
        where invoice_number = v_alloc->>'invoice_number' for update;
      if not found then
        raise exception 'INVOICE_NOT_FOUND: %', v_alloc->>'invoice_number'
          using errcode = 'no_data_found';
      end if;
      if v_inv.customer_id <> v_customer.id then
        raise exception 'INVOICE_CUSTOMER_MISMATCH: %', v_inv.invoice_number
          using errcode = 'check_violation';
      end if;
      if v_inv.status = 'void' then
        raise exception 'INVOICE_VOID: %', v_inv.invoice_number
          using errcode = 'check_violation';
      end if;
      v_inv_out := v_inv.total_amount - v_inv.amount_paid;
      v_apply := least((v_alloc->>'amount')::numeric, v_inv_out, v_remaining);
      if v_apply <= 0 then continue; end if;

      update sales_invoices
         set amount_paid = amount_paid + v_apply,
             status = case when amount_paid + v_apply >= total_amount
                           then 'paid'::sales_invoice_status else status end
       where id = v_inv.id;
      insert into payment_allocations (payment_id, sales_invoice_id, amount_applied)
        values (v_payment.id, v_inv.id, v_apply);

      v_remaining := v_remaining - v_apply;
      v_allocated := v_allocated + v_apply;
      v_invoices := v_invoices || jsonb_build_object(
        'invoice_number', v_inv.invoice_number, 'applied', v_apply,
        'status', (select status from sales_invoices where id = v_inv.id));
    end loop;
  else
    -- Auto-allocate oldest outstanding first (by due date).
    for v_inv in
      select * from sales_invoices
       where customer_id = v_customer.id
         and status <> 'void'
         and amount_paid < total_amount
       order by due_date asc, transaction_date asc
       for update
    loop
      exit when v_remaining <= 0;
      v_inv_out := v_inv.total_amount - v_inv.amount_paid;
      v_apply := least(v_inv_out, v_remaining);

      update sales_invoices
         set amount_paid = amount_paid + v_apply,
             status = case when amount_paid + v_apply >= total_amount
                           then 'paid'::sales_invoice_status else status end
       where id = v_inv.id;
      insert into payment_allocations (payment_id, sales_invoice_id, amount_applied)
        values (v_payment.id, v_inv.id, v_apply);

      v_remaining := v_remaining - v_apply;
      v_allocated := v_allocated + v_apply;
      v_invoices := v_invoices || jsonb_build_object(
        'invoice_number', v_inv.invoice_number, 'applied', v_apply,
        'status', (select status from sales_invoices where id = v_inv.id));
    end loop;
  end if;

  if v_allocated <= 0 then
    raise exception 'NO_OUTSTANDING_INVOICE: nothing to allocate for customer %',
      v_customer.code using errcode = 'check_violation';
  end if;

  -- Journal: Debit Bank/Cash | Credit AR (allocated amount). §3.2
  v_entry := post_journal_entry(jsonb_build_object(
    'journal_reference', 'JV/RCPT/' || (p->>'payment_number'),
    'entry_date', p->>'payment_date',
    'description', 'Payment ' || (p->>'payment_number') || ' from ' || v_customer.code,
    'source', 'payment.received',
    'currency', coalesce(p->>'currency', 'IDR'),
    'exchange_rate', coalesce((p->>'exchange_rate')::numeric, 1),
    'items', jsonb_build_array(
      jsonb_build_object('account_id', v_acc_debit, 'line_number', 1,
                         'debit', v_allocated, 'base_debit', v_allocated),
      jsonb_build_object('account_id', v_acc_ar, 'line_number', 2,
                         'credit', v_allocated, 'base_credit', v_allocated)
    )
  ));

  update payments
     set journal_entry_id = v_entry.id, posted_at = now(), allocated_amount = v_allocated
   where id = v_payment.id;

  return jsonb_build_object(
    'status', 'success', 'payment_id', v_payment.id,
    'journal_reference', v_entry.journal_reference,
    'amount', v_amount, 'allocated', v_allocated,
    'unapplied', v_amount - v_allocated,
    'posted_at', now(), 'idempotent_replay', false, 'invoices', v_invoices
  );

exception
  when unique_violation then
    if v_idem is not null then
      select * into v_existing from payments where idempotency_key = v_idem;
      if found then
        return jsonb_build_object(
          'status', 'success', 'payment_id', v_existing.id,
          'journal_reference',
            (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
          'amount', v_existing.amount, 'allocated', v_existing.allocated_amount,
          'posted_at', v_existing.posted_at, 'idempotent_replay', true,
          'invoices', '[]'::jsonb
        );
      end if;
    end if;
    raise;
end;
$$;

-- =====================================================================
-- Update create_sales_invoice: outstanding now nets out partial payments.
-- (CREATE OR REPLACE of the 0003 function; only the credit-limit query
-- changed to subtract amount_paid and consider all non-void invoices.)
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

  if v_idem is not null then
    select * into v_existing from sales_invoices where idempotency_key = v_idem;
    if found then
      return jsonb_build_object(
        'status', 'success', 'invoice_id', v_existing.id,
        'journal_reference',
          (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
        'total_amount', v_existing.total_amount, 'vat_amount', v_existing.vat_amount,
        'posted_at', v_existing.posted_at, 'idempotent_replay', true
      );
    end if;
  end if;

  v_subtotal := (p->>'subtotal')::numeric;
  v_discount := coalesce((p->>'discount_total')::numeric, 0);
  v_vat      := (p->>'vat_amount')::numeric;
  v_total    := (p->>'total_amount')::numeric;

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

  -- Outstanding = unpaid portion of all non-void invoices (FR-2.4).
  select coalesce(sum(total_amount - amount_paid), 0) into v_outstanding
    from sales_invoices
   where customer_id = v_customer.id and status <> 'void';

  select count(*) into v_overdue
    from sales_invoices
   where customer_id = v_customer.id
     and status = 'issued'
     and due_date < current_date;

  if v_overdue > 0 then
    raise exception
      'OVERDUE_INVOICES: customer % has % overdue unpaid invoice(s) (FR-2.4)',
      v_customer.code, v_overdue using errcode = 'check_violation';
  end if;

  if v_customer.credit_limit > 0
     and (v_outstanding + v_total) > v_customer.credit_limit then
    raise exception
      'CREDIT_LIMIT_EXCEEDED: customer % outstanding % + new % exceeds limit % (FR-2.4)',
      v_customer.code, v_outstanding, v_total, v_customer.credit_limit
      using errcode = 'check_violation';
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
      raise exception 'PRODUCT_NOT_FOUND: %', v_item->>'sku'
        using errcode = 'no_data_found';
    end if;
    v_fifo := fulfill_inventory_fifo(
      v_product.id, v_warehouse.id, (v_item->>'base_quantity')::numeric
    );
    v_cogs_cost := v_cogs_cost + (v_fifo->>'total_cost')::numeric;
  end loop;

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
    'status', 'success', 'invoice_id', v_invoice.id,
    'journal_reference', v_ar_entry.journal_reference,
    'total_amount', v_invoice.total_amount, 'vat_amount', v_invoice.vat_amount,
    'posted_at', v_invoice.posted_at, 'idempotent_replay', false
  );

exception
  when unique_violation then
    if v_idem is not null then
      select * into v_existing from sales_invoices where idempotency_key = v_idem;
      if found then
        return jsonb_build_object(
          'status', 'success', 'invoice_id', v_existing.id,
          'journal_reference',
            (select journal_reference from journal_entries where id = v_existing.journal_entry_id),
          'total_amount', v_existing.total_amount, 'vat_amount', v_existing.vat_amount,
          'posted_at', v_existing.posted_at, 'idempotent_replay', true
        );
      end if;
    end if;
    raise;
end;
$$;

commit;
