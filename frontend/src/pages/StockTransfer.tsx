import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { todayISO } from '../lib/format';
import type { Product, Warehouse } from '../lib/types';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelCls = 'mb-1 block text-xs font-medium text-slate-500';

interface Line {
  sku: string;
  uom: string;
  conversion_to_base: number;
  quantity: string;
  batch_number: string;
  expiry_date: string;
}
const emptyLine = (): Line => ({
  sku: '',
  uom: '',
  conversion_to_base: 1,
  quantity: '',
  batch_number: '',
  expiry_date: '',
});

export function StockTransfer() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fromWh, setFromWh] = useState('');
  const [toWh, setToWh] = useState('');
  const [num, setNum] = useState('');
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setProducts(await apiGet<Product[]>('/inventory/products'));
        setWarehouses(await apiGet<Warehouse[]>('/inventory/warehouses'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat');
      }
    })();
  }, []);

  const uomOptions = (sku: string) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return [];
    return [
      { uom_name: p.base_uom, quantity_in_base: 1 },
      ...p.product_uom_conversions,
    ];
  };
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const onProduct = (i: number, sku: string) => {
    const p = products.find((x) => x.sku === sku);
    const c = p?.product_uom_conversions[0];
    setLine(i, {
      sku,
      uom: c ? c.uom_name : (p?.base_uom ?? ''),
      conversion_to_base: c ? c.quantity_in_base : 1,
    });
  };
  const onUom = (i: number, uom: string) => {
    const opt = uomOptions(lines[i].sku).find((o) => o.uom_name === uom);
    setLine(i, { uom, conversion_to_base: opt?.quantity_in_base ?? 1 });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setOk(null);
    setError(null);
    if (!num || !fromWh || !toWh || fromWh === toWh) {
      setError('Lengkapi nomor, gudang asal & tujuan (harus berbeda).');
      return;
    }
    setBusy(true);
    try {
      const res = await apiPost<{ items_moved: number }>('/inventory/transfers', {
        transfer_number: num,
        transfer_date: date,
        from_warehouse_code: fromWh,
        to_warehouse_code: toWh,
        items: lines.map((l) => ({
          sku: l.sku,
          quantity: Number(l.quantity) || 0,
          uom: l.uom,
          conversion_to_base: l.conversion_to_base,
          batch_number: l.batch_number,
          expiry_date: l.expiry_date,
        })),
      });
      setOk(`Transfer tersimpan. ${res.items_moved} item dipindahkan.`);
      setNum('');
      setLines([emptyLine()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal transfer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Transfer Stok Antar-Gudang
      </h1>
      <p className="mb-6 text-slate-500">
        Pemindahan stok per batch tanpa efek laba/rugi (FR-3.3).
      </p>

      <form onSubmit={(e) => void submit(e)}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Nomor Transfer</label>
            <input className={inputCls} value={num} onChange={(e) => setNum(e.target.value)} placeholder="TRF/..." />
          </div>
          <div>
            <label className={labelCls}>Tanggal</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Dari Gudang</label>
            <select className={inputCls} value={fromWh} onChange={(e) => setFromWh(e.target.value)}>
              <option value="">— pilih —</option>
              {warehouses.map((w) => <option key={w.id} value={w.code}>{w.code}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Ke Gudang</label>
            <select className={inputCls} value={toWh} onChange={(e) => setToWh(e.target.value)}>
              <option value="">— pilih —</option>
              {warehouses.map((w) => <option key={w.id} value={w.code}>{w.code}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Item</p>
            <button type="button" onClick={() => setLines((p) => [...p, emptyLine()])}
              className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50">+ Tambah</button>
          </div>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-6">
              <div className="col-span-2">
                <label className={labelCls}>Produk</label>
                <select className={inputCls} value={line.sku} onChange={(e) => onProduct(i, e.target.value)}>
                  <option value="">— pilih —</option>
                  {products.map((p) => <option key={p.id} value={p.sku}>{p.sku}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>UOM</label>
                <select className={inputCls} value={line.uom} disabled={!line.sku} onChange={(e) => onUom(i, e.target.value)}>
                  {uomOptions(line.sku).map((o) => <option key={o.uom_name} value={o.uom_name}>{o.uom_name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Qty</label>
                <input type="number" min="0" step="any" className={inputCls} value={line.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Batch</label>
                <input className={inputCls} value={line.batch_number}
                  onChange={(e) => setLine(i, { batch_number: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Kedaluwarsa</label>
                <input type="date" className={inputCls} value={line.expiry_date}
                  onChange={(e) => setLine(i, { expiry_date: e.target.value })} />
              </div>
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                  className="col-span-2 rounded-lg border border-rose-200 px-3 py-1 text-sm text-rose-600 hover:bg-rose-50">Hapus item</button>
              )}
            </div>
          ))}
        </div>

        {ok && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <button type="submit" disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy ? 'Memproses...' : 'Transfer Stok'}
        </button>
      </form>
    </div>
  );
}
