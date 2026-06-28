-- =====================================================================
-- Migration : 0006_reports.sql
-- Reference : PRD Objective 1.2 (instant financial statements) — Trial
--             Balance, Profit & Loss, Balance Sheet. Read-only aggregation
--             over the General Ledger (posted journals, IDR base amounts).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- report_trial_balance(as_of) -> jsonb
-- Per-account debit/credit totals for all posted entries up to as_of.
-- ---------------------------------------------------------------------
create or replace function report_trial_balance(p_as_of date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sums as (
    select a.account_code, a.account_name, a.account_type,
           coalesce(sum(ji.base_debit), 0)  as debit,
           coalesce(sum(ji.base_credit), 0) as credit
    from accounts a
    left join journal_items ji on ji.account_id = a.id
    left join journal_entries je on je.id = ji.journal_entry_id
         and je.status = 'posted' and je.entry_date <= p_as_of
    group by a.account_code, a.account_name, a.account_type
    having coalesce(sum(ji.base_debit), 0) <> 0
        or coalesce(sum(ji.base_credit), 0) <> 0
  )
  select jsonb_build_object(
    'as_of', p_as_of,
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      'account_code', account_code, 'account_name', account_name,
      'account_type', account_type, 'debit', debit, 'credit', credit
    ) order by account_code), '[]'::jsonb),
    'total_debit', coalesce(sum(debit), 0),
    'total_credit', coalesce(sum(credit), 0),
    'balanced', coalesce(sum(debit), 0) = coalesce(sum(credit), 0)
  )
  from sums;
$$;

-- ---------------------------------------------------------------------
-- report_profit_loss(from, to) -> jsonb
-- Revenue - COGS = gross profit; - expenses = net income.
-- ---------------------------------------------------------------------
create or replace function report_profit_loss(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select a.account_type, a.account_code, a.account_name,
           coalesce(sum(ji.base_debit), 0)  as debit,
           coalesce(sum(ji.base_credit), 0) as credit
    from accounts a
    join journal_items ji on ji.account_id = a.id
    join journal_entries je on je.id = ji.journal_entry_id
    where je.status = 'posted'
      and je.entry_date between p_from and p_to
      and a.account_type in ('revenue', 'cogs', 'expense')
    group by a.account_type, a.account_code, a.account_name
  ),
  agg as (
    select
      coalesce(sum(credit - debit) filter (where account_type = 'revenue'), 0) as revenue,
      coalesce(sum(debit - credit) filter (where account_type = 'cogs'), 0)    as cogs,
      coalesce(sum(debit - credit) filter (where account_type = 'expense'), 0) as expense
    from lines
  )
  select jsonb_build_object(
    'period_from', p_from, 'period_to', p_to,
    'revenue', agg.revenue, 'cogs', agg.cogs,
    'gross_profit', agg.revenue - agg.cogs,
    'expense', agg.expense,
    'net_income', agg.revenue - agg.cogs - agg.expense,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_type', account_type, 'account_code', account_code,
        'account_name', account_name,
        'amount', case when account_type = 'revenue' then credit - debit
                       else debit - credit end
      ) order by account_code) from lines), '[]'::jsonb)
  )
  from agg;
$$;

-- ---------------------------------------------------------------------
-- report_balance_sheet(as_of) -> jsonb
-- Assets = Liabilities + Equity + current-period earnings. Because every
-- journal is balanced, this identity always holds (balanced = true).
-- ---------------------------------------------------------------------
create or replace function report_balance_sheet(p_as_of date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bal as (
    select a.account_type, a.account_code, a.account_name,
           coalesce(sum(ji.base_debit), 0) - coalesce(sum(ji.base_credit), 0) as debit_balance
    from accounts a
    left join journal_items ji on ji.account_id = a.id
    left join journal_entries je on je.id = ji.journal_entry_id
         and je.status = 'posted' and je.entry_date <= p_as_of
    group by a.account_type, a.account_code, a.account_name
  ),
  sect as (
    select
      coalesce(sum(debit_balance) filter (where account_type = 'asset'), 0)      as total_assets,
      coalesce(sum(-debit_balance) filter (where account_type = 'liability'), 0) as total_liabilities,
      coalesce(sum(-debit_balance) filter (where account_type = 'equity'), 0)    as total_equity,
      coalesce(sum(-debit_balance) filter (where account_type = 'revenue'), 0)
        - coalesce(sum(debit_balance) filter (where account_type in ('cogs','expense')), 0)
        as current_earnings
    from bal
  )
  select jsonb_build_object(
    'as_of', p_as_of,
    'assets', coalesce((select jsonb_agg(jsonb_build_object(
        'account_code', account_code, 'account_name', account_name, 'amount', debit_balance
      ) order by account_code) from bal where account_type = 'asset' and debit_balance <> 0), '[]'::jsonb),
    'liabilities', coalesce((select jsonb_agg(jsonb_build_object(
        'account_code', account_code, 'account_name', account_name, 'amount', -debit_balance
      ) order by account_code) from bal where account_type = 'liability' and debit_balance <> 0), '[]'::jsonb),
    'equity', coalesce((select jsonb_agg(jsonb_build_object(
        'account_code', account_code, 'account_name', account_name, 'amount', -debit_balance
      ) order by account_code) from bal where account_type = 'equity' and debit_balance <> 0), '[]'::jsonb),
    'total_assets', sect.total_assets,
    'total_liabilities', sect.total_liabilities,
    'total_equity', sect.total_equity,
    'current_earnings', sect.current_earnings,
    'total_liabilities_equity', sect.total_liabilities + sect.total_equity + sect.current_earnings,
    'balanced', sect.total_assets
      = (sect.total_liabilities + sect.total_equity + sect.current_earnings)
  )
  from sect;
$$;

commit;
