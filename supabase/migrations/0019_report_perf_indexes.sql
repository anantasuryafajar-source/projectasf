-- =====================================================================
-- Migration : 0019_report_perf_indexes.sql
-- Purpose   : Performance hardening for the financial report NFR (PRD §6.2):
--             "Financial report generation queries spanning up to 100,000
--              line items must render in less than 5 seconds."
--
--   The trial-balance / P&L / balance-sheet RPCs (0006) all aggregate
--   journal_items joined to journal_entries, filtered by
--   (status = 'posted' AND entry_date <= as_of / BETWEEN from..to).
--
--   - Composite (status, entry_date) lets the planner narrow to posted
--     entries within the reporting window before the join/group-by.
--   - Covering index on journal_items(journal_entry_id) INCLUDE the
--     base amounts + account_id lets the aggregation run as an
--     index-only scan, avoiding heap fetches over 100k+ lines.
-- =====================================================================

begin;

-- Narrow posted entries by period (P&L BETWEEN, TB/BS <= as_of).
create index if not exists idx_journal_entries_status_date
  on journal_entries (status, entry_date);

-- Covering index for the GL aggregation: join key + grouped account +
-- the summed base amounts, so reports can scan the index alone.
create index if not exists idx_journal_items_cover
  on journal_items (journal_entry_id)
  include (account_id, base_debit, base_credit);

commit;
