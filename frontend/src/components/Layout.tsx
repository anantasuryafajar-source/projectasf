import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, type Role } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: '\u{1F4CA}',
    roles: ['owner', 'admin_gudang', 'sales_kasir'],
  },
  {
    to: '/barang-masuk',
    label: 'Input Barang Masuk',
    icon: '\u{1F4E6}',
    roles: ['owner', 'admin_gudang'],
  },
  {
    to: '/invoice',
    label: 'Invoice Penjualan',
    icon: '\u{1F9FE}',
    roles: ['owner', 'sales_kasir'],
  },
  {
    to: '/pembayaran',
    label: 'Pembayaran',
    icon: '\u{1F4B5}',
    roles: ['owner', 'sales_kasir'],
  },
  {
    to: '/laporan',
    label: 'Laporan Keuangan',
    icon: '\u{1F4C8}',
    roles: ['owner', 'admin_gudang', 'sales_kasir'],
  },
  {
    to: '/master/produk',
    label: 'Master Produk',
    icon: '\u{1F37E}',
    roles: ['owner', 'admin_gudang'],
  },
  {
    to: '/master/gudang',
    label: 'Master Gudang',
    icon: '\u{1F3ED}',
    roles: ['owner', 'admin_gudang'],
  },
  {
    to: '/master/customer',
    label: 'Master Customer',
    icon: '\u{1F465}',
    roles: ['owner', 'sales_kasir'],
  },
  {
    to: '/transfer',
    label: 'Transfer Stok',
    icon: '\u{1F69A}',
    roles: ['owner', 'admin_gudang'],
  },
  {
    to: '/kurs',
    label: 'Kurs & Revaluasi',
    icon: '\u{1F4B1}',
    roles: ['owner'],
  },
];

export function Layout() {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;
  const items = NAV.filter((item) => role && item.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <span className="text-2xl">&#127870;</span>
          <div>
            <p className="text-sm font-bold tracking-tight text-slate-900">
              Ananta ERP
            </p>
            <p className="text-[11px] text-slate-400">Beverage Distribution</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }: { isActive: boolean }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3 text-[11px] text-slate-400">
          PRD v2.0 &middot; Accurate Core Engine
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
          <div />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">
                {session?.user.email}
              </p>
              {role && (
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  {ROLE_LABELS[role]}
                </span>
              )}
            </div>
            <button
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Keluar
            </button>
          </div>
        </header>

        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
