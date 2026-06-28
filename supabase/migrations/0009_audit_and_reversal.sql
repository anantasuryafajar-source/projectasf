-- =====================================================================
-- Migration : 0009_audit_and_reversal.sql
-- Reference : PRD §6.2 — immutable audit ledger (User ID, timestamp, IP,
--             old/new state), no hard-delete of posted entries, corrections
--             via void/reversal.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Immutable audit ledger. Actor/IP are read from session GUCs
-- (app.user_id / app.ip) which the backend sets per request when available.
-- ---------------------------------------------------------------------
create table audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  table_name  text        not null,
  record_id   uuid,
  action      text        not null,            -- INSERT | UPDATE | DELETE
  actor_id    uuid,
  ip_address  text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index idx_audit_table_record on audit_logs (table_name, record_id);
create index idx_audit_created_at on audit_logs (created_at);

alter table audit_logs enable row level security;
create policy audit_select_owner on audit_logs for select
  using (public.current_app_role() = 'owner');
grant select, insert on audit_logs to anon, authenticated, service_role;

-- Append-only: block any UPDATE/DELETE, including by service_role.
create or replace function block_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only (§6.2)';
end;
$$;
create trigger trg_audit_immutable
before update or delete on audit_logs
for each row execute function block_audit_mutation();

-- Generic row auditor.
create or replace function audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid;
  v_ip     text;
  v_record uuid;
begin
  begin
    v_actor := nullif(current_setting('app.user_id', true), '')::uuid;
  exception when others then
    v_actor := null;
  end;
  v_ip := nullif(current_setting('app.ip', true), '');

  if tg_op = 'DELETE' then
    v_record := (to_jsonb(old)->>'id')::uuid;
  else
    v_record := (to_jsonb(new)->>'id')::uuid;
  end if;

  insert into audit_logs (table_name, record_id, action, actor_id, ip_address, old_data, new_data)
  values (
    tg_table_name, v_record, tg_op, v_actor, v_ip,
    case when tg_op <> 'INSERT' then to_jsonb(old) else null end,
    case when tg_op <> 'DELETE' then to_jsonb(new) else null end
  );
  return null;
end;
$$;

-- Attach the auditor to the business-critical tables.
do $$
declare
  t text;
  tables text[] := array[
    'journal_entries','journal_items','sales_invoices','sales_invoice_items',
    'payments','payment_allocations','sales_returns','sales_return_items',
    'inventory_batches','accounts','products','customers','warehouses','nsfp_numbers'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on %1$I for each row execute function audit_row()',
      t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Prevent hard-delete of posted journal entries (§6.2).
-- ---------------------------------------------------------------------
create or replace function prevent_delete_posted_journal()
returns trigger language plpgsql as $$
begin
  if old.status = 'posted' then
    raise exception
      'Cannot hard-delete a posted journal entry (§6.2). Use void/reversal.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
create trigger trg_je_no_hard_delete
before delete on journal_entries
for each row execute function prevent_delete_posted_journal();

-- ---------------------------------------------------------------------
-- reverse_journal_entry(entry_id, void) -> journal_entries
-- Posts a mirrored contra entry (debit<->credit) linked via reversal_of.
-- When p_void = true, the original is also flagged 'voided'. (§6.2)
-- ---------------------------------------------------------------------
create or replace function reverse_journal_entry(
  p_entry_id uuid,
  p_void boolean default false
)
returns journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig  journal_entries;
  v_items jsonb;
  v_new   journal_entries;
begin
  select * into v_orig from journal_entries where id = p_entry_id;
  if not found then
    raise exception 'JOURNAL_NOT_FOUND: %', p_entry_id using errcode = 'no_data_found';
  end if;
  if v_orig.status = 'voided' then
    raise exception 'ALREADY_VOIDED: %', p_entry_id using errcode = 'check_violation';
  end if;

  select jsonb_agg(jsonb_build_object(
           'account_id', account_id, 'line_number', line_number,
           'debit', credit, 'credit', debit,
           'base_debit', base_credit, 'base_credit', base_debit,
           'memo', coalesce(memo, '')
         ) order by line_number)
    into v_items
    from journal_items where journal_entry_id = p_entry_id;

  v_new := post_journal_entry(jsonb_build_object(
    'journal_reference', 'JV/REV/' || v_orig.journal_reference,
    'entry_date', to_char(current_date, 'YYYY-MM-DD'),
    'description', 'Reversal of ' || v_orig.journal_reference,
    'source', v_orig.source::text,
    'currency', v_orig.currency,
    'exchange_rate', v_orig.exchange_rate,
    'items', v_items
  ));

  update journal_entries set reversal_of = p_entry_id where id = v_new.id;
  if p_void then
    update journal_entries set status = 'voided' where id = p_entry_id;
  end if;

  -- Re-read so the returned row reflects reversal_of (post_journal_entry
  -- returned the row before the link was set).
  select * into v_new from journal_entries where id = v_new.id;
  return v_new;
end;
$$;

commit;
