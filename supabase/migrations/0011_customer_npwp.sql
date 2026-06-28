-- =====================================================================
-- Migration : 0011_customer_npwp.sql
-- Reference : PRD FR-4.2 (e-Faktur needs the buyer's NPWP) + master data.
-- =====================================================================

begin;

alter table customers
  add column if not exists npwp    varchar(32),
  add column if not exists address text;

commit;
