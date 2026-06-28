-- =====================================================================
-- Migration : 0016_forex.sql
-- Reference : PRD FR-1.3 — adjustable daily exchange rates + automatic
--             month-end foreign-exchange gain/loss (unrealized revaluation
--             of open foreign-currency AR).
-- Note      : realized FX gain/loss on foreign-currency settlement is a
--             follow-up (the payment flow is currently IDR-centric).
-- =====================================================================

begin;

-- Adjustable daily rates: IDR per 1 unit of `currency`.
create table exchange_rates (
  id         uuid        primary key default gen_random_uuid(),
  currency   char(3)     not null,
  rate_date  date        not null,
  rate       numeric(18,6) not null,
  created_at timestamptz not null default now(),
  constraint uq_rate_currency_date unique (currency, rate_date),
  constraint chk_rate_pos check (rate > 0)
);

create index idx_rates_lookup on exchange_rates (currency, rate_date desc);

alter table exchange_rates enable row level security;
create policy rates_select on exchange_rates for select
  using (public.current_app_role() in ('owner', 'admin_gudang', 'sales_kasir'));
create policy rates_write on exchange_rates for all
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
grant all privileges on exchange_rates to anon, authenticated, service_role;

-- Forex gain/loss accounts (idempotent; parents from migration 0010).
insert into accounts (account_code, account_name, account_type, normal_balance, parent_account_id)
select v.code, v.name, v.atype::account_type, v.nb::normal_balance, pa.id
from (values
  ('4800', 'Laba Selisih Kurs', 'revenue', 'credit', '4'),
  ('6800', 'Rugi Selisih Kurs', 'expense', 'debit',  '6')
) as v(code, name, atype, nb, parent)
left join accounts pa on pa.account_code = v.parent
on conflict (account_code) do nothing;

-- ---------------------------------------------------------------------
-- revalue_open_ar(payload) -> jsonb  (FR-1.3 month-end unrealized FX)
-- Revalues every open foreign-currency invoice at the as_of rate vs its
-- booked rate, posting one net adjustment journal (AR vs FX gain/loss).
-- ---------------------------------------------------------------------
create or replace function revalue_open_ar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as_of      date := (p->>'as_of')::date;
  v_acc_ar     uuid;
  v_acc_gain   uuid;
  v_acc_loss   uuid;
  v_inv        record;
  v_rate       numeric;
  v_out_fx     numeric;
  v_diff       numeric;
  v_net        numeric := 0;
  v_count      int := 0;
  v_items      jsonb;
  v_entry      journal_entries;
begin
  select id into v_acc_ar   from accounts where account_code = p->>'ar_account_code';
  select id into v_acc_gain from accounts where account_code = p->>'gain_account_code';
  select id into v_acc_loss from accounts where account_code = p->>'loss_account_code';
  if v_acc_ar is null or v_acc_gain is null or v_acc_loss is null then
    raise exception 'ACCOUNT_MAPPING_MISSING: AR/gain/loss account not found'
      using errcode = 'check_violation';
  end if;

  for v_inv in
    select * from sales_invoices
     where status <> 'void' and currency <> 'IDR'
       and (total_amount - amount_paid - returned_amount) > 0
  loop
    select rate into v_rate from exchange_rates
      where currency = v_inv.currency and rate_date <= v_as_of
      order by rate_date desc limit 1;
    if v_rate is null then
      continue; -- no rate available; skip this currency
    end if;
    v_out_fx := v_inv.total_amount - v_inv.amount_paid - v_inv.returned_amount;
    v_diff := round(v_out_fx * (v_rate - v_inv.exchange_rate), 2);
    v_net := v_net + v_diff;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 or v_net = 0 then
    return jsonb_build_object('as_of', v_as_of, 'revalued_count', v_count,
      'net_adjustment', coalesce(v_net, 0), 'journal_reference', null);
  end if;

  if v_net > 0 then
    -- AR worth more in IDR -> unrealized gain.
    v_items := jsonb_build_array(
      jsonb_build_object('account_id', v_acc_ar, 'line_number', 1, 'debit', v_net, 'base_debit', v_net),
      jsonb_build_object('account_id', v_acc_gain, 'line_number', 2, 'credit', v_net, 'base_credit', v_net));
  else
    v_items := jsonb_build_array(
      jsonb_build_object('account_id', v_acc_loss, 'line_number', 1, 'debit', -v_net, 'base_debit', -v_net),
      jsonb_build_object('account_id', v_acc_ar, 'line_number', 2, 'credit', -v_net, 'base_credit', -v_net));
  end if;

  v_entry := post_journal_entry(jsonb_build_object(
    'journal_reference', 'JV/FXREVAL/' || to_char(v_as_of, 'YYYYMMDD'),
    'entry_date', to_char(v_as_of, 'YYYY-MM-DD'),
    'description', 'Unrealized FX revaluation ' || to_char(v_as_of, 'YYYY-MM-DD'),
    'source', 'manual',
    'items', v_items));

  return jsonb_build_object('as_of', v_as_of, 'revalued_count', v_count,
    'net_adjustment', v_net, 'journal_reference', v_entry.journal_reference);
end;
$$;

create or replace function audited_revalue_open_ar(
  p jsonb, _actor text default null, _ip text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return revalue_open_ar(p);
end;
$$;

grant execute on function
  revalue_open_ar(jsonb), audited_revalue_open_ar(jsonb, text, text)
  to anon, authenticated, service_role;

commit;
