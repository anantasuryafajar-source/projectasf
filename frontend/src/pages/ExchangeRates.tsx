import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { todayISO } from '../lib/format';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

interface Rate {
  id: string;
  currency: string;
  rate_date: string;
  rate: number;
}
interface RevalueResult {
  as_of: string;
  revalued_count: number;
  net_adjustment: number;
  journal_reference: string | null;
}

export function ExchangeRates() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [rateDate, setRateDate] = useState(todayISO());
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState(todayISO());
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setRates(await apiGet<Rate[]>('/forex/rates'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const saveRate = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      await apiPost('/forex/rates', {
        currency,
        rate_date: rateDate,
        rate: Number(rate),
      });
      setMsg(`Kurs ${currency} @ ${rateDate} tersimpan.`);
      setRate('');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan kurs');
    }
  };

  const runRevalue = async () => {
    setMsg(null);
    setError(null);
    try {
      const r = await apiPost<RevalueResult>(`/forex/revalue?as_of=${asOf}`, {});
      setMsg(
        r.journal_reference
          ? `Revaluasi ${r.as_of}: ${r.revalued_count} invoice, net ${r.net_adjustment} → jurnal ${r.journal_reference}`
          : `Revaluasi ${r.as_of}: tidak ada penyesuaian (net 0 / tidak ada AR valas).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal revaluasi');
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Kurs &amp; Revaluasi Valas
      </h1>
      <p className="mb-6 text-slate-500">
        Kurs harian (IDR per 1 unit) &amp; revaluasi selisih kurs akhir bulan (FR-1.3).
      </p>

      {msg && <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
      {error && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={(e) => void saveRate(e)}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="font-semibold text-slate-900">Set Kurs Harian</p>
          <input className={inputCls} value={currency} maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
          <input type="date" className={inputCls} value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
          <input type="number" step="any" className={inputCls} value={rate}
            onChange={(e) => setRate(e.target.value)} placeholder="Kurs ke IDR (mis. 16250)" />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Simpan Kurs
          </button>
        </form>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="font-semibold text-slate-900">Revaluasi Akhir Bulan</p>
          <input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <button onClick={() => void runRevalue()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
            Jalankan Revaluasi
          </button>
          <p className="text-xs text-slate-400">
            Merevaluasi AR mata uang asing yang masih terbuka ke kurs as_of, posting jurnal selisih kurs.
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Mata Uang</th><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Kurs (IDR)</th>
            </tr>
          </thead>
          <tbody>
            {rates.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">Belum ada kurs.</td></tr>
            ) : rates.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-slate-900">{r.currency}</td>
                <td className="px-5 py-3">{r.rate_date}</td>
                <td className="px-5 py-3">{Number(r.rate).toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
