import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthContext';
import type { JournalEntry, Product, Warehouse } from '../lib/types';

interface Stats {
  products: number;
  warehouses: number;
  journals: number;
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${accent}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const [products, warehouses, journalEntries] = await Promise.allSettled([
        apiGet<Product[]>('/inventory/products'),
        apiGet<Warehouse[]>('/inventory/warehouses'),
        apiGet<JournalEntry[]>('/accounting/journal-entries?limit=8'),
      ]);
      if (!active) return;

      const failed = [products, warehouses, journalEntries].find(
        (r) => r.status === 'rejected',
      );
      if (failed && failed.status === 'rejected') {
        setError(
          failed.reason instanceof Error
            ? failed.reason.message
            : 'Gagal memuat data',
        );
      }

      setStats({
        products: products.status === 'fulfilled' ? products.value.length : 0,
        warehouses:
          warehouses.status === 'fulfilled' ? warehouses.value.length : 0,
        journals:
          journalEntries.status === 'fulfilled'
            ? journalEntries.value.length
            : 0,
      });
      if (journalEntries.status === 'fulfilled')
        setJournals(journalEntries.value);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [reload]);

  // Realtime: refresh when journals/inventory/invoices change (§6.1).
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'journal_entries' },
        () => setReload((n) => n + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_batches' },
        () => setReload((n) => n + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Dashboard Utama
        </h1>
        <p className="mt-1 text-slate-500">
          Selamat datang
          {profile?.full_name ? `, ${profile.full_name}` : ''}. Ringkasan
          operasional distribusi.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sebagian data gagal dimuat: {error}. Pastikan backend API berjalan.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard
          label="Produk"
          value={loading ? '—' : (stats?.products ?? 0)}
          icon="&#127870;"
          accent="bg-indigo-50"
        />
        <StatCard
          label="Gudang"
          value={loading ? '—' : (stats?.warehouses ?? 0)}
          icon="&#127971;"
          accent="bg-emerald-50"
        />
        <StatCard
          label="Jurnal Terbaru"
          value={loading ? '—' : (stats?.journals ?? 0)}
          icon="&#128220;"
          accent="bg-amber-50"
        />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Jurnal Terbaru</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Referensi</th>
                <th className="px-6 py-3 font-medium">Tanggal</th>
                <th className="px-6 py-3 font-medium">Sumber</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    Memuat...
                  </td>
                </tr>
              ) : journals.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    Belum ada jurnal.
                  </td>
                </tr>
              ) : (
                journals.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                  >
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {j.journal_reference}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{j.entry_date}</td>
                    <td className="px-6 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {j.source}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {j.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
