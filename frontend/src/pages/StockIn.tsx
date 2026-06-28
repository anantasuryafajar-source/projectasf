import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import type { Product, UomConversion, Warehouse } from '../lib/types';

const numberFmt = new Intl.NumberFormat('id-ID');

interface ReceiptResult {
  id: string;
  batch_number: string;
  quantity_on_hand: number;
}

export function StockIn() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [uom, setUom] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [p, w] = await Promise.all([
          apiGet<Product[]>('/inventory/products'),
          apiGet<Warehouse[]>('/inventory/warehouses'),
        ]);
        if (!active) return;
        setProducts(p);
        setWarehouses(w);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : 'Gagal memuat master data',
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  // UOM options = base unit (factor 1) + the product's nested conversions (FR-3.4).
  const uomOptions: UomConversion[] = useMemo(() => {
    if (!selectedProduct) return [];
    return [
      {
        id: 'base',
        uom_name: selectedProduct.base_uom,
        quantity_in_base: 1,
      },
      ...selectedProduct.product_uom_conversions,
    ];
  }, [selectedProduct]);

  // When the product changes, prefer a larger pack unit (e.g. carton/dus) to
  // showcase the conversion, otherwise fall back to the base unit.
  useEffect(() => {
    if (!selectedProduct) {
      setUom('');
      return;
    }
    const pack = selectedProduct.product_uom_conversions[0];
    setUom(pack ? pack.uom_name : selectedProduct.base_uom);
  }, [selectedProduct]);

  const factor =
    uomOptions.find((o) => o.uom_name === uom)?.quantity_in_base ?? 1;
  const qtyNum = Number(quantity) || 0;
  const baseQty = qtyNum * factor;
  const baseUom = selectedProduct?.base_uom ?? 'unit';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!productId || !warehouseId || qtyNum <= 0 || !batchNumber || !expiryDate) {
      setError('Lengkapi semua field wajib (produk, gudang, jumlah, batch, kedaluwarsa).');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiPost<ReceiptResult>('/inventory/receipts', {
        product_id: productId,
        warehouse_id: warehouseId,
        uom,
        quantity: qtyNum,
        unit_cost: Number(unitCost) || 0,
        batch_number: batchNumber,
        expiry_date: expiryDate,
      });
      setSuccess(
        `Stok masuk tercatat. Batch ${result.batch_number} kini ${numberFmt.format(
          Number(result.quantity_on_hand),
        )} ${baseUom}.`,
      );
      setQuantity('');
      setBatchNumber('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan stok masuk');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Input Barang Masuk
        </h1>
        <p className="mt-1 text-slate-500">
          Catat penerimaan stok per batch dengan konversi satuan otomatis.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}. Pastikan backend API berjalan & master data tersedia.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Produk <span className="text-rose-500">*</span>
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">— Pilih produk —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Gudang <span className="text-rose-500">*</span>
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">— Pilih gudang —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Jumlah <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Satuan (UOM)
              </label>
              <select
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                disabled={!selectedProduct}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
              >
                {uomOptions.map((o) => (
                  <option key={o.id} value={o.uom_name}>
                    {o.uom_name}
                    {o.quantity_in_base !== 1
                      ? ` (1 = ${numberFmt.format(o.quantity_in_base)} ${baseUom})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Harga Pokok / {baseUom} (IDR)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Nomor Batch <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="BATCH-2026-A2"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Tanggal Kedaluwarsa <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Menyimpan...' : 'Simpan Barang Masuk'}
          </button>
        </form>

        {/* Real-time UOM conversion calculator */}
        <div className="h-fit rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-7 shadow-sm">
          <p className="text-sm font-medium text-indigo-700">
            Konversi Satuan Otomatis
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Setara dalam satuan dasar (real-time)
          </p>

          <div className="mt-6 text-center">
            <p className="text-4xl font-bold tracking-tight text-slate-900">
              {numberFmt.format(baseQty)}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-500">{baseUom}</p>
          </div>

          <div className="mt-6 rounded-xl bg-white/70 p-4 text-center text-sm text-slate-600">
            {selectedProduct ? (
              <>
                <span className="font-semibold text-slate-900">
                  {numberFmt.format(qtyNum)}
                </span>{' '}
                {uom} &times;{' '}
                <span className="font-semibold text-slate-900">
                  {numberFmt.format(factor)}
                </span>{' '}
                ={' '}
                <span className="font-semibold text-indigo-700">
                  {numberFmt.format(baseQty)} {baseUom}
                </span>
              </>
            ) : (
              <span className="text-slate-400">
                Pilih produk untuk melihat konversi.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
