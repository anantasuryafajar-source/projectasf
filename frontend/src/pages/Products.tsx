import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import type { Product } from '../lib/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

interface ConvRow {
  uom_name: string;
  quantity_in_base: string;
}

export function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [baseUom, setBaseUom] = useState('bottle');
  const [valuation, setValuation] = useState('fifo');
  const [taxable, setTaxable] = useState(true);
  const [convs, setConvs] = useState<ConvRow[]>([{ uom_name: 'carton', quantity_in_base: '24' }]);

  const load = async () => {
    try {
      setItems(await apiGet<Product[]>('/inventory/products'));
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
      await apiPost('/inventory/products', {
        sku,
        name,
        category: category || undefined,
        base_uom: baseUom,
        valuation_method: valuation,
        taxable,
        uom_conversions: convs
          .filter((c) => c.uom_name && Number(c.quantity_in_base) > 0)
          .map((c) => ({ uom_name: c.uom_name, quantity_in_base: Number(c.quantity_in_base) })),
      });
      setOk(`Produk ${sku} tersimpan.`);
      setSku('');
      setName('');
      setCategory('');
      setConvs([{ uom_name: 'carton', quantity_in_base: '24' }]);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Master Produk
      </h1>
      <p className="mb-6 text-slate-500">Kelola produk, metode valuasi, dan konversi satuan (UOM).</p>

      <form onSubmit={(e) => void submit(e)}
        className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <input className={inputCls} placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
          <input className={inputCls} placeholder="Nama produk" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} placeholder="Kategori" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input className={inputCls} placeholder="Satuan dasar (mis. bottle)" value={baseUom} onChange={(e) => setBaseUom(e.target.value)} />
          <select className={inputCls} value={valuation} onChange={(e) => setValuation(e.target.value)}>
            <option value="fifo">FIFO</option>
            <option value="moving_average">Moving Average</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
            Kena PPN
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Konversi UOM (ke satuan dasar)</p>
            <button type="button"
              onClick={() => setConvs((p) => [...p, { uom_name: '', quantity_in_base: '' }])}
              className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50">
              + Tambah
            </button>
          </div>
          {convs.map((c, i) => (
            <div key={i} className="mb-2 flex gap-3">
              <input className={inputCls} placeholder="Nama UOM (mis. carton)"
                value={c.uom_name}
                onChange={(e) => setConvs((p) => p.map((x, j) => (j === i ? { ...x, uom_name: e.target.value } : x)))} />
              <input className={inputCls} type="number" placeholder="Jumlah dalam satuan dasar (mis. 24)"
                value={c.quantity_in_base}
                onChange={(e) => setConvs((p) => p.map((x, j) => (j === i ? { ...x, quantity_in_base: e.target.value } : x)))} />
              {convs.length > 1 && (
                <button type="button"
                  onClick={() => setConvs((p) => p.filter((_, j) => j !== i))}
                  className="rounded-lg border border-rose-200 px-3 text-sm text-rose-600 hover:bg-rose-50">×</button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Simpan Produk
          </button>
          {ok && <span className="text-sm text-emerald-700">{ok}</span>}
          {error && <span className="text-sm text-rose-700">{error}</span>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">SKU</th><th className="px-5 py-3">Nama</th>
              <th className="px-5 py-3">Satuan</th><th className="px-5 py-3">Valuasi</th>
              <th className="px-5 py-3">Konversi</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Belum ada produk.</td></tr>
            ) : items.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-slate-900">{p.sku}</td>
                <td className="px-5 py-3">{p.name}</td>
                <td className="px-5 py-3">{p.base_uom}</td>
                <td className="px-5 py-3 uppercase text-slate-500">{p.valuation_method}</td>
                <td className="px-5 py-3 text-slate-500">
                  {p.product_uom_conversions.map((c) => `${c.uom_name}×${c.quantity_in_base}`).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
