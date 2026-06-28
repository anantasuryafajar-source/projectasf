-- =====================================================================
-- Migration : 0012_audit_actor.sql
-- Reference : PRD §6.2 — audit ledger must log User ID + IP.
-- Approach  : thin `audited_*` wrappers set transaction-local GUCs
--             (app.user_id / app.ip) then delegate to the existing RPC.
--             Because set_config(..., is_local=true) is transaction-scoped,
--             every audit row written inside that RPC (and any nested calls)
--             picks up the actor — without rewriting the large functions.
--             The NestJS layer passes the JWT user id + client IP.
-- =====================================================================

begin;

create or replace function _set_audit_ctx(_actor text, _ip text)
returns void
language plpgsql
as $$
begin
  perform set_config('app.user_id', coalesce(_actor, ''), true);
  perform set_config('app.ip', coalesce(_ip, ''), true);
end;
$$;

create or replace function audited_post_journal_entry(
  p jsonb, _actor text default null, _ip text default null
) returns journal_entries
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return post_journal_entry(p);
end;
$$;

create or replace function audited_create_sales_invoice(
  p jsonb, _actor text default null, _ip text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return create_sales_invoice(p);
end;
$$;

create or replace function audited_record_payment(
  p jsonb, _actor text default null, _ip text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return record_payment(p);
end;
$$;

create or replace function audited_create_sales_return(
  p jsonb, _actor text default null, _ip text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return create_sales_return(p);
end;
$$;

create or replace function audited_reverse_journal_entry(
  p_entry_id uuid, p_void boolean default false,
  _actor text default null, _ip text default null
) returns journal_entries
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return reverse_journal_entry(p_entry_id, p_void);
end;
$$;

create or replace function audited_fulfill_inventory_fifo(
  p_product_id uuid, p_warehouse_id uuid, p_qty_base numeric,
  _actor text default null, _ip text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _set_audit_ctx(_actor, _ip);
  return fulfill_inventory_fifo(p_product_id, p_warehouse_id, p_qty_base);
end;
$$;

grant execute on function
  audited_post_journal_entry(jsonb, text, text),
  audited_create_sales_invoice(jsonb, text, text),
  audited_record_payment(jsonb, text, text),
  audited_create_sales_return(jsonb, text, text),
  audited_reverse_journal_entry(uuid, boolean, text, text),
  audited_fulfill_inventory_fifo(uuid, uuid, numeric, text, text)
  to anon, authenticated, service_role;

commit;
