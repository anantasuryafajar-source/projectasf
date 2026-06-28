-- =====================================================================
-- Migration : 0004_grants.sql
-- Purpose   : Grant table/function privileges to the Supabase API roles.
--             RLS (enabled in 0001/0003) still restricts row access for
--             anon/authenticated; service_role bypasses RLS. Privileges and
--             RLS are independent in PostgreSQL, so these GRANTs are required
--             for PostgREST to reach the tables at all.
-- =====================================================================

begin;

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public
  to anon, authenticated, service_role;
grant all privileges on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Future objects created by the migration owner inherit the same grants.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

commit;
