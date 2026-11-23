import React from "react";
import { getSystemInfo } from "zmp-sdk";
import {
  AnimationRoutes,
  App,
  Route,
  SnackbarProvider,
  ZMPRouter,
} from "zmp-ui";
import { AppProps } from "zmp-ui/app";

import HomePage from "@/pages/index";
import CategoriesPage from "@/pages/categories";
import ProductDetailPage from "@/pages/product-detail";
import CartPage from "@/pages/cart";
import CheckoutPage from "@/pages/checkout";
import OrdersPage from "@/pages/orders";
import NotificationsPage from "@/pages/notifications";
import ProfilePage from "@/pages/profile";
import AddressesPage from "@/pages/addresses";
import VouchersPage from "@/pages/vouchers";
import PolicyPage from "@/pages/policy";

import { BottomNav } from "@/components/BottomNav";
import { BackendSyncBridge } from "@/components/BackendSyncBridge";
import { FloatingCartPill } from "@/components/FloatingCartPill";
import { SupportModal } from "@/components/SupportModal";
import { ToastBanner } from "@/components/ToastBanner";
import { ZaloLoginModal } from "@/components/ZaloLoginModal";

const SafeSystemTheme = (): AppProps["theme"] => {
  try {
    return (getSystemInfo()?.zaloTheme as AppProps["theme"]) || "light";
  } catch {
    return "light";
  }
};

const Layout: React.FC = () => {
  return (
    <App theme={SafeSystemTheme()}>
      <SnackbarProvider>
        <ZMPRouter>
          <div className="miniapp-shell">
            <BackendSyncBridge />
            <ToastBanner />
            <AnimationRoutes>
              <Route path="/" element={<HomePage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/product/:id" element={<ProductDetailPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/addresses" element={<AddressesPage />} />
              <Route path="/vouchers" element={<VouchersPage />} />
              <Route path="/policy/:slug" element={<PolicyPage />} />
            </AnimationRoutes>
            <FloatingCartPill />
            <BottomNav />
            <SupportModal />
            <ZaloLoginModal />
          </div>
        </ZMPRouter>
      </SnackbarProvider>
    </App>
  );
};

export default Layout;
