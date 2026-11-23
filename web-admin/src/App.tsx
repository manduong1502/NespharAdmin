import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CmsContentPage } from "./pages/CmsContentPage";
import { CustomersCrmPage } from "./pages/CustomersCrmPage";
import { InventoryBatchesPage } from "./pages/InventoryBatchesPage";
import { LoginPage } from "./pages/LoginPage";
import { OrdersOperationsPage } from "./pages/OrdersOperationsPage";
import { OverviewReportsPage } from "./pages/OverviewReportsPage";
import { ProductsLegalPage } from "./pages/ProductsLegalPage";
import { StaffAuditPage } from "./pages/StaffAuditPage";

const ProtectedRoutes: React.FC = () => {
  const { staff, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-frame text-[14px] text-ink-muted">
        Đang khởi tạo không gian quản trị Dược Phẩm NESPHAR...
      </div>
    );
  }
  if (!staff) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<OverviewReportsPage />} />
            <Route path="/orders" element={<OrdersOperationsPage />} />
            <Route path="/products" element={<ProductsLegalPage />} />
            <Route path="/inventory" element={<InventoryBatchesPage />} />
            <Route path="/customers" element={<CustomersCrmPage />} />
            <Route path="/cms" element={<CmsContentPage />} />
            <Route path="/staff" element={<StaffAuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
