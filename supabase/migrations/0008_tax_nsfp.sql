-- =====================================================================
-- Migration : 0008_tax_nsfp.sql
-- Reference : PRD FR-4.2 (DJP e-Faktur CSV export) & FR-4.3 (NSFP lifecycle
--             — pool of tax-invoice serial numbers, auto-assigned
--             chronologically to taxable invoices).
-- =====================================================================

begin;

create type nsfp_status as enum ('available', 'assigned', 'void');

-- Pool of acquired Nomor Seri Faktur Pajak (NSFP) from e-Nofa (FR-4.3).
create table nsfp_numbers (
  id               uuid        primary key default gen_random_uuid(),
  serial_number    varchar(32) not null,
  status           nsfp_status not null default 'available',
  sales_invoice_id uuid        references sales_invoices (id) on delete set null,
  assigned_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint uq_nsfp_serial unique (serial_number)
);

create index idx_nsfp_status on nsfp_numbers (status);

-- The assigned tax-invoice (NSFP) number on each sales invoice.
alter table sales_invoices
  add column if not exists tax_invoice_number varchar(32);

alter table nsfp_numbers enable row level security;

create policy nsfp_select on nsfp_numbers for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy nsfp_write on nsfp_numbers for all
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

grant all privileges on nsfp_numbers to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- assign_pending_nsfp() -> jsonb  (FR-4.3)
-- Assigns available NSFP, lowest serial first, to taxable invoices that
-- lack a tax number, oldest invoice first. Stops when the pool runs out.
-- ---------------------------------------------------------------------
create or replace function assign_pending_nsfp()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv         record;
  v_nsfp        nsfp_numbers;
  v_count       int := 0;
  v_assignments jsonb := '[]'::jsonb;
begin
  for v_inv in
    select * from sales_invoices
     where vat_amount > 0 and tax_invoice_number is null and status <> 'void'
     order by transaction_date asc, created_at asc
  loop
    select * into v_nsfp from nsfp_numbers
      where status = 'available'
      order by serial_number asc
      limit 1 for update skip locked;
    exit when not found;

    update nsfp_numbers
       set status = 'assigned', sales_invoice_id = v_inv.id, assigned_at = now()
     where id = v_nsfp.id;
    update sales_invoices
       set tax_invoice_number = v_nsfp.serial_number
     where id = v_inv.id;

    v_count := v_count + 1;
    v_assignments := v_assignments || jsonb_build_object(
      'invoice_number', v_inv.invoice_number, 'serial_number', v_nsfp.serial_number);
  end loop;

  return jsonb_build_object(
    'assigned', v_count,
    'remaining_available', (select count(*) from nsfp_numbers where status = 'available'),
    'assignments', v_assignments);
end;
$$;

commit;
