import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ROLE_LABELS, type Role } from '../lib/types';

function CenteredSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
    </div>
  );
}

function Forbidden({ allowedRoles }: { allowedRoles: Role[] }) {
  const { profile } = useAuth();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full bg-rose-100 p-4">
        <span className="text-3xl">&#128274;</span>
      </div>
      <h2 className="mt-4 text-xl font-semibold text-slate-900">
        Akses ditolak
      </h2>
      <p className="mt-2 max-w-md text-slate-600">
        Halaman ini hanya untuk role{' '}
        <span className="font-medium">
          {allowedRoles.map((r) => ROLE_LABELS[r]).join(', ')}
        </span>
        . Role Anda saat ini:{' '}
        <span className="font-medium">
          {profile ? ROLE_LABELS[profile.role] : 'tidak diketahui'}
        </span>
        .
      </p>
    </div>
  );
}

/**
 * Guards nested routes. Requires an authenticated session; if `allowedRoles`
 * is provided, also requires the user's profile role to be included (RBAC).
 */
export function ProtectedRoute({ allowedRoles }: { allowedRoles?: Role[] }) {
  const { loading, session, profile } = useAuth();

  if (loading) return <CenteredSpinner />;
  if (!session) return <Navigate to="/login" replace />;

  if (allowedRoles && !(profile && allowedRoles.includes(profile.role))) {
    return <Forbidden allowedRoles={allowedRoles} />;
  }

  return <Outlet />;
}
