-- =====================================================================
-- Migration : 0010_seed_coa.sql
-- Reference : PRD FR-1.1 (PSAK-compliant multi-level Chart of Accounts).
-- Seeds a baseline hierarchical CoA, including every posting account the
-- automation engine references (1000/1100/1300/2100/4100/5000). Idempotent
-- via ON CONFLICT (account_code) DO NOTHING — safe to re-run and will not
-- overwrite accounts already present.
-- =====================================================================

begin;

-- Header (parent) accounts — one per PSAK class.
insert into accounts (account_code, account_name, account_type, normal_balance) values
  ('1', 'ASET',                     'asset',     'debit'),
  ('2', 'LIABILITAS',              'liability', 'credit'),
  ('3', 'EKUITAS',                 'equity',    'credit'),
  ('4', 'PENDAPATAN',             'revenue',   'credit'),
  ('5', 'BEBAN POKOK PENJUALAN',  'cogs',      'debit'),
  ('6', 'BEBAN OPERASIONAL',      'expense',   'debit')
on conflict (account_code) do nothing;

-- Sub-header: current assets / liabilities.
insert into accounts (account_code, account_name, account_type, normal_balance, parent_account_id)
select v.code, v.name, v.atype::account_type, v.nb::normal_balance, p.id
from (values
  ('11', 'Aset Lancar',              'asset',     'debit',  '1'),
  ('15', 'Aset Tetap',              'asset',     'debit',  '1'),
  ('21', 'Liabilitas Jangka Pendek','liability', 'credit', '2')
) as v(code, name, atype, nb, parent)
left join accounts p on p.account_code = v.parent
on conflict (account_code) do nothing;

-- Postable detail accounts (parents referenced by code).
insert into accounts (account_code, account_name, account_type, normal_balance, parent_account_id)
select v.code, v.name, v.atype::account_type, v.nb::normal_balance, p.id
from (values
  -- Assets
  ('1000', 'Kas & Bank',                 'asset',     'debit',  '11'),
  ('1100', 'Piutang Usaha',             'asset',     'debit',  '11'),
  ('1200', 'PPN Masukan',               'asset',     'debit',  '11'),
  ('1300', 'Persediaan Barang Dagang',  'asset',     'debit',  '11'),
  ('1500', 'Peralatan',                 'asset',     'debit',  '15'),
  -- Liabilities
  ('2000', 'Utang Usaha',               'liability', 'credit', '21'),
  ('2100', 'PPN Keluaran',              'liability', 'credit', '21'),
  -- Equity
  ('3000', 'Modal Disetor',             'equity',    'credit', '3'),
  ('3900', 'Laba Ditahan',              'equity',    'credit', '3'),
  -- Revenue
  ('4100', 'Pendapatan Penjualan',     'revenue',   'credit', '4'),
  ('4900', 'Retur & Diskon Penjualan', 'revenue',   'debit',  '4'),
  -- COGS
  ('5000', 'Harga Pokok Penjualan',    'cogs',      'debit',  '5'),
  -- Operating expenses
  ('6100', 'Beban Gaji',                'expense',   'debit',  '6'),
  ('6200', 'Beban Sewa',                'expense',   'debit',  '6'),
  ('6300', 'Beban Transport & Distribusi', 'expense', 'debit', '6'),
  ('6900', 'Beban Lain-lain',           'expense',   'debit',  '6')
) as v(code, name, atype, nb, parent)
left join accounts p on p.account_code = v.parent
on conflict (account_code) do nothing;

commit;
