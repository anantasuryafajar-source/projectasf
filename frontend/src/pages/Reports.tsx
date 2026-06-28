import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { formatIDR, todayISO } from '../lib/format';

interface BSLine {
  account_code: string;
  account_name: string;
  amount: number;
}
interface BalanceSheet {
  as_of: string;
  assets: BSLine[];
  liabilities: BSLine[];
  equity: BSLine[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  current_earnings: number;
  total_liabilities_equity: number;
  balanced: boolean;
}
interface ProfitLoss {
  period_from: string;
  period_to: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  expense: number;
  net_income: number;
}

function Section({ title, lines }: { title: string; lines: BSLine[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        lines.map((l) => (
          <div key={l.account_code} className="flex justify-between py-1 text-sm">
            <span className="text-slate-600">
              {l.account_code} · {l.account_name}
            </span>
            <span className="font-medium text-slate-900">
              {formatIDR(l.amount)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export function Reports() {
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [balanceSheet, profitLoss] = await Promise.all([
          apiGet<BalanceSheet>(`/reports/balance-sheet?as_of=${todayISO()}`),
          apiGet<ProfitLoss>(`/reports/profit-loss?to=${todayISO()}`),
        ]);
        if (!active) return;
        setBs(balanceSheet);
        setPl(profitLoss);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Laporan Keuangan
        </h1>
        <p className="mt-1 text-slate-500">
          Neraca &amp; Laba Rugi langsung dari General Ledger.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}. Pastikan backend API berjalan.
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Memuat...</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Balance Sheet */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Neraca</h2>
              <span className="text-xs text-slate-400">per {bs?.as_of}</span>
            </div>
            <Section title="Aset" lines={bs?.assets ?? []} />
            <div className="flex justify-between border-t border-slate-100 py-1 text-sm font-semibold">
              <span>Total Aset</span>
              <span>{formatIDR(bs?.total_assets)}</span>
            </div>

            <div className="mt-4">
              <Section title="Liabilitas" lines={bs?.liabilities ?? []} />
              <Section title="Ekuitas" lines={bs?.equity ?? []} />
              <div className="flex justify-between py-1 text-sm">
                <span className="text-slate-600">Laba Berjalan</span>
                <span className="font-medium text-slate-900">
                  {formatIDR(bs?.current_earnings)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 py-1 text-sm font-semibold">
                <span>Total Liabilitas + Ekuitas</span>
                <span>{formatIDR(bs?.total_liabilities_equity)}</span>
              </div>
            </div>

            <div
              className={`mt-4 rounded-lg px-3 py-2 text-center text-sm font-medium ${
                bs?.balanced
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {bs?.balanced ? 'Seimbang (Aset = Liabilitas + Ekuitas)' : 'TIDAK seimbang'}
            </div>
          </div>

          {/* Profit & Loss */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Laba Rugi</h2>
              <span className="text-xs text-slate-400">
                {pl?.period_from} → {pl?.period_to}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Pendapatan" value={pl?.revenue} />
              <Row label="HPP (COGS)" value={pl?.cogs} negative />
              <div className="flex justify-between border-t border-slate-100 py-1 font-semibold">
                <span>Laba Kotor</span>
                <span>{formatIDR(pl?.gross_profit)}</span>
              </div>
              <Row label="Beban" value={pl?.expense} negative />
              <div className="flex justify-between border-t border-slate-200 py-2 text-base font-bold">
                <span>Laba Bersih</span>
                <span
                  className={
                    (pl?.net_income ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }
                >
                  {formatIDR(pl?.net_income)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  negative,
}: {
  label: string;
  value: number | undefined;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">
        {negative ? '(' : ''}
        {formatIDR(value)}
        {negative ? ')' : ''}
      </span>
    </div>
  );
}
