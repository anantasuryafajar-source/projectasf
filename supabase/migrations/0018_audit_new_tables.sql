-- =====================================================================
-- Migration : 0018_audit_new_tables.sql
-- Purpose   : Attach the audit_row() trigger to tables introduced after
--             migration 0009 (stock transfers, exchange rates) so they are
--             captured by the immutable audit ledger (§6.2).
-- =====================================================================

begin;

do $$
declare
  t text;
  tables text[] := array['stock_transfers', 'stock_transfer_items', 'exchange_rates'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_trigger where tgname = 'trg_audit_' || t
    ) then
      execute format(
        'create trigger trg_audit_%1$s after insert or update or delete on %1$I for each row execute function audit_row()',
        t);
    end if;
  end loop;
end;
$$;

commit;
