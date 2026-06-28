import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { StockIn } from './pages/StockIn';
import { SalesInvoice } from './pages/SalesInvoice';
import { Payments } from './pages/Payments';
import { Reports } from './pages/Reports';
import { Products } from './pages/Products';
import { Warehouses } from './pages/Warehouses';
import { Customers } from './pages/Customers';
import { StockTransfer } from './pages/StockTransfer';
import { ExchangeRates } from './pages/ExchangeRates';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Authenticated area */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />

          {/* Reports: all authenticated roles (read-only) */}
          <Route path="/laporan" element={<Reports />} />

          {/* Inventory write: owner + admin_gudang only (RBAC) */}
          <Route
            element={<ProtectedRoute allowedRoles={['owner', 'admin_gudang']} />}
          >
            <Route path="/barang-masuk" element={<StockIn />} />
            <Route path="/transfer" element={<StockTransfer />} />
            <Route path="/master/produk" element={<Products />} />
            <Route path="/master/gudang" element={<Warehouses />} />
          </Route>

          {/* Owner-only: FX rates & revaluation */}
          <Route element={<ProtectedRoute allowedRoles={['owner']} />}>
            <Route path="/kurs" element={<ExchangeRates />} />
          </Route>

          {/* Sales operations: owner + sales_kasir */}
          <Route
            element={<ProtectedRoute allowedRoles={['owner', 'sales_kasir']} />}
          >
            <Route path="/invoice" element={<SalesInvoice />} />
            <Route path="/pembayaran" element={<Payments />} />
            <Route path="/master/customer" element={<Customers />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
