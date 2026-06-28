-- =====================================================================
-- NFR gate (PRD §6.2): "Financial report generation queries spanning up to
-- 100,000 line items must render in less than 5 seconds."
--
-- Seeds 50,000 balanced posted journal_entries x 2 lines = 100,000
-- journal_items, then measures each financial report with clock_timestamp()
-- and RAISES an exception (failing CI) if any report exceeds the threshold.
-- =====================================================================

set session_replication_role = replica;  -- bypass per-row triggers for fast bulk load

create temporary table _acc as
select account_code, id from accounts
where account_code in ('1100','1300','2100','4100','5000','3000');

insert into journal_entries (id, journal_reference, entry_date, source, status, created_at, updated_at, posted_at)
select gen_random_uuid(), 'BENCH/'||g, date '2026-01-01' + (g % 180),
       'manual', 'posted', now(), now(), now()
from generate_series(1, 50000) g;

with e as (
  select id,
         (row_number() over (order by journal_reference))::int as g,
         (100000 + (row_number() over (order by journal_reference)) % 500)::numeric(18,2) as amt
  from journal_entries where journal_reference like 'BENCH/%'
)
insert into journal_items (journal_entry_id, account_id, line_number, debit, credit, base_debit, base_credit)
select e.id,
       case g % 3 when 0 then (select id from _acc where account_code='1100')
                  when 1 then (select id from _acc where account_code='5000')
                  else        (select id from _acc where account_code='1300') end,
       1, e.amt, 0, e.amt, 0
from e
union all
select e.id,
       case g % 3 when 0 then (select id from _acc where account_code='4100')
                  when 1 then (select id from _acc where account_code='2100')
                  else        (select id from _acc where account_code='3000') end,
       2, 0, e.amt, 0, e.amt
from e;

set session_replication_role = origin;

analyze journal_entries;
analyze journal_items;

do $$
declare
  limit_ms   constant numeric := 5000;
  n_items    bigint;
  t0         timestamptz;
  tb_ms      numeric;
  pl_ms      numeric;
  bs_ms      numeric;
begin
  select count(*) into n_items from journal_items;

  t0 := clock_timestamp();
  perform report_trial_balance(date '2026-12-31');
  tb_ms := extract(epoch from clock_timestamp() - t0) * 1000;

  t0 := clock_timestamp();
  perform report_profit_loss(date '2026-01-01', date '2026-12-31');
  pl_ms := extract(epoch from clock_timestamp() - t0) * 1000;

  t0 := clock_timestamp();
  perform report_balance_sheet(date '2026-12-31');
  bs_ms := extract(epoch from clock_timestamp() - t0) * 1000;

  raise notice 'NFR benchmark over % line items:', n_items;
  raise notice '  trial_balance : % ms', round(tb_ms, 1);
  raise notice '  profit_loss   : % ms', round(pl_ms, 1);
  raise notice '  balance_sheet : % ms', round(bs_ms, 1);
  raise notice '  threshold     : % ms', limit_ms;

  if n_items < 100000 then
    raise exception 'NFR benchmark seeded only % line items (expected >= 100000)', n_items;
  end if;
  if tb_ms > limit_ms or pl_ms > limit_ms or bs_ms > limit_ms then
    raise exception 'NFR FAILED: a report exceeded % ms (TB=% PL=% BS=%)',
      limit_ms, round(tb_ms,1), round(pl_ms,1), round(bs_ms,1);
  end if;

  raise notice 'NFR PASSED: all reports under % ms.', limit_ms;
end $$;
