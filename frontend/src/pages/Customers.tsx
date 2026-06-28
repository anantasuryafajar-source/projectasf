import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { formatIDR } from '../lib/format';
import type { Customer } from '../lib/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export function Customers() {
  const [items, setItems] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    npwp: '',
    address: '',
    credit_limit: '',
    term_of_payment_days: '',
  });

  const load = async () => {
    try {
      setItems(await apiGet<Customer[]>('/customers'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    try {
      await apiPost('/customers', {
        code: form.code,
        name: form.name,
        npwp: form.npwp || undefined,
        address: form.address || undefined,
        credit_limit: Number(form.credit_limit) || 0,
        term_of_payment_days: Number(form.term_of_payment_days) || 0,
      });
      setOk(`Customer ${form.code} tersimpan.`);
      setForm({ code: '', name: '', npwp: '', address: '', credit_limit: '', term_of_payment_days: '' });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Master Customer
      </h1>
      <p className="mb-6 text-slate-500">Kelola pelanggan, limit kredit, dan NPWP (e-Faktur).</p>

      <form onSubmit={(e) => void submit(e)}
        className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <input className={inputCls} placeholder="Kode (CUST-...)" value={form.code} onChange={set('code')} />
        <input className={inputCls} placeholder="Nama" value={form.name} onChange={set('name')} />
        <input className={inputCls} placeholder="NPWP" value={form.npwp} onChange={set('npwp')} />
        <input className={inputCls} placeholder="Alamat" value={form.address} onChange={set('address')} />
        <input className={inputCls} type="number" placeholder="Limit Kredit (IDR)" value={form.credit_limit} onChange={set('credit_limit')} />
        <input className={inputCls} type="number" placeholder="TOP (hari)" value={form.term_of_payment_days} onChange={set('term_of_payment_days')} />
        <div className="sm:col-span-3 flex items-center gap-3">
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Simpan Customer
          </button>
          {ok && <span className="text-sm text-emerald-700">{ok}</span>}
          {error && <span className="text-sm text-rose-700">{error}</span>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Kode</th><th className="px-5 py-3">Nama</th>
              <th className="px-5 py-3">NPWP</th><th className="px-5 py-3">Limit</th>
              <th className="px-5 py-3">TOP</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Belum ada customer.</td></tr>
            ) : items.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-slate-900">{c.code}</td>
                <td className="px-5 py-3">{c.name}</td>
                <td className="px-5 py-3 text-slate-500">{c.npwp ?? '—'}</td>
                <td className="px-5 py-3">{formatIDR(c.credit_limit)}</td>
                <td className="px-5 py-3">{c.term_of_payment_days} hari</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
