import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { formatIDR, todayISO } from '../lib/format';
import type { Product, Warehouse } from '../lib/types';

const VAT_RATE = 0.11;

interface Line {
  sku: string;
  uom: string;
  conversion_to_base: number;
  quantity: string;
  unit_price: string;
  taxable: boolean;
  batch_number: string;
  expiry_date: string;
}

interface InvoiceResponse {
  status: string;
  invoice_id: string;
  journal_reference: string;
  total_amount: number;
  vat_amount: number;
  posted_at: string;
}

function emptyLine(): Line {
  return {
    sku: '',
    uom: '',
    conversion_to_base: 1,
    quantity: '',
    unit_price: '',
    taxable: true,
    batch_number: '',
    expiry_date: '',
  };
}

export function SalesInvoice() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState('');
  const [warehouseCode, setWarehouseCode] = useState('');
  const [topDays, setTopDays] = useState('14');
  const [discountTotal, setDiscountTotal] = useState('0');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InvoiceResponse | null>(null);
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
          setLoadError(err instanceof Error ? err.message : 'Gagal memuat data');
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  };

  const onProductChange = (idx: number, sku: string) => {
    const product = products.find((p) => p.sku === sku);
    const firstConv = product?.product_uom_conversions[0];
    updateLine(idx, {
      sku,
      uom: firstConv ? firstConv.uom_name : (product?.base_uom ?? ''),
      conversion_to_base: firstConv ? firstConv.quantity_in_base : 1,
    });
  };

  const onUomChange = (idx: number, uom: string) => {
    const product = products.find((p) => p.sku === lines[idx].sku);
    const factor =
      product?.base_uom === uom
        ? 1
        : (product?.product_uom_conversions.find((c) => c.uom_name === uom)
            ?.quantity_in_base ?? 1);
    updateLine(idx, { uom, conversion_to_base: factor });
  };

  const uomOptionsFor = (sku: string) => {
    const product = products.find((p) => p.sku === sku);
    if (!product) return [];
    return [
      { uom_name: product.base_uom, quantity_in_base: 1 },
      ...product.product_uom_conversions,
    ];
  };

  // Client-side preview mirroring the backend calculator.
  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
      0,
    );
    const discount = Number(discountTotal) || 0;
    const vat = lines.reduce((s, l) => {
      if (!l.taxable) return s;
      const gross = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
      const net = subtotal > 0 ? gross - discount * (gross / subtotal) : 0;
      return s + net * VAT_RATE;
    }, 0);
    return {
      subtotal,
      vat: Math.round(vat),
      total: Math.round(subtotal - discount + vat),
    };
  }, [lines, discountTotal]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!invoiceNumber || !customerId || !warehouseCode) {
      setError('Lengkapi nomor invoice, customer, dan gudang.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<InvoiceResponse>('/sales-invoice', {
        invoice_number: invoiceNumber,
        transaction_date: transactionDate,
        customer_id: customerId,
        warehouse_id: warehouseCode,
        term_of_payment_days: Number(topDays) || 0,
        currency: 'IDR',
        exchange_rate: 1,
        discount_total: Number(discountTotal) || 0,
        items: lines.map((l) => ({
          sku: l.sku,
          quantity: Number(l.quantity) || 0,
          uom: l.uom,
          conversion_to_base: l.conversion_to_base,
          unit_price: Number(l.unit_price) || 0,
          taxable: l.taxable,
          batch_number: l.batch_number || undefined,
          expiry_date: l.expiry_date || undefined,
        })),
      });
      setResult(res);
      setLines([emptyLine()]);
      setInvoiceNumber('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Buat Invoice Penjualan
        </h1>
        <p className="mt-1 text-slate-500">
          Pengiriman barang &rarr; jurnal AR/Revenue/VAT, FIFO &amp; COGS otomatis.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nomor Invoice">
            <input className={inputCls} value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV/20260628/0001" />
          </Field>
          <Field label="Tanggal">
            <input type="date" className={inputCls} value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)} />
          </Field>
          <Field label="Customer (kode)">
            <input className={inputCls} value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="CUST-BRW-099" />
          </Field>
          <Field label="Gudang">
            <select className={inputCls} value={warehouseCode}
              onChange={(e) => setWarehouseCode(e.target.value)}>
              <option value="">— pilih —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.code}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Line items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Item</p>
            <button type="button"
              onClick={() => setLines((p) => [...p, emptyLine()])}
              className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50">
              + Tambah item
            </button>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 p-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <div className="col-span-2">
                  <label className={labelCls}>Produk</label>
                  <select className={inputCls} value={line.sku}
                    onChange={(e) => onProductChange(idx, e.target.value)}>
                    <option value="">— pilih —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.sku}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>UOM</label>
                  <select className={inputCls} value={line.uom}
                    disabled={!line.sku}
                    onChange={(e) => onUomChange(idx, e.target.value)}>
                    {uomOptionsFor(line.sku).map((o) => (
                      <option key={o.uom_name} value={o.uom_name}>
                        {o.uom_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Qty</label>
                  <input type="number" min="0" step="any" className={inputCls}
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Harga/UOM</label>
                  <input type="number" min="0" step="any" className={inputCls}
                    value={line.unit_price}
                    onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
                </div>
                <div className="flex items-end">
                  {lines.length > 1 && (
                    <button type="button"
                      onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                      className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                      Hapus
                    </button>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Batch</label>
                  <input className={inputCls} value={line.batch_number}
                    onChange={(e) => updateLine(idx, { batch_number: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Kedaluwarsa</label>
                  <input type="date" className={inputCls} value={line.expiry_date}
                    onChange={(e) => updateLine(idx, { expiry_date: e.target.value })} />
                </div>
                <label className="col-span-2 flex items-center gap-2 self-end text-sm text-slate-600">
                  <input type="checkbox" checked={line.taxable}
                    onChange={(e) => updateLine(idx, { taxable: e.target.checked })} />
                  Kena PPN
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="TOP (hari)">
            <input type="number" min="0" className={inputCls} value={topDays}
              onChange={(e) => setTopDays(e.target.value)} />
          </Field>
          <Field label="Diskon Total">
            <input type="number" min="0" step="any" className={inputCls}
              value={discountTotal}
              onChange={(e) => setDiscountTotal(e.target.value)} />
          </Field>
        </div>

        {/* Totals preview */}
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">Subtotal</span>
            <span>{formatIDR(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">PPN (11%)</span>
            <span>{formatIDR(totals.vat)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 py-1 font-bold text-slate-900">
            <span>Total</span>
            <span>{formatIDR(totals.total)}</span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        {result && (
          <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            Invoice dibuat. Jurnal <strong>{result.journal_reference}</strong> · Total{' '}
            <strong>{formatIDR(result.total_amount)}</strong> (PPN {formatIDR(result.vat_amount)}).
          </div>
        )}

        <button type="submit" disabled={submitting}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {submitting ? 'Memproses...' : 'Buat Invoice'}
        </button>
      </form>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50';
const labelCls = 'mb-1 block text-xs font-medium text-slate-500';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}
