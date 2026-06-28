import { useState, type FormEvent } from 'react';
import { apiPost } from '../lib/api';
import { formatIDR, todayISO } from '../lib/format';

interface PaymentResponse {
  status: string;
  payment_id: string;
  journal_reference: string;
  amount: number;
  allocated: number;
  unapplied: number;
  invoices: Array<{ invoice_number: string; applied: number; status: string }>;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export function Payments() {
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PaymentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!paymentNumber || !customerId || !(Number(amount) > 0)) {
      setError('Lengkapi nomor, customer, dan nominal pembayaran.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<PaymentResponse>('/payments', {
        payment_number: paymentNumber,
        payment_date: paymentDate,
        customer_id: customerId,
        amount: Number(amount),
      });
      setResult(res);
      setPaymentNumber('');
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencatat pembayaran');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Pembayaran Pelanggan
        </h1>
        <p className="mt-1 text-slate-500">
          Dialokasikan otomatis ke invoice tertua &rarr; jurnal Kas/Bank vs Piutang.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Nomor Pembayaran
            </label>
            <input className={inputCls} value={paymentNumber}
              onChange={(e) => setPaymentNumber(e.target.value)}
              placeholder="PAY/20260701/0001" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Tanggal
            </label>
            <input type="date" className={inputCls} value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Customer (kode)
            </label>
            <input className={inputCls} value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="CUST-BRW-099" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Nominal (IDR)
            </label>
            <input type="number" min="0" step="any" className={inputCls}
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        {result && (
          <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            <p>
              Pembayaran tercatat. Jurnal <strong>{result.journal_reference}</strong> ·
              Teralokasi <strong>{formatIDR(result.allocated)}</strong>
              {result.unapplied > 0 && ` · Sisa ${formatIDR(result.unapplied)}`}.
            </p>
            {result.invoices.length > 0 && (
              <ul className="mt-2 list-inside list-disc">
                {result.invoices.map((i) => (
                  <li key={i.invoice_number}>
                    {i.invoice_number}: {formatIDR(i.applied)} ({i.status})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button type="submit" disabled={submitting}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {submitting ? 'Memproses...' : 'Catat Pembayaran'}
        </button>
      </form>
    </div>
  );
}
