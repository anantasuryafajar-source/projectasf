import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import type { Warehouse } from '../lib/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export function Warehouses() {
  const [items, setItems] = useState<Warehouse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const load = async () => {
    try {
      setItems(await apiGet<Warehouse[]>('/inventory/warehouses'));
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
      await apiPost('/inventory/warehouses', { code, name });
      setOk(`Gudang ${code} tersimpan.`);
      setCode('');
      setName('');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Master Gudang
      </h1>
      <p className="mb-6 text-slate-500">Kelola gudang fisik/virtual untuk pelacakan stok.</p>

      <form onSubmit={(e) => void submit(e)}
        className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <input className={inputCls} placeholder="Kode (WH-...)" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className={inputCls} placeholder="Nama gudang" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Simpan Gudang
        </button>
        <div className="sm:col-span-3">
          {ok && <span className="text-sm text-emerald-700">{ok}</span>}
          {error && <span className="text-sm text-rose-700">{error}</span>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Kode</th><th className="px-5 py-3">Nama</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={2} className="px-5 py-8 text-center text-slate-400">Belum ada gudang.</td></tr>
            ) : items.map((w) => (
              <tr key={w.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-slate-900">{w.code}</td>
                <td className="px-5 py-3">{w.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
