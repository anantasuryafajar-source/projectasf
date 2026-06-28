-- =====================================================================
-- Migration : 0017_realtime.sql
-- Reference : PRD §6.1 — real-time triggers for prompt dashboard syncing.
-- Adds key tables to the Supabase realtime publication so the frontend
-- can subscribe to postgres_changes. Guarded so it is a no-op on a plain
-- Postgres (where the publication does not exist).
-- =====================================================================

begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- add tables individually; ignore if already members
    begin
      alter publication supabase_realtime add table journal_entries;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table inventory_batches;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table sales_invoices;
    exception when duplicate_object then null; end;
  end if;
end;
$$;

commit;
